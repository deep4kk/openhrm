import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can, canAny } from "../auth";
import { addDays, today } from "../dates";

/**
 * Exit management reads (PRD §8.21).
 *
 * A resignation is the spine: the clearance checklist, the exit interview and
 * the full-and-final settlement all hang off it, and the detail query pulls all
 * three so the exit screen answers "is this person ready to leave on Friday?"
 * in one round trip.
 */

export async function listResignations(
  session: AuthContext,
  filters: { status?: string } = {},
) {
  const db = orgDb(session.org.id);
  const orgWide = canAny(session, "exit.read.all", "exit.manage", "settlement.manage");

  if (!orgWide && !session.employee) return [];

  return db.resignation.findMany({
    where: {
      ...(orgWide ? {} : { employeeId: session.employee!.id }),
      ...(filters.status === "live"
        ? { status: { in: ["SUBMITTED", "ACCEPTED"] } }
        : filters.status && filters.status !== "all"
          ? { status: filters.status as "SUBMITTED" }
          : {}),
    },
    orderBy: [{ status: "asc" }, { lastWorkingDayRequested: "asc" }],
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
          dateOfJoining: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
        },
      },
      decidedBy: { select: { firstName: true, lastName: true } },
      clearance: {
        include: { tasks: { select: { status: true, dueDate: true } } },
      },
      settlement: { select: { id: true, status: true, netPayable: true } },
      exitInterview: { select: { id: true, submittedAt: true } },
    },
  });
}

export async function getResignation(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  const resignation = await db.resignation.findFirst({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
          workEmail: true,
          dateOfJoining: true,
          noticePeriodDays: true,
          ctcAnnual: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      decidedBy: { select: { firstName: true, lastName: true } },
      clearance: {
        include: {
          tasks: {
            orderBy: { sortdex: "asc" },
            include: {
              assignee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      exitInterview: {
        include: { conductedBy: { select: { firstName: true, lastName: true } } },
      },
      settlement: {
        include: { approvedBy: { select: { name: true } } },
      },
    },
  });

  if (!resignation) return null;

  const orgWide = canAny(session, "exit.read.all", "exit.manage", "settlement.manage");
  if (!orgWide && resignation.employeeId !== session.employee?.id) return null;

  return resignation;
}

/** The signed-in employee's own live resignation, if they have one. */
export async function myResignation(session: AuthContext) {
  if (!session.employee) return null;
  const db = orgDb(session.org.id);

  return db.resignation.findFirst({
    where: {
      employeeId: session.employee.id,
      status: { in: ["SUBMITTED", "ACCEPTED"] },
    },
    include: {
      clearance: { include: { tasks: { select: { status: true } } } },
      exitInterview: { select: { id: true, submittedAt: true } },
      settlement: { select: { status: true, netPayable: true } },
    },
  });
}

/**
 * Exit headlines.
 *
 * "Leaving within 30 days" is the one that drives action: it is the window in
 * which handover, clearance and the final settlement all have to happen, and
 * missing it is how a leaver ends up with unreturned kit and an unpaid balance.
 */
export async function exitSummary(session: AuthContext) {
  const db = orgDb(session.org.id);
  if (!canAny(session, "exit.read.all", "exit.manage")) return null;

  const now = today();
  const horizon = addDays(now, 30);

  const [pending, accepted, leavingSoon, unsettled, thisYear] = await Promise.all([
    db.resignation.count({ where: { status: "SUBMITTED" } }),
    db.resignation.count({ where: { status: "ACCEPTED" } }),
    db.resignation.count({
      where: {
        status: "ACCEPTED",
        lastWorkingDayApproved: { gte: now, lte: horizon },
      },
    }),
    db.finalSettlement.count({ where: { status: { in: ["PENDING", "COMPUTED"] } } }),
    db.resignation.count({
      where: {
        status: "COMPLETED",
        submittedAt: { gte: new Date(now.getUTCFullYear(), 0, 1) },
      },
    }),
  ]);

  return { pending, accepted, leavingSoon, unsettled, thisYear };
}

/**
 * Everything the settlement calculator needs about one leaver.
 *
 * Gathered here rather than in the action so the figures can be shown before
 * anyone commits to them — a full-and-final that appears fully formed with no
 * working shown is one nobody trusts and everybody queries.
 */
export async function settlementInputs(session: AuthContext, resignationId: string) {
  const db = orgDb(session.org.id);
  if (!can(session, "settlement.manage")) return null;

  const resignation = await db.resignation.findFirst({
    where: { id: resignationId },
    include: {
      employee: {
        select: {
          id: true,
          dateOfJoining: true,
          ctcAnnual: true,
          noticePeriodDays: true,
        },
      },
    },
  });
  if (!resignation) return null;

  const { employee } = resignation;
  const lastDay =
    resignation.lastWorkingDayApproved ?? resignation.lastWorkingDayRequested;

  const [balances, loans, claims, assets] = await Promise.all([
    db.leaveBalance.findMany({
      where: { employeeId: employee.id },
      include: { leaveType: { select: { name: true, isPaid: true } } },
    }),
    db.loanAdvance.findMany({
      where: { employeeId: employee.id, status: "ACTIVE" },
    }),
    db.expenseClaim.findMany({
      where: { employeeId: employee.id, status: "APPROVED" },
      select: { id: true, title: true, totalAmount: true },
    }),
    db.assetAssignment.findMany({
      where: { employeeId: employee.id, returnedOn: null },
      include: { asset: { select: { name: true, assetTag: true } } },
    }),
  ]);

  // Encashable leave is the unused balance on paid types. Unpaid leave has no
  // cash value, so it never enters the calculation.
  const encashableDays = balances
    .filter((b) => b.leaveType.isPaid)
    .reduce((sum, b) => {
      const entitled =
        Number(b.openingBalance) +
        Number(b.accrued) +
        Number(b.carriedForward) +
        Number(b.adjusted);
      return sum + Math.max(0, entitled - Number(b.used));
    }, 0);

  const annualCtc = Number(employee.ctcAnnual ?? 0);
  const monthlyGross = annualCtc / 12;
  const perDay = monthlyGross / 30;

  const servedYears =
    (lastDay.getTime() - employee.dateOfJoining.getTime()) /
    (365.25 * 86_400_000);

  // Indian gratuity: 15 days' wages per completed year, on basic — approximated
  // here as half of gross, matching the default salary structure. Payable after
  // five years. Labelled as an estimate in the UI, and editable.
  const gratuityEligible = servedYears >= 5;
  const gratuityAmount = gratuityEligible
    ? Math.round((monthlyGross * 0.5 * 15 * Math.floor(servedYears)) / 26)
    : 0;

  // A loan carries its principal and how much has been recovered so far; what
  // is left is the difference, which is what a settlement has to claw back.
  const outstandingLoans = loans.reduce(
    (sum, loan) =>
      sum + Math.max(0, Number(loan.principal) - Number(loan.recovered)),
    0,
  );
  const pendingReimbursements = claims.reduce(
    (sum, claim) => sum + Number(claim.totalAmount),
    0,
  );

  // Notice shortfall is recovered at per-day gross for each day not served.
  const noticeGiven = Math.round(
    (lastDay.getTime() - resignation.submittedAt.getTime()) / 86_400_000,
  );
  const shortfallDays = Math.max(
    0,
    (resignation.noticePeriodDays || employee.noticePeriodDays) - noticeGiven,
  );

  return {
    lastDay,
    servedYears: Math.round(servedYears * 10) / 10,
    monthlyGross: Math.round(monthlyGross),
    perDay: Math.round(perDay),
    encashableDays: Math.round(encashableDays * 100) / 100,
    leaveEncashmentAmount: Math.round(encashableDays * perDay),
    gratuityEligible,
    gratuityAmount,
    outstandingLoans: Math.round(outstandingLoans),
    pendingReimbursements: Math.round(pendingReimbursements),
    shortfallDays,
    noticePayRecovery: Math.round(shortfallDays * perDay),
    unreturnedAssets: assets.map((a) => ({
      name: a.asset.name,
      tag: a.asset.assetTag,
    })),
    loans: loans.map((l) => ({
      id: l.id,
      reason: l.reason,
      principal: Number(l.principal),
      outstanding: Math.max(0, Number(l.principal) - Number(l.recovered)),
    })),
    claims: claims.map((c) => ({
      id: c.id,
      title: c.title,
      amount: Number(c.totalAmount),
    })),
  };
}
