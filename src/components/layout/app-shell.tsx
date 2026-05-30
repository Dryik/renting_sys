import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
  return (
    <div
      dir="ltr"
      className={cn(
        "relative grid min-h-screen overflow-hidden bg-background text-foreground",
        dir === "rtl"
          ? "grid-cols-[minmax(0,1fr)_17rem]"
          : "grid-cols-[17rem_minmax(0,1fr)]",
      )}
    >
      <aside
        dir={dir}
        className={cn(
          "sticky top-0 row-start-1 z-10 flex h-screen min-w-0 flex-col border-border/40 bg-card/65 backdrop-blur-md",
          dir === "rtl" ? "border-l" : "border-r",
          dir === "rtl" ? "col-start-2" : "col-start-1",
        )}
      >
        <div className="border-b border-border/40 px-5 py-5">
          <div className="flex items-center gap-3 rounded-2xl bg-muted/40 px-3 py-3">
            {shopLogoDataUrl ? (
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card">
                <img
                  alt={shopName}
                  className="max-h-9 max-w-9 object-contain"
                  src={shopLogoDataUrl}
                />
              </div>
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
                {getInitial(shopName)}
              </div>
            )}
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold leading-tight text-foreground">
                  {shopName}
                </h1>
              </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
          {getNavigationGroups(navigation).map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-3 text-xs font-bold text-muted-foreground">
                {t(group.label)}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activePage;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-semibold transition-all duration-200 active:scale-98",
                      isActive
                        ? "bg-accent/80 text-primary shadow-xs hover:bg-accent hover:text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("size-5 shrink-0", isActive && "text-primary")}
                    />
                    <span className="truncate">{t(item.label)}</span>
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
