import { DataValue } from "@/components/common/data-value";
import { ProvenanceBadge } from "@/components/common/provenance";
import { ATTRIBUTES, describeValue, type AttributeMap } from "@/lib/compatibility/attributes";
import type { SpecValue } from "@/types/domain";

/** "11,12,13" → "11, 12, 13" so long lists wrap. */
const display = (v: string | number) => (typeof v === "string" ? v.replace(/,(?=\S)/g, ", ") : v);

export function SpecList({ specs, attributes }: { specs: SpecValue[]; attributes?: AttributeMap }) {
  const attrEntries = Object.entries(attributes ?? {});
  if (specs.length === 0 && attrEntries.length === 0)
    return <p className="text-xs italic text-subtle-foreground">No specifications recorded. Unknown values are left unavailable rather than estimated.</p>;
  return (
    <dl className="divide-y divide-border border-y border-border text-xs">
      {specs.map((s) => (
        <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 py-1.5">
          <dt className="text-muted-foreground">{s.label}</dt>
          <dd className="min-w-0 text-right [overflow-wrap:anywhere]">
            <DataValue>{`${display(s.value)}${s.unit ? ` ${s.unit}` : ""}`}</DataValue>
          </dd>
        </div>
      ))}
      {attrEntries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 py-1.5">
          <dt className="text-muted-foreground">{ATTRIBUTES[k]?.label ?? k}</dt>
          <dd className="min-w-0 text-right [overflow-wrap:anywhere]">
            <DataValue mono={false}>{describeValue(k, v)}</DataValue>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export { ProvenanceBadge };
