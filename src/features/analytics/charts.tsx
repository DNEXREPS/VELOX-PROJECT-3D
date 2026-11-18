"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { stroke: "var(--subtle-foreground)", fontSize: 11 };
const tooltipStyle = { background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, color: "var(--foreground)" };

export function WeightByGroupChart({ data }: { data: { label: string; weightG: number }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Component weight by group">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)} kg`} />
          <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={96} />
          <Tooltip cursor={{ fill: "var(--surface-raised)" }} contentStyle={tooltipStyle} formatter={(v) => [`${Math.round(Number(v))} g`, "Known weight"]} />
          <Bar dataKey="weightG" fill="var(--accent)" radius={[0, 2, 2, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostByYearChart({ data, currency }: { data: { year: string; total: number }[]; currency: string }) {
  return (
    <div className="h-48 w-full" role="img" aria-label={`Service cost per year in ${currency}`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="year" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
          <Tooltip cursor={{ fill: "var(--surface-raised)" }} contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(2)} ${currency}`, "Cost"]} />
          <Bar dataKey="total" fill="var(--info)" radius={[2, 2, 0, 0]} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
