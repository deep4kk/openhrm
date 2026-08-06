import type { Metadata } from "next";
import { Palmtree } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { saveLeaveTypeAction, deleteLeaveTypeAction } from "@/lib/actions/settings";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings, Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";

export const metadata: Metadata = { title: "Leave types" };

const ACCRUAL_LABELS: Record<string, string> = {
  NONE: "Credited upfront",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
};

/**
 * Leave types are the rules every balance in the system is calculated from,
 * so this screen states the consequence of each field rather than its name.
 *
 * Note the delete behaviour: a type anybody has ever used cannot be deleted,
 * only switched off. Its balances and ledger cascade, and erasing the record of
 * leave someone actually took is not a thing an HR system should make easy.
 */
export default async function LeaveTypesSettingsPage() {
  const session = await requirePermission("leave.type.manage");
  const db = orgDb(session.org.id);

  const [leaveTypes, usage] = await Promise.all([
    db.leaveType.findMany({ orderBy: [{ sortdex: "asc" }, { name: "asc" }] }),
    db.leaveRequest.groupBy({ by: ["leaveTypeId"], _count: { _all: true } }),
  ]);

  const requestsByType = new Map(
    usage.map((row) => [row.leaveTypeId, row._count._all]),
  );

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />
      <PageHeader
        title="Leave types"
        description="Accrual, carry-forward and notice rules. Changing these changes what everyone's balance will be at the next accrual run."
      />

      <Panel
        icon={Palmtree}
        title="Leave types"
        count={leaveTypes.length}
        description="Switching a type off hides it from the apply form and keeps every past record intact."
      >
        <RecordEditor
          noun="leave type"
          addLabel="Add leave type"
          emptyMessage="No leave types yet. Add one before anyone can apply for leave."
          canManage
          saveAction={saveLeaveTypeAction}
          deleteAction={deleteLeaveTypeAction}
          records={leaveTypes.map((type) => {
            const requests = requestsByType.get(type.id) ?? 0;
            return {
              id: type.id,
              title: type.name,
              subtitle: [
                type.accrualFrequency === "NONE"
                  ? `${Number(type.openingBalance)} days upfront`
                  : `${Number(type.accrualAmount)}/${ACCRUAL_LABELS[type.accrualFrequency].toLowerCase()}`,
                type.carryForward
                  ? type.carryForwardCap
                    ? `carries up to ${Number(type.carryForwardCap)}`
                    : "carries over"
                  : "expires yearly",
                type.minNoticeDays > 0
                  ? `${type.minNoticeDays} days notice`
                  : "no notice",
                `${requests} ${requests === 1 ? "request" : "requests"}`,
              ].join(" · "),
              badges: [
                { label: type.code },
                type.isPaid
                  ? { label: "Paid", tone: "positive" as const }
                  : { label: "Unpaid", tone: "neutral" as const },
                ...(type.isActive
                  ? []
                  : [{ label: "Inactive", tone: "warning" as const }]),
              ],
              values: {
                name: type.name,
                code: type.code,
                description: type.description ?? "",
                colorToken: type.colorToken,
                isPaid: type.isPaid,
                requiresApproval: type.requiresApproval,
                allowHalfDay: type.allowHalfDay,
                countsHolidays: type.countsHolidays,
                accrualFrequency: type.accrualFrequency,
                accrualAmount: String(Number(type.accrualAmount)),
                openingBalance: String(Number(type.openingBalance)),
                maxBalance:
                  type.maxBalance === null ? "" : String(Number(type.maxBalance)),
                carryForward: type.carryForward,
                carryForwardCap:
                  type.carryForwardCap === null
                    ? ""
                    : String(Number(type.carryForwardCap)),
                maxConsecutiveDays:
                  type.maxConsecutiveDays === null
                    ? ""
                    : String(type.maxConsecutiveDays),
                minNoticeDays: String(type.minNoticeDays),
                applicableGender: type.applicableGender ?? "",
                isActive: type.isActive,
                sortdex: String(type.sortdex),
              },
            };
          })}
          fields={[
            { name: "name", label: "Name", type: "text", required: true },
            {
              name: "code",
              label: "Code",
              type: "text",
              required: true,
              hint: "Short, e.g. EL. Stored uppercase.",
            },
            {
              name: "description",
              label: "Description",
              type: "textarea",
              width: "full",
              hint: "Shown to employees on the apply form.",
            },
            {
              name: "accrualFrequency",
              label: "Accrues",
              type: "select",
              required: true,
              options: [
                { value: "NONE", label: "Not at all — credited upfront" },
                { value: "MONTHLY", label: "Monthly" },
                { value: "QUARTERLY", label: "Quarterly" },
                { value: "ANNUALLY", label: "Annually" },
              ],
            },
            {
              name: "accrualAmount",
              label: "Days per accrual",
              type: "number",
              step: "0.5",
              hint: "Ignored when credited upfront.",
            },
            {
              name: "openingBalance",
              label: "Opening balance",
              type: "number",
              step: "0.5",
              hint: "Credited at the start of the leave year.",
            },
            {
              name: "maxBalance",
              label: "Maximum balance",
              type: "number",
              step: "0.5",
              hint: "Blank for no ceiling.",
            },
            {
              name: "minNoticeDays",
              label: "Notice required (days)",
              type: "number",
            },
            {
              name: "maxConsecutiveDays",
              label: "Maximum consecutive days",
              type: "number",
              hint: "Blank for no limit.",
            },
            {
              name: "carryForwardCap",
              label: "Carry-forward cap",
              type: "number",
              step: "0.5",
              hint: "Blank means unlimited. Only applies when carry-forward is on.",
            },
            {
              name: "applicableGender",
              label: "Restricted to",
              type: "select",
              placeholder: "Everyone",
              hint: "For maternity and paternity leave.",
              options: [
                { value: "FEMALE", label: "Women" },
                { value: "MALE", label: "Men" },
                { value: "OTHER", label: "Other" },
                { value: "UNDISCLOSED", label: "Undisclosed" },
              ],
            },
            {
              name: "colorToken",
              label: "Colour",
              type: "select",
              placeholder: "Default",
              hint: "Used on the leave calendar and charts.",
              options: [
                { value: "chart-1", label: "Chart 1" },
                { value: "chart-2", label: "Chart 2" },
                { value: "chart-3", label: "Chart 3" },
                { value: "chart-4", label: "Chart 4" },
                { value: "chart-5", label: "Chart 5" },
              ],
            },
            {
              name: "sortdex",
              label: "Display order",
              type: "number",
              hint: "Lower appears first.",
            },
            { name: "isPaid", label: "Paid leave", type: "checkbox" },
            {
              name: "requiresApproval",
              label: "Requires approval",
              type: "checkbox",
              hint: "Off means requests are auto-approved on submission.",
            },
            {
              name: "allowHalfDay",
              label: "Half days allowed",
              type: "checkbox",
            },
            {
              name: "countsHolidays",
              label: "Count weekends and holidays inside the range",
              type: "checkbox",
              hint: "Usually off — most policies only deduct working days.",
            },
            {
              name: "carryForward",
              label: "Unused days carry into the next leave year",
              type: "checkbox",
            },
            {
              name: "isActive",
              label: "Available to apply for",
              type: "checkbox",
              hint: "Switch off to retire a type without touching its history.",
            },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
