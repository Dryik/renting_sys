import type { ReactNode } from "react";

/**
 * The save/failure notice shown above the tabs.
 */
export function StatusBanner({
  icon,
  message,
  title,
  tone,
}: {
  icon: ReactNode;
  message?: string | null;
  title: string;
  tone: "error" | "info" | "success";
}) {
  const toneClass = {
    error: "border-destructive/20 bg-destructive/5 text-destructive",
    info: "border-primary/20 bg-accent text-primary",
    success: "border-success/20 bg-success/10 text-success",
  }[tone];

  return (
    <div
      aria-live="polite"
      className={`flex items-start gap-3 rounded-md border px-4 py-3 ${toneClass}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        {message ? <p className="mt-1 break-words opacity-80">{message}</p> : null}
      </div>
    </div>
  );
}
