import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A labelled row that opens another admin screen.
 */
export function AdminShortcut({
  description,
  icon,
  label,
  onClick,
}: {
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full justify-start gap-3 whitespace-normal p-3 text-start"
      onClick={onClick}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </Button>
  );
}
