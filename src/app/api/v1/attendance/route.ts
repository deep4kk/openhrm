import {
  ApiError,
  apiError,
  apiJson,
  authenticateRequest,
  readPaging,
  requireApiPermission,
} from "@/lib/api-auth";
import { orgDb } from "@/lib/db";
import { toDateOnly } from "@/lib/dates";

/**
 * GET /api/v1/attendance
 *
 * Attendance records for a date range. `from` is required and the range is
 * capped at 92 days — an unbounded query over a 5,000-person org's whole
 * history is not something an integration should be able to ask for by
 * forgetting a parameter.
 */
const MAX_RANGE_DAYS = 92;

export async function GET(request: Request) {
  try {
    const context = await authenticateRequest(request);
    requireApiPermission(context, "attendance.read.all");

    const url = new URL(request.url);
    const { take, skip } = readPaging(request);

    const fromParam = url.searchParams.get("from");
    if (!fromParam || Number.isNaN(Date.parse(fromParam))) {
      throw new ApiError(
        400,
        "bad_request",
        "`from` is required, as an ISO date — for example ?from=2026-08-01.",
      );
    }

    const from = toDateOnly(new Date(fromParam));
    const toParam = url.searchParams.get("to");
    const to =
      toParam && !Number.isNaN(Date.parse(toParam))
        ? toDateOnly(new Date(toParam))
        : new Date(from.getTime() + 30 * 86_400_000);

    if (to < from) {
      throw new ApiError(400, "bad_request", "`to` is before `from`.");
    }
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      throw new ApiError(
        400,
        "range_too_wide",
        `Ask for at most ${MAX_RANGE_DAYS} days at a time.`,
      );
    }

    const employeeCode = url.searchParams.get("employee_code");
    const db = orgDb(context.orgId);

    const where = {
      date: { gte: from, lte: to },
      ...(employeeCode ? { employee: { employeeCode } } : {}),
    };

    const [total, records] = await Promise.all([
      db.attendanceRecord.count({ where }),
      db.attendanceRecord.findMany({
        where,
        orderBy: [{ date: "desc" }],
        take,
        skip,
        select: {
          id: true,
          date: true,
          checkInAt: true,
          checkOutAt: true,
          workedMinutes: true,
          status: true,
          isLate: true,
          source: true,
          employee: { select: { id: true, employeeCode: true } },
        },
      }),
    ]);

    return apiJson({
      data: records.map((record) => ({
        id: record.id,
        employee_id: record.employee.id,
        employee_code: record.employee.employeeCode,
        date: record.date.toISOString().slice(0, 10),
        check_in_at: record.checkInAt?.toISOString() ?? null,
        check_out_at: record.checkOutAt?.toISOString() ?? null,
        worked_minutes: record.workedMinutes,
        status: record.status,
        is_late: record.isLate,
        source: record.source,
      })),
      paging: { total, limit: take, offset: skip },
      range: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
