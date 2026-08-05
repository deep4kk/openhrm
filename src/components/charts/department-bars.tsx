"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Headcount by department.
 *
 * Form: magnitude compared across named categories → bars. Horizontal, because
 * department names are words and horizontal bars let them sit on one line
 * instead of being rotated 45° or truncated.
 *
 * This is ONE series measured across categories, so it is ONE colour. Painting
 * each bar a different hue would imply the colours mean something — the classic
 * rainbow-bar mistake. Length already encodes the value; colour would be noise.
 *
 * Values are labelled directly at the end of each bar, so the chart is readable
 * without hovering and without a y-axis to trace back to.
 */

const config = {
  count: { label: "People", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function DepartmentBars({
  data,
}: {
  data: { name: string; count: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        No departments set up yet.
      </p>
    );
  }

  // Enough room per row to stay legible; the container grows with the data
  // rather than squeezing ten departments into a fixed height.
  const height = Math.max(data.length * 34 + 16, 140);

  return (
    <>
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height }}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 36, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            dataKey="name"
            type="category"
            tickLine={false}
            axisLine={false}
            width={104}
            tickMargin={6}
          />

          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel={false} />}
          />

          {/* 4px rounded data-end, square against the baseline — the bar reads
              as growing from the axis rather than floating. */}
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            radius={[0, 4, 4, 0]}
            barSize={16}
          >
            <LabelList
              dataKey="count"
              position="right"
              offset={8}
              className="fill-muted-foreground"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ChartContainer>

      <table className="sr-only">
        <caption>Headcount by department</caption>
        <thead>
          <tr>
            <th scope="col">Department</th>
            <th scope="col">People</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
