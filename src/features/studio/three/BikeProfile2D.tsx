"use client";
import type { KeyboardEvent, ReactNode } from "react";
import { SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { cn } from "@/lib/utils";

/**
 * Non-3D bicycle side profile. Used when WebGL is unavailable, when the 3D asset
 * fails to load, or when the rider chooses the lightweight view. It is a real,
 * interactive slot selector — not an image pretending to be 3D.
 * Coordinates mirror scripts/generate-placeholder-model.mts (metres → SVG units).
 */
const S = 500;
const X = (x: number) => (x + 0.8) * S;
const Y = (y: number) => (1.08 - y) * S;
const pt = (x: number, y: number) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
const line = (a: [number, number], b: [number, number]) => `M${pt(...a)} L${pt(...b)}`;

const rearAxle: [number, number] = [-0.405, 0.34];
const frontAxle: [number, number] = [0.585, 0.34];
const bb: [number, number] = [0, 0.27];
const seat: [number, number] = [-0.153, 0.788];
const headTop: [number, number] = [0.4, 0.84];
const headBottom: [number, number] = [0.44, 0.69];

interface PartProps {
  slot: BikeSlot;
  children: ReactNode;
  selected: boolean;
  opacity: number;
  onSelect?: (slot: BikeSlot) => void;
}

function Part({ slot, children, selected, opacity, onSelect }: PartProps) {
  return (
    <g
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={SLOT_META[slot].label}
      aria-pressed={onSelect ? selected : undefined}
      opacity={opacity}
      className={cn(onSelect && "cursor-pointer outline-none hover:opacity-100 [&:focus-visible>*]:stroke-[var(--ring)]")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(slot);
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(slot);
        }
      }}
    >
      <title>{SLOT_META[slot].label}</title>
      {children}
    </g>
  );
}

interface Props {
  selectedSlot: BikeSlot | null;
  pendingSlots?: BikeSlot[];
  recordedSlots?: BikeSlot[] | null;
  paintColor?: string | null;
  onSelectSlot?: (slot: BikeSlot | null) => void;
  className?: string;
}

export function BikeProfile2D({ selectedSlot, pendingSlots = [], recordedSlots = null, paintColor, onSelectSlot, className }: Props) {
  const recorded = recordedSlots ? new Set(recordedSlots) : null;
  const tone = (slot: BikeSlot, base: string) =>
    slot === selectedSlot ? "var(--accent)" : pendingSlots.includes(slot) ? "var(--info)" : base;
  const dim = (slot: BikeSlot) => (recorded && !recorded.has(slot) && slot !== selectedSlot ? 0.3 : 1);

  const pp = (slot: BikeSlot) => ({ slot, selected: slot === selectedSlot, opacity: dim(slot), onSelect: onSelectSlot ? (s: BikeSlot) => onSelectSlot(s) : undefined });

  const frameStroke = tone("frame", paintColor ?? "#5b626c");
  const metal = "#8b9198";
  const dark = "#4a4f56";

  return (
    <svg
      viewBox="0 0 700 520"
      className={cn("h-full w-full select-none", className)}
      onClick={() => onSelectSlot?.(null)}
      aria-label="Bicycle side profile"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(["rear", "front"] as const).map((w) => {
        const [x, y] = w === "rear" ? rearAxle : frontAxle;
        const slot: BikeSlot = w === "rear" ? "rear_tire" : "front_tire";
        return (
          <g key={w}>
            <Part {...pp(slot)}>
              <circle cx={X(x)} cy={Y(y)} r={0.325 * S} stroke={tone(slot, "#2a2c30")} strokeWidth={14} />
            </Part>
            <Part {...pp("wheelset")}>
              <circle cx={X(x)} cy={Y(y)} r={0.298 * S} stroke={tone("wheelset", "#3a3d42")} strokeWidth={7} />
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i / 12) * Math.PI * 2;
                return <path key={i} d={line([x, y], [x + Math.cos(a) * 0.29, y + Math.sin(a) * 0.29])} stroke={tone("wheelset", "#4a4e54")} strokeWidth={1} />;
              })}
              <circle cx={X(x)} cy={Y(y)} r={9} fill={tone("wheelset", metal)} />
            </Part>
            <Part {...pp(w === "rear" ? "rear_rotor" : "front_rotor")}>
              <circle cx={X(x)} cy={Y(y)} r={0.08 * S} stroke={tone(w === "rear" ? "rear_rotor" : "front_rotor", metal)} strokeWidth={3} strokeDasharray="6 4" />
            </Part>
          </g>
        );
      })}

      <Part {...pp("frame")}>
        <path
          d={[line(bb, seat), line([seat[0] + 0.01, seat[1] - 0.02], [headTop[0], headTop[1] - 0.025]), line(bb, headBottom), line(headBottom, headTop), line(bb, rearAxle), line(seat, rearAxle)].join(" ")}
          stroke={frameStroke}
          strokeWidth={13}
        />
      </Part>
      <Part {...pp("fork")}>
        <path d={line(headBottom, frontAxle)} stroke={tone("fork", paintColor ?? "#5b626c")} strokeWidth={11} />
      </Part>
      <Part {...pp("headset")}>
        <rect x={X(headTop[0]) - 10} y={Y(headTop[1]) - 12} width={20} height={8} fill={tone("headset", dark)} />
      </Part>
      <Part {...pp("stem")}>
        <path d={line([0.394, 0.875], [0.49, 0.885])} stroke={tone("stem", dark)} strokeWidth={10} />
      </Part>
      <Part {...pp("handlebar")}>
        <path d={`M${pt(0.505, 0.885)} C${pt(0.6, 0.89)} ${pt(0.64, 0.83)} ${pt(0.62, 0.79)} S${pt(0.56, 0.75)} ${pt(0.53, 0.755)}`} stroke={tone("handlebar", "#25272b")} strokeWidth={9} />
      </Part>
      <Part {...pp("shifters")}>
        <path d={line([0.565, 0.9], [0.615, 0.895]) + " " + line([0.612, 0.89], [0.645, 0.79])} stroke={tone("shifters", dark)} strokeWidth={6} />
      </Part>
      <Part {...pp("seatpost")}>
        <path d={line([-0.153, 0.75], [-0.205, 0.955])} stroke={tone("seatpost", "#25272b")} strokeWidth={9} />
      </Part>
      <Part {...pp("saddle")}>
        <path d={`M${pt(-0.33, 0.985)} Q${pt(-0.2, 0.96)} ${pt(-0.1, 0.975)} L${pt(-0.06, 0.97)}`} stroke={tone("saddle", "#1d1e21")} strokeWidth={12} />
      </Part>
      <Part {...pp("cassette")}>
        <circle cx={X(rearAxle[0])} cy={Y(rearAxle[1])} r={0.062 * S} fill={tone("cassette", "#7a8087")} fillOpacity={0.55} stroke={tone("cassette", metal)} strokeWidth={2} />
      </Part>
      <Part {...pp("chain")}>
        <path
          d={`M${pt(0, 0.374)} L${pt(-0.405, 0.39)} A${0.05 * S} ${0.05 * S} 0 0 0 ${pt(-0.43, 0.27)} L${pt(-0.39, 0.2)} L${pt(0, 0.166)} A${0.104 * S} ${0.104 * S} 0 0 0 ${pt(0, 0.374)}`}
          stroke={tone("chain", "#7d8389")}
          strokeWidth={3}
        />
      </Part>
      <Part {...pp("crankset")}>
        <circle cx={X(bb[0])} cy={Y(bb[1])} r={0.104 * S} stroke={tone("crankset", dark)} strokeWidth={5} />
        <circle cx={X(bb[0])} cy={Y(bb[1])} r={0.071 * S} stroke={tone("crankset", dark)} strokeWidth={3} />
        <path d={line(bb, [Math.cos(-1.2) * 0.1725, 0.27 + Math.sin(-1.2) * 0.1725])} stroke={tone("crankset", "#3d4147")} strokeWidth={9} />
      </Part>
      <Part {...pp("bottom_bracket")}>
        <circle cx={X(bb[0])} cy={Y(bb[1])} r={12} fill={tone("bottom_bracket", metal)} />
      </Part>
      <Part {...pp("pedals")}>
        <rect x={X(Math.cos(-1.2) * 0.1725) - 22} y={Y(0.27 + Math.sin(-1.2) * 0.1725) - 5} width={44} height={10} fill={tone("pedals", dark)} />
      </Part>
      <Part {...pp("rear_derailleur")}>
        <path d={line([-0.43, 0.31], [-0.405, 0.265]) + " " + line([-0.41, 0.265], [-0.375, 0.2])} stroke={tone("rear_derailleur", dark)} strokeWidth={8} />
      </Part>
      <Part {...pp("front_derailleur")}>
        <rect x={X(-0.065)} y={Y(0.42)} width={30} height={14} fill={tone("front_derailleur", dark)} transform={`rotate(-12 ${X(-0.05)} ${Y(0.41)})`} />
      </Part>
      <Part {...pp("rear_brake")}>
        <rect x={X(-0.37)} y={Y(0.39)} width={26} height={14} fill={tone("rear_brake", dark)} />
      </Part>
      <Part {...pp("front_brake")}>
        <rect x={X(0.53)} y={Y(0.42)} width={14} height={26} fill={tone("front_brake", dark)} />
      </Part>
      <Part {...pp("accessory_1")}>
        <path d={line([0.11, 0.405], [0.245, 0.51])} stroke={tone("accessory_1", metal)} strokeWidth={5} strokeDasharray="10 5" />
      </Part>
    </svg>
  );
}
