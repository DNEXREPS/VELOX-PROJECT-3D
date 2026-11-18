import type { GearCell } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Ratio matrix: chainrings × cogs. Development/speed only when circumference is known. */
export function GearTable({ cells, chainrings, cogs, showDevelopment }: { cells: GearCell[]; chainrings: number[]; cogs: number[]; showDevelopment: boolean }) {
  const max = Math.max(...cells.map((c) => c.ratio));
  const min = Math.min(...cells.map((c) => c.ratio));
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface">
          <tr>
            <th className="sticky left-0 bg-surface px-2 py-1.5 text-left font-medium text-muted-foreground">Ring \ Cog</th>
            {cogs.map((c) => <th key={c} className="figure px-2 py-1.5 text-right font-medium text-muted-foreground">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {chainrings.map((ring) => (
            <tr key={ring}>
              <th className="figure sticky left-0 bg-surface px-2 py-1.5 text-left font-medium">{ring}T</th>
              {cogs.map((cog) => {
                const cell = cells.find((c) => c.chainring === ring && c.cog === cog)!;
                const t = (cell.ratio - min) / Math.max(0.0001, max - min);
                return (
                  <td key={cog} className={cn("figure px-2 py-1.5 text-right")} style={{ backgroundColor: `color-mix(in oklch, var(--accent) ${Math.round(t * 22)}%, transparent)` }} title={showDevelopment && cell.developmentM ? `${cell.developmentM} m/rev · ${cell.speedAt90} km/h @ 90 rpm` : undefined}>
                    {cell.ratio.toFixed(2)}
                    {showDevelopment && cell.developmentM !== null && <span className="block text-[10px] text-subtle-foreground">{cell.developmentM} m</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
