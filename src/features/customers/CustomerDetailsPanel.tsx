import { Edit, IdCard, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { CustomerPhotoAvatar } from "@/components/ui/customer-photo-avatar";
import { DocumentPhotoSection } from "@/components/ui/document-photo-section";
import { useI18n } from "@/hooks/useI18n";
import type { CustomerRecord } from "@/shared/customers";

type CustomerDetailsPanelProps = {
  customer: CustomerRecord;
  onEdit?: () => void;
};

export function CustomerDetailsPanel({ customer, onEdit }: CustomerDetailsPanelProps) {
  const { formatDate, t } = useI18n();

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <CustomerPhotoAvatar
            alt={customer.fullName}
            className="size-14 border"
            customerId={customer.id}
            iconClassName="size-6"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold tracking-normal">{customer.fullName}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Added")} <BidiValue value={formatDate(customer.createdAt)} />
            </p>
          </div>
          {onEdit ? (
            <Button type="button" size="sm" variant="outline" onClick={onEdit}>
              <Edit data-icon="inline-start" />
              {t("Edit")}
            </Button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Detail icon={<Phone className="size-4" />} label={t("Phone")} value={<BidiValue value={customer.phone} wrap />} />
          <Detail label={t("Second Phone")} value={customer.secondaryPhone ? <BidiValue value={customer.secondaryPhone} wrap /> : t("No second phone")} />
          <Detail icon={<IdCard className="size-4" />} label={t("National ID / Passport")} value={customer.nationalId ? <BidiValue value={customer.nationalId} wrap /> : t("No ID")} />
          <Detail label={t("Driver License")} value={customer.driverLicenseNo ? <BidiValue value={customer.driverLicenseNo} wrap /> : t("No license")} />
          <Detail label={t("License Expiry")} value={customer.licenseExpiryDate ? <BidiValue value={formatDate(customer.licenseExpiryDate)} /> : t("No date")} />
          <Detail label={t("Address")} value={customer.address || t("No address")} />
        </div>

        {customer.notes ? (
          <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="mb-1 font-medium">{t("Notes")}</p>
            <p className="text-muted-foreground" dir="auto">{customer.notes}</p>
          </div>
        ) : null}
      </section>

      <DocumentPhotoSection entityType="customer" entityId={customer.id} />
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
      <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="break-words font-medium">{value}</div>
    </div>
  );
}
