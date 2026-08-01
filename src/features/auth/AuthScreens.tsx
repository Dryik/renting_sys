import { KeyRound, LogIn, UserPlus } from "lucide-react";
import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/useI18n";
import type { AuthState } from "@/shared/auth";
import { normalizeDigits } from "@/shared/numerals";

const authErrorMessages = [
  "Username or PIN is incorrect.",
  "Account is temporarily locked. Try again later.",
  "This user is inactive.",
  "PIN is incorrect.",
  "Login is required.",
  "Unlock the app first.",
  "Username already exists.",
  "Owner account already exists.",
  "Username must be at least 3 characters.",
  "Username is too long.",
  "Username can use letters, numbers, dots, dashes, and underscores.",
  "PIN is required.",
  "Confirm PIN is required.",
  "PIN must be exactly 4 digits.",
  "PINs do not match.",
  "Current PIN is incorrect.",
  "Full name is required.",
  "User was not found.",
];

type AuthScreenProps = {
  currentUserName?: string | null;
  onAuthState: (state: AuthState) => void;
  themeControl?: ReactNode;
};

export function OwnerSetupScreen({ onAuthState, themeControl }: AuthScreenProps) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const state = await window.rentalApp.auth.setupOwner({
        fullName,
        username,
        password,
        confirmPassword,
      });
      onAuthState(state);
    } catch (err) {
      setError(t(getFriendlyAuthErrorMessage(err, "Owner setup failed.")));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title={t("First owner setup")}
      description={t("Create the first owner account before using the app.")}
      themeControl={themeControl}
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <AuthField label={t("Full name")} required>
          <Input autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </AuthField>
        <AuthField label={t("Username")} required>
          <Input data-ltr="true" value={username} onChange={(event) => setUsername(event.target.value)} />
        </AuthField>
        <AuthField label={t("PIN")} required>
          <PinInput autoComplete="new-password" value={password} onChange={setPassword} />
        </AuthField>
        <AuthField label={t("Confirm PIN")} required>
          <PinInput autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />
        </AuthField>
        <AuthError message={error} />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          <UserPlus className="size-4" />
          {t("Create owner account")}
        </Button>
      </form>
    </AuthFrame>
  );
}

export function LoginScreen({ onAuthState, themeControl }: AuthScreenProps) {
  const { t } = useI18n();
  const [users, setUsers] = useState<{ id: number; username: string; fullName: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string; fullName: string } | null>(null);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.rentalApp.auth.listLoginUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  function selectUser(user: { id: number; username: string; fullName: string }) {
    setSelectedUser(user);
    setPassword("");
    setError(null);
  }

  function back() {
    setSelectedUser(null);
    setPassword("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const validationMessage = getPinValidationMessage(password);
    if (validationMessage) {
      setError(t(validationMessage));
      return;
    }

    setIsSubmitting(true);

    try {
      const state = await window.rentalApp.auth.login({ username: selectedUser!.username, password });
      onAuthState(state);
    } catch (err) {
      setError(t(getFriendlyAuthErrorMessage(err, "Login failed.")));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthFrame title={t("Login")} themeControl={themeControl}>
      {selectedUser ? (
        <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          {/* Selected user header */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3">
            <UserAvatar name={selectedUser.fullName} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{selectedUser.fullName}</p>
              <p className="truncate text-xs text-muted-foreground" data-ltr="true">{selectedUser.username}</p>
            </div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={back}
            >
              {t("Change")}
            </button>
          </div>

          <AuthField label={t("PIN")} required>
            <PinInput autoFocus value={password} onChange={setPassword} />
          </AuthField>
          <AuthError message={error} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            <LogIn data-rtl-flip="true" className="size-4" />
            {t("Login")}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("Loading...")}</p>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("No active users found.")}</p>
          ) : (
            <>
              <p className="mb-1 text-sm text-muted-foreground">{t("Select your account:")}</p>
              <div className="flex flex-col gap-2">
                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-start transition-colors hover:bg-accent hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <UserAvatar name={user.fullName} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{user.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground" data-ltr="true">{user.username}</p>
                    </div>
                    <LogIn data-rtl-flip="true" className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </AuthFrame>
  );
}

function UserAvatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  const colors = [
    "bg-blue-600", "bg-violet-600", "bg-emerald-600",
    "bg-amber-600", "bg-rose-600", "bg-cyan-600",
  ];
  const color = colors[(name.charCodeAt(0) ?? 0) % colors.length];

  const sizeClass = size === "lg" ? "size-12 text-base" : "size-9 text-sm";

  return (
    <span className={["inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", sizeClass, color].join(" ")}>
      {initials || "?"}
    </span>
  );
}

export function LockScreen({
  currentUserName,
  onAuthState,
  themeControl,
}: AuthScreenProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const validationMessage = getPinValidationMessage(password);
    if (validationMessage) {
      setError(t(validationMessage));
      return;
    }

    setIsSubmitting(true);

    try {
      const state = await window.rentalApp.auth.unlock({ password });
      onAuthState(state);
    } catch (err) {
      setError(t(getFriendlyAuthErrorMessage(err, "Unlock failed.")));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    const state = await window.rentalApp.auth.logout();
    onAuthState(state);
  }

  return (
    <AuthFrame
      title={t("App locked")}
      description={
        currentUserName
          ? t("Unlock as {{name}}", { name: currentUserName })
          : t("Enter your PIN to unlock.")
      }
      themeControl={themeControl}
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <AuthField label={t("PIN")} required>
          <PinInput value={password} onChange={setPassword} />
        </AuthField>
        <AuthError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void logout()}>
            {t("Switch user")}
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            <KeyRound className="size-4" />
            {t("Unlock")}
          </Button>
        </div>
      </form>
    </AuthFrame>
  );
}

export function ChangePinScreen({ onAuthState, themeControl }: AuthScreenProps) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const state = await window.rentalApp.auth.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      onAuthState(state);
    } catch (err) {
      setError(t(getFriendlyAuthErrorMessage(err, "PIN could not be changed.")));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    const state = await window.rentalApp.auth.logout();
    onAuthState(state);
  }

  return (
    <AuthFrame
      title={t("Change PIN")}
      description={t("Change your PIN before using the app.")}
      themeControl={themeControl}
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <AuthField label={t("Current PIN")} required>
          <PinInput value={currentPassword} onChange={setCurrentPassword} />
        </AuthField>
        <AuthField label={t("New PIN")} required>
          <PinInput autoComplete="new-password" value={newPassword} onChange={setNewPassword} />
        </AuthField>
        <AuthField label={t("Confirm PIN")} required>
          <PinInput autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />
        </AuthField>
        <AuthError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void logout()}>
            {t("Switch user")}
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            <KeyRound className="size-4" />
            {t("Change PIN")}
          </Button>
        </div>
      </form>
    </AuthFrame>
  );
}

function AuthFrame({
  children,
  description,
  themeControl,
  title,
}: {
  children: ReactNode;
  description?: string | null;
  themeControl?: ReactNode;
  title: string;
}) {
  const { dir, settings, t } = useI18n();
  const shopName = settings.shopName.trim() || t("Rental Desk");

  return (
    <main dir={dir} className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 pt-24">
      {themeControl ? (
        <div className="absolute left-5 top-5 sm:left-8 sm:top-8">
          {themeControl}
        </div>
      ) : null}
      <div className="absolute right-5 top-5 flex items-center gap-3 text-right sm:right-8 sm:top-8" dir="ltr">
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-tight text-foreground" dir="rtl">
            نظام أراك للتأجير
          </p>
        </div>
        <AuthBrandMark compact />
      </div>

      <section className="w-full max-w-[460px] rounded-2xl border border-border/80 bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <AuthBrandMark />
          <p className="mt-4 max-w-full break-words text-lg font-bold leading-7 text-foreground">
            {shopName}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </section>
    </main>
  );
}

function AuthBrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={[
        "relative inline-flex shrink-0 items-center justify-center font-black leading-none",
        "drop-shadow-[0_7px_12px_rgba(29,78,216,0.28)]",
        compact ? "h-11 min-w-8 text-[2rem]" : "h-16 min-w-12 text-[3.75rem]",
      ].join(" ")}
      aria-hidden="true"
    >
      <span className="bg-[linear-gradient(160deg,#60a5fa_0%,#2563eb_42%,#1d4ed8_100%)] bg-clip-text text-transparent">
        A
      </span>
      <span className="pointer-events-none absolute bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.38)_32%,rgba(255,255,255,0)_58%)] bg-clip-text text-transparent">
        A
      </span>
    </span>
  );
}

function AuthField({
  children,
  label,
  required = false,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function PinInput({
  autoComplete = "current-password",
  autoFocus = false,
  onChange,
  value,
}: {
  autoComplete?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Input
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      data-ltr="true"
      inputMode="numeric"
      maxLength={4}
      pattern="[0-9]{4}"
      type="password"
      value={value}
      onChange={(event) => onChange(normalizePinValue(event.target.value))}
    />
  );
}

function AuthError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {message}
    </div>
  );
}

function normalizePinValue(value: string): string {
  return normalizeDigits(value).replace(/\D/g, "").slice(0, 4);
}

function getPinValidationMessage(value: string): string | null {
  const pin = normalizePinValue(value);

  if (!pin) {
    return "PIN is required.";
  }

  if (pin.length !== 4) {
    return "PIN must be exactly 4 digits.";
  }

  return null;
}

function getFriendlyAuthErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const knownMessage = authErrorMessages.find((authMessage) =>
    message.includes(authMessage),
  );

  if (knownMessage) {
    return knownMessage;
  }

  if (message && !isTechnicalAuthError(message)) {
    return message;
  }

  return fallback;
}

function isTechnicalAuthError(message: string): boolean {
  return (
    message.includes("Error invoking remote method") ||
    message.includes("ZodError") ||
    message.includes('"code"') ||
    message.includes('"path"')
  );
}
