import {
  apiError,
  apiJson,
  authenticateRequest,
  readPaging,
  requireApiPermission,
} from "@/lib/api-auth";
import { orgDb } from "@/lib/db";

/**
 * GET /api/v1/employees
 *
 * The employee directory. Compensation and encrypted columns are never
 * returned by this endpoint at all — not gated behind a permission, absent.
 * A read API is the wrong shape for handing out bank details, and leaving the
 * capability out entirely is a stronger guarantee than a check somebody could
 * later relax.
 */
export async function GET(request: Request) {
  try {
    const context = await authenticateRequest(request);
    requireApiPermission(context, "employee.read.all", "directory.read");

    const url = new URL(request.url);
    const { take, skip } = readPaging(request);

    const status = url.searchParams.get("status");
    const department = url.searchParams.get("department");
    const updatedSince = url.searchParams.get("updated_since");

    const db = orgDb(context.orgId);

    const where = {
      ...(status ? { status: status as "ACTIVE" } : { status: { not: "EXITED" as const } }),
      ...(department ? { department: { code: department } } : {}),
      ...(updatedSince && !Number.isNaN(Date.parse(updatedSince))
        ? { updatedAt: { gte: new Date(updatedSince) } }
        : {}),
    };

    const [total, employees] = await Promise.all([
      db.employee.count({ where }),
      db.employee.findMany({
        where,
        orderBy: [{ employeeCode: "asc" }],
        take,
        skip,
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          workEmail: true,
          phone: true,
          status: true,
          employmentType: true,
          dateOfJoining: true,
          dateOfExit: true,
          updatedAt: true,
          department: { select: { name: true, code: true } },
          designation: { select: { title: true } },
          location: { select: { name: true } },
          manager: { select: { id: true, employeeCode: true } },
        },
      }),
    ]);

    return apiJson({
      data: employees.map((employee) => ({
        id: employee.id,
        employee_code: employee.employeeCode,
        first_name: employee.firstName,
        last_name: employee.lastName,
        display_name: employee.displayName,
        work_email: employee.workEmail,
        phone: employee.phone,
        status: employee.status,
        employment_type: employee.employmentType,
        date_of_joining: iso(employee.dateOfJoining),
        date_of_exit: iso(employee.dateOfExit),
        department: employee.department?.name ?? null,
        department_code: employee.department?.code ?? null,
        designation: employee.designation?.title ?? null,
        location: employee.location?.name ?? null,
        manager_id: employee.manager?.id ?? null,
        manager_code: employee.manager?.employeeCode ?? null,
        updated_at: employee.updatedAt.toISOString(),
      })),
      paging: { total, limit: take, offset: skip },
    });
  } catch (error) {
    return apiError(error);
  }
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}
