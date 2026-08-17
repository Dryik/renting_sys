import {
  Archive,
  BarChart3,
  CarFront,
  History,
  FileText,
  KeyRound,
  Landmark,
  LockKeyhole,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  type LucideIcon,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CustomersPage } from "@/features/customers/CustomersPage";
import { RentalsPage } from "@/features/rentals/RentalsPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { VehiclesPage } from "@/features/vehicles/VehiclesPage";
import { AccountingPage } from "@/features/accounting/AccountingPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { BackupPage } from "@/features/backup/BackupPage";
import { MaintenancePage } from "@/features/maintenance/MaintenancePage";
import { ActivityLogPage } from "@/features/activity/ActivityLogPage";
import { ChangePinScreen, LoginScreen, LockScreen, OwnerSetupScreen } from "@/features/auth/AuthScreens";
import { LicenseBanner } from "@/features/license/LicenseBanner";
import { LicensePage } from "@/features/license/LicensePage";
import { UsersPage } from "@/features/users/UsersPage";
import { useI18n } from "@/hooks/useI18n";
import { AuthProvider } from "@/hooks/AuthProvider";
import {
  rentalAppApi,
  getUpdatesApi,
  isDesktopBridgeAvailable,
} from "@/data/rental-app-api";
import { useRendererSession } from "@/data/session-context";
import { useCommandMutation } from "@/data/hooks";
import { type AuthState, type Permission } from "@/shared/auth";
import type { LicenseStatus } from "@/shared/license";

type PageId =
  | "vehicles"
  | "customers"
  | "rentals"
  | "payments"
  | "maintenance"
  | "reports"
  | "settings"
  | "backup"
  | "users"
  | "activity"
  | "license";

type NavigationItem = {
  group: string;
  id: PageId;
  label: string;
  icon: LucideIcon;
  permission: Permission | Permission[] | null;
  showInSidebar?: boolean;
};

type AppColorTheme = "light" | "dark";

const colorThemeStorageKey = "arak-rental-desk-color-theme";

const navigation: NavigationItem[] = [
  {
    group: "Operations",
    id: "rentals",
    label: "Rentals",
    icon: FileText,
    permission: "rentals.view",
  },
  {
    group: "Operations",
    id: "vehicles",
    label: "Vehicles",
    icon: CarFront,
    permission: "vehicles.view",
  },
  {
    group: "Operations",
    id: "customers",
    label: "Customers",
    icon: Users,
    permission: "customers.view",
  },
  {
    group: "Operations",
    id: "payments",
    label: "Accounting",
    icon: Landmark,
    permission: ["accounting.view", "dailyClosing.staffClose", "weeklyIncome.view"],
  },
  {
    group: "Workshop",
    id: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    permission: "maintenance.view",
  },
  {
    group: "Insights",
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    permission: "reports.view",
  },
  {
    group: "Administration",
    id: "settings",
    label: "Settings",
    icon: Settings,
    permission: "settings.view",
  },
  {
    group: "Administration",
    id: "backup",
    label: "Backup",
    icon: Archive,
    permission: "backup.export",
  },
  {
    group: "Administration",
    id: "users",
    label: "Users",
    icon: ShieldCheck,
    permission: "users.view",
    showInSidebar: false,
  },
  {
    group: "Administration",
    id: "activity",
    label: "Activity Log",
    icon: History,
    permission: "audit.view",
    showInSidebar: false,
  },
  {
    group: "Administration",
    id: "license",
    label: "App License",
    icon: KeyRound,
    permission: null,
    showInSidebar: false,
  },
];

const pageCopy: Record<
  PageId,
  {
    title: string;
    description: string;
  }
> = {
  vehicles: {
    title: "Vehicles",
    description: "Vehicle records and current availability.",
  },
  customers: {
    title: "Customers",
    description: "Customer identity and contact details.",
  },
  rentals: {
    title: "Rentals",
    description: "Contracts, payments, returns, and overdue work.",
  },
  payments: {
    title: "Accounting",
    description: "Cash drawer, shop safe, bank, expenses, and payments.",
  },
  maintenance: {
    title: "Maintenance",
    description: "Service work and vehicle downtime.",
  },
  reports: {
    title: "Reports",
    description: "Operational reports for review and printing.",
  },
  settings: {
    title: "Settings",
    description: "Shop details used on contracts and receipts.",
  },
  backup: {
    title: "Backup",
    description: "Export and restore local business data.",
  },
  users: {
    title: "Users",
    description: "Local staff accounts and fixed roles.",
  },
  activity: {
    title: "Activity Log",
    description: "Important staff actions and system changes.",
  },
  license: {
    title: "App License",
    description: "Offline activation and trial status.",
  },
};

export default function App() {
  const { dir, language, settings, t } = useI18n();
  const [colorTheme, setColorTheme] = useState<AppColorTheme>(() =>
    getStoredColorTheme(),
  );
  // Auth state lives in the session provider: adopting a new one has to clear
  // the caches and move the epoch on, and that must not be something a screen
  // can forget to do.
  const { applyAuthState, authState, completeRestore, refreshAuth } =
    useRendererSession();
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [activePage, setActivePage] = useState<PageId>("rentals");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<
    "none" | "restored" | "restoredStateUnavailable"
  >("none");
  const [isRetryingAuthState, setIsRetryingAuthState] = useState(false);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [dir, language]);

  useEffect(() => {
    document.documentElement.dataset.theme = colorTheme;
    document.documentElement.classList.toggle("dark", colorTheme === "dark");
    window.localStorage.setItem(colorThemeStorageKey, colorTheme);
  }, [colorTheme]);

  const refreshLicense = useCallback(async () => {
    try {
      setLicenseStatus(await rentalAppApi.license.getStatus());
    } catch {
      setLicenseStatus({
        mode: "readonly",
        canWrite: false,
        machineCode: null,
        license: null,
        trial: null,
        reason: "machine-code-unavailable",
        message: "This computer's machine code could not be read. Please check Windows permissions or contact support.",
      });
    }
  }, []);

  const [downloadedUpdateVersion, setDownloadedUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshAuth();
      void refreshLicense();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refreshAuth, refreshLicense]);

  /**
   * A successful restore replaced the database under us, and the main process
   * has already dropped the session. The transition clears the renderer and
   * signs out *before* it reads the new state, so a failed read leaves the
   * login screen rather than the previous user's shell over someone else's
   * data. Either way the restore itself is reported as having succeeded,
   * because it did.
   */
  const handleRestoreCompleted = useCallback(async () => {
    setIsRetryingAuthState(true);

    try {
      const outcome = await completeRestore();

      setRestoreNotice(
        outcome.kind === "restored" ? "restored" : "restoredStateUnavailable",
      );
    } finally {
      setIsRetryingAuthState(false);
    }
  }, [completeRestore]);

  /**
   * Every screen adopts a new session through here, which is also where the
   * one-time restore notice is dropped: signing in clears it, so it belongs to
   * exactly one visit to the login screen.
   */
  const handleAuthState = useCallback(
    async (next: AuthState) => {
      setRestoreNotice("none");
      await applyAuthState(next);
    },
    [applyAuthState],
  );

  useEffect(() => {
    void getUpdatesApi()?.getPendingUpdate?.().then((info) => {
      if (info?.version) {
        setDownloadedUpdateVersion(info.version);
      }
    });

    const unsub = getUpdatesApi()?.onDownloaded((info) => {
      setDownloadedUpdateVersion(info.version);
    });
    return () => unsub?.();
  }, []);

  // Restarting is an action, not a business write, so it invalidates nothing.
  const restartAndInstall = useCommandMutation<void, void>(async () => {
    await getUpdatesApi()?.restartAndInstall();
  });

  const accessibleNavigation = useMemo(() => {
    const currentUser = authState?.currentUser;

    if (!currentUser) {
      return [];
    }

    return navigation.filter((item) => canOpenNavigationItem(item, currentUser.permissions));
  }, [authState]);

  const visibleNavigation = useMemo(
    () => accessibleNavigation.filter((item) => item.showInSidebar !== false),
    [accessibleNavigation],
  );

  const activePageForRender = accessibleNavigation.some((item) => item.id === activePage)
    ? activePage
    : visibleNavigation[0]?.id ?? activePage;
  const shellActivePage = visibleNavigation.some(
    (item) => item.id === activePageForRender,
  )
    ? activePageForRender
    : activePageForRender === "users" ||
        activePageForRender === "activity" ||
        activePageForRender === "license"
      ? "settings"
      : activePageForRender;
  const activeCopy = getActivePageCopy(
    activePageForRender,
    authState?.currentUser?.permissions ?? [],
  );

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activePageForRender]);

  function handleNavigate(pageId: PageId) {
    if (
      activePageForRender === "settings" &&
      settingsDirty &&
      pageId !== "settings"
    ) {
      setPendingPage(pageId);
      return;
    }

    setActivePage(pageId);
  }

  function toggleColorTheme() {
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      const docWithTransition = document as unknown as {
        startViewTransition: (cb: () => void) => void;
      };
      docWithTransition.startViewTransition(() => {
        setColorTheme((current) => (current === "dark" ? "light" : "dark"));
      });
    } else {
      setColorTheme((current) => (current === "dark" ? "light" : "dark"));
    }
  }

  const themeToggle = (
    <ThemeToggleButton
      onToggle={toggleColorTheme}
      t={t}
      theme={colorTheme}
    />
  );

  if (!isDesktopBridgeAvailable()) {
    return (
      <main
        dir={dir}
        className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-background text-foreground"
      >
        <div className="max-w-md rounded-2xl border border-border p-6 shadow-xl bg-card">
          <h2 className="text-xl font-bold mb-2">{t("Desktop Application")}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {t(
              "This is a local desktop application built for Electron. Please switch to the running Electron app window on your Windows taskbar.",
            )}
          </p>
          <div className="text-xs font-mono bg-muted p-2.5 rounded text-muted-foreground border border-border">
            ARAK Rental Desk Desktop Window
          </div>
        </div>
      </main>
    );
  }

  if (!authState || !licenseStatus) {
    return (
      <main
        dir={dir}
        className="relative flex min-h-screen items-center justify-center"
      >
        <div className="absolute start-5 top-5 sm:start-8 sm:top-8">
          {themeToggle}
        </div>
        <p className="text-sm text-muted-foreground">{t("Loading...")}</p>
      </main>
    );
  }

  if (licenseStatus.mode === "readonly" && authState.needsOwnerSetup) {
    return (
      <main dir={dir} className="relative min-h-screen bg-background p-8">
        <div className="absolute start-5 top-5 sm:start-8 sm:top-8">
          {themeToggle}
        </div>
        <LicensePage status={licenseStatus} onStatusChange={setLicenseStatus} />
      </main>
    );
  }

  if (authState.needsOwnerSetup) {
    return (
      <OwnerSetupScreen
        onAuthState={handleAuthState}
        themeControl={themeToggle}
      />
    );
  }

  if (authState.isLocked) {
    return (
      <LockScreen
        currentUserName={authState.currentUser?.fullName}
        onAuthState={handleAuthState}
        themeControl={themeToggle}
      />
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <LoginScreen
        onAuthState={handleAuthState}
        isRetryingAuthState={isRetryingAuthState}
        onRetryAuthState={() => void handleRestoreCompleted()}
        restoreNotice={restoreNotice}
        themeControl={themeToggle}
      />
    );
  }

  if (authState.currentUser?.mustChangePassword) {
    return (
      <ChangePinScreen
        onAuthState={handleAuthState}
        themeControl={themeToggle}
      />
    );
  }

  return (
    <AuthProvider
      authState={authState}
      licenseStatus={licenseStatus}
      refreshAuth={refreshAuth}
      setAuthState={handleAuthState}
    >
      <AppShell
        activePage={shellActivePage}
        dir={dir}
        navigation={visibleNavigation}
        onNavigate={handleNavigate}
        shopLogoDataUrl={settings.shopLogoDataUrl}
        shopName={settings.shopName}
        t={t}
      >
        <div className="flex h-screen min-h-0 flex-col">
          <PageHeader
            title={t(activeCopy.title)}
            description={t(activeCopy.description)}
            account={
              <>
                {themeToggle}
                <CurrentUserActions
                  authState={authState}
                  onAuthState={handleAuthState}
                />
              </>
            }
          />

          <section
            ref={contentRef}
            className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-5 py-6 lg:px-8"
          >
            {downloadedUpdateVersion ? (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-4 text-primary shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🚀</span>
                  <div>
                    <h4 className="font-bold text-sm">
                      {t("New Version {{version}} Ready!", { version: downloadedUpdateVersion })}
                    </h4>
                    <p className="text-xs opacity-90">
                      {t("A new update has been downloaded. Restart the application to apply changes.")}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => restartAndInstall.mutate()}
                >
                  {t("Restart & Update")}
                </Button>
              </div>
            ) : null}
            <LicenseBanner
              status={licenseStatus}
              onOpenLicense={() => handleNavigate("license")}
            />
            {renderActivePage(activePageForRender, {
              licenseStatus,
              onNavigate: handleNavigate,
              onLicenseStatusChange: setLicenseStatus,
              onRestoreCompleted: handleRestoreCompleted,
              onSettingsDirtyChange: setSettingsDirty,
            })}
          </section>
          <ConfirmDialog
            open={pendingPage !== null}
            title={t("Discard unsaved changes?")}
            description={t("Your unsaved settings changes will be lost.")}
            cancelLabel={t("Stay")}
            confirmLabel={t("Discard")}
            variant="destructive"
            onCancel={() => setPendingPage(null)}
            onConfirm={() => {
              const nextPage = pendingPage;
              setPendingPage(null);
              setSettingsDirty(false);
              if (nextPage) {
                setActivePage(nextPage);
              }
            }}
          />
        </div>
      </AppShell>
    </AuthProvider>
  );
}

function getStoredColorTheme(): AppColorTheme {
  try {
    return window.localStorage.getItem(colorThemeStorageKey) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function canOpenNavigationItem(
  item: NavigationItem,
  permissions: Permission[],
): boolean {
  if (item.permission === null) {
    return true;
  }

  const requiredPermissions = Array.isArray(item.permission)
    ? item.permission
    : [item.permission];

  return requiredPermissions.some((permission) => permissions.includes(permission));
}

function getActivePageCopy(
  pageId: PageId,
  permissions: Permission[],
): { description: string; title: string } {
  if (pageId === "payments" && !permissions.includes("accounting.view")) {
    return {
      title: "Accounting",
      description: "Record expenses, close the day, and view weekly income.",
    };
  }

  return pageCopy[pageId];
}

function ThemeToggleButton({
  onToggle,
  t,
  theme,
}: {
  onToggle: () => void;
  t: (key: string) => string;
  theme: AppColorTheme;
}) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = t(nextTheme === "dark" ? "Dark theme" : "Light theme");
  const Icon = nextTheme === "dark" ? Moon : Sun;

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="shrink-0"
      aria-label={label}
      onClick={onToggle}
    >
      <Icon />
    </Button>
  );
}

function renderActivePage(
  pageId: PageId,
  context: {
    licenseStatus: LicenseStatus;
    onNavigate: (pageId: PageId) => void;
    onLicenseStatusChange: (status: LicenseStatus) => void;
    onRestoreCompleted: () => Promise<void>;
    onSettingsDirtyChange: (isDirty: boolean) => void;
  },
) {
  if (pageId === "vehicles") return <VehiclesPage />;
  if (pageId === "customers") return <CustomersPage />;
  if (pageId === "rentals") return <RentalsPage />;
  if (pageId === "payments") return <AccountingPage />;
  if (pageId === "maintenance") return <MaintenancePage />;
  if (pageId === "reports") return <ReportsPage />;
  if (pageId === "settings") {
    return (
      <SettingsPage
        onDirtyChange={context.onSettingsDirtyChange}
        onOpenActivityLog={() => context.onNavigate("activity")}
        onOpenAppLicense={() => context.onNavigate("license")}
        onOpenUsers={() => context.onNavigate("users")}
      />
    );
  }
  if (pageId === "backup") {
    return <BackupPage onRestoreCompleted={context.onRestoreCompleted} />;
  }
  if (pageId === "users") return <UsersPage />;
  if (pageId === "activity") return <ActivityLogPage />;
  if (pageId === "license") {
    return (
      <LicensePage
        status={context.licenseStatus}
        onStatusChange={context.onLicenseStatusChange}
      />
    );
  }

  return null;
}

function CurrentUserActions({
  authState,
  onAuthState,
}: {
  authState: AuthState;
  onAuthState: (state: AuthState) => Promise<void>;
}) {
  const { t } = useI18n();
  const user = authState.currentUser;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex h-10 max-w-52 items-center rounded-xl border border-border/80 bg-muted px-3 text-sm font-semibold transition-colors hover:bg-card"
        aria-label={t("Current user")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{user.fullName}</span>
      </button>
      {open ? (
      <div className="absolute end-0 z-30 mt-2 min-w-44 rounded-xl border border-border/80 bg-popover p-1.5 shadow-lg" role="menu">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            void rentalAppApi.auth
              .lock()
              .then(onAuthState)
              .catch(() => undefined);
          }}
        >
          <LockKeyhole />
          {t("Lock app")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            void rentalAppApi.auth
              .logout()
              .then(onAuthState)
              .catch(() => undefined);
          }}
        >
          <Users />
          {t("Switch user")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setOpen(false);
            void rentalAppApi.auth
              .logout()
              .then(onAuthState)
              .catch(() => undefined);
          }}
        >
          <LogOut data-rtl-flip="true" />
          {t("Logout")}
        </Button>
      </div>
      ) : null}
    </div>
  );
}
