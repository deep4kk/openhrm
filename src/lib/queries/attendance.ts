import "server-only";

import { cache } from "react";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { resolveEmployeeScope, employeeIdFilter } from "../scope";
import { endOfMonth, startOfMonth, toDateOnly, isoWeekday } from "../dates";

/**
 * Attendance reads.
 *
 * One row per employee per calendar day is the invariant everything else leans
 * on — it makes "was Priya in on the 4th?" a primary-key lookup rather than a
 * scan over punch events, and it means a duplicate check-in can't create a
 * second day.
 */

export async function getTodayRecord(
  session: AuthContext,
  employeeId: string,
) {
  const db = orgDb(session.org.id);
  return db.attendanceRecord.findFirst({
    where: { employeeId, date: toDateOnly(new Date()) },
    include: { shift: true },
  });
}

/** Everyone in scope, with today's record attached — the "who's in" board. */
export async function getTodayBoard(session: AuthContext) {
  const db = orgDb(session.org.id);

  const scope = await resolveEmployeeScope(session, "attendance.read");
  if (!scope) return [];

  const today = toDateOnly(new Date());

  const employees = await db.employee.findMany({
    where: {
      status: { notIn: ["EXITED"] },
      ...(scope.scope === "all" ? {} : { id: { in: scope.employeeIds ?? [] } }),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      employeeCode: true,
      department: { select: { name: true } },
      designation: { select: { title: true } },
      attendance: {
        where: { date: today },
        select: {
          id: true,
          checkInAt: true,
          checkOutAt: true,
          workedMinutes: true,
          status: true,
          isLate: true,
        },
      },
    },
    orderBy: [{ firstName: "asc" }],
  });

  return employees.map((employee) => ({
    ...employee,
    today: employee.attendance[0] ?? null,
  }));
}

export async function getMonthlyAttendance(
  session: AuthContext,
  employeeId: string,
  month: Date = new Date(),
) {
  const db = orgDb(session.org.id);

  return db.attendanceRecord.findMany({
    where: {
      employeeId,
      date: { gte: startOfMonth(month), lte: endOfMonth(month) },
    },
    orderBy: { date: "desc" },
    include: { shift: { select: { startTime: true, endTime: true } } },
  });
}

/**
 * Month summary for one employee.
 *
 * Percentages are computed against *working* days, not calendar days — an
 * "80% attendance" that counts Sundays as absences is worse than no number.
 */
export async function getMonthSummary(
  session: AuthContext,
  employeeId: string,
  month: Date = new Date(),
) {
  const records = await getMonthlyAttendance(session, employeeId, month);

  const workingDayRecords = records.filter(
    (r) => r.status !== "WEEKLY_OFF" && r.status !== "HOLIDAY",
  );

  const present = records.filter((r) => r.status === "PRESENT").length;
  const halfDays = records.filter((r) => r.status === "HALF_DAY").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const onLeave = records.filter((r) => r.status === "ON_LEAVE").length;
  const late = records.filter((r) => r.isLate).length;
  const totalMinutes = records.reduce((sum, r) => sum + r.workedMinutes, 0);

  const expected = workingDayRecords.length;
  const credited = present + halfDays * 0.5;

  return {
    present,
    halfDays,
    absent,
    onLeave,
    late,
    totalMinutes,
    expected,
    credited,
    attendanceRate: expected > 0 ? Math.round((credited / expected) * 100) : 0,
    averageMinutes:
      present + halfDays > 0
        ? Math.round(totalMinutes / (present + halfDays))
        : 0,
  };
}

/** Headline numbers for today, used by the dashboards. */
/**
 * Today's board totals.
 *
 * Cached on the session because the dashboard stat row and the attendance page
 * header ask the same question, and on the dashboard it now streams inside its
 * own Suspense boundary.
 */
export const getTodaySummary = cache(async function getTodaySummary(
  session: AuthContext,
) {
  const db = orgDb(session.org.id);
  const today = toDateOnly(new Date());
  const weekday = isoWeekday(today);
  const isWorkingDay = session.org.workingDays.includes(weekday);

  const [headcount, records] = await Promise.all([
    db.employee.count({ where: { status: { notIn: ["EXITED"] } } }),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { date: today },
      _count: { _all: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    records.map((r) => [r.status, r._count._all]),
  );

  const present = (byStatus.PRESENT ?? 0) + (byStatus.HALF_DAY ?? 0);

  return {
    headcount,
    present,
    absent: byStatus.ABSENT ?? 0,
    onLeave: byStatus.ON_LEAVE ?? 0,
    notMarked: Math.max(
      headcount -
        Object.values(byStatus).reduce((a, b) => a + b, 0),
      0,
    ),
    isWorkingDay,
  };
});

/** Daily present-count for the last N days — the dashboard trend line. */
export async function getAttendanceTrend(session: AuthContext, days = 14) {
  const db = orgDb(session.org.id);

  const end = toDateOnly(new Date());
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const records = await db.attendanceRecord.groupBy({
    by: ["date", "status"],
    where: { date: { gte: start, lte: end } },
    _count: { _all: true },
  });

  const byDate = new Map<string, { present: number; absent: number }>();

  for (const row of records) {
    const key = row.date.toISOString().slice(0, 10);
    const entry = byDate.get(key) ?? { present: 0, absent: 0 };
    if (row.status === "PRESENT" || row.status === "HALF_DAY") {
      entry.present += row._count._all;
    } else if (row.status === "ABSENT") {
      entry.absent += row._count._all;
    }
    byDate.set(key, entry);
  }

  const series: { date: string; present: number; absent: number }[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = byDate.get(key) ?? { present: 0, absent: 0 };
    // Weekly offs would flatline the chart at zero and hide the real pattern.
    if (session.org.workingDays.includes(isoWeekday(cursor))) {
      series.push({ date: key, ...entry });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}

export async function getPendingRegularizations(session: AuthContext) {
  const db = orgDb(session.org.id);

  const scope = await resolveEmployeeScope(
    session,
    "attendance.regularize.approve",
  );
  if (!scope) return [];

  return db.attendanceRegularization.findMany({
    where: {
      status: "PENDING",
      ...(scope.scope === "all" ? {} : employeeIdFilter(scope)),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
        },
      },
    },
    orderBy: { date: "desc" },
  });
}

export async function getMyRegularizations(
  session: AuthContext,
  employeeId: string,
) {
  const db = orgDb(session.org.id);
  return db.attendanceRegularization.findMany({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      reviewer: { select: { firstName: true, lastName: true } },
    },
  });
}
