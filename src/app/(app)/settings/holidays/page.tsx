import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { saveHolidayAction, deleteHolidayAction } from "@/lib/actions/settings";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings, Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Holidays" };

/**
 * The holiday calendar, one year at a time.
 *
 * Scoped to a year because a holiday list is inherently annual — showing five
 * years at once buries the one being edited. The year comes from the URL so the
 * view is linkable and the back button works.
 */
export default async function HolidaysSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requirePermission("holiday.manage");
  const db = orgDb(session.org.id);

  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const parsedYear = Number(yearParam);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 1970 && parsedYear <= 2100
      ? parsedYear
      : currentYear;

  const [holidays, locations] = await Promise.all([
    db.holiday.findMany({
      where: {
        date: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      orderBy: { date: "asc" },
      include: { location: { select: { name: true } } },
    }),
    db.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const years = [year - 1, year, year + 1];

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />
      <PageHeader
        title="Holidays"
        description="Days the organisation is closed. Leave taken on a holiday isn't deducted from anyone's balance."
      />

      <Panel
        icon={CalendarOff}
        title={`Holidays in ${year}`}
        count={holidays.length}
        description="Leave the location blank for a holiday everyone observes."
        action={
          <nav className="flex items-center gap-1" aria-label="Choose year">
            {years.map((option) => (
              <Link
                key={option}
                href={`/settings/holidays?year=${option}`}
                aria-current={option === year ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors",
                  option === year
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </Link>
            ))}
          </nav>
        }
      >
        <RecordEditor
          noun="holiday"
          addLabel="Add holiday"
          emptyMessage={`No holidays recorded for ${year}.`}
          canManage
          saveAction={saveHolidayAction}
          deleteAction={deleteHolidayAction}
          records={holidays.map((holiday) => ({
            id: holiday.id,
            title: holiday.name,
            subtitle: [
              formatDate(holiday.date),
              holiday.location?.name ?? "All locations",
            ].join(" · "),
            badges: holiday.isOptional
              ? [{ label: "Optional", tone: "neutral" as const }]
              : undefined,
            values: {
              name: holiday.name,
              // <input type="date"> wants YYYY-MM-DD, and the column is date-only
              // stored at UTC midnight — so slicing the ISO string is exact.
              date: holiday.date.toISOString().slice(0, 10),
              locationId: holiday.locationId ?? "",
              isOptional: holiday.isOptional,
            },
          }))}
          fields={[
            { name: "name", label: "Name", type: "text", required: true },
            { name: "date", label: "Date", type: "date", required: true },
            {
              name: "locationId",
              label: "Location",
              type: "select",
              placeholder: "All locations",
              width: "full",
              options: locations.map((l) => ({ value: l.id, label: l.name })),
            },
            {
              name: "isOptional",
              label: "Optional (restricted) holiday",
              type: "checkbox",
              hint: "Employees choose which of these to take, rather than the office closing.",
            },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
