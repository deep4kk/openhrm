/**
 * Country, currency and timezone lists for the settings forms.
 *
 * All three are derived from the Intl data already in the runtime rather than
 * hand-maintained arrays. A hard-coded list of "common" countries is the kind
 * of shortcut that works until the first person self-hosts somewhere it left
 * out — and it silently ages every year.
 *
 * Built once at module load. The country sweep is 676 `DisplayNames` lookups,
 * which is microseconds, and it runs on the server only.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface LocaleOption {
  value: string;
  label: string;
}

function buildCountries(): LocaleOption[] {
  const names = new Intl.DisplayNames(["en"], {
    type: "region",
    fallback: "none",
  });

  const output: LocaleOption[] = [];
  for (const first of ALPHABET) {
    for (const second of ALPHABET) {
      const code = `${first}${second}`;
      // `fallback: "none"` returns undefined for codes that aren't real
      // regions, which is exactly the filter we want.
      const label = names.of(code);
      if (label && label !== code) output.push({ value: code, label });
    }
  }
  return output.sort((a, b) => a.label.localeCompare(b.label));
}

function buildCurrencies(): LocaleOption[] {
  const names = new Intl.DisplayNames(["en"], {
    type: "currency",
    fallback: "none",
  });

  const codes = supportedValues("currency");
  return codes
    .map((code) => ({
      value: code,
      label: `${code} — ${names.of(code) ?? code}`,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function buildTimezones(): LocaleOption[] {
  return supportedValues("timeZone")
    .map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** `Intl.supportedValuesOf` is ES2022; degrade to a usable minimum without it. */
function supportedValues(key: "currency" | "timeZone"): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (k: string) => string[];
  };
  if (typeof intl.supportedValuesOf === "function") {
    return intl.supportedValuesOf(key);
  }
  return key === "currency"
    ? ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"]
    : ["Asia/Kolkata", "UTC", "Europe/London", "America/New_York"];
}

export const COUNTRIES: LocaleOption[] = buildCountries();
export const CURRENCIES: LocaleOption[] = buildCurrencies();
export const TIMEZONES: LocaleOption[] = buildTimezones();

/**
 * The timezone list, guaranteed to contain the values actually stored.
 *
 * Node's ICU reports the *legacy* IANA spellings — `Asia/Calcutta`, not
 * `Asia/Kolkata` — while the schema and most of the world use the modern ones.
 * A `<select>` whose value matches no option silently displays its first entry,
 * so an admin opening Settings would see "Africa/Abidjan", and saving an
 * otherwise untouched form would quietly move the whole organisation's
 * timezone. Attendance would then be stamped against the wrong day.
 *
 * Rather than hand-maintaining an alias table that ages, any stored value the
 * runtime doesn't offer is added to the list as-is. The form then shows the
 * truth, and leaving it alone changes nothing.
 */
export function timezoneOptions(
  ...current: (string | null | undefined)[]
): LocaleOption[] {
  const known = new Set(TIMEZONES.map((zone) => zone.value));
  const missing = current.filter(
    (value): value is string => Boolean(value) && !known.has(value!),
  );

  if (missing.length === 0) return TIMEZONES;

  return [
    ...TIMEZONES,
    ...Array.from(new Set(missing)).map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    })),
  ].sort((a, b) => a.label.localeCompare(b.label));
}

export const MONTHS: LocaleOption[] = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Date(Date.UTC(2000, index, 1)).toLocaleString("en", {
    month: "long",
    timeZone: "UTC",
  }),
}));

/** ISO weekday numbers, Monday first — the order `workingDays` is stored in. */
export const WEEKDAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
] as const;
