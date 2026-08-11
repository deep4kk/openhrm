/**
 * Naming a payroll period.
 *
 * Lives here rather than in src/lib/actions/payroll.ts because every export of
 * a `"use server"` module must be an async server action — a plain synchronous
 * helper in that file fails the build. It is imported by three payroll screens
 * and by the actions themselves, so it needs a home that is neither.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "March 2026" — how a payroll run is referred to everywhere it appears. */
export function periodLabel(month: number, year: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}
