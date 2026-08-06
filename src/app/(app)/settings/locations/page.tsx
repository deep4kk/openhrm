import type { Metadata } from "next";
import { MapPin } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { COUNTRIES, timezoneOptions } from "@/lib/locale";
import { saveLocationAction, deleteLocationAction } from "@/lib/actions/settings";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings, Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsSettingsPage() {
  const session = await requirePermission("structure.manage");
  const db = orgDb(session.org.id);

  const [locations, headcount] = await Promise.all([
    db.location.findMany({ orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }] }),
    db.employee.groupBy({
      by: ["locationId"],
      _count: { _all: true },
      where: { status: { not: "EXITED" } },
    }),
  ]);

  const countByLocation = new Map(
    headcount.map((row) => [row.locationId, row._count._all]),
  );

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />
      <PageHeader
        title="Locations"
        description="Offices and sites. A location carries its own timezone and can have its own holidays."
      />

      <Panel
        icon={MapPin}
        title="Locations"
        count={locations.length}
        description="Exactly one location can be headquarters — setting a new one clears the old."
      >
        <RecordEditor
          noun="location"
          addLabel="Add location"
          emptyMessage="No locations yet. Add your first office to assign people to it."
          canManage
          saveAction={saveLocationAction}
          deleteAction={deleteLocationAction}
          records={locations.map((location) => {
            const people = countByLocation.get(location.id) ?? 0;
            return {
              id: location.id,
              title: location.name,
              subtitle: [
                [location.city, location.state].filter(Boolean).join(", ") ||
                  location.country,
                location.timezone,
                `${people} ${people === 1 ? "person" : "people"}`,
              ]
                .filter(Boolean)
                .join(" · "),
              badges: location.isHeadquarters
                ? [{ label: "HQ", tone: "info" as const }]
                : undefined,
              values: {
                name: location.name,
                addressLine1: location.addressLine1 ?? "",
                addressLine2: location.addressLine2 ?? "",
                city: location.city ?? "",
                state: location.state ?? "",
                country: location.country,
                postalCode: location.postalCode ?? "",
                timezone: location.timezone,
                isHeadquarters: location.isHeadquarters,
              },
            };
          })}
          fields={[
            {
              name: "name",
              label: "Name",
              type: "text",
              required: true,
              width: "full",
              placeholder: "Bengaluru HQ",
            },
            {
              name: "addressLine1",
              label: "Address",
              type: "text",
              width: "full",
            },
            { name: "addressLine2", label: "Address line 2", type: "text", width: "full" },
            { name: "city", label: "City", type: "text" },
            { name: "state", label: "State", type: "text" },
            { name: "postalCode", label: "Postal code", type: "text" },
            {
              name: "country",
              label: "Country",
              type: "select",
              required: true,
              placeholder: "Select a country",
              options: COUNTRIES,
            },
            {
              name: "timezone",
              label: "Timezone",
              type: "select",
              required: true,
              width: "full",
              placeholder: "Select a timezone",
              hint: "Attendance at this site is stamped against this zone.",
              // Include the zones already stored, so an existing location never
              // silently re-points at whatever sorts first.
              options: timezoneOptions(
                session.org.timezone,
                ...locations.map((l) => l.timezone),
              ),
            },
            {
              name: "isHeadquarters",
              label: "This is the headquarters",
              type: "checkbox",
            },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
