/** Generator registry (velox-assembly/1). Versions are immutable: behaviour changes bump the version. */
import type { GeneratorId } from "../spec";
import type { GeneratorDef } from "./common";
import { wheel } from "./wheel";
import { tire, TIRE_HEIGHT_RATIO } from "./tire";
import { handlebar, seatpost, stem, STEM_STACK_MM } from "./cockpit";
import { cassette, chain, chainParams, crankset, rotor, CHAINLINE_MM, COG_PITCH_MM } from "./drivetrain";

export const GENERATORS: Record<GeneratorId, GeneratorDef> = { wheel, tire, stem, handlebar, seatpost, crankset, cassette, chain, rotor };
export const GENERATOR_VERSIONS = Object.fromEntries(Object.values(GENERATORS).map((g) => [g.id, g.version])) as Record<GeneratorId, number>;

export { TIRE_HEIGHT_RATIO, STEM_STACK_MM, CHAINLINE_MM, COG_PITCH_MM, chainParams };
export { oldFromAxle } from "./wheel";
export { sprocketRadius } from "./common";
export type { GeneratedPart, GeneratorDef, GeneratorResolution, Dims } from "./common";

/** Back-compat helpers used by P0 tests and the lab. */
export const resolveWheel = (dims: Record<string, unknown>, position: "front" | "rear") => wheel.resolve(dims, { position });
export const resolveTire = (dims: Record<string, unknown>) => tire.resolve(dims, {});
export const buildWheel = (params: Parameters<GeneratorDef["build"]>[0]) => wheel.build(params);
export const buildTire = (params: Parameters<GeneratorDef["build"]>[0]) => tire.build(params);
