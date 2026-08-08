import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { SidePanel } from "@/components/ui/side-panel";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMutation, useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useI18n } from "@/hooks/useI18n";
import type { AccessoryInput, AccessoryRecord } from "@/shared/accessories";
import { Edit, Plus, Shield } from "lucide-react";

export function AccessoriesManagement() {
  const { can } = useAuth();
  const { formatCurrency, t } = useI18n();
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<AccessoryRecord | null>(null);
  const [name, setName] = useState("");
  const [quantityOwned, setQuantityOwned] = useState("");
  const [defaultCharge, setDefaultCharge] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const accessoriesQuery = useBusinessQuery(
    "accessories",
    "list",
    undefined,
    () => rentalAppApi.accessories.list(),
  );
  const items = accessoriesQuery.data?.rows ?? [];
  const loading = accessoriesQuery.isPending;
  const saveAccessory = useBusinessMutation(
    (input: { id: number | null; payload: AccessoryInput }) =>
      input.id === null
        ? rentalAppApi.accessories.create(input.payload)
        : rentalAppApi.accessories.update(input.id, input.payload),
  );

  function openCreate() {
    setEditItem(null);
    setName("");
    setQuantityOwned("5");
    setDefaultCharge("5");
    setNotes("");
    setFormOpen(true);
  }

  function openEdit(item: AccessoryRecord) {
    setEditItem(item);
    setName(item.name);
    setQuantityOwned(String(item.quantityOwned));
    setDefaultCharge(String(item.defaultCharge));
    setNotes(item.notes ?? "");
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        name,
        quantityOwned: Number(quantityOwned) || 0,
        defaultCharge: Number(defaultCharge) || 0,
        isActive: true,
        notes: notes || null,
      };

      await saveAccessory.mutateAsync({ id: editItem?.id ?? null, payload });
      setFormOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Shield className="size-5 text-primary" />
          <span>{t("Accessories & Inventory")}</span>
        </div>

        {can("settings.edit") ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            {t("Add Accessory")}
          </Button>
        ) : null}
      </div>

      <DataTable className="min-w-full">
        <thead>
          <tr>
            <Th>{t("Name")}</Th>
            <Th className="text-center">{t("Owned")}</Th>
            <Th className="text-center">{t("Assigned")}</Th>
            <Th className="text-center">{t("Available")}</Th>
            <Th className="text-end">{t("Daily Rate")}</Th>
            <Th className="text-end">{t("Actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyTableRow colSpan={6} message={t("Loading...")} state="loading" />
          ) : items.length === 0 ? (
            <EmptyTableRow colSpan={6} message={t("No accessories configured yet.")} />
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <Td className="font-semibold">{item.name}</Td>
                <Td className="text-center font-mono">{item.quantityOwned}</Td>
                <Td className="text-center font-mono text-amber-600">{item.quantityAssigned}</Td>
                <Td className="text-center font-mono text-emerald-600 font-bold">{item.quantityAvailable}</Td>
                <Td className="text-end font-mono">{formatCurrency(item.defaultCharge)}</Td>
                <Td className="text-end">
                  <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                    <Edit className="size-3.5" />
                    {t("Edit")}
                  </Button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>

      {/* Create / Edit Form Modal */}
      <SidePanel
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editItem ? t("Edit Accessory") : t("Add Accessory")}
      >
        <form className="flex flex-col gap-4 p-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("Accessory Name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Helmet / GPS / Child Seat" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("Quantity Owned")}</label>
            <Input type="number" value={quantityOwned} onChange={(e) => setQuantityOwned(e.target.value)} required min="0" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("Daily Charge (Dinars)")}</label>
            <Input type="number" step="0.5" value={defaultCharge} onChange={(e) => setDefaultCharge(e.target.value)} required min="0" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("Notes")}</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition, size, etc." />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {t("Save Changes")}
            </Button>
          </div>
        </form>
      </SidePanel>
    </div>
  );
}
