import crypto from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import { ZodError } from "zod";
import {
  can,
  changePasswordSchema,
  createUserSchema,
  deactivateUserSchema,
  getPermissionsForRole,
  hasPermission,
  loginSchema,
  ownerSetupSchema,
  reactivateUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  unlockSchema,
  type AuthState,
  type CurrentUser,
  type Permission,
  type RoleKey,
  type UserListRecord,
} from "../../src/shared/auth";
import { getDatabase } from "./database";
import { logAuditEvent, setAuditActorProvider } from "./audit.service";
import { users } from "./schema";

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

type UserRow = typeof users.$inferSelect;

type SessionState = {
  sessionId: string;
  user: CurrentUser;
  lockedAt: string | null;
};

const passwordAlgo = "scrypt";
const scryptKeyLength = 64;
const lockoutThreshold = 5;
const lockoutMinutes = 15;

let currentSession: SessionState | null = null;
let appVersion: string | null = null;

setAuditActorProvider(() => ({
  user: currentSession?.user ?? null,
  sessionId: currentSession?.sessionId ?? null,
  appVersion,
}));

export function setAuthAppVersion(version: string): void {
  appVersion = version;
}

export function clearCurrentSession(): void {
  currentSession = null;
}

export function getAuthState(): AuthState {
  return {
    needsOwnerSetup: !hasActiveOwnerAdmin(),
    isAuthenticated: Boolean(currentSession && !currentSession.lockedAt),
    isLocked: Boolean(currentSession?.lockedAt),
    currentUser: currentSession?.user ?? null,
  };
}

export function setupFirstOwner(input: unknown): AuthState {
  try {
    const values = ownerSetupSchema.parse(input);

    if (hasActiveOwnerAdmin()) {
      throw new Error("Owner account already exists.");
    }

    const now = new Date().toISOString();
    const passwordHash = hashPassword(values.password);
    const user = getDatabase().transaction((tx) => {
      const inserted = tx
        .insert(users)
        .values({
          fullName: values.fullName,
          username: values.username,
          passwordHash,
          passwordAlgo,
          roleKey: "owner_admin",
          isActive: true,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: now,
          createdAt: now,
          updatedAt: now,
          createdByUserId: null,
          deactivatedAt: null,
          deactivatedByUserId: null,
        })
        .returning()
        .get();
      const safeUser = toCurrentUser(inserted);
      logAuditEvent(tx, {
        action: "user.created",
        entityType: "user",
        entityId: inserted.id,
        entityLabel: inserted.username,
        summaryAr: `تم إنشاء حساب المالك ${inserted.fullName}`,
        summaryEn: `Owner account ${inserted.fullName} was created.`,
        actorOverride: safeUser,
        sessionIdOverride: null,
      });

      return safeUser;
    });

    currentSession = {
      sessionId: crypto.randomUUID(),
      user,
      lockedAt: null,
    };

    logAuditEvent(getDatabase(), {
      action: "auth.login.success",
      entityType: "auth",
      entityId: user.id,
      entityLabel: user.username,
      summaryAr: `تم تسجيل دخول ${user.fullName}`,
      summaryEn: `${user.fullName} signed in.`,
    });

    return getAuthState();
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function login(input: unknown): AuthState {
  try {
    const values = loginSchema.parse(input);
    const db = getDatabase();
    const now = new Date().toISOString();
    const user = db.select().from(users).where(eq(users.username, values.username)).get();

    if (!user) {
      logAuditEvent(db, {
        action: "auth.login.failed",
        entityType: "auth",
        entityLabel: values.username,
        summaryAr: "فشلت محاولة تسجيل الدخول",
        summaryEn: "Sign-in failed.",
        metadata: { username: values.username },
        actorOverride: null,
        sessionIdOverride: null,
      });
      throw new Error("Username or PIN is incorrect.");
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      logFailedLogin(user, "Account is temporarily locked.");
      throw new Error("Account is temporarily locked. Try again later.");
    }

    if (!user.isActive) {
      logFailedLogin(user, "Inactive user cannot sign in.");
      throw new Error("This user is inactive.");
    }

    if (!verifyPassword(values.password, user.passwordHash, user.passwordAlgo)) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= lockoutThreshold
          ? new Date(Date.now() + lockoutMinutes * 60 * 1000).toISOString()
          : null;

      db.update(users)
        .set({
          failedLoginCount,
          lockedUntil,
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .run();
      logFailedLogin(user, "Wrong PIN.");
      throw new Error("Username or PIN is incorrect.");
    }

    const updated = db
      .update(users)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning()
      .get();

    currentSession = {
      sessionId: crypto.randomUUID(),
      user: toCurrentUser(updated),
      lockedAt: null,
    };
    logAuditEvent(db, {
      action: "auth.login.success",
      entityType: "auth",
      entityId: updated.id,
      entityLabel: updated.username,
      summaryAr: `تم تسجيل دخول ${updated.fullName}`,
      summaryEn: `${updated.fullName} signed in.`,
    });

    return getAuthState();
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function logout(): AuthState {
  if (currentSession) {
    logAuditEvent(getDatabase(), {
      action: "auth.logout",
      entityType: "auth",
      entityId: currentSession.user.id,
      entityLabel: currentSession.user.username,
      summaryAr: `تم تسجيل خروج ${currentSession.user.fullName}`,
      summaryEn: `${currentSession.user.fullName} signed out.`,
    });
  }

  currentSession = null;
  return getAuthState();
}

export function lockApp(): AuthState {
  if (!currentSession) {
    throw new Error("Login is required.");
  }

  if (!currentSession.lockedAt) {
    currentSession.lockedAt = new Date().toISOString();
    logAuditEvent(getDatabase(), {
      action: "auth.locked",
      entityType: "auth",
      entityId: currentSession.user.id,
      entityLabel: currentSession.user.username,
      summaryAr: `تم قفل التطبيق بواسطة ${currentSession.user.fullName}`,
      summaryEn: `${currentSession.user.fullName} locked the app.`,
    });
  }

  return getAuthState();
}

export function unlockApp(input: unknown): AuthState {
  try {
    const values = unlockSchema.parse(input);

    if (!currentSession) {
      throw new Error("Login is required.");
    }

    const now = new Date().toISOString();
    const user = getDatabase()
      .select()
      .from(users)
      .where(eq(users.id, currentSession.user.id))
      .get();

    if (!user || !user.isActive) {
      currentSession = null;
      throw new Error("This user is inactive.");
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      logFailedUnlock(user, "Account is temporarily locked.");
      throw new Error("Account is temporarily locked. Try again later.");
    }

    if (!verifyPassword(values.password, user.passwordHash, user.passwordAlgo)) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= lockoutThreshold
          ? new Date(Date.now() + lockoutMinutes * 60 * 1000).toISOString()
          : null;

      getDatabase()
        .update(users)
        .set({
          failedLoginCount,
          lockedUntil,
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .run();
      logFailedUnlock(user, "Wrong PIN.");
      throw new Error("PIN is incorrect.");
    }

    const updated = getDatabase()
      .update(users)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning()
      .get();
    currentSession = {
      ...currentSession,
      user: toCurrentUser(updated),
      lockedAt: null,
    };
    logAuditEvent(getDatabase(), {
      action: "auth.unlocked",
      entityType: "auth",
      entityId: updated.id,
      entityLabel: updated.username,
      summaryAr: `تم فتح قفل التطبيق بواسطة ${updated.fullName}`,
      summaryEn: `${updated.fullName} unlocked the app.`,
    });

    return getAuthState();
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function changePassword(input: unknown): AuthState {
  try {
    const values = changePasswordSchema.parse(input);
    const session = requireUnlockedSession();
    const db = getDatabase();
    const user = db.select().from(users).where(eq(users.id, session.user.id)).get();

    if (!user) {
      throw new Error("User was not found.");
    }

    if (!verifyPassword(values.currentPassword, user.passwordHash, user.passwordAlgo)) {
      throw new Error("Current PIN is incorrect.");
    }

    const now = new Date().toISOString();
    const updated = db
      .update(users)
      .set({
        passwordHash: hashPassword(values.newPassword),
        passwordAlgo,
        mustChangePassword: false,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning()
      .get();

    currentSession = {
      ...session,
      user: toCurrentUser(updated),
    };
    logAuditEvent(db, {
      action: "user.passwordChanged",
      entityType: "user",
      entityId: user.id,
      entityLabel: user.username,
      summaryAr: `تم تغيير كلمة مرور ${user.fullName}`,
      summaryEn: `${user.fullName} changed their PIN.`,
    });

    return getAuthState();
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function listUsers(): UserListRecord[] {
  requirePermissionForCurrentSession("users.view");

  return getDatabase()
    .select()
    .from(users)
    .orderBy(asc(users.fullName), asc(users.username))
    .all()
    .map(toUserListRecord);
}

export function createUser(input: unknown): UserListRecord {
  try {
    requirePermissionForCurrentSession("users.create");
    const values = createUserSchema.parse(input);
    const actor = requireUnlockedSession().user;
    const now = new Date().toISOString();

    return getDatabase().transaction((tx) => {
      const inserted = tx
        .insert(users)
        .values({
          fullName: values.fullName,
          username: values.username,
          passwordHash: hashPassword(values.password),
          passwordAlgo,
          roleKey: values.roleKey,
          isActive: true,
          earnsCommission: values.earnsCommission ?? true,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: now,
          updatedAt: now,
          createdByUserId: actor.id,
          deactivatedAt: null,
          deactivatedByUserId: null,
        })
        .returning()
        .get();
      logAuditEvent(tx, {
        action: "user.created",
        entityType: "user",
        entityId: inserted.id,
        entityLabel: inserted.username,
        summaryAr: `تم إنشاء مستخدم ${inserted.fullName}`,
        summaryEn: `User ${inserted.fullName} was created.`,
        after: safeUserSnapshot(inserted),
      });

      return toUserListRecord(inserted);
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function updateUser(input: unknown): UserListRecord {
  try {
    requirePermissionForCurrentSession("users.edit");
    const values = updateUserSchema.parse(input);

    return getDatabase().transaction((tx) => {
      const existing = getUserForUpdate(tx, values.userId);

      if (existing.roleKey !== values.roleKey) {
        if (!values.reason?.trim()) {
          throw new Error("Reason is required.");
        }
        assertCanChangeOwnerRole(existing, values.roleKey);
      }

      const now = new Date().toISOString();
      const updated = tx
        .update(users)
        .set({
          fullName: values.fullName,
          username: values.username,
          roleKey: values.roleKey,
          earnsCommission: values.earnsCommission ?? true,
          updatedAt: now,
        })
        .where(eq(users.id, values.userId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: existing.roleKey === updated.roleKey ? "user.updated" : "user.roleChanged",
        entityType: "user",
        entityId: updated.id,
        entityLabel: updated.username,
        summaryAr:
          existing.roleKey === updated.roleKey
            ? `تم تحديث مستخدم ${updated.fullName}`
            : `تم تغيير دور المستخدم ${updated.fullName}`,
        summaryEn:
          existing.roleKey === updated.roleKey
            ? `User ${updated.fullName} was updated.`
            : `User ${updated.fullName}'s role was changed.`,
        before: safeUserSnapshot(existing),
        after: safeUserSnapshot(updated),
        reason: existing.roleKey === updated.roleKey ? null : values.reason,
      });
      refreshCurrentSessionUser(updated);

      return toUserListRecord(updated);
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function deactivateUser(input: unknown): void {
  try {
    requirePermissionForCurrentSession("users.deactivate");
    const values = deactivateUserSchema.parse(input);
    const actor = requireUnlockedSession().user;

    getDatabase().transaction((tx) => {
      const existing = getUserForUpdate(tx, values.userId);

      if (existing.id === actor.id) {
        throw new Error("You cannot deactivate your own account.");
      }

      if (existing.roleKey === "owner_admin" && countActiveOwners(tx) <= 1) {
        throw new Error("Cannot deactivate the last active owner/admin.");
      }

      const now = new Date().toISOString();
      const updated = tx
        .update(users)
        .set({
          isActive: false,
          deactivatedAt: now,
          deactivatedByUserId: actor.id,
          updatedAt: now,
        })
        .where(eq(users.id, values.userId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "user.deactivated",
        entityType: "user",
        entityId: updated.id,
        entityLabel: updated.username,
        summaryAr: `تم تعطيل مستخدم ${updated.fullName}`,
        summaryEn: `User ${updated.fullName} was deactivated.`,
        before: safeUserSnapshot(existing),
        after: safeUserSnapshot(updated),
        reason: values.reason,
      });
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function reactivateUser(input: unknown): UserListRecord {
  try {
    requirePermissionForCurrentSession("users.edit");
    const values = reactivateUserSchema.parse(input);

    return getDatabase().transaction((tx) => {
      const existing = getUserForUpdate(tx, values.userId);
      const updated = tx
        .update(users)
        .set({
          isActive: true,
          deactivatedAt: null,
          deactivatedByUserId: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, values.userId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "user.reactivated",
        entityType: "user",
        entityId: updated.id,
        entityLabel: updated.username,
        summaryAr: `تم تفعيل مستخدم ${updated.fullName}`,
        summaryEn: `User ${updated.fullName} was reactivated.`,
        before: safeUserSnapshot(existing),
        after: safeUserSnapshot(updated),
      });

      return toUserListRecord(updated);
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function resetUserPassword(input: unknown): void {
  try {
    requirePermissionForCurrentSession("users.resetPassword");
    const values = resetPasswordSchema.parse(input);
    const actor = requireUnlockedSession().user;

    getDatabase().transaction((tx) => {
      const existing = getUserForUpdate(tx, values.userId);

      if (existing.roleKey === "owner_admin" && actor.roleKey !== "owner_admin") {
        throw new Error("Only an owner/admin can reset another owner PIN.");
      }

      const updated = tx
        .update(users)
        .set({
          passwordHash: hashPassword(values.newPassword),
          passwordAlgo,
          mustChangePassword: values.mustChangePassword,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, values.userId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "user.passwordReset",
        entityType: "user",
        entityId: updated.id,
        entityLabel: updated.username,
        summaryAr: `تمت إعادة تعيين كلمة مرور ${updated.fullName}`,
        summaryEn: `${updated.fullName}'s PIN was reset.`,
        before: { mustChangePassword: existing.mustChangePassword },
        after: { mustChangePassword: updated.mustChangePassword },
        reason: values.reason,
      });
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export function requirePermissionForCurrentSession(permission: Permission): CurrentUser {
  const session = requireUnlockedSession();

  if (session.user.mustChangePassword) {
    throw new Error("Change PIN is required.");
  }

  if (!hasPermission(session.user, permission)) {
    throw new Error("Permission denied.");
  }

  return session.user;
}

export function requireAllPermissionsForCurrentSession(
  permissions: Permission[],
): CurrentUser {
  const session = requireUnlockedSession();

  if (session.user.mustChangePassword) {
    throw new Error("Change PIN is required.");
  }

  for (const permission of permissions) {
    if (!hasPermission(session.user, permission)) {
      throw new Error("Permission denied.");
    }
  }

  return session.user;
}

export function getCurrentUserForService(): CurrentUser | null {
  return currentSession && !currentSession.lockedAt && !currentSession.user.mustChangePassword
    ? currentSession.user
    : null;
}

export function assertCurrentUserCan(permission: Permission): void {
  requirePermissionForCurrentSession(permission);
}

export function currentUserCan(permission: Permission): boolean {
  return Boolean(
    currentSession &&
      !currentSession.lockedAt &&
      !currentSession.user.mustChangePassword &&
      can(currentSession.user.roleKey, permission),
  );
}

function requireUnlockedSession(): SessionState {
  if (!currentSession) {
    throw new Error("Login is required.");
  }

  if (currentSession.lockedAt) {
    throw new Error("Unlock the app first.");
  }

  return currentSession;
}

function hasActiveOwnerAdmin(): boolean {
  const owner = getDatabase()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.roleKey, "owner_admin"), eq(users.isActive, true)))
    .get();

  return Boolean(owner);
}

function countActiveOwners(tx: DbTransaction): number {
  return tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.roleKey, "owner_admin"), eq(users.isActive, true)))
    .all().length;
}

function assertCanChangeOwnerRole(existing: UserRow, nextRoleKey: RoleKey): void {
  if (existing.roleKey !== "owner_admin" || nextRoleKey === "owner_admin") {
    return;
  }

  const activeOwnerCount = getDatabase()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.roleKey, "owner_admin"), eq(users.isActive, true), ne(users.id, existing.id)))
    .all().length;

  if (existing.isActive && activeOwnerCount === 0) {
    throw new Error("Cannot remove the last active owner/admin.");
  }
}

function getUserForUpdate(tx: DbTransaction, userId: number): UserRow {
  const user = tx.select().from(users).where(eq(users.id, userId)).get();

  if (!user) {
    throw new Error("User was not found.");
  }

  return user;
}

function refreshCurrentSessionUser(user: UserRow): void {
  if (!currentSession || currentSession.user.id !== user.id) {
    return;
  }

  currentSession = {
    ...currentSession,
    user: toCurrentUser(user),
  };
}

function logFailedLogin(user: UserRow, reason: string): void {
  logAuditEvent(getDatabase(), {
    action: "auth.login.failed",
    entityType: "auth",
    entityId: user.id,
    entityLabel: user.username,
    summaryAr: `فشلت محاولة تسجيل دخول ${user.username}`,
    summaryEn: `Sign-in failed for ${user.username}.`,
    metadata: { reason },
    actorOverride: null,
    sessionIdOverride: null,
  });
}

function logFailedUnlock(user: UserRow, reason: string): void {
  logAuditEvent(getDatabase(), {
    action: "auth.unlock.failed",
    entityType: "auth",
    entityId: user.id,
    entityLabel: user.username,
    summaryAr: `فشلت محاولة فتح قفل ${user.username}`,
    summaryEn: `Unlock failed for ${user.username}.`,
    metadata: { reason },
    actorOverride: toCurrentUser(user),
    sessionIdOverride: null,
  });
}

function toCurrentUser(user: UserRow): CurrentUser {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    roleKey: user.roleKey as RoleKey,
    isActive: user.isActive,
    earnsCommission: user.earnsCommission,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    permissions: getPermissionsForRole(user.roleKey as RoleKey),
  };
}

function toUserListRecord(user: UserRow): UserListRecord {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    roleKey: user.roleKey as RoleKey,
    isActive: user.isActive,
    earnsCommission: user.earnsCommission,
    mustChangePassword: user.mustChangePassword,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deactivatedAt: user.deactivatedAt,
  };
}

function safeUserSnapshot(user: UserRow) {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    roleKey: user.roleKey,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deactivatedAt: user.deactivatedAt,
  };
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .scryptSync(password, salt, scryptKeyLength, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    })
    .toString("base64url");

  return `scrypt$32768$8$1$${salt}$${hash}`;
}

function verifyPassword(
  password: string,
  storedHash: string,
  storedAlgo: string,
): boolean {
  if (storedAlgo !== passwordAlgo) {
    return false;
  }

  const parts = storedHash.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, nText, rText, pText, salt, expectedHash] = parts;
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const actualHash = crypto
    .scryptSync(password, salt, scryptKeyLength, {
      N: n,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    })
    .toString("base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  const actual = Buffer.from(actualHash, "base64url");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function normalizeAuthError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the user details.");
  }

  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed: users.username")
  ) {
    return new Error("Username already exists.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Authentication action failed.");
}
