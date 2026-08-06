import type { Metadata } from "next";
import { Network, Award } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  saveDepartmentAction,
  deleteDepartmentAction,
  saveDesignationAction,
  deleteDesignationAction,
} from "@/lib/actions/settings";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings, Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";

export const metadata: Metadata = { title: "Structure" };

/**
 * Departments and designations.
 *
 * They share a page because they answer the same question from two directions —
 * which part of the company someone sits in, and how senior they are within it.
 * Both feed the employee form, the org chart and headcount reporting.
 */
export default async function StructureSettingsPage() {
  const session = await requirePermission("structure.manage");
  const db = orgDb(session.org.id);

  const [departments, designations, employees, headcount] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.designation.findMany({ orderBy: [{ level: "desc" }, { title: "asc" }] }),
    db.employee.findMany({
      where: { status: { not: "EXITED" } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.employee.groupBy({
      by: ["departmentId"],
      _count: { _all: true },
      where: { status: { not: "EXITED" } },
    }),
  ]);

  const countByDepartment = new Map(
    headcount.map((row) => [row.departmentId, row._count._all]),
  );
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));
  const employeeName = new Map(
    employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]),
  );

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${e.firstName} ${e.lastName}`.trim() || e.employeeCode,
  }));

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />
      <PageHeader
        title="Structure"
        description="Departments group people; designations rank them. Both appear on the employee record and drive reporting."
      />

      <Panel
        icon={Network}
        title="Departments"
        count={departments.length}
        description="A department can sit under another one — that nesting is what the org chart reads."
      >
        <RecordEditor
          noun="department"
          addLabel="Add department"
          emptyMessage="No departments yet. Add the first one to start grouping people."
          canManage
          saveAction={saveDepartmentAction}
          deleteAction={deleteDepartmentAction}
          records={departments.map((department) => {
            const headcountLabel = countByDepartment.get(department.id) ?? 0;
            const parent = department.parentId
              ? departmentName.get(department.parentId)
              : undefined;
            const head = department.headId
              ? employeeName.get(department.headId)
              : undefined;

            return {
              id: department.id,
              title: department.name,
              subtitle: [
                `${headcountLabel} ${headcountLabel === 1 ? "person" : "people"}`,
                parent ? `under ${parent}` : undefined,
                head ? `led by ${head}` : undefined,
              ]
                .filter(Boolean)
                .join(" · "),
              badges: [{ label: department.code }],
              values: {
                name: department.name,
                code: department.code,
                parentId: department.parentId ?? "",
                headId: department.headId ?? "",
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
              hint: "Short identifier, e.g. ENG. Stored uppercase.",
            },
            {
              name: "parentId",
              label: "Sits under",
              type: "select",
              placeholder: "Top level",
              options: departments.map((d) => ({ value: d.id, label: d.name })),
            },
            {
              name: "headId",
              label: "Department head",
              type: "select",
              placeholder: "Not set",
              options: employeeOptions,
            },
          ]}
        />
      </Panel>

      <Panel
        icon={Award}
        title="Designations"
        count={designations.length}
        description="Level orders the org chart and seniority reports. Higher is more senior; ties are fine."
      >
        <RecordEditor
          noun="designation"
          addLabel="Add designation"
          emptyMessage="No designations yet."
          canManage
          saveAction={saveDesignationAction}
          deleteAction={deleteDesignationAction}
          records={designations.map((designation) => ({
            id: designation.id,
            title: designation.title,
            subtitle: `Level ${designation.level}`,
            values: {
              title: designation.title,
              level: String(designation.level),
            },
          }))}
          fields={[
            { name: "title", label: "Title", type: "text", required: true },
            {
              name: "level",
              label: "Level",
              type: "number",
              required: true,
              hint: "0–100. Only the relative order matters.",
            },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
