import {
  ApiError,
  apiError,
  apiJson,
  authenticateRequest,
  requireApiPermission,
} from "@/lib/api-auth";
import { orgDb } from "@/lib/db";

/**
 * GET /api/v1/employees/:id
 *
 * One employee. Accepts either the cuid or the employee code, because an
 * integrating system almost always holds the code and not our internal id.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await authenticateRequest(request);
    requireApiPermission(context, "employee.read.all", "directory.read");

    const { id } = await params;
    const db = orgDb(context.orgId);

    const employee = await db.employee.findFirst({
      where: { OR: [{ id }, { employeeCode: id }] },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        workEmail: true,
        personalEmail: true,
        phone: true,
        gender: true,
        status: true,
        employmentType: true,
        dateOfJoining: true,
        dateOfExit: true,
        probationEndDate: true,
        noticePeriodDays: true,
        city: true,
        state: true,
        country: true,
        createdAt: true,
        updatedAt: true,
        department: { select: { name: true, code: true } },
        designation: { select: { title: true, level: true } },
        location: { select: { name: true, timezone: true } },
        shift: { select: { name: true, startTime: true, endTime: true } },
        manager: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        },
      },
    });

    if (!employee) {
      throw new ApiError(404, "not_found", "No employee with that id or code.");
    }

    return apiJson({
      data: {
        id: employee.id,
        employee_code: employee.employeeCode,
        first_name: employee.firstName,
        last_name: employee.lastName,
        display_name: employee.displayName,
        work_email: employee.workEmail,
        personal_email: employee.personalEmail,
        phone: employee.phone,
        gender: employee.gender,
        status: employee.status,
        employment_type: employee.employmentType,
        date_of_joining: iso(employee.dateOfJoining),
        date_of_exit: iso(employee.dateOfExit),
        probation_end_date: iso(employee.probationEndDate),
        notice_period_days: employee.noticePeriodDays,
        city: employee.city,
        state: employee.state,
        country: employee.country,
        department: employee.department?.name ?? null,
        department_code: employee.department?.code ?? null,
        designation: employee.designation?.title ?? null,
        location: employee.location?.name ?? null,
        timezone: employee.location?.timezone ?? null,
        shift: employee.shift
          ? {
              name: employee.shift.name,
              start_time: employee.shift.startTime,
              end_time: employee.shift.endTime,
            }
          : null,
        manager: employee.manager
          ? {
              id: employee.manager.id,
              employee_code: employee.manager.employeeCode,
              name: `${employee.manager.firstName} ${employee.manager.lastName}`,
            }
          : null,
        created_at: employee.createdAt.toISOString(),
        updated_at: employee.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}
