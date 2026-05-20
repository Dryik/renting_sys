import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ShellNavigationItem<TId extends string> = {
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
  shopName: string;
  t: (key: string) => string;
};

export function AppShell<TId extends string>({
  activePage,
  children,
  dir,
  navigation,
  onNavigate,
  shopName,
  t,
}: AppShellProps<TId>) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "flex w-60 shrink-0 flex-col bg-card",
          dir === "rtl" ? "border-l" : "border-r",
        )}
      >
        <div className="border-b px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground shadow-xs">
              {getInitial(shopName)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">{shopName}</h1>
              <p className="truncate text-sm text-muted-foreground">{t("Rental Desk")}</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activePage;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-start text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground",
                )}
              >
                <Icon data-icon="inline-start" />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}

function getInitial(shopName: string): string {
  const trimmed = shopName.trim();

  if (!trimmed) {
    return "R";
  }

  return trimmed.slice(0, 1).toUpperCase();
}
