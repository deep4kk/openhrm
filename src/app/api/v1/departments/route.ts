import {
  apiError,
  apiJson,
  authenticateRequest,
  requireApiPermission,
} from "@/lib/api-auth";
import { orgDb } from "@/lib/db";

/**
 * GET /api/v1/departments
 *
 * The org structure, with live headcount. Small enough that it is never paged
 * — an organisation with more than two hundred departments has a different
 * problem than this endpoint.
 */
export async function GET(request: Request) {
  try {
    const context = await authenticateRequest(request);
    requireApiPermission(context, "org.read", "directory.read", "employee.read.all");

    const db = orgDb(context.orgId);

    const departments = await db.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        parentId: true,
        head: { select: { employeeCode: true } },
        _count: { select: { employees: true } },
      },
    });

    return apiJson({
      data: departments.map((department) => ({
        id: department.id,
        name: department.name,
        code: department.code,
        parent_id: department.parentId,
        head_employee_code: department.head?.employeeCode ?? null,
        headcount: department._count.employees,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
