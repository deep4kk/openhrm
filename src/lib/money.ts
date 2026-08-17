/**
 * Money formatting, in one place.
 *
 * Payroll shows the same figure on a run summary, a payslip and a settlement,
 * and they have to match character for character — a rounded ₹1.2L next to an
 * exact ₹1,20,000 reads like a bug even when both are right.
 *
 * Indian digit grouping (1,20,000 rather than 120,000) comes from the en-IN
 * locale, which is what the primary market reads. Everything else is driven by
 * the organisation's own currency setting.
 */

/**
 * What these formatters accept.
 *
 * Money lives in Postgres as `Decimal`, and Prisma hands it back as a Decimal
 * object rather than a number — deliberately, so a currency value never loses
 * precision on the way through. Every one of these functions already narrows
 * with `Number()` as its first act, so the type is widened to match rather than
 * making forty call sites write `Number(payslip.netPay)` and eventually forget
 * one.
 */
export type MoneyInput =
  | number
  | string
  | { toString(): string }
  | null
  | undefined;

export function formatMoney(
  amount: MoneyInput,
  currency = "INR",
  options: { decimals?: boolean } = {},
): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: options.decimals ? 2 : 0,
    maximumFractionDigits: options.decimals ? 2 : 0,
  }).format(value);
}

/** Bare number with grouping — for table columns that share one currency header. */
export function formatAmount(amount: MoneyInput, decimals = 0): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Compact form for dashboard tiles, where the shape of the number matters more
 * than the last three digits. Uses lakh/crore because that is how the figure
 * would be said aloud in the market this targets.
 */
export function formatCompactMoney(
  amount: MoneyInput,
  currency = "INR",
): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "—";

  const symbol = currencySymbol(currency);

  if (currency === "INR") {
    if (Math.abs(value) >= 1_00_00_000) {
      return `${symbol}${trim(value / 1_00_00_000)}Cr`;
    }
    if (Math.abs(value) >= 1_00_000) {
      return `${symbol}${trim(value / 1_00_000)}L`;
    }
    if (Math.abs(value) >= 1_000) {
      return `${symbol}${trim(value / 1_000)}K`;
    }
    return `${symbol}${Math.round(value)}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function trim(value: number): string {
  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * Rounds to whole units. Payroll rounds each component once, at the point it is
 * computed, rather than carrying fractions through and rounding at the end —
 * otherwise the printed lines don't add up to the printed total, which is the
 * one thing an employee will always check.
 */
export function roundMoney(value: number): number {
  return Math.round(value);
}
