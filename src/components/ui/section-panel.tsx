import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionPanelProps = Omit<ComponentProps<"section">, "title"> & {
  badge?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  title?: ReactNode;
};

export function SectionPanel({
  badge,
  children,
  className,
  description,
  title,
  ...props
}: SectionPanelProps) {
  return (
    <section
      data-ui="section-panel"
      className={cn("p-5", className)}
      {...props}
    >
      {title || description || badge ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h3 className="text-base font-bold">{title}</h3> : null}
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
