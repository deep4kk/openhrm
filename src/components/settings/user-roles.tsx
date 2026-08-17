"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  changeUserRoleAction,
  setUserStatusAction,
} from "@/lib/actions/platform";
import { Button } from "@/components/ui/button";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  status: string;
  roleId: string;
  isSelf: boolean;
  employee: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    employeeCode: string;
  } | null;
}

/**
 * Who holds which role.
 *
 * The role select writes immediately, and a change takes effect on that
 * person's very next request — permissions are read per request rather than
 * baked into their session token, so revoking access does not wait for a token
 * to expire. Suspending, by contrast, ends their sessions there and then.
 */
export function UserRoles({
  users,
  roles,
}: {
  users: UserRow[];
  roles: { id: string; name: string }[];
}) {
  return (
    <ul className="surface divide-y overflow-hidden">
      {users.map((user) => (
        <UserRow key={user.id} user={user} roles={roles} />
      ))}
    </ul>
  );
}

function UserRow({
  user,
  roles,
}: {
  user: UserRow;
  roles: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const suspended = user.status === "SUSPENDED";

  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-[14rem] flex-1">
        {user.employee ? (
          <PersonCell
            firstName={user.employee.firstName}
            lastName={user.employee.lastName}
            avatarUrl={user.employee.avatarUrl}
            secondary={user.email}
            size="sm"
          />
        ) : (
          <div>
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-muted-foreground text-xs">{user.email}</p>
          </div>
        )}
      </div>

      {suspended && <StatusBadge label="Suspended" tone="critical" />}
      {user.isSelf && <StatusBadge label="You" tone="info" />}

      <select
        value={user.roleId}
        disabled={pending || suspended}
        aria-label={`Role for ${user.name}`}
        onChange={(e) =>
          startTransition(async () => {
            const result = await changeUserRoleAction(user.id, e.target.value);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Role changed");
            router.refresh();
          })
        }
        className="border-input bg-background h-9 w-40 shrink-0 rounded-lg border px-2.5 text-sm disabled:opacity-60"
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>

      {!user.isSelf && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (
              !suspended &&
              !confirm(
                `Suspend ${user.name}? They are signed out everywhere immediately.`,
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await setUserStatusAction(
                user.id,
                suspended ? "ACTIVE" : "SUSPENDED",
              );
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success(suspended ? "Reactivated" : "Suspended");
              router.refresh();
            });
          }}
        >
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      )}
    </li>
  );
}
