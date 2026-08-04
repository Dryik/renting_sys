import { useState, useEffect, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ShellNavigationItem<TId extends string> = {
  group?: string;
  id: TId;
  label: string;
  icon: LucideIcon;
};

type AppShellProps<TId extends string> = {
  activePage: TId;
  children: ReactNode;
  dir: "ltr" | "rtl";
  navigation: ShellNavigationItem<TId>[];
  onNavigate: (page: TId) => void;
  shopLogoDataUrl: string | null;
  shopName: string;
  t: (key: string) => string;
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "arak_sidebar_collapsed";

export function AppShell<TId extends string>({
  activePage,
  children,
  dir,
  navigation,
  onNavigate,
  shopLogoDataUrl,
  shopName,
  t,
}: AppShellProps<TId>) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
    } catch {
      // Ignore storage errors
    }
  }, [isCollapsed]);

  const toggleSidebar = () => setIsCollapsed((prev) => !prev);

  return (
    <div
      dir="ltr"
      className={cn(
        "relative grid min-h-screen overflow-hidden bg-background text-foreground transition-[grid-template-columns] duration-300 ease-in-out",
        dir === "rtl"
          ? isCollapsed
            ? "grid-cols-[minmax(0,1fr)_4.5rem]"
            : "grid-cols-[minmax(0,1fr)_17rem]"
          : isCollapsed
            ? "grid-cols-[4.5rem_minmax(0,1fr)]"
            : "grid-cols-[17rem_minmax(0,1fr)]",
      )}
    >
      {shopLogoDataUrl ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden p-8 select-none"
        >
          <img
            src={shopLogoDataUrl}
            alt=""
            className="max-h-[520px] max-w-[520px] w-2/5 object-contain opacity-[0.045] dark:opacity-[0.065] transition-opacity duration-300"
          />
        </div>
      ) : null}

      <aside
        dir={dir}
        className={cn(
          "sticky top-0 row-start-1 z-10 flex h-screen min-w-0 flex-col border-border/40 bg-card/65 backdrop-blur-md transition-all duration-300 ease-in-out",
          dir === "rtl" ? "border-l" : "border-r",
          dir === "rtl" ? "col-start-2" : "col-start-1",
        )}
      >
        {/* Sidebar Header & Brand */}
        <div className="border-b border-border/40 p-2 sm:p-3">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                type="button"
                onClick={toggleSidebar}
                title={t("Expand Sidebar")}
                className="flex items-center justify-center rounded-xl bg-muted/50 p-1.5 transition-transform hover:scale-105 active:scale-95"
              >
                {shopLogoDataUrl ? (
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card">
                    <img
                      alt={shopName}
                      className="max-h-8 max-w-8 object-contain"
                      src={shopLogoDataUrl}
                    />
                  </div>
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">
                    {getInitial(shopName)}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={toggleSidebar}
                title={t("Expand Sidebar")}
                className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
              >
                {dir === "rtl" ? (
                  <ChevronLeft className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex w-full items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                {shopLogoDataUrl ? (
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card">
                    <img
                      alt={shopName}
                      className="max-h-8 max-w-8 object-contain"
                      src={shopLogoDataUrl}
                    />
                  </div>
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">
                    {getInitial(shopName)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-sm font-bold leading-tight text-foreground">
                    {shopName}
                  </h1>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleSidebar}
                title={t("Collapse Sidebar")}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
              >
                {dir === "rtl" ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-4">
          {getNavigationGroups(navigation).map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              {!isCollapsed ? (
                <p className="px-3 text-xs font-bold text-muted-foreground">
                  {t(group.label)}
                </p>
              ) : (
                <div className="my-1 border-t border-border/40" />
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activePage;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    title={isCollapsed ? t(item.label) : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center rounded-xl text-start text-sm font-semibold transition-all duration-200 active:scale-98",
                      isCollapsed
                        ? "justify-center px-0 w-full"
                        : "w-full gap-3 px-3",
                      isActive
                        ? "bg-accent/80 text-primary shadow-xs hover:bg-accent hover:text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("size-5 shrink-0", isActive && "text-primary")}
                    />
                    {!isCollapsed ? (
                      <span className="truncate">{t(item.label)}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main
        dir={dir}
        className={cn(
          "row-start-1 z-10 h-screen min-w-0 overflow-hidden bg-transparent",
          dir === "rtl" ? "col-start-1" : "col-start-2",
        )}
      >
        {children}
      </main>
    </div>
  );
}

function getNavigationGroups<TId extends string>(
  navigation: ShellNavigationItem<TId>[],
): Array<{ label: string; items: ShellNavigationItem<TId>[] }> {
  const groups: Array<{ label: string; items: ShellNavigationItem<TId>[] }> = [];

  for (const item of navigation) {
    const label = item.group ?? "Operations";
    const existing = groups.find((group) => group.label === label);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return groups;
}

function getInitial(shopName: string): string {
  const trimmed = shopName.trim();

  if (!trimmed) {
    return "R";
  }

  return trimmed.slice(0, 1).toUpperCase();
}
