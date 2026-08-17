import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  deleteCustomFieldAction,
  saveCustomFieldAction,
} from "@/lib/actions/custom-fields";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";

export const metadata: Metadata = { title: "Custom fields" };

const TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "SELECT", label: "Dropdown" },
  { value: "BOOLEAN", label: "Yes / no" },
];

/**
 * Extra fields on the employee record (PRD §8.3).
 *
 * The escape hatch that stops "we need to track X" from being a feature
 * request. Deliberately plain: a label, a type, an optional list of choices.
 */
export default async function CustomFieldsPage() {
  const session = await requirePermission("customfield.manage");

  const fields = await orgDb(session.org.id).customFieldDefinition.findMany({
    orderBy: [{ section: "asc" }, { sortdex: "asc" }, { label: "asc" }],
    include: { _count: { select: { values: true } } },
  });

  return (
    <PageShell className="max-w-3xl">
      <BackToSettings />

      <PageHeader
        title="Custom fields"
        description="Anything your organisation tracks that OpenHRM doesn't ship — blood group, T-shirt size, locker number. They appear on the employee record under the section you name."
      />

      <div className="surface p-5">
        <RecordEditor
          canManage
          noun="field"
          addLabel="Add a field"
          emptyMessage="No custom fields yet."
          saveAction={saveCustomFieldAction}
          deleteAction={deleteCustomFieldAction}
          fields={[
            { name: "label", label: "Label", type: "text", required: true },
            {
              name: "key",
              label: "Key",
              type: "text",
              hint: "Lower case, no spaces. Set once — values are stored against it. Leave blank to derive it from the label.",
            },
            {
              name: "type",
              label: "Type",
              type: "select",
              required: true,
              options: TYPES,
            },
            {
              name: "section",
              label: "Section",
              type: "text",
              hint: "Groups it on the profile — “Personal”, “IT”, “Compliance”.",
            },
            {
              name: "options",
              label: "Choices",
              type: "text",
              width: "full",
              hint: "Dropdowns only. Comma separated.",
            },
            {
              name: "helpText",
              label: "Help text",
              type: "text",
              width: "full",
            },
            {
              name: "required",
              label: "Required",
              type: "checkbox",
              width: "full",
            },
          ]}
          records={fields.map((field) => ({
            id: field.id,
            title: field.label,
            subtitle: [
              field.key,
              TYPES.find((t) => t.value === field.type)?.label ?? field.type,
              field.section,
              `${field._count.values} value${field._count.values === 1 ? "" : "s"}`,
            ].join(" · "),
            badges: [
              ...(field.required
                ? [{ label: "Required", tone: "info" as const }]
                : []),
              ...(field.isActive
                ? []
                : [{ label: "Hidden", tone: "warning" as const }]),
            ],
            values: {
              label: field.label,
              key: field.key,
              type: field.type,
              section: field.section,
              options: field.options.join(", "),
              helpText: field.helpText ?? "",
              required: field.required,
            },
          }))}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        A field&apos;s key and type are fixed once it has been created — values
        already recorded are stored against both. The label, section, help text
        and choices can be changed at any time.
      </p>
    </PageShell>
  );
}
