import { KeyRound, Pencil, Plus, RefreshCw, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { MetricStrip } from "@/components/ui/metric-strip";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { SectionPanel } from "@/components/ui/section-panel";
import { SidePanel } from "@/components/ui/side-panel";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import {
  roleLabels,
  roleValues,
  type CreateUserInput,
  type RoleKey,
  type UpdateUserInput,
  type UserListRecord,
} from "@/shared/auth";
import { normalizeDigits } from "@/shared/numerals";

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
  const [users, setUsers] = useState<UserListRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<UserFormState>(null);
  const [pendingAction, setPendingAction] = useState<PendingSensitiveAction>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setUsers(await window.rentalApp.users.list());
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Users could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadUsers]);

  async function createUser(input: CreateUserInput) {
    setIsSaving(true);
    setError(null);

    try {
      await window.rentalApp.users.create(input);
      setFormState(null);
      await Promise.all([loadUsers(), refreshAuth()]);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("User could not be saved."));
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
    setError(null);

    try {
      await window.rentalApp.users.update(input);
      setFormState(null);
      setPendingAction(null);
      await Promise.all([loadUsers(), refreshAuth()]);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("User could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateUser(user: UserListRecord, reason: string) {
    setIsSaving(true);
    setError(null);

    try {
      await window.rentalApp.users.deactivate({ userId: user.id, reason });
      setPendingAction(null);
      await Promise.all([loadUsers(), refreshAuth()]);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("User could not be deactivated."));
    } finally {
      setIsSaving(false);
    }
  }

  async function reactivateUser(user: UserListRecord) {
    setIsSaving(true);
    setError(null);

    try {
      await window.rentalApp.users.reactivate({ userId: user.id });
      await Promise.all([loadUsers(), refreshAuth()]);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("User could not be saved."));
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
    setError(null);

    try {
      await window.rentalApp.users.resetPassword({
        userId: user.id,
        newPassword: password,
        confirmPassword,
        mustChangePassword: true,
        reason,
      });
      setPendingAction(null);
      await Promise.all([loadUsers(), refreshAuth()]);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("PIN could not be reset."));
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
        <Button variant="outline" onClick={() => void loadUsers()}>
          <RefreshCw className="size-4" />
          {t("Refresh")}
        </Button>
        {can("users.create") ? (
          <Button onClick={() => setFormState({ mode: "create", user: null })}>
            <Plus className="size-4" />
            {t("Create user")}
          </Button>
        ) : null}
      </div>

      <MetricStrip
        columns={3}
        items={[
          { label: t("Active users"), value: users.filter((user) => user.isActive).length },
          { label: t("Owners"), value: users.filter((user) => user.roleKey === "owner_admin").length },
          { label: t("Locked users"), tone: "warning", value: users.filter((user) => Boolean(user.lockedUntil)).length },
        ]}
      />

      <SectionPanel
        title={t("Users")}
        description={t("Manage local staff accounts and fixed roles.")}
        badge={t("{{count}} shown", { count: users.length })}
      >
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <DataTable className="min-w-[880px]" containerClassName="min-h-[22rem]">
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
                const deactivateBlockReason = getDeactivateBlockReason(
                  user,
                  activeOwnerCount,
                  currentUser?.id ?? null,
                  t,
                );

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
                        {can("users.edit") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFormState({ mode: "edit", user })}
                          >
                            <Pencil className="size-4" />
                            {t("Edit")}
                          </Button>
                        ) : null}
                        {can("users.resetPassword") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingAction({ type: "reset", user })}
                          >
                            <KeyRound className="size-4" />
                            {t("Reset PIN")}
                          </Button>
                        ) : null}
                        {can("users.deactivate") && user.isActive ? (
                          deactivateBlockReason ? (
                            <span title={deactivateBlockReason}>
                              <Button
                                aria-label={deactivateBlockReason}
                                className="border-border text-muted-foreground"
                                disabled
                                size="sm"
                                variant="outline"
                              >
                                <UserX className="size-4" />
                                {t("Deactivate")}
                              </Button>
                            </span>
                          ) : (
                            <Button
                              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              size="sm"
                              variant="outline"
                              onClick={() => setPendingAction({ type: "deactivate", user })}
                            >
                              <UserX className="size-4" />
                              {t("Deactivate")}
                            </Button>
                          )
                        ) : null}
                        {can("users.edit") && !user.isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void reactivateUser(user)}
                          >
                            <UserCheck className="size-4" />
                            {t("Activate")}
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </SectionPanel>

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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();

    if (mode === "create") {
      onCreate({ fullName, username, roleKey, password, confirmPassword });
      return;
    }

    if (user) {
      onUpdate({ userId: user.id, fullName, username, roleKey });
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
        aria-modal="true"
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        role="alertdialog"
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
  return (
    <Input
      autoComplete="new-password"
      data-ltr="true"
      inputMode="numeric"
      maxLength={4}
      pattern="[0-9]{4}"
      type="password"
      value={value}
      onChange={(event) => onChange(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 4))}
    />
  );
}
