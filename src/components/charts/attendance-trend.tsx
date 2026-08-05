"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Attendance over the last fortnight.
 *
 * Form: change over time across a continuous axis → lines, not bars.
 *
 * Two series, so a legend is always present and both are also named in the
 * tooltip — identity is never carried by colour alone. Colours are the
 * validated categorical pair (chart-1 / chart-2), which clears CVD separation
 * in both themes; weekly offs are dropped upstream so the line doesn't dive to
 * zero every weekend and imply an attendance collapse.
 *
 * A screen-reader table carries the same numbers, because a line chart is not
 * readable by assistive tech.
 */

const config = {
  present: { label: "Present", color: "var(--chart-1)" },
  absent: { label: "Absent", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function AttendanceTrend({
  data,
}: {
  data: { date: string; present: number; absent: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        No attendance recorded yet.
      </p>
    );
  }

  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
          accessibilityLayer
        >
          {/* Grid stays recessive: horizontal only, so it guides the eye across
              to the axis without competing with the data. */}
          <CartesianGrid vertical={false} strokeDasharray="3 3" />

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={24}
            tickFormatter={formatTick}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            tickMargin={4}
          />

          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={<ChartTooltipContent labelFormatter={formatFullDate} />}
          />

          <Line
            dataKey="present"
            type="monotone"
            stroke="var(--color-present)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
          <Line
            dataKey="absent"
            type="monotone"
            stroke="var(--color-absent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />

          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>

      <table className="sr-only">
        <caption>Attendance by day for the last two weeks</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Present</th>
            <th scope="col">Absent</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.date}>
              <th scope="row">{formatFullDate(row.date)}</th>
              <td>{row.present}</td>
              <td>{row.absent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function formatTick(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatFullDate(value: unknown): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(String(value)));
}
