import { z } from "zod";
import { normalizeDigits } from "./numerals";

export const roleValues = [
  "owner_admin",
  "manager",
  "staff",
  "accountant",
  "viewer",
] as const;

export type RoleKey = (typeof roleValues)[number];

export const permissionValues = [
  "vehicles.view",
  "vehicles.create",
  "vehicles.edit",
  "vehicles.changeStatus",
  "vehicles.deactivate",
  "vehicles.documents.view",
  "vehicles.documents.create",
  "vehicles.documents.replace",
  "vehicles.documents.archive",
  "vehicleSales.view",
  "vehicleSales.create",
  "vehicleSales.void",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.deactivate",
  "customers.documents.view",
  "customers.documents.create",
  "customers.documents.replace",
  "customers.documents.archive",
  "customers.documents.capturePhoto",
  "rentals.view",
  "rentals.create",
  "rentals.editActive",
  "rentals.return",
  "rentals.cancel",
  "payments.view",
  "payments.create",
  "payments.refund",
  "payments.void",
  "accounting.view",
  "expenses.create",
  "expenses.void",
  "cashMovements.create",
  "cashMovements.void",
  "accountingAdjustments.create",
  "accountingAdjustments.void",
  "dailyClosing.save",
  "dailyClosing.staffClose",
  "weeklyIncome.view",
  "employeeLoans.view",
  "employeeLoans.create",
  "employeeLoans.repay",
  "employeeLoans.void",
  "accessories.view",
  "accessories.create",
  "accessories.edit",
  "maintenance.view",
  "maintenance.create",
  "maintenance.edit",
  "maintenance.complete",
  "maintenance.archive",
  "reports.view",
  "reports.export",
  "settings.view",
  "settings.edit",
  "backup.export",
  "backup.restore",
  "users.view",
  "users.create",
  "users.edit",
  "users.deactivate",
  "users.resetPassword",
  "audit.view",
] as const;

export type Permission = (typeof permissionValues)[number];

const readOnlyPermissionValues = [
  "vehicles.view",
  "vehicles.documents.view",
  "vehicleSales.view",
  "customers.view",
  "customers.documents.view",
  "rentals.view",
  "payments.view",
  "accounting.view",
  "weeklyIncome.view",
  "employeeLoans.view",
  "accessories.view",
  "maintenance.view",
  "reports.view",
  "reports.export",
  "settings.view",
  "backup.export",
  "users.view",
  "audit.view",
] as const satisfies readonly Permission[];

const readOnlyPermissionSet = new Set<Permission>(readOnlyPermissionValues);

export const roleLabels: Record<RoleKey, { ar: string; en: string }> = {
  owner_admin: { ar: "المالك / المدير", en: "Owner / Admin" },
  manager: { ar: "مدير", en: "Manager" },
  staff: { ar: "موظف", en: "Staff / Clerk" },
  accountant: { ar: "محاسب", en: "Accountant" },
  viewer: { ar: "مشاهدة فقط", en: "Viewer" },
};

export const roleDescriptions: Record<RoleKey, { ar: string; en: string }> = {
  owner_admin: { ar: "تحكم كامل في التطبيق.", en: "Full control." },
  manager: {
    ar: "إدارة العمل اليومي والتقارير والتصحيحات.",
    en: "Daily operations, reports, corrections, and cancellations.",
  },
  staff: {
    ar: "التأجير والإرجاع والعملاء وتعديل بيانات المركبات والمدفوعات العادية.",
    en: "Rentals, returns, customers, vehicle details, and normal payments.",
  },
  accountant: {
    ar: "المدفوعات والتقارير مع صلاحيات تشغيل محدودة.",
    en: "Payments and reports with limited operations.",
  },
  viewer: { ar: "عرض فقط دون تعديل.", en: "Read-only access." },
};

const allPermissions = [...permissionValues];

export const rolePermissionMap: Record<RoleKey, readonly Permission[]> = {
  owner_admin: allPermissions,
  manager: [
    "vehicles.view",
    "vehicles.create",
    "vehicles.edit",
    "vehicles.changeStatus",
    "vehicles.deactivate",
    "vehicles.documents.view",
    "vehicles.documents.create",
    "vehicles.documents.replace",
    "vehicles.documents.archive",
    "vehicleSales.view",
    "vehicleSales.create",
    "vehicleSales.void",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.deactivate",
    "customers.documents.view",
    "customers.documents.create",
    "customers.documents.replace",
    "customers.documents.archive",
    "customers.documents.capturePhoto",
    "rentals.view",
    "rentals.create",
    "rentals.editActive",
    "rentals.return",
    "rentals.cancel",
    "payments.view",
    "payments.create",
    "payments.refund",
    "payments.void",
    "accounting.view",
    "expenses.create",
    "expenses.void",
    "cashMovements.create",
    "cashMovements.void",
    "dailyClosing.save",
    "dailyClosing.staffClose",
    "weeklyIncome.view",
    "employeeLoans.view",
    "employeeLoans.create",
    "employeeLoans.repay",
    "employeeLoans.void",
    "accessories.view",
    "accessories.create",
    "accessories.edit",
    "maintenance.view",
    "maintenance.create",
    "maintenance.edit",
    "maintenance.complete",
    "maintenance.archive",
    "reports.view",
    "reports.export",
    "backup.export",
    "audit.view",
  ],
  staff: [
    "vehicles.view",
    "vehicles.edit",
    "vehicles.documents.view",
    "vehicles.documents.create",
    "vehicles.documents.archive",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.documents.view",
    "customers.documents.create",
    "customers.documents.archive",
    "customers.documents.capturePhoto",
    "rentals.view",
    "rentals.create",
    "rentals.return",
    "payments.view",
    "payments.create",
    "expenses.create",
    "dailyClosing.staffClose",
    "weeklyIncome.view",
    "accessories.view",
    "maintenance.view",
    "maintenance.create",
    "maintenance.complete",
  ],
  accountant: [
    "vehicles.view",
    "vehicles.documents.view",
    "vehicleSales.view",
    "customers.view",
    "rentals.view",
    "payments.view",
    "payments.create",
    "payments.refund",
    "accounting.view",
    "expenses.create",
    "dailyClosing.save",
    "dailyClosing.staffClose",
    "weeklyIncome.view",
    "employeeLoans.view",
    "employeeLoans.repay",
    "reports.view",
    "reports.export",
  ],
  viewer: [
    "vehicles.view",
    "vehicles.documents.view",
    "vehicleSales.view",
    "customers.view",
    "rentals.view",
    "payments.view",
    "maintenance.view",
    "reports.view",
  ],
};

export type CurrentUser = {
  id: number;
  fullName: string;
  username: string;
  roleKey: RoleKey;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  permissions: Permission[];
};

export type AuthState = {
  needsOwnerSetup: boolean;
  isAuthenticated: boolean;
  isLocked: boolean;
  currentUser: CurrentUser | null;
};

export type UserListRecord = {
  id: number;
  fullName: string;
  username: string;
  roleKey: RoleKey;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
};

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(40, "Username is too long.")
  .regex(/^[\p{L}\p{N}._-]+$/u, "Username can use letters, numbers, dots, dashes, and underscores.")
  .transform((value) => value.toLowerCase());

const pinSchema = z.preprocess(
  normalizePinInput,
  z
    .string()
    .trim()
    .min(1, "PIN is required.")
    .regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
);

const confirmPinSchema = z.preprocess(
  normalizePinInput,
  z
    .string()
    .trim()
    .min(1, "Confirm PIN is required.")
    .regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
);

const reasonSchema = z
  .string()
  .trim()
  .min(1, "Reason is required.")
  .max(500, "Reason is too long.");

export const ownerSetupSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required.").max(100),
    username: usernameSchema,
    password: pinSchema,
    confirmPassword: confirmPinSchema,
  })
  .superRefine((values, context) => {
    if (values.password !== values.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "PINs do not match.",
        path: ["confirmPassword"],
      });
    }
  });

export const loginSchema = z.object({
  username: usernameSchema,
  password: pinSchema,
});

export const unlockSchema = z.object({
  password: pinSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: pinSchema,
    newPassword: pinSchema,
    confirmPassword: confirmPinSchema,
  })
  .superRefine((values, context) => {
    if (values.newPassword !== values.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "PINs do not match.",
        path: ["confirmPassword"],
      });
    }
  });

export const createUserSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required.").max(100),
    username: usernameSchema,
    roleKey: z.enum(roleValues),
    password: pinSchema,
    confirmPassword: confirmPinSchema,
  })
  .superRefine((values, context) => {
    if (values.password !== values.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "PINs do not match.",
        path: ["confirmPassword"],
      });
    }
  });

export const updateUserSchema = z.object({
  userId: z.number().int().positive("User is required."),
  fullName: z.string().trim().min(1, "Full name is required.").max(100),
  username: usernameSchema,
  roleKey: z.enum(roleValues),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const deactivateUserSchema = z.object({
  userId: z.number().int().positive("User is required."),
  reason: reasonSchema,
});

export const reactivateUserSchema = z.object({
  userId: z.number().int().positive("User is required."),
});

export const resetPasswordSchema = z
  .object({
    userId: z.number().int().positive("User is required."),
    newPassword: pinSchema,
    confirmPassword: confirmPinSchema,
    mustChangePassword: z.boolean().default(true),
    reason: reasonSchema,
  })
  .superRefine((values, context) => {
    if (values.newPassword !== values.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "PINs do not match.",
        path: ["confirmPassword"],
      });
    }
  });

export type OwnerSetupInput = z.infer<typeof ownerSetupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UnlockInput = z.infer<typeof unlockSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type DeactivateUserInput = z.infer<typeof deactivateUserSchema>;
export type ReactivateUserInput = z.infer<typeof reactivateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export function getPermissionsForRole(roleKey: RoleKey): Permission[] {
  return [...rolePermissionMap[roleKey]];
}

export function can(roleKey: RoleKey, permission: Permission): boolean {
  return rolePermissionMap[roleKey].includes(permission);
}

export function hasPermission(
  user: Pick<CurrentUser, "permissions"> | null,
  permission: Permission,
): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export function isWritePermission(permission: Permission): boolean {
  return !readOnlyPermissionSet.has(permission);
}

export function requirePermission(
  roleKey: RoleKey,
  permission: Permission,
): void {
  if (!can(roleKey, permission)) {
    throw new Error("Permission denied.");
  }
}

export function isRoleKey(value: unknown): value is RoleKey {
  return roleValues.includes(value as RoleKey);
}

export function isPermission(value: unknown): value is Permission {
  return permissionValues.includes(value as Permission);
}

function normalizePinInput(value: unknown): unknown {
  return typeof value === "string" ? normalizeDigits(value) : value;
}
