import { Eye, EyeOff, KeyRound, Pencil, Plus, RefreshCw, UserCheck, UserX } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { SidePanel } from "@/components/ui/side-panel";
import { useBusinessMutation, useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import {
  roleLabels,
  roleValues,
  type CreateUserInput,
  type RoleKey,
  type ResetPasswordInput,
  type UpdateUserInput,
  type UserListRecord,
} from "@/shared/auth";
import { normalizeDigits } from "@/shared/numerals";
import { useModalBehavior } from "@/hooks/useModalBehavior";

type UserFormState =
  | { mode: "create"; user: null }
  | { mode: "edit"; user: UserListRecord }
  | null;

type PendingSensitiveAction =
  | { type: "deactivate"; user: UserListRecord }
  | { type: "reset"; user: UserListRecord }
  | { type: "role"; input: UpdateUserInput }
  | null;

export function UsersPage() {
  const { can, currentUser, refreshAuth } = useAuth();
  const { formatDateTime, language, t } = useI18n();
  const [isSaving, setIsSaving] = useState(false);
  // Failures raised by an action; a failed load is derived below.
  const [actionError, setActionError] = useState<string | null>(null);
  const [formState, setFormState] = useState<UserFormState>(null);
  const [detailsUser, setDetailsUser] = useState<UserListRecord | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingSensitiveAction>(null);

  const usersQuery = useBusinessQuery(
    "users",
    "list",
    undefined,
    () => rentalAppApi.users.list(),
  );
  const users = usersQuery.data ?? [];
  const isLoading = usersQuery.isPending;
  const listError = usersQuery.isError
    ? usersQuery.error instanceof Error
      ? t(usersQuery.error.message)
      : t("Users could not be loaded.")
    : null;
  const error = actionError ?? listError;

  async function refreshUsers() {
    const result = await usersQuery.refetch();

    if (!result.isError) {
      setActionError(null);
    }
  }

  // Changing a user can change what the signed-in account may do, so each of
  // these refreshes the session as well as invalidating the business root.
  const createUserMutation = useBusinessMutation((input: CreateUserInput) =>
    rentalAppApi.users.create(input),
  );
  const updateUserMutation = useBusinessMutation((input: UpdateUserInput) =>
    rentalAppApi.users.update(input),
  );
  const deactivateUserMutation = useBusinessMutation(
    (input: { userId: number; reason: string }) =>
      rentalAppApi.users.deactivate(input),
  );
  const reactivateUserMutation = useBusinessMutation((input: { userId: number }) =>
    rentalAppApi.users.reactivate(input),
  );
  const resetPasswordMutation = useBusinessMutation(
    (input: ResetPasswordInput) => rentalAppApi.users.resetPassword(input),
  );

  async function createUser(input: CreateUserInput) {
    setIsSaving(true);
    setActionError(null);

    try {
      await createUserMutation.mutateAsync(input);
      setFormState(null);
      await refreshAuth();
    } catch (err) {
      setActionError(err instanceof Error ? t(err.message) : t("User could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function updateUser(input: UpdateUserInput) {
    const existing = users.find((user) => user.id === input.userId);

    if (existing && existing.roleKey !== input.roleKey && !input.reason) {
      setPendingAction({ type: "role", input });
      return;
    }

    setIsSaving(true);
    setActionError(null);

    try {
      await updateUserMutation.mutateAsync(input);
      setFormState(null);
      setPendingAction(null);
      await refreshAuth();
    } catch (err) {
      setActionError(err instanceof Error ? t(err.message) : t("User could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateUser(user: UserListRecord, reason: string) {
    setIsSaving(true);
    setActionError(null);

    try {
      await deactivateUserMutation.mutateAsync({ userId: user.id, reason });
      setPendingAction(null);
      setDetailsUser(null);
      await refreshAuth();
    } catch (err) {
      setActionError(err instanceof Error ? t(err.message) : t("User could not be deactivated."));
    } finally {
      setIsSaving(false);
    }
  }

  async function reactivateUser(user: UserListRecord) {
    setIsSaving(true);
    setActionError(null);

    try {
      await reactivateUserMutation.mutateAsync({ userId: user.id });
      setDetailsUser(null);
      await refreshAuth();
    } catch (err) {
      setActionError(err instanceof Error ? t(err.message) : t("User could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function resetPassword(
    user: UserListRecord,
    password: string,
    confirmPassword: string,
    reason: string,
  ) {
    setIsSaving(true);
    setActionError(null);

    try {
      await resetPasswordMutation.mutateAsync({
        userId: user.id,
        newPassword: password,
        confirmPassword,
        mustChangePassword: true,
        reason,
      });
      setPendingAction(null);
      await refreshAuth();
    } catch (err) {
      setActionError(err instanceof Error ? t(err.message) : t("PIN could not be reset."));
    } finally {
      setIsSaving(false);
    }
  }

  const activeOwnerCount = users.filter(
    (user) => user.isActive && user.roleKey === "owner_admin",
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={usersQuery.isFetching}
          onClick={() => void refreshUsers()}
        >
          <RefreshCw
            className={usersQuery.isFetching ? "size-4 animate-spin" : "size-4"}
          />
          {t("Refresh")}
        </Button>
        {can("users.create") ? (
          <Button onClick={() => setFormState({ mode: "create", user: null })}>
            <Plus className="size-4" />
            {t("Create user")}
          </Button>
        ) : null}
      </div>

      <section className="rounded-2xl border border-border/40 bg-card/75 p-5 shadow-xs">
        <div className="mb-4 flex justify-end">
          <span className="flex flex-wrap items-center gap-3 rounded-full border border-border/70 bg-muted/45 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <span>{t("Active users")}: <BidiValue value={users.filter((user) => user.isActive).length} /></span>
            <span>{t("Owners")}: <BidiValue value={users.filter((user) => user.roleKey === "owner_admin").length} /></span>
            <span>{t("Locked users")}: <BidiValue value={users.filter((user) => Boolean(user.lockedUntil)).length} /></span>
          </span>
        </div>
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <DataTable className="min-w-[780px]">
          <thead>
            <tr>
              <Th>{t("Full name")}</Th>
              <Th>{t("Username")}</Th>
              <Th>{t("Role")}</Th>
              <Th>{t("Status")}</Th>
              <Th>{t("Last login")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={6} message={t("Loading users...")} state="loading" />
            ) : users.length === 0 ? (
              <EmptyTableRow colSpan={6} message={t("No users yet")} />
            ) : (
              users.map((user) => {
                return (
                  <tr key={user.id}>
                    <Td className="font-semibold">{user.fullName}</Td>
                    <Td><BidiValue value={user.username} /></Td>
                    <Td>
                      <RoleBadge roleKey={user.roleKey} label={roleLabels[user.roleKey][language]} />
                    </Td>
                    <Td>
                      <Badge variant={user.isActive ? "secondary" : "destructive"}>
                        {user.isActive ? t("Active") : t("Inactive")}
                      </Badge>
                    </Td>
                    <Td>{user.lastLoginAt ? <BidiValue value={formatDateTime(user.lastLoginAt)} /> : t("Never")}</Td>
                    <Td className="text-end">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetailsUser(user)}>
                          <Eye className="size-4" />
                          {t("Details")}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </section>

      <SidePanel
        open={Boolean(formState)}
        title={formState?.mode === "edit" ? t("Edit user") : t("Create user")}
        description={t("Use fixed roles for simple local access control.")}
        width="md"
        onClose={() => setFormState(null)}
      >
        {formState ? (
          <UserForm
            isSaving={isSaving}
            mode={formState.mode}
            user={formState.user}
            onCancel={() => setFormState(null)}
            onCreate={(input) => void createUser(input)}
            onUpdate={(input) => void updateUser(input)}
          />
        ) : null}
      </SidePanel>

      <SidePanel
        open={Boolean(detailsUser)}
        title={t("User Details")}
        description={t("Manage local staff accounts and fixed roles.")}
        width="md"
        onClose={() => setDetailsUser(null)}
      >
        {detailsUser ? (
          <UserDetails
            deactivateBlockReason={getDeactivateBlockReason(detailsUser, activeOwnerCount, currentUser?.id ?? null, t)}
            formatDateTime={formatDateTime}
            language={language}
            t={t}
            user={detailsUser}
            onDeactivate={can("users.deactivate") && detailsUser.isActive ? () => setPendingAction({ type: "deactivate", user: detailsUser }) : undefined}
            onEdit={can("users.edit") ? () => {
              const user = detailsUser;
              setDetailsUser(null);
              setFormState({ mode: "edit", user });
            } : undefined}
            onReactivate={can("users.edit") && !detailsUser.isActive ? () => void reactivateUser(detailsUser) : undefined}
            onResetPin={can("users.resetPassword") ? () => setPendingAction({ type: "reset", user: detailsUser }) : undefined}
          />
        ) : null}
      </SidePanel>

      <ReasonDialog
        open={Boolean(pendingAction && pendingAction.type !== "reset")}
        title={getReasonTitle(pendingAction, t)}
        description={getReasonDescription(pendingAction, t)}
        reasonLabel={t("Reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Confirm")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setPendingAction(null)}
        onConfirm={(reason) => {
          if (pendingAction?.type === "deactivate") {
            void deactivateUser(pendingAction.user, reason);
          } else if (pendingAction?.type === "role") {
            void updateUser({ ...pendingAction.input, reason });
          }
        }}
      />
      <ResetPinDialog
        open={pendingAction?.type === "reset"}
        isBusy={isSaving}
        onCancel={() => setPendingAction(null)}
        onConfirm={(values) => {
          if (pendingAction?.type === "reset") {
            void resetPassword(
              pendingAction.user,
              values.password,
              values.confirmPassword,
              values.reason,
            );
          }
        }}
      />
    </div>
  );
}

function UserDetails({
  deactivateBlockReason,
  formatDateTime,
  language,
  onDeactivate,
  onEdit,
  onReactivate,
  onResetPin,
  t,
  user,
}: {
  deactivateBlockReason: string | null;
  formatDateTime: (value: string | Date) => string;
  language: "ar" | "en";
  onDeactivate?: () => void;
  onEdit?: () => void;
  onReactivate?: () => void;
  onResetPin?: () => void;
  t: (key: string) => string;
  user: UserListRecord;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <UserDetailValue label={t("Full name")} value={user.fullName} />
        <UserDetailValue label={t("Username")} value={<BidiValue value={user.username} />} />
        <UserDetailValue label={t("Role")} value={<RoleBadge roleKey={user.roleKey} label={roleLabels[user.roleKey][language]} />} />
        <UserDetailValue label={t("Status")} value={<Badge variant={user.isActive ? "secondary" : "destructive"}>{user.isActive ? t("Active") : t("Inactive")}</Badge>} />
        <UserDetailValue label={t("Last login")} value={user.lastLoginAt ? <BidiValue value={formatDateTime(user.lastLoginAt)} /> : t("Never")} />
        <UserDetailValue label={t("Created At")} value={<BidiValue value={formatDateTime(user.createdAt)} />} />
        <UserDetailValue label={t("Sales Commission")} value={user.earnsCommission ? t("Enabled") : t("Disabled")} />
        <UserDetailValue label={t("Change PIN")} value={user.mustChangePassword ? t("Required") : t("Not required")} />
      </div>
      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {onEdit ? (
            <Button type="button" variant="outline" onClick={onEdit}>
              <Pencil className="size-4" />
              {t("Edit")}
            </Button>
          ) : null}
          {onResetPin ? (
            <Button type="button" variant="outline" onClick={onResetPin}>
              <KeyRound className="size-4" />
              {t("Reset PIN")}
            </Button>
          ) : null}
          {onReactivate ? (
            <Button type="button" onClick={onReactivate}>
              <UserCheck className="size-4" />
              {t("Activate")}
            </Button>
          ) : null}
        </div>
        {onDeactivate ? (
          deactivateBlockReason ? (
            <span title={deactivateBlockReason}>
              <Button type="button" variant="outline" disabled aria-label={deactivateBlockReason}>
                <UserX className="size-4" />
                {t("Deactivate")}
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDeactivate}
            >
              <UserX className="size-4" />
              {t("Deactivate")}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function UserDetailValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3 text-sm">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function UserForm({
  isSaving,
  mode,
  onCancel,
  onCreate,
  onUpdate,
  user,
}: {
  isSaving: boolean;
  mode: "create" | "edit";
  onCancel: () => void;
  onCreate: (input: CreateUserInput) => void;
  onUpdate: (input: UpdateUserInput) => void;
  user: UserListRecord | null;
}) {
  const { language, t } = useI18n();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [roleKey, setRoleKey] = useState<RoleKey>(user?.roleKey ?? "staff");
  const [earnsCommission, setEarnsCommission] = useState(user?.earnsCommission ?? true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();

    if (mode === "create") {
      onCreate({ fullName, username, roleKey, earnsCommission, password, confirmPassword });
      return;
    }

    if (user) {
      onUpdate({ userId: user.id, fullName, username, roleKey, earnsCommission });
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Field label={t("Full name")}>
        <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      <Field label={t("Username")}>
        <Input data-ltr="true" value={username} onChange={(event) => setUsername(event.target.value)} />
      </Field>
      <Field label={t("Role")}>
        <select
          className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          value={roleKey}
          onChange={(event) => setRoleKey(event.target.value as RoleKey)}
        >
          {roleValues.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role][language]}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={earnsCommission}
          onChange={(e) => setEarnsCommission(e.target.checked)}
        />
        <span>{t("Earns Sales Commission")}</span>
      </label>
      {mode === "create" ? (
        <>
          <Field label={t("PIN")}>
            <PinInput value={password} onChange={setPassword} />
          </Field>
          <Field label={t("Confirm PIN")}>
            <PinInput value={confirmPassword} onChange={setConfirmPassword} />
          </Field>
        </>
      ) : null}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {t("Save Changes")}
        </Button>
      </div>
    </form>
  );
}

function RoleBadge({ label, roleKey }: { label: string; roleKey: RoleKey }) {
  const roleClass: Record<RoleKey, string> = {
    owner_admin: "border-primary/20 bg-accent text-primary",
    manager: "border-primary/20 bg-primary/10 text-primary",
    staff: "border-success/20 bg-success/10 text-success",
    accountant: "border-warning/25 bg-warning/10 text-warning",
    viewer: "border-border bg-secondary text-muted-foreground",
  };

  return (
    <Badge variant="outline" className={roleClass[roleKey]}>
      {label}
    </Badge>
  );
}

function getDeactivateBlockReason(
  user: UserListRecord,
  activeOwnerCount: number,
  currentUserId: number | null,
  t: (key: string) => string,
): string | null {
  if (!user.isActive) {
    return null;
  }

  if (user.id === currentUserId) {
    return t("You cannot deactivate your own account.");
  }

  if (user.roleKey === "owner_admin" && activeOwnerCount <= 1) {
    return t("The last active owner account cannot be deactivated.");
  }

  return null;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function getReasonTitle(
  action: PendingSensitiveAction,
  t: (key: string) => string,
): string {
  if (action?.type === "deactivate") return t("Deactivate user");
  if (action?.type === "reset") return t("Reset PIN");
  if (action?.type === "role") return t("Change role");
  return t("Reason");
}

function getReasonDescription(
  action: PendingSensitiveAction,
  t: (key: string) => string,
): string {
  if (action?.type === "deactivate") return t("Enter the reason for deactivating this user.");
  if (action?.type === "reset") return t("Enter the reason for resetting this PIN.");
  if (action?.type === "role") return t("Enter the reason for changing this role.");
  return t("Reason is required.");
}

function ResetPinDialog({
  isBusy,
  onCancel,
  onConfirm,
  open,
}: {
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (values: {
    confirmPassword: string;
    password: string;
    reason: string;
  }) => void;
  open: boolean;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  if (!open) {
    return null;
  }

  function submit() {
    if (!/^\d{4}$/.test(password)) {
      setError(t("PIN must be exactly 4 digits."));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("PINs do not match."));
      return;
    }

    if (!reason.trim()) {
      setError(t("Reason is required."));
      return;
    }

    onConfirm({ password, confirmPassword, reason: reason.trim() });
    setPassword("");
    setConfirmPassword("");
    setReason("");
    setError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <div
        ref={dialogRef}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        data-modal-layer="true"
        role="alertdialog"
        tabIndex={-1}
      >
        <h2 className="text-base font-semibold">{t("Reset PIN")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Enter the new PIN and the reason for resetting it.")}
        </p>
        <div className="mt-4 grid gap-3">
          <Field label={t("New PIN")}>
            <PinInput value={password} onChange={(value) => {
              setPassword(value);
              setError(null);
            }} />
          </Field>
          <Field label={t("Confirm PIN")}>
            <PinInput value={confirmPassword} onChange={(value) => {
              setConfirmPassword(value);
              setError(null);
            }} />
          </Field>
          <Field label={t("Reason")}>
            <Input
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            />
          </Field>
          {error ? (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isBusy} onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button type="button" disabled={isBusy} onClick={submit}>
            {t("Reset PIN")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PinInput({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();
  const [showPin, setShowPin] = useState(false);

  return (
    <span className="flex flex-col gap-1.5">
      <span className="relative">
        <Input
          autoComplete="new-password"
          className="pe-11"
          data-ltr="true"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]{4}"
          type={showPin ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 4))}
        />
        <button
          type="button"
          className="absolute end-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t(showPin ? "Hide PIN" : "Show PIN")}
          onClick={() => setShowPin((current) => !current)}
        >
          {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      <span className="text-xs font-normal text-muted-foreground">{t("Use a 4-digit PIN.")}</span>
    </span>
  );
}
