import type { Metadata } from "next";
import { Clock } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { saveShiftAction, deleteShiftAction } from "@/lib/actions/settings";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings, Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";

export const metadata: Metadata = { title: "Shifts" };

/**
 * Shifts decide what attendance *means*: whether a day counts as present, half
 * a day, or late. Editing one changes how future days are graded, which is why
 * the copy names the consequence rather than just the field.
 */
export default async function ShiftsSettingsPage() {
  const session = await requirePermission("shift.manage");
  const db = orgDb(session.org.id);

  const [shifts, headcount] = await Promise.all([
    db.shift.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    db.employee.groupBy({
      by: ["shiftId"],
      _count: { _all: true },
      where: { status: { not: "EXITED" } },
    }),
  ]);

  const countByShift = new Map(
    headcount.map((row) => [row.shiftId, row._count._all]),
  );

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />
      <PageHeader
        title="Shifts"
        description="Working hours, and the thresholds attendance is graded against."
      />

      <Panel
        icon={Clock}
        title="Shifts"
        count={shifts.length}
        description="New employees get the default shift unless you pick another one."
      >
        <RecordEditor
          noun="shift"
          addLabel="Add shift"
          emptyMessage="No shifts yet. Add one so attendance has hours to measure against."
          canManage
          saveAction={saveShiftAction}
          deleteAction={deleteShiftAction}
          records={shifts.map((shift) => {
            const people = countByShift.get(shift.id) ?? 0;
            return {
              id: shift.id,
              title: shift.name,
              subtitle: [
                `${shift.startTime}–${shift.endTime}`,
                `${shift.breakMinutes}m break`,
                `${shift.graceMinutes}m grace`,
                `half day under ${Number(shift.halfDayHours)}h`,
                `${people} ${people === 1 ? "person" : "people"}`,
              ].join(" · "),
              badges: shift.isDefault
                ? [{ label: "Default", tone: "neutral" as const }]
                : undefined,
              values: {
                name: shift.name,
                startTime: shift.startTime,
                endTime: shift.endTime,
                breakMinutes: String(shift.breakMinutes),
                graceMinutes: String(shift.graceMinutes),
                halfDayHours: String(Number(shift.halfDayHours)),
                fullDayHours: String(Number(shift.fullDayHours)),
                isDefault: shift.isDefault,
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
              placeholder: "General shift",
            },
            { name: "startTime", label: "Starts", type: "time", required: true },
            { name: "endTime", label: "Ends", type: "time", required: true },
            {
              name: "breakMinutes",
              label: "Break (minutes)",
              type: "number",
              required: true,
              hint: "Deducted from hours worked.",
            },
            {
              name: "graceMinutes",
              label: "Grace (minutes)",
              type: "number",
              required: true,
              hint: "Lateness tolerated before a day is flagged.",
            },
            {
              name: "halfDayHours",
              label: "Half day at",
              type: "number",
              step: "0.25",
              required: true,
              hint: "Hours below this count as a half day.",
            },
            {
              name: "fullDayHours",
              label: "Full day at",
              type: "number",
              step: "0.25",
              required: true,
              hint: "Hours at or above this count as a full day.",
            },
            {
              name: "isDefault",
              label: "Use as the default shift for new employees",
              type: "checkbox",
            },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
