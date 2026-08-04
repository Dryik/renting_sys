import { useId, type ComponentProps } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/useI18n";

type LocalizedDateInputProps = Omit<ComponentProps<"input">, "type"> & {
  displayValue?: string | Date | null;
  type?: "date" | "datetime-local";
};

export function LocalizedDateInput({
  "aria-describedby": ariaDescribedBy,
  displayValue,
  type = "date",
  ...props
}: LocalizedDateInputProps) {
  const { formatDate, formatDateTime, locale, t } = useI18n();
  const hintId = useId();
  const normalized = displayValue
    ? type === "datetime-local"
      ? formatDateTime(displayValue)
      : formatDate(displayValue)
    : "";

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        {...props}
        aria-describedby={[ariaDescribedBy, hintId].filter(Boolean).join(" ")}
        data-ltr="true"
        lang={locale}
        type={type}
      />
      <p className="text-xs text-muted-foreground" id={hintId}>
        {normalized ? (
          <>
            {t("Date format")}: <BidiValue value={normalized} />
          </>
        ) : (
          <>
            {t("Date format")}: <BidiValue value={type === "date" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm"} />
          </>
        )}
      </p>
    </div>
  );
}
