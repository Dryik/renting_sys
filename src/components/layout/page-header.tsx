import type { ReactNode } from "react";

type PageHeaderProps = {
  actions?: ReactNode;
  account?: ReactNode;
  description?: string;
  title: string;
};

export function PageHeader({
  account,
  actions,
  description,
  title,
}: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-card/95 px-5 py-3 shadow-xs backdrop-blur lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 text-start">
          <h2 className="text-xl font-bold tracking-normal text-card-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {actions}
          {account}
        </div>
      </div>
    </header>
  );
}
