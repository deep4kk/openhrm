import {
  apiError,
  apiJson,
  authenticateRequest,
  readPaging,
  requireApiPermission,
} from "@/lib/api-auth";
import { orgDb } from "@/lib/db";

/**
 * GET /api/v1/leave
 *
 * Leave requests, filterable by status and date range. This is the endpoint a
 * payroll integration or a resourcing tool actually wants: who is off, when,
 * and whether it was approved.
 */
export async function GET(request: Request) {
  try {
    const context = await authenticateRequest(request);
    requireApiPermission(context, "leave.read.all");

    const url = new URL(request.url);
    const { take, skip } = readPaging(request);

    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const employeeCode = url.searchParams.get("employee_code");

    const db = orgDb(context.orgId);

    const where = {
      ...(status ? { status: status as "APPROVED" } : {}),
      ...(employeeCode ? { employee: { employeeCode } } : {}),
      // Overlap, not containment: a request spanning the window should appear
      // even if neither of its own dates falls inside it.
      ...(from && !Number.isNaN(Date.parse(from))
        ? { endDate: { gte: new Date(from) } }
        : {}),
      ...(to && !Number.isNaN(Date.parse(to))
        ? { startDate: { lte: new Date(to) } }
        : {}),
    };

    const [total, requests] = await Promise.all([
      db.leaveRequest.count({ where }),
      db.leaveRequest.findMany({
        where,
        orderBy: { startDate: "desc" },
        take,
        skip,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          days: true,
          isHalfDay: true,
          halfDaySession: true,
          status: true,
          reason: true,
          decidedAt: true,
          createdAt: true,
          employee: { select: { id: true, employeeCode: true, workEmail: true } },
          leaveType: { select: { name: true, code: true, isPaid: true } },
          approver: { select: { employeeCode: true } },
        },
      }),
    ]);

    return apiJson({
      data: requests.map((request) => ({
        id: request.id,
        employee_id: request.employee.id,
        employee_code: request.employee.employeeCode,
        employee_email: request.employee.workEmail,
        leave_type: request.leaveType.name,
        leave_type_code: request.leaveType.code,
        is_paid: request.leaveType.isPaid,
        start_date: request.startDate.toISOString().slice(0, 10),
        end_date: request.endDate.toISOString().slice(0, 10),
        days: Number(request.days),
        is_half_day: request.isHalfDay,
        half_day_session: request.halfDaySession,
        status: request.status,
        reason: request.reason,
        approver_code: request.approver?.employeeCode ?? null,
        decided_at: request.decidedAt?.toISOString() ?? null,
        created_at: request.createdAt.toISOString(),
      })),
      paging: { total, limit: take, offset: skip },
    });
  } catch (error) {
    return apiError(error);
  }
}
