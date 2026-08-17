import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/page-header";
import { cn } from "@/lib/utils";

/**
 * Loading shapes, one per layout this app actually uses.
 *
 * Every screen here is server-rendered against a live database, so a navigation
 * costs a round trip no amount of query tuning removes. What we control is what
 * the person sees during it. Without a fallback the browser sits on the old
 * page with no acknowledgement of the click, and a 400ms wait reads as a broken
 * button; with one, the same 400ms reads as a page arriving.
 *
 * These deliberately mirror the geometry of the real screens — same header
 * block, same stat grid, same table column count — so content swaps in without
 * anything jumping. A generic centred spinner would be less work and would
 * measurably feel worse, because it throws away the layout and then throws it
 * back.
 *
 * `aria-hidden` throughout: the loading state is decoration. Screen readers are
 * told about the transition by the router's own live region, and announcing
 * forty empty boxes on top of that would be noise.
 */

function Bar({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4", className)} aria-hidden="true" />;
}

/** Title + description block that opens every screen. */
export function HeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-6 w-44" aria-hidden="true" />
        <Skeleton className="h-4 w-72 max-w-full" aria-hidden="true" />
      </div>
      {actions && <Skeleton className="h-9 w-28 shrink-0" aria-hidden="true" />}
    </div>
  );
}

/** The four-tile summary row. Matches StatRow's grid exactly. */
export function StatRowSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: tiles }, (_, i) => (
        <div key={i} className="surface space-y-3 p-4">
          <Bar className="w-20" />
          <Skeleton className="h-7 w-16" aria-hidden="true" />
          <Bar className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * A table.
 *
 * Row widths vary on a fixed cycle rather than randomly: a skeleton that
 * reshuffles its own widths between renders draws the eye to the noise instead
 * of the content, and random widths would also differ between the server render
 * and the client, which React flags as a hydration mismatch.
 */
const WIDTHS = ["w-full", "w-4/5", "w-11/12", "w-3/4", "w-5/6"];

export function TableSkeleton({
  rows = 8,
  cols = 5,
  filters = false,
}: {
  rows?: number;
  cols?: number;
  filters?: boolean;
}) {
  return (
    <div className="space-y-3">
      {filters && (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-full max-w-xs" aria-hidden="true" />
          <Skeleton className="h-9 w-32" aria-hidden="true" />
        </div>
      )}
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          {Array.from({ length: cols }, (_, i) => (
            <Bar
              key={i}
              className={cn("h-3", i === 0 ? "w-32" : "flex-1 max-w-24")}
            />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            {Array.from({ length: cols }, (_, c) =>
              c === 0 ? (
                <div key={c} className="flex w-32 items-center gap-2.5">
                  <Skeleton
                    className="size-7 shrink-0 rounded-full"
                    aria-hidden="true"
                  />
                  <Bar className={cn("flex-1", WIDTHS[r % WIDTHS.length])} />
                </div>
              ) : (
                <Bar
                  key={c}
                  className={cn(
                    "max-w-24 flex-1",
                    WIDTHS[(r + c) % WIDTHS.length],
                  )}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cards in a responsive grid — courses, policies, assets, surveys. */
export function CardGridSkeleton({
  cards = 6,
  cols = 3,
}: {
  cards?: number;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2",
        cols === 3 && "lg:grid-cols-3",
      )}
    >
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="surface space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-5 w-32" aria-hidden="true" />
            <Skeleton className="h-5 w-16 rounded-full" aria-hidden="true" />
          </div>
          <Bar className="w-full" />
          <Bar className="w-2/3" />
          <div className="flex gap-2 pt-1">
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A chart panel. Bars are static heights for the same reason table widths are. */
const BAR_HEIGHTS = [45, 70, 55, 85, 60, 95, 50, 75, 65, 90, 58, 80];

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("surface space-y-4 p-4", className)}>
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" aria-hidden="true" />
        <Bar className="h-3 w-56" />
      </div>
      <div className="flex h-48 items-end gap-1.5" aria-hidden="true">
        {BAR_HEIGHTS.map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-sm rounded-b-none"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Two-column detail view: a main panel and a sidebar of facts. */
export function DetailSkeleton({ panels = 2 }: { panels?: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {Array.from({ length: panels }, (_, i) => (
          <div key={i} className="surface space-y-3 p-4">
            <Skeleton className="h-5 w-36" aria-hidden="true" />
            <Bar className="w-full" />
            <Bar className="w-5/6" />
            <Bar className="w-2/3" />
          </div>
        ))}
      </div>
      <div className="surface h-fit space-y-4 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Bar className="h-3 w-20" />
            <Bar className="w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A form. Used by every /new and /edit screen. */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="surface max-w-2xl space-y-5 p-5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Bar className="h-3 w-24" />
          <Skeleton className="h-9 w-full" aria-hidden="true" />
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-9 w-24" aria-hidden="true" />
        <Skeleton className="h-9 w-20" aria-hidden="true" />
      </div>
    </div>
  );
}

/** A vertical list of rows — approvals, tickets, notifications, feed items. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="surface divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 p-4">
          <Skeleton className="size-8 shrink-0 rounded-full" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bar className={cn("h-3.5", WIDTHS[i % WIDTHS.length])} />
            <Bar className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

/**
 * The default page fallback: header, stats, table.
 *
 * Most screens in this product are exactly that shape, so this is what a
 * section gets unless it has a reason to differ.
 */
export function PageSkeleton({
  stats = true,
  children,
}: {
  stats?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <PageShell>
      <HeaderSkeleton />
      {stats && <StatRowSkeleton />}
      {children ?? <TableSkeleton />}
    </PageShell>
  );
}
