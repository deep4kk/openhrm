import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { RoleEditor } from "@/components/settings/role-editor";
import { UserRoles } from "@/components/settings/user-roles";

export const metadata: Metadata = { title: "Roles & permissions" };

/**
 * The permission system, exposed.
 *
 * Two halves: what each role can do, and who is on which role. Kept on one
 * screen because the two questions are always asked together — "can Priya
 * approve payroll?" is answered by joining them.
 */
export default async function RolesPage() {
  const session = await requirePermission("role.manage");
  const db = orgDb(session.org.id);

  const [roles, users] = await Promise.all([
    db.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { _count: { select: { users: true } } },
    }),
    db.user.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            employeeCode: true,
          },
        },
      },
    }),
  ]);

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />

      <PageHeader
        title="Roles & permissions"
        description="Roles are compositions of permissions, not tiers. Every check in the app asks whether someone holds a specific permission — never what their role is called."
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold">Roles</h2>
        <RoleEditor
          roles={roles.map((role) => ({
            id: role.id,
            key: role.key,
            name: role.name,
            description: role.description ?? "",
            permissions: role.permissions,
            isSystem: role.isSystem,
            userCount: role._count.users,
          }))}
          permissions={PERMISSIONS.map((permission) => ({
            key: permission.key,
            label: permission.label,
            group: permission.group,
            description: permission.description,
            sensitive: "sensitive" in permission && permission.sensitive === true,
          }))}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          People
          <span className="text-muted-foreground ml-2 font-normal tabular-nums">
            {users.length}
          </span>
        </h2>
        <UserRoles
          roles={roles.map((role) => ({ id: role.id, name: role.name }))}
          users={users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            status: user.status,
            roleId: user.roleId,
            isSelf: user.id === session.user.id,
            employee: user.employee,
          }))}
        />
      </section>

      <p className="text-muted-foreground text-xs">
        A role change takes effect on that person&apos;s next click — permissions
        are read from the database on every request rather than baked into their
        session. Suspending an account ends its sessions immediately.
      </p>
    </PageShell>
  );
}
