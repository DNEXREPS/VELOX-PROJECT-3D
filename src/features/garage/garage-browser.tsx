"use client";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Lock, Globe, Search } from "lucide-react";
import Link from "next/link";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { BICYCLE_CATEGORIES, CATEGORY_LABEL, type BicycleCategory } from "@/lib/domain/bicycle";
import { formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BikeCard } from "./bike-card";

export interface GarageItem {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: BicycleCategory;
  visibility: "private" | "public";
  is_primary: boolean;
  coverUrl: string | null;
  color_hex: string | null;
  weight_kg: number | null;
  model_year: number | null;
  componentCount: number;
  updated_at: string;
}

/** Client-side search/filter over the rider's own (small) collection. */
export function GarageBrowser({ bikes }: { bikes: GarageItem[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [visibility, setVisibility] = useState<string>("");
  const [sort, setSort] = useState("primary");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = bikes.filter(
      (b) =>
        (!needle || [b.name, b.brand, b.model].some((v) => v?.toLowerCase().includes(needle))) &&
        (!category || b.category === category) &&
        (!visibility || b.visibility === visibility),
    );
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "updated" ? b.updated_at.localeCompare(a.updated_at) : Number(b.is_primary) - Number(a.is_primary),
    );
  }, [bikes, q, category, visibility, sort]);

  const categories = BICYCLE_CATEGORIES.filter((c) => bikes.some((b) => b.category === c));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, model" className="pl-9" aria-label="Search bicycles" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="sm:w-40">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </NativeSelect>
          <NativeSelect value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Visibility" className="sm:w-32">
            <option value="">Any visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </NativeSelect>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="col-span-2 sm:w-36">
            <option value="primary">Primary first</option>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
          </NativeSelect>
        </div>
        <div className="hidden gap-1 sm:flex" role="group" aria-label="View">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              aria-label={v === "grid" ? "Grid view" : "List view"}
              className={cn("grid size-9 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground", view === v && "bg-surface-raised text-foreground")}
            >
              {v === "grid" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No bicycles match these filters" description="Adjust the search or filters." />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((b) => (
            <BikeCard
              key={b.id}
              data={{
                href: `/garage/${b.id}`,
                name: b.name,
                brand: b.brand,
                model: b.model,
                category: b.category,
                coverUrl: b.coverUrl,
                colorHex: b.color_hex,
                isPrimary: b.is_primary,
                badges: <VisibilityBadge v={b.visibility} />,
                meta: (
                  <span className="figure">
                    {b.componentCount} parts · {b.weight_kg ? formatKg(b.weight_kg) : "weight —"}
                  </span>
                ),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium [&>th]:text-muted-foreground">
                <th>Name</th>
                <th>Brand / model</th>
                <th>Category</th>
                <th className="text-right">Parts</th>
                <th className="text-right">Weight</th>
                <th>Visibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-surface [&>td]:px-3 [&>td]:py-2">
                  <td>
                    <Link href={`/garage/${b.id}`} className="font-medium hover:text-accent">{b.name}</Link>
                    {b.is_primary && <Badge tone="accent" className="ml-2">Primary</Badge>}
                  </td>
                  <td className="text-muted-foreground">{[b.brand, b.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="text-muted-foreground">{CATEGORY_LABEL[b.category]}</td>
                  <td className="figure text-right">{b.componentCount}</td>
                  <td className="figure text-right">{b.weight_kg ? formatKg(b.weight_kg) : "—"}</td>
                  <td><VisibilityBadge v={b.visibility} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function VisibilityBadge({ v }: { v: "private" | "public" }) {
  return v === "public" ? (
    <Badge tone="info"><Globe /> Public</Badge>
  ) : (
    <Badge><Lock /> Private</Badge>
  );
}
