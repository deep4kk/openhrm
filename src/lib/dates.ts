/**
 * Date handling.
 *
 * Two rules this module exists to enforce:
 *
 * 1. A calendar date is not an instant. "5 August" is the same day whether you
 *    are in Kolkata or Berlin, so dates stored as `@db.Date` are handled at UTC
 *    midnight and never shifted by a timezone. Getting this wrong is how leave
 *    requests silently gain or lose a day.
 *
 * 2. Working days are an organisation setting, not a constant. Some of our
 *    users run Sunday–Thursday weeks. Nothing here assumes Saturday/Sunday.
 */

/** Strips the time component, anchoring to UTC midnight. */
export function toDateOnly(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Today, as a date-only value. */
export function today(): Date {
  return toDateOnly(new Date());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateOnly(a).getTime() === toDateOnly(b).getTime();
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: Date): number {
  const day = toDateOnly(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Every date from `start` to `end`, inclusive. */
export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let cursor = toDateOnly(start);
  const last = toDateOnly(end);
  // Guard against an inverted range producing an infinite loop.
  let guard = 0;
  while (cursor <= last && guard++ < 3660) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function isWorkingDay(date: Date, workingDays: number[]): boolean {
  return workingDays.includes(isoWeekday(date));
}

/**
 * Counts the working days in a range, excluding weekly offs and the supplied
 * holidays. This is the number a leave request actually deducts — an employee
 * taking Friday to Monday off over a five-day week is charged two days, not four.
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  workingDays: number[],
  holidays: Date[] = [],
): number {
  const holidaySet = new Set(holidays.map((h) => toDateOnly(h).getTime()));

  return eachDay(start, end).filter((day) => {
    if (!isWorkingDay(day, workingDays)) return false;
    if (holidaySet.has(day.getTime())) return false;
    return true;
  }).length;
}

// ---------------------------------------------------------------------------
// Leave years
// ---------------------------------------------------------------------------

/**
 * The leave year a date falls in, keyed by the organisation's fiscal start.
 *
 * With an April start (the Indian default), 2026-03-31 belongs to leave year
 * 2025 and 2026-04-01 begins 2026. Accruals, carry-forward and balance rows all
 * hang off this number, so it has exactly one definition.
 */
export function leaveYearOf(date: Date, fiscalYearStartMonth: number): number {
  const d = toDateOnly(date);
  const month = d.getUTCMonth() + 1;
  return month >= fiscalYearStartMonth
    ? d.getUTCFullYear()
    : d.getUTCFullYear() - 1;
}

export function leaveYearBounds(
  year: number,
  fiscalYearStartMonth: number,
): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, fiscalYearStartMonth - 1, 1));
  const end = addDays(
    new Date(Date.UTC(year + 1, fiscalYearStartMonth - 1, 1)),
    -1,
  );
  return { start, end };
}

/** Months elapsed in the leave year, used to prorate monthly accrual. */
export function monthsElapsedInLeaveYear(
  date: Date,
  fiscalYearStartMonth: number,
): number {
  const year = leaveYearOf(date, fiscalYearStartMonth);
  const { start } = leaveYearBounds(year, fiscalYearStartMonth);
  const d = toDateOnly(date);
  return (
    (d.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (d.getUTCMonth() - start.getUTCMonth()) +
    1
  );
}

// ---------------------------------------------------------------------------
// Ranges used by dashboards
// ---------------------------------------------------------------------------

export function startOfMonth(date: Date): Date {
  const d = toDateOnly(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  const d = toDateOnly(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function startOfWeek(date: Date, weekStartsOn = 1): Date {
  const d = toDateOnly(date);
  const current = isoWeekday(d);
  const diff = (current - weekStartsOn + 7) % 7;
  return addDays(d, -diff);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return DATE_FORMAT.format(typeof date === "string" ? new Date(date) : date);
}

export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return DATE_SHORT.format(typeof date === "string" ? new Date(date) : date);
}

/** A date range, collapsing "5 Aug – 5 Aug" to a single date. */
export function formatDateRange(start: Date, end: Date): string {
  if (isSameDay(start, end)) return formatDate(start);
  return `${formatDateShort(start)} – ${formatDate(end)}`;
}

/**
 * Wall-clock time in a given zone, for check-in/out stamps.
 *
 * The formatter is kept per zone rather than rebuilt per call. Constructing an
 * Intl.DateTimeFormat is not free — it resolves a locale and loads timezone
 * data — and the attendance board calls this twice for every person on it, so
 * a thirty-person team was paying for sixty formatters to render one table.
 * The map stays small in practice: it is keyed by timezone, and an
 * organisation has one.
 */
const TIME_FORMATS = new Map<string, Intl.DateTimeFormat>();

function timeFormatFor(timeZone: string): Intl.DateTimeFormat {
  let format = TIME_FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone,
    });
    TIME_FORMATS.set(timeZone, format);
  }
  return format;
}

export function formatTime(
  value: Date | string | null | undefined,
  timeZone = "UTC",
): string {
  if (!value) return "—";
  return timeFormatFor(timeZone).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "7h 45m" — durations read better than decimal hours on a timesheet. */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "in 3 days" / "2 days ago" — relative time without pulling in a library. */
export function formatRelative(date: Date | string): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const diffMs = target.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffDays) >= 1) return rtf.format(diffDays, "day");

  const diffHours = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHours) >= 1) return rtf.format(diffHours, "hour");

  const diffMinutes = Math.round(diffMs / 60_000);
  return rtf.format(diffMinutes, "minute");
}

/** Parses an "HH:mm" shift time onto a given date, in UTC. */
export function applyTimeToDate(date: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const d = toDateOnly(date);
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}
