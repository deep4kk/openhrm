"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { saveAssetAction } from "@/lib/actions/assets";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface AssetDraft {
  id?: string;
  name: string;
  assetTag: string;
  categoryId: string;
  serialNumber: string;
  make: string;
  model: string;
  locationId: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyEndsOn: string;
  condition: string;
  status: string;
  note: string;
}

export const EMPTY_ASSET: AssetDraft = {
  name: "",
  assetTag: "",
  categoryId: "",
  serialNumber: "",
  make: "",
  model: "",
  locationId: "",
  purchaseDate: "",
  purchaseCost: "",
  warrantyEndsOn: "",
  condition: "NEW",
  status: "AVAILABLE",
  note: "",
};

const CONDITIONS = [
  { value: "NEW", label: "New" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
  { value: "DAMAGED", label: "Damaged" },
];

/**
 * Adding or editing an asset.
 *
 * The tag is the field that matters: it is what is physically stuck to the
 * laptop, and it is how an admin finds the row six months later when the serial
 * number sticker has worn off. Everything else is optional, because a register
 * nobody fills in is worse than a thin one that people keep current.
 */
export function AssetDialog({
  asset = EMPTY_ASSET,
  categories,
  locations,
  suggestedTag,
}: {
  asset?: AssetDraft;
  categories: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  suggestedTag?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveAssetAction,
    {},
  );
  const router = useRouter();
  const editing = Boolean(asset.id);

  useEffect(() => {
    if (state.success) {
      toast.success(editing ? "Asset updated" : "Asset added");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, editing, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={editing ? "outline" : "default"} />}>
        {editing ? (
          <>
            <Pencil className="size-4" aria-hidden />
            Edit
          </>
        ) : (
          <>
            <Plus className="size-4" aria-hidden />
            Add asset
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit asset" : "Add an asset"}</DialogTitle>
          <DialogDescription>
            The tag is what is stuck on the item. Everything else can be filled in
            later.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <FormError message={state.error} />
          {asset.id && <input type="hidden" name="id" value={asset.id} />}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Name"
              name="name"
              error={state.fieldErrors?.name}
              required
              hint="What it is — MacBook Pro 14, Dell U2723."
            >
              {(p) => <Input {...p} defaultValue={asset.name} maxLength={120} />}
            </FormField>

            <FormField
              label="Asset tag"
              name="assetTag"
              error={state.fieldErrors?.assetTag}
              required
              hint="Your own reference. Must be unique."
            >
              {(p) => (
                <Input
                  {...p}
                  defaultValue={asset.assetTag || (suggestedTag ?? "")}
                  maxLength={40}
                  className="font-mono"
                />
              )}
            </FormField>

            <FormField label="Category" name="categoryId">
              {(p) => (
                <select
                  {...p}
                  defaultValue={asset.categoryId}
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Location" name="locationId">
              {(p) => (
                <select
                  {...p}
                  defaultValue={asset.locationId}
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="">Unassigned</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Serial number" name="serialNumber">
              {(p) => (
                <Input
                  {...p}
                  defaultValue={asset.serialNumber}
                  maxLength={80}
                  className="font-mono"
                />
              )}
            </FormField>

            <FormField label="Make" name="make">
              {(p) => <Input {...p} defaultValue={asset.make} maxLength={60} />}
            </FormField>

            <FormField label="Model" name="model">
              {(p) => <Input {...p} defaultValue={asset.model} maxLength={60} />}
            </FormField>

            <FormField label="Condition" name="condition">
              {(p) => (
                <select
                  {...p}
                  defaultValue={asset.condition}
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Purchased on" name="purchaseDate">
              {(p) => <Input {...p} type="date" defaultValue={asset.purchaseDate} />}
            </FormField>

            <FormField
              label="Purchase cost"
              name="purchaseCost"
              hint="Drives the book-value estimate."
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={asset.purchaseCost}
                  className="tabular-nums"
                />
              )}
            </FormField>

            <FormField label="Warranty ends" name="warrantyEndsOn">
              {(p) => (
                <Input {...p} type="date" defaultValue={asset.warrantyEndsOn} />
              )}
            </FormField>

            {editing && asset.status !== "ASSIGNED" && (
              <FormField
                label="Status"
                name="status"
                hint="Issued assets change status by being returned."
              >
                {(p) => (
                  <select
                    {...p}
                    defaultValue={asset.status}
                    className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="IN_REPAIR">In repair</option>
                    <option value="RETIRED">Retired</option>
                    <option value="LOST">Lost</option>
                  </select>
                )}
              </FormField>
            )}
          </div>

          <FormField label="Note" name="note">
            {(p) => (
              <Textarea {...p} rows={2} defaultValue={asset.note} maxLength={500} />
            )}
          </FormField>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editing ? "Save changes" : "Add asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
