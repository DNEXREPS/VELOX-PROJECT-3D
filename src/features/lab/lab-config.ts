/** Lab presets and input builder (pure; shared by the lab UI and unit tests). */
import type { AssemblyInput, CategoryTarget, PartInput } from "@/lib/assembly/spec";
import type { BikeSlot } from "@/lib/domain/slots";
import { recordedDims, toPartInput } from "@/features/studio/assembly/demo-bindings";
import { LAB_PARTS } from "./lab-parts";

export type LabConfig = { category: CategoryTarget; parts: Partial<Record<BikeSlot, string | null>> };

const ROAD: LabConfig = {
  category: "road",
  parts: {
    frame: "demo-endurance-carbon-disc-frame",
    fork: "demo-carbon-disc-fork",
    wheelset: "demo-alloy-disc-wheelset",
    front_tire: "demo-road-tire-700x28",
    rear_tire: "demo-road-tire-700x28#rear",
    stem: "demo-alloy-stem-100",
    handlebar: "demo-alloy-drop-bar-420",
    seatpost: "demo-carbon-seatpost-27-2",
    crankset: "demo-r12-crankset-50-34",
    cassette: "demo-r12-cassette-11-34",
    chain: "demo-r12-chain",
    front_rotor: "demo-rotor-160-centerlock",
    rear_rotor: "demo-rotor-160-centerlock#rear",
  },
};
const HARDTAIL: LabConfig = {
  category: "mtb_hardtail",
  parts: {
    frame: "lab-hardtail-frame",
    fork: "lab-rigid-mtb-fork",
    wheelset: "lab-29-wheelset",
    front_tire: "lab-29x2.4-tire",
    rear_tire: "lab-29x2.4-tire#rear",
    stem: "lab-stem-50",
    handlebar: "lab-flat-bar-780",
    seatpost: "lab-dropper-31-6",
    crankset: "lab-crank-170-32",
    cassette: "demo-g12-cassette-10-44-xdr",
    chain: "demo-r12-chain",
    front_rotor: "demo-rotor-180-6bolt",
    rear_rotor: "demo-rotor-160-centerlock#rear",
  },
};
export const LAB_PRESETS: Record<string, LabConfig> = { road: ROAD, hardtail: HARDTAIL };

export function labInput(c: LabConfig): AssemblyInput {
  const parts: AssemblyInput["parts"] = {};
  for (const [slot, key] of Object.entries(c.parts) as [BikeSlot, string | null][]) {
    const lp = key ? LAB_PARTS[key] : null;
    if (!lp) continue;
    let input: PartInput | undefined;
    if (lp.binding) input = { slot, name: lp.part.name, visual: lp.binding, dims: (lp.binding.kind === "generator" ? recordedDims(lp.binding.generator, lp.part) : {}) as PartInput["dims"] };
    else input = toPartInput(slot, lp.part);
    parts[slot] = input;
  }
  return { category: c.category, parts };
}

