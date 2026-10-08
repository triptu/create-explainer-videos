// Buddy: the studio's mascot, a small emotive robot. Buddy itself never changes between videos (shape,
// cream shell, coral accents, mint eyes on a dark face screen); only its outfit does. Emotion comes
// from eyelids, mouth, head tilt and posture, never from changing the character.
//
//   <Buddy mood="curious" look={[0.6, -0.3]} arms={[10, 60]} outfit={{ hat: "beanie", hold: "lantern" }} />
//   <Buddy face={moodAt(f, [[0, "neutral"], [at("loop", "kept"), "happy"]])} walk={f / 16} />
//
// Coordinates: origin at the ground between Buddy's feet; `size` is the rendered height in px (default 360).
import React, { useId } from "react";
import { useCurrentFrame } from "remotion";

export const BUDDY = {
  shell: "#F5F1E9",
  shellShade: "#DCD4C5",
  shellDeep: "#BDB29E",
  accent: "#FF6B4A",
  accentDeep: "#D9492C",
  screen: "#151C29",
  screen2: "#222C3F",
  eye: "#86F7E4",
  joint: "#343B4C",
  blush: "#FF8E9E",
};

/* ---------------------------------------------------------------- faces and moods */

type Eye = { w: number; h: number; lidTop: number; lidAngle: number; lidBottom: number };
export type Face = {
  eyes: [Eye, Eye];
  look: [number, number];
  mouth: { curve: number; open: number; width: number; wobble: number; shift: number };
  blush: number;
  tilt: number;
};
const E = (o: Partial<Eye> = {}): Eye => ({ w: 1, h: 1, lidTop: 0, lidAngle: 0, lidBottom: 0, ...o });
const F = (o: Partial<Omit<Face, "mouth">> & { mouth?: Partial<Face["mouth"]> } = {}): Face => ({
  eyes: o.eyes ?? [E(), E()],
  look: o.look ?? [0, 0],
  mouth: { curve: 0.35, open: 0, width: 0.8, wobble: 0, shift: 0, ...o.mouth },
  blush: o.blush ?? 0,
  tilt: o.tilt ?? 0,
});

export const MOODS = {
  neutral: F(),
  happy: F({ eyes: [E({ lidBottom: 0.42 }), E({ lidBottom: 0.42 })], mouth: { curve: 0.9, width: 1 }, blush: 0.55 }),
  excited: F({ eyes: [E({ h: 1.08, lidBottom: 0.48 }), E({ h: 1.08, lidBottom: 0.48 })], mouth: { curve: 1, open: 0.55, width: 1.1 }, blush: 0.9 }),
  curious: F({ eyes: [E({ w: 1.06, h: 1.1 }), E({ w: 1.06, h: 1.1 })], mouth: { curve: 0.35, width: 0.55 }, look: [0.35, -0.35], tilt: -8 }),
  thinking: F({ eyes: [E({ lidTop: 0.26 }), E({ lidTop: 0.26 })], mouth: { curve: 0.05, width: 0.5, wobble: 0.3, shift: 0.3 }, look: [-0.55, -0.6], tilt: 6 }),
  confused: F({ eyes: [E({ lidTop: 0.16, lidAngle: -10 }), E({ lidTop: 0.16, lidAngle: -10 })], mouth: { curve: -0.1, width: 0.7, wobble: 0.8 }, look: [0.2, -0.25], tilt: 10 }),
  worried: F({ eyes: [E({ lidTop: 0.2, lidAngle: -20, h: 0.95 }), E({ lidTop: 0.2, lidAngle: -20, h: 0.95 })], mouth: { curve: -0.35, width: 0.7, wobble: 0.55 }, look: [0, 0.15] }),
  sad: F({ eyes: [E({ lidTop: 0.36, lidAngle: -24 }), E({ lidTop: 0.36, lidAngle: -24 })], mouth: { curve: -0.85, width: 0.7 }, look: [0, 0.55], tilt: -4 }),
  surprised: F({ eyes: [E({ w: 1.16, h: 1.26 }), E({ w: 1.16, h: 1.26 })], mouth: { curve: 0, open: 0.85, width: 0.48 } }),
  determined: F({ eyes: [E({ lidTop: 0.3, lidAngle: 17 }), E({ lidTop: 0.3, lidAngle: 17 })], mouth: { curve: 0.25, width: 0.85 } }),
  proud: F({ eyes: [E({ lidTop: 0.28, lidBottom: 0.4 }), E({ lidTop: 0.28, lidBottom: 0.4 })], mouth: { curve: 0.95, width: 1.05 }, blush: 0.45, tilt: -5, look: [0, -0.2] }),
  skeptical: F({ eyes: [E({ lidTop: 0.36 }), E({ lidTop: 0.36 })], mouth: { curve: -0.15, width: 0.65, shift: 0.35 }, look: [0.3, 0], tilt: 4 }),
  sleepy: F({ eyes: [E({ lidTop: 0.62 }), E({ lidTop: 0.62 })], mouth: { curve: 0.1, width: 0.5 } }),
} satisfies Record<string, Face>;
export type Mood = keyof typeof MOODS;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixEye = (a: Eye, b: Eye, t: number): Eye => ({ w: mix(a.w, b.w, t), h: mix(a.h, b.h, t), lidTop: mix(a.lidTop, b.lidTop, t), lidAngle: mix(a.lidAngle, b.lidAngle, t), lidBottom: mix(a.lidBottom, b.lidBottom, t) });
export const mixFace = (a: Face, b: Face, t: number): Face => ({
  eyes: [mixEye(a.eyes[0], b.eyes[0], t), mixEye(a.eyes[1], b.eyes[1], t)],
  look: [mix(a.look[0], b.look[0], t), mix(a.look[1], b.look[1], t)],
  mouth: { curve: mix(a.mouth.curve, b.mouth.curve, t), open: mix(a.mouth.open, b.mouth.open, t), width: mix(a.mouth.width, b.mouth.width, t), wobble: mix(a.mouth.wobble, b.mouth.wobble, t), shift: mix(a.mouth.shift, b.mouth.shift, t) },
  blush: mix(a.blush, b.blush, t),
  tilt: mix(a.tilt, b.tilt, t),
});

/** Face at frame f from a mood track [[frame, mood], …], blending over `blend` frames at each change. */
export const moodAt = (f: number, keys: [number, Mood][], blend = 7): Face => {
  const ks = [...keys].sort((a, b) => a[0] - b[0]);
  let face = MOODS[ks[0]?.[1] ?? "neutral"];
  for (const [at, m] of ks.slice(1)) {
    if (f <= at) break;
    const t = Math.min(1, (f - at) / blend);
    face = mixFace(face, MOODS[m], t * t * (3 - 2 * t));
  }
  return face;
};

/* ---------------------------------------------------------------- outfits */

export type Outfit = {
  hat?: "beanie" | "hardhat" | "cap" | "grad" | "headphones" | "explorer" | "chef" | "party" | "detective";
  neck?: "scarf" | "bowtie" | "tie" | "badge";
  back?: "backpack" | "cape" | "jetpack";
  face?: "glasses" | "goggles";
  hold?: "lantern" | "flag" | "magnifier" | "clipboard" | "pickaxe" | "wrench" | "mug";
  /** main clothing color (hat, scarf, pack…); defaults per item */
  color?: string;
  /** second clothing color (stripes, trims) */
  color2?: string;
};

/* ---------------------------------------------------------------- the robot */

export type BuddyProps = {
  mood?: Mood;
  /** explicit face (e.g. from moodAt); overrides mood */
  face?: Face;
  /** where Buddy looks, [-1..1, -1..1]; added to the mood's own look */
  look?: [number, number];
  /** 0..1 mouth openness while speaking; pass useTalk(who) so it follows the speech envelope */
  talk?: number;
  /** shoulder angles in degrees [left, right]: 0 = down, 90 = straight out, 170 = up */
  arms?: [number, number];
  /** 0..1 right-arm wave */
  wave?: number;
  /** walk cycle phase in cycles (e.g. f / 16); omit to stand */
  walk?: number;
  /** lift off the ground in px (hops, jumps) */
  hop?: number;
  /** -1..1 squash (+) / stretch (−) for anticipation and landing */
  squash?: number;
  /** whole-body lean in degrees (pivot at the feet) */
  lean?: number;
  /** extra head tilt in degrees */
  tilt?: number;
  /** -1..1 three-quarter turn toward screen left (−) or right (+) */
  turn?: number;
  outfit?: Outfit;
  /** rendered height in px */
  size?: number;
  /** antenna light 0..1 (pulses gently on its own) */
  glow?: number;
  /** emote bubble near the head and its progress 0..1 */
  emote?: "?" | "!" | "…" | "♥" | "idea" | "sweat";
  emoteP?: number;
  seed?: number;
  /** frame override (defaults to the current frame) */
  frame?: number;
};

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const frac = (x: number) => x - Math.floor(x);
const rnd = (n: number) => frac(Math.sin(n * 91.7 + 13.1) * 43758.5453);

/** Blink amount 0..1 at frame f: every 2.4–4.4 s, a 7-frame blink; sometimes a double blink. */
const blinkAt = (f: number, seed: number) => {
  let t = 20 + rnd(seed) * 40, k = 0;
  while (t < f - 8) { t += 72 + rnd(seed + ++k) * 60; if (rnd(seed + k * 3.3) < 0.18) t -= 60; }
  const d = f - t;
  if (d < 0 || d > 7) return 0;
  return Math.sin((d / 7) * Math.PI);
};

const EyeShape: React.FC<{ id: string; cx: number; cy: number; e: Eye; side: -1 | 1; blink: number }> = ({ id, cx, cy, e, side, blink }) => {
  const w = 30 * e.w, h = 42 * e.h * (1 - 0.9 * blink);
  const top = cy - h / 2, bottom = cy + h / 2;
  const lidY = top + e.lidTop * h;
  // positive angle lowers the inner end (toward the face's middle): angry/determined; negative = sad/worried
  const ang = e.lidAngle * -side;
  const smileR = w * 1.15;
  const smileCy = bottom + smileR - e.lidBottom * h * 1.25;
  return (
    <g>
      <mask id={id} maskUnits="userSpaceOnUse" x={cx - 60} y={cy - 70} width={120} height={140}>
        <rect x={cx - w / 2} y={top} width={w} height={h} rx={Math.min(w, h) / 2} fill="#fff" />
        {e.lidTop > 0.01 && <rect x={cx - 60} y={lidY - 140} width={120} height={140} fill="#000" transform={`rotate(${ang} ${cx} ${lidY})`} />}
        {e.lidBottom > 0.01 && <circle cx={cx} cy={smileCy} r={smileR} fill="#000" />}
      </mask>
      <g mask={`url(#${id})`}>
        <rect x={cx - 60} y={cy - 70} width={120} height={140} fill={BUDDY.eye} />
        <ellipse cx={cx - w * 0.18} cy={top + h * 0.28} rx={w * 0.16} ry={h * 0.12} fill="#fff" opacity={0.55} />
      </g>
    </g>
  );
};

const mouthPath = (m: Face["mouth"], open: number, cx: number, cy: number, t: number) => {
  const hw = 15 * m.width;
  const n = 16;
  const top: [number, number][] = [], bot: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n * 2 - 1;
    const x = cx + m.shift * 8 + u * hw;
    const y = cy + m.curve * 9 * (1 - u * u) * (1 - open * 0.6) - open * 5 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - m.width * 0.4) + m.wobble * 2.4 * Math.sin(u * Math.PI * 2 + t);
    top.push([x, y]);
    bot.push([x, y + open * 22 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.75 + 0.25 * m.width)]);
  }
  const d = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return open > 0.04 ? d(top) + d(bot.reverse()).replace("M", "L") + "Z" : d(top);
};

export const Buddy: React.FC<BuddyProps> = (p) => {
  const uid = useId().replace(/:/g, "");
  const cf = useCurrentFrame();
  const f = p.frame ?? cf;
  const seed = p.seed ?? 1;
  const face = p.face ?? MOODS[p.mood ?? "neutral"];
  const size = p.size ?? 360;
  const o = p.outfit ?? {};
  const turn = clamp(p.turn ?? 0, -1, 1);

  // idle life
  const breathe = Math.sin(f / 22 + seed) * 0.012;
  const walking = p.walk !== undefined;
  const ph = (p.walk ?? 0) * Math.PI * 2;
  const stride = walking ? Math.sin(ph) : 0;
  const bob = walking ? Math.abs(Math.cos(ph)) * 7 : 0;
  const hop = (p.hop ?? 0) + bob;
  const squash = clamp((p.squash ?? 0) + breathe, -0.3, 0.3);
  const sx = 1 + squash * 0.55, sy = 1 - squash;
  const blink = blinkAt(f, seed);
  const look: [number, number] = [clamp(face.look[0] + (p.look?.[0] ?? 0), -1.2, 1.2) + turn * 0.4, clamp(face.look[1] + (p.look?.[1] ?? 0), -1.2, 1.2)];
  const tilt = face.tilt + (p.tilt ?? 0) + (walking ? Math.sin(ph) * 2 : 0);
  const sway = Math.sin(f / 13 + seed * 2) * 4 - tilt * 0.6 - (p.lean ?? 0) * 1.4 + (walking ? Math.cos(ph) * 6 : 0);
  const talk = p.talk ?? 0;
  // talk is a speech envelope (see useTalk): the mouth follows it directly, so it opens on syllables
  const mouthOpen = Math.max(face.mouth.open, Math.min(1, talk) * 0.95);
  const glow = clamp((p.glow ?? 0.55) + Math.sin(f / 18) * 0.15);
  const [armL, armR0] = p.arms ?? [8, 8];
  const armR = armR0 + (p.wave ?? 0) * (110 + Math.sin(f / 4) * 22);
  const armSwing = walking ? Math.sin(ph) * 16 : 0;

  // geometry (head center ≈ (0, -219))
  const hx = turn * 10; // head shifts slightly toward the turn
  const fx = turn * 16; // face screen shifts more: three-quarter illusion
  const eyeY = -222 + look[1] * 8;
  const eyeX = (s: -1 | 1) => fx + s * (31 - Math.abs(turn) * 3 * (s === Math.sign(turn) ? 1 : -1)) + look[0] * 10;

  const legs = (s: -1 | 1) => {
    const lift = walking ? Math.max(0, Math.sin(ph) * s) * 16 : 0;
    const a = walking ? -s * Math.max(0, Math.sin(ph) * s) * 8 + turn * stride * 18 * s : 0;
    return (
      <g transform={`translate(0 ${-lift}) rotate(${a} ${s * 22} -66)`}>
        <rect x={s * 22 - 11} y={-70} width={22} height={52} rx={11} fill={BUDDY.joint} />
        <rect x={s * 22 - 19} y={-24} width={38} height={22} rx={11} fill={BUDDY.shellShade} />
        <rect x={s * 22 - 19} y={-24} width={38} height={9} rx={4.5} fill={BUDDY.shell} />
      </g>
    );
  };
  const arm = (s: -1 | 1, ang: number) => (
    <g transform={`rotate(${s * -ang} ${s * 54} -128)`}>
      <rect x={s * 54 - 10} y={-136} width={20} height={58} rx={10} fill={`url(#${uid}sh)`} />
      <circle cx={s * 54} cy={-76} r={14} fill={BUDDY.shellShade} />
      <circle cx={s * 54 - 3} cy={-80} r={6} fill="#fff" opacity={0.35} />
      {s === 1 && o.hold && <Held kind={o.hold} ang={ang} o={o} f={f} />}
    </g>
  );

  return (
    <svg width={size * 0.95} height={size} viewBox="-190 -380 380 400" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id={`${uid}sh`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BUDDY.shell} />
          <stop offset="1" stopColor={BUDDY.shellShade} />
        </linearGradient>
        <linearGradient id={`${uid}scr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BUDDY.screen2} />
          <stop offset="1" stopColor={BUDDY.screen} />
        </linearGradient>
        <radialGradient id={`${uid}glow`}>
          <stop offset="0" stopColor={BUDDY.eye} stopOpacity={0.16} />
          <stop offset="1" stopColor={BUDDY.eye} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${uid}ant`}>
          <stop offset="0" stopColor={BUDDY.accent} stopOpacity={0.7} />
          <stop offset="1" stopColor={BUDDY.accent} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="buddyLanternGlow">
          <stop offset="0" stopColor="#FFD98A" stopOpacity={0.55} />
          <stop offset="0.35" stopColor="#FFD27A" stopOpacity={0.2} />
          <stop offset="1" stopColor="#FFD27A" stopOpacity={0} />
        </radialGradient>
        <filter id={`${uid}soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* ground shadow shrinks as Buddy lifts off */}
      <ellipse cx={0} cy={0} rx={72 * (1 - clamp(hop / 260) * 0.5)} ry={11 * (1 - clamp(hop / 260) * 0.5)} fill="#000" opacity={0.16 * (1 - clamp(hop / 300) * 0.6)} />

      <g transform={`translate(0 ${-hop}) rotate(${p.lean ?? 0}) scale(${sx} ${sy})`}>
        {o.back && <Back kind={o.back} o={o} f={f} phase="behind" />}
        {legs(-1)}
        {legs(1)}
        {arm(-1, armL - armSwing)}
        {/* body */}
        <rect x={-54} y={-148} width={108} height={92} rx={42} fill={`url(#${uid}sh)`} />
        <path d="M -40 -136 Q -50 -112 -44 -88" stroke="#fff" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.5} />
        <rect x={-26} y={-120} width={52} height={34} rx={13} fill={BUDDY.shellShade} opacity={0.55} />
        <circle cx={0} cy={-103} r={20} fill={`url(#${uid}ant)`} opacity={glow} />
        <circle cx={0} cy={-103} r={8.5} fill={BUDDY.accent} />
        <circle cx={-2.5} cy={-105.5} r={2.6} fill="#fff" opacity={0.7} />
        {o.back && <Back kind={o.back} o={o} f={f} phase="front" />}
        {o.neck && <Neck kind={o.neck} o={o} f={f} />}
        {arm(1, armR + armSwing)}

        {/* head */}
        <g transform={`rotate(${tilt} 0 -150)`}>
          <rect x={-16} y={-160} width={32} height={16} rx={5} fill={BUDDY.joint} />
          {/* ears */}
          <rect x={hx - 101 + Math.max(0, turn) * 6} y={-246} width={20 - Math.max(0, turn) * 6} height={54} rx={9} fill={BUDDY.accent} />
          <rect x={hx + 81} y={-246} width={20 + Math.min(0, turn) * 6} height={54} rx={9} fill={BUDDY.accent} />
          <rect x={hx - 98 + Math.max(0, turn) * 6} y={-240} width={6} height={42} rx={3} fill="#fff" opacity={0.25} />
          {/* shell */}
          <rect x={hx - 90} y={-294} width={180} height={146} rx={58} fill={`url(#${uid}sh)`} />
          <path d={`M ${hx - 62} -282 Q ${hx - 82} -268 ${hx - 84} -238`} stroke="#fff" strokeWidth={8} strokeLinecap="round" fill="none" opacity={0.6} />
          {/* face screen */}
          <rect x={fx - 72} y={-274} width={144} height={106} rx={42} fill={`url(#${uid}scr)`} />
          <path d={`M ${fx - 50} -268 L ${fx - 20} -268 L ${fx - 62} -176 L ${fx - 70} -190 Z`} fill="#fff" opacity={0.04} />
          {/* eye glow, eyes, blush, mouth */}
          <ellipse cx={fx + look[0] * 10} cy={eyeY} rx={62} ry={34} fill={`url(#${uid}glow)`} />
          <EyeShape id={`${uid}l`} cx={eyeX(-1)} cy={eyeY} e={face.eyes[0]} side={-1} blink={blink} />
          <EyeShape id={`${uid}r`} cx={eyeX(1)} cy={eyeY} e={face.eyes[1]} side={1} blink={blink} />
          {face.blush > 0.01 && (
            <g opacity={face.blush * 0.6}>
              <ellipse cx={fx - 50} cy={-195} rx={11} ry={6} fill={BUDDY.blush} filter={`url(#${uid}soft)`} />
              <ellipse cx={fx + 50} cy={-195} rx={11} ry={6} fill={BUDDY.blush} filter={`url(#${uid}soft)`} />
            </g>
          )}
          <path d={mouthPath(face.mouth, mouthOpen, fx + look[0] * 6, -190 + look[1] * 3, f / 5)} fill={mouthOpen > 0.04 ? "#0B1019" : "none"} stroke={BUDDY.eye} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          {o.face && <FaceGear kind={o.face} fx={fx} eyeY={eyeY} />}
          {o.hat && <Hat kind={o.hat} o={o} hx={hx} f={f} />}
          {/* antenna (pokes through hats) */}
          <g transform={`rotate(${sway} ${hx} ${o.hat ? -318 : -292})`}>
            <path d={`M ${hx} ${o.hat ? -318 : -292} L ${hx} -326`} stroke={BUDDY.joint} strokeWidth={5} strokeLinecap="round" />
            <circle cx={hx} cy={-334} r={22} fill={`url(#${uid}ant)`} opacity={glow} />
            <circle cx={hx} cy={-334} r={9.5} fill={BUDDY.accent} />
            <circle cx={hx - 3} cy={-337} r={3} fill="#fff" opacity={0.75} />
          </g>
          {p.emote && <Emote kind={p.emote} p={p.emoteP ?? 1} f={f} />}
        </g>
      </g>
    </svg>
  );
};

/* ---------------------------------------------------------------- outfit pieces */

const Hat: React.FC<{ kind: NonNullable<Outfit["hat"]>; o: Outfit; hx: number; f: number }> = ({ kind, o, hx, f }) => {
  const c = o.color, c2 = o.color2;
  switch (kind) {
    case "beanie": {
      const col = c ?? "#E8573A", rib = c2 ?? "#F4E9D8";
      return (
        <g transform={`translate(${hx} 0)`}>
          <path d="M -86 -258 Q -84 -332 0 -334 Q 84 -332 86 -258 Z" fill={col} />
          <path d="M -60 -312 Q 0 -340 60 -312" stroke="#fff" strokeOpacity={0.18} strokeWidth={6} fill="none" strokeLinecap="round" />
          {[-60, -30, 0, 30, 60].map((x) => <path key={x} d={`M ${x} -268 Q ${x * 0.9} -300 ${x * 0.7} -326`} stroke="#000" strokeOpacity={0.1} strokeWidth={4} fill="none" />)}
          <rect x={-94} y={-276} width={188} height={30} rx={15} fill={rib} />
          {[-72, -48, -24, 0, 24, 48, 72].map((x) => <rect key={x} x={x - 2} y={-272} width={4} height={22} rx={2} fill="#000" opacity={0.07} />)}
          <circle cx={0} cy={-344} r={20} fill={rib} />
          <circle cx={-6} cy={-350} r={7} fill="#fff" opacity={0.5} />
        </g>
      );
    }
    case "hardhat": {
      const col = c ?? "#F5B82E";
      return (
        <g transform={`translate(${hx} 0)`}>
          <path d="M -80 -268 Q -80 -334 0 -336 Q 80 -334 80 -268 Z" fill={col} />
          <rect x={-12} y={-336} width={24} height={66} rx={8} fill="#000" opacity={0.08} />
          <rect x={-104} y={-276} width={208} height={18} rx={9} fill={col} />
          <rect x={-104} y={-266} width={208} height={8} rx={4} fill="#000" opacity={0.12} />
          <path d="M -50 -318 Q -30 -330 -8 -332" stroke="#fff" strokeOpacity={0.4} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case "cap": {
      const col = c ?? "#2F6FEB";
      return (
        <g transform={`translate(${hx} 0)`}>
          <path d="M -84 -262 Q -84 -330 0 -332 Q 84 -330 84 -262 Z" fill={col} />
          <path d="M 20 -268 Q 110 -272 132 -256 Q 100 -246 20 -254 Z" fill={c2 ?? col} />
          <path d="M 20 -262 Q 100 -262 128 -256" stroke="#000" strokeOpacity={0.18} strokeWidth={3} fill="none" />
          <circle cx={0} cy={-332} r={7} fill={c2 ?? col} />
          <path d="M -48 -314 Q -24 -326 0 -328" stroke="#fff" strokeOpacity={0.25} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case "grad": {
      const col = c ?? "#22262F", tassel = c2 ?? "#F5B82E";
      const sw = Math.sin(f / 15) * 4;
      return (
        <g transform={`translate(${hx} 0)`}>
          <path d="M -62 -300 L -62 -270 Q 0 -256 62 -270 L 62 -300 Z" fill={col} />
          <path d="M 0 -346 L 116 -316 L 0 -286 L -116 -316 Z" fill={col} />
          <path d="M 0 -346 L 116 -316 L 0 -306 L -116 -316 Z" fill="#fff" opacity={0.08} />
          <path d={`M 0 -316 Q 60 -320 82 -312 L ${84 + sw} -268`} stroke={tassel} strokeWidth={4} fill="none" strokeLinecap="round" />
          <rect x={78 + sw} y={-270} width={12} height={24} rx={4} fill={tassel} />
        </g>
      );
    }
    case "headphones": {
      const col = c ?? "#2A2F3A", pad = c2 ?? BUDDY.accent;
      return (
        <g transform={`translate(${hx} 0)`}>
          <path d="M -96 -228 Q -100 -330 0 -332 Q 100 -330 96 -228" stroke={col} strokeWidth={14} fill="none" strokeLinecap="round" />
          <rect x={-118} y={-262} width={34} height={70} rx={16} fill={col} />
          <rect x={84} y={-262} width={34} height={70} rx={16} fill={col} />
          <rect x={-110} y={-250} width={8} height={46} rx={4} fill={pad} />
          <rect x={102} y={-250} width={8} height={46} rx={4} fill={pad} />
        </g>
      );
    }
    case "explorer": {
      const col = c ?? "#D8C08A", band = c2 ?? "#7A5B33";
      return (
        <g transform={`translate(${hx} 0)`}>
          <ellipse cx={0} cy={-272} rx={124} ry={20} fill={col} />
          <ellipse cx={0} cy={-276} rx={124} ry={16} fill="#fff" opacity={0.12} />
          <path d="M -76 -276 Q -78 -346 0 -348 Q 78 -346 76 -276 Z" fill={col} />
          <rect x={-78} y={-292} width={156} height={16} fill={band} />
          <path d="M -40 -330 Q -20 -342 4 -342" stroke="#fff" strokeOpacity={0.3} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case "chef": {
      return (
        <g transform={`translate(${hx} 0)`}>
          <rect x={-70} y={-300} width={140} height={34} rx={8} fill="#FFFFFF" />
          <circle cx={-46} cy={-326} r={36} fill="#FFFFFF" />
          <circle cx={46} cy={-326} r={36} fill="#FFFFFF" />
          <circle cx={0} cy={-348} r={42} fill="#FFFFFF" />
          <rect x={-70} y={-282} width={140} height={6} fill="#000" opacity={0.06} />
        </g>
      );
    }
    case "party": {
      const col = c ?? "#8B5CF6", dot = c2 ?? "#FFD54A";
      return (
        <g transform={`translate(${hx + 30} 0) rotate(14 0 -290)`}>
          <path d="M -40 -286 L 0 -390 L 40 -286 Z" fill={col} />
          {[[-12, -312], [12, -336], [-4, -360], [18, -300]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={6} fill={dot} />)}
          <circle cx={0} cy={-394} r={11} fill={dot} />
        </g>
      );
    }
    case "detective": {
      const col = c ?? "#8A6A48", band = c2 ?? "#3B2C1E";
      return (
        <g transform={`translate(${hx} 0)`}>
          <ellipse cx={0} cy={-274} rx={118} ry={18} fill={col} />
          <path d="M -72 -278 Q -76 -340 -30 -344 Q 0 -332 30 -344 Q 76 -340 72 -278 Z" fill={col} />
          <rect x={-74} y={-296} width={148} height={16} fill={band} />
          <ellipse cx={0} cy={-270} rx={118} ry={6} fill="#000" opacity={0.12} />
        </g>
      );
    }
  }
};

const Neck: React.FC<{ kind: NonNullable<Outfit["neck"]>; o: Outfit; f: number }> = ({ kind, o, f }) => {
  switch (kind) {
    case "scarf": {
      const col = o.color2 ?? o.color ?? "#2E8B7A";
      const flap = Math.sin(f / 9) * 6;
      return (
        <g>
          <path d={`M 18 -146 Q 34 -110 ${30 + flap} -84 L ${48 + flap} -88 Q 46 -118 34 -146 Z`} fill={col} />
          <path d={`M ${30 + flap} -84 L ${48 + flap} -88`} stroke="#fff" strokeOpacity={0.5} strokeWidth={4} strokeDasharray="4 5" />
          <rect x={-50} y={-160} width={100} height={26} rx={13} fill={col} />
          <rect x={-50} y={-160} width={100} height={9} rx={4.5} fill="#fff" opacity={0.15} />
          {[-30, -10, 10, 30].map((x) => <rect key={x} x={x - 2} y={-158} width={4} height={22} fill="#000" opacity={0.08} />)}
        </g>
      );
    }
    case "bowtie": {
      const col = o.color ?? "#D9364C";
      return (
        <g>
          <path d="M 0 -146 L -26 -160 L -26 -132 Z" fill={col} />
          <path d="M 0 -146 L 26 -160 L 26 -132 Z" fill={col} />
          <rect x={-7} y={-153} width={14} height={14} rx={4} fill={col} />
          <rect x={-7} y={-153} width={14} height={14} rx={4} fill="#000" opacity={0.15} />
        </g>
      );
    }
    case "tie": {
      const col = o.color ?? "#2F6FEB";
      return (
        <g>
          <path d="M -9 -150 L 9 -150 L 6 -140 L -6 -140 Z" fill={col} />
          <path d="M -6 -140 L 6 -140 L 13 -94 L 0 -82 L -13 -94 Z" fill={col} />
          <path d="M -3 -130 L 6 -126" stroke="#fff" strokeOpacity={0.25} strokeWidth={3} />
        </g>
      );
    }
    case "badge": {
      const col = o.color ?? "#2F6FEB";
      return (
        <g>
          <path d="M -30 -150 L -4 -112 M 30 -150 L 4 -112" stroke={col} strokeWidth={5} />
          <rect x={-18} y={-114} width={36} height={44} rx={5} fill="#fff" stroke="#000" strokeOpacity={0.12} />
          <rect x={-12} y={-106} width={24} height={14} rx={3} fill={col} opacity={0.8} />
          <rect x={-12} y={-86} width={24} height={4} rx={2} fill="#000" opacity={0.25} />
        </g>
      );
    }
  }
};

const Back: React.FC<{ kind: NonNullable<Outfit["back"]>; o: Outfit; f: number; phase: "behind" | "front" }> = ({ kind, o, f, phase }) => {
  switch (kind) {
    case "backpack": {
      const col = o.color ?? "#E8573A";
      if (phase === "front")
        return (
          <g>
            <path d="M -44 -140 Q -50 -104 -40 -66" stroke={col} strokeWidth={10} fill="none" strokeLinecap="round" />
            <path d="M 44 -140 Q 50 -104 40 -66" stroke={col} strokeWidth={10} fill="none" strokeLinecap="round" />
            <path d="M -44 -140 Q -50 -104 -40 -66" stroke="#000" strokeOpacity={0.15} strokeWidth={3} fill="none" />
          </g>
        );
      return (
        <g>
          <rect x={-74} y={-176} width={148} height={124} rx={34} fill={col} />
          <rect x={-74} y={-176} width={148} height={124} rx={34} fill="#000" opacity={0.18} />
          <rect x={-58} y={-196} width={116} height={40} rx={20} fill={o.color2 ?? "#7A5B33"} />
          <rect x={-58} y={-196} width={116} height={14} rx={7} fill="#fff" opacity={0.15} />
        </g>
      );
    }
    case "cape": {
      if (phase === "front") return null;
      const col = o.color ?? "#D9364C";
      const w = Math.sin(f / 10) * 10;
      return <path d={`M -46 -150 Q -90 -60 ${-96 + w} 4 L ${96 + w} 4 Q 90 -60 46 -150 Z`} fill={col} />;
    }
    case "jetpack": {
      if (phase === "front") return null;
      const col = o.color ?? "#9AA3B5";
      const flame = 0.8 + Math.sin(f * 1.7) * 0.2;
      return (
        <g>
          {[-1, 1].map((s) => (
            <g key={s}>
              <rect x={s * 56 - 20} y={-176} width={40} height={96} rx={18} fill={col} />
              <rect x={s * 56 - 20} y={-176} width={14} height={96} rx={7} fill="#fff" opacity={0.25} />
              <path d={`M ${s * 56 - 12} -80 Q ${s * 56} ${-80 + 46 * flame} ${s * 56 + 12} -80 Z`} fill="#FFB547" />
              <path d={`M ${s * 56 - 6} -80 Q ${s * 56} ${-80 + 26 * flame} ${s * 56 + 6} -80 Z`} fill="#FFF2B3" />
            </g>
          ))}
        </g>
      );
    }
  }
};

const FaceGear: React.FC<{ kind: NonNullable<Outfit["face"]>; fx: number; eyeY: number }> = ({ kind, fx, eyeY }) => {
  if (kind === "glasses")
    return (
      <g fill="none" stroke="#1A1A1A" strokeWidth={5}>
        <rect x={fx - 56} y={eyeY - 28} width={48} height={52} rx={18} fill="#fff" fillOpacity={0.06} />
        <rect x={fx + 8} y={eyeY - 28} width={48} height={52} rx={18} fill="#fff" fillOpacity={0.06} />
        <path d={`M ${fx - 8} ${eyeY - 6} Q ${fx} ${eyeY - 12} ${fx + 8} ${eyeY - 6}`} />
      </g>
    );
  return (
    <g>
      <rect x={fx - 92} y={-300} width={184} height={16} rx={8} fill="#3B3F4A" />
      {[-1, 1].map((s) => (
        <g key={s}>
          <circle cx={fx + s * 32} cy={-300} r={24} fill="#5B6170" />
          <circle cx={fx + s * 32} cy={-300} r={16} fill="#9FD8F0" />
          <circle cx={fx + s * 32 - 5} cy={-305} r={5} fill="#fff" opacity={0.7} />
        </g>
      ))}
    </g>
  );
};

const Held: React.FC<{ kind: NonNullable<Outfit["hold"]>; ang: number; o: Outfit; f: number }> = ({ kind, ang, o, f }) => {
  // held items are drawn in the right arm's frame, at the hand; counter-rotate so they hang/stand upright
  const up = `rotate(${ang} 54 -76)`;
  switch (kind) {
    case "lantern": {
      const swing = Math.sin(f / 11) * 6;
      const light = 0.85 + Math.sin(f / 7) * 0.06 + Math.sin(f / 2.3) * 0.03;
      return (
        <g transform={`${up} rotate(${swing} 54 -76)`}>
          <circle cx={54} cy={-32} r={130} fill="url(#buddyLanternGlow)" opacity={light} />
          <path d="M 54 -76 L 54 -62" stroke="#3A3022" strokeWidth={4} />
          <path d="M 42 -62 Q 54 -76 66 -62" stroke="#3A3022" strokeWidth={4} fill="none" />
          <rect x={36} y={-62} width={36} height={8} rx={3} fill="#4A3B28" />
          <rect x={38} y={-54} width={32} height={42} rx={9} fill="#FFE3A3" opacity={light} />
          <ellipse cx={54} cy={-32} rx={7} ry={11} fill="#FFFFFF" opacity={0.9} />
          <path d="M 44 -54 L 44 -12 M 64 -54 L 64 -12" stroke="#4A3B28" strokeWidth={3} />
          <rect x={36} y={-14} width={36} height={8} rx={3} fill="#4A3B28" />
        </g>
      );
    }
    case "flag": {
      const col = o.color2 ?? o.color ?? BUDDY.accent;
      const w = Math.sin(f / 6);
      return (
        <g transform={up}>
          <path d="M 54 -60 L 54 -230" stroke="#6B5640" strokeWidth={6} strokeLinecap="round" />
          <path d={`M 56 -228 Q ${86} ${-238 + w * 6} 116 -226 Q ${106} ${-206 + w * 4} 116 -186 Q ${86} ${-196 - w * 6} 56 -190 Z`} fill={col} />
          <circle cx={54} cy={-234} r={6} fill="#F5B82E" />
        </g>
      );
    }
    case "magnifier":
      return (
        <g transform={`${up} rotate(-35 54 -76)`}>
          <rect x={48} y={-112} width={12} height={46} rx={6} fill="#6B5640" />
          <circle cx={54} cy={-140} r={30} fill="#BFE9FF" fillOpacity={0.35} stroke="#3B3F4A" strokeWidth={8} />
          <path d="M 40 -152 Q 46 -160 56 -160" stroke="#fff" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.8} />
        </g>
      );
    case "clipboard":
      return (
        <g transform={`${up} rotate(-8 54 -76)`}>
          <rect x={20} y={-120} width={70} height={92} rx={8} fill="#A47A4C" />
          <rect x={28} y={-110} width={54} height={76} rx={4} fill="#fff" />
          <rect x={42} y={-126} width={26} height={12} rx={4} fill="#5B6170" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={36} y={-98 + i * 16} width={i === 3 ? 22 : 38} height={5} rx={2.5} fill="#000" opacity={0.2} />)}
        </g>
      );
    case "pickaxe":
      return (
        <g transform={`${up} rotate(-20 54 -76)`}>
          <rect x={49} y={-170} width={10} height={110} rx={5} fill="#7A5B33" />
          <path d="M 4 -150 Q 54 -186 104 -150 Q 54 -172 4 -150 Z" fill="#9AA3B5" stroke="#5B6170" strokeWidth={4} strokeLinejoin="round" />
        </g>
      );
    case "wrench":
      return (
        <g transform={`${up} rotate(-25 54 -76)`}>
          <rect x={48} y={-150} width={12} height={84} rx={6} fill="#9AA3B5" />
          <path d="M 36 -168 a 18 18 0 1 0 36 0 l -10 0 l 0 12 l -16 0 l 0 -12 z" fill="#9AA3B5" />
        </g>
      );
    case "mug":
      return (
        <g transform={up}>
          <rect x={34} y={-104} width={40} height={44} rx={8} fill={o.color ?? "#F4F1EA"} stroke="#3B3F4A" strokeWidth={4} />
          <path d="M 74 -94 q 18 4 0 22" stroke="#3B3F4A" strokeWidth={5} fill="none" />
          {[0, 1].map((i) => <path key={i} d={`M ${46 + i * 14} -112 q -6 -10 0 -18 q 6 -8 0 -16`} stroke="#fff" strokeWidth={3} fill="none" opacity={0.4 + 0.2 * Math.sin(f / 6 + i)} />)}
        </g>
      );
  }
};

const Emote: React.FC<{ kind: NonNullable<BuddyProps["emote"]>; p: number; f: number }> = ({ kind, p, f }) => {
  const s = Math.min(1, p * 1.4) * (1 + Math.sin(Math.min(1, p) * Math.PI) * 0.15);
  if (s <= 0.01) return null;
  const bob = Math.sin(f / 8) * 3;
  const t = `translate(118 ${-318 + bob}) scale(${s})`;
  const ink = "#1D2433";
  switch (kind) {
    case "sweat":
      return <path transform={`translate(96 ${-276 + p * 18}) scale(${s})`} d="M 0 -18 Q 12 0 0 10 Q -12 0 0 -18 Z" fill="#8FD3FF" opacity={1 - Math.max(0, p - 0.8) * 5} />;
    case "idea":
      return (
        <g transform={t}>
          <circle r={34} fill="#FFE27A" opacity={0.25} />
          <path d="M -14 4 Q -24 -26 0 -30 Q 24 -26 14 4 Z" fill="#FFD84A" />
          <rect x={-10} y={4} width={20} height={12} rx={3} fill="#9AA3B5" />
          {[-40, 0, 40].map((a) => <path key={a} d="M 0 -40 L 0 -50" transform={`rotate(${a})`} stroke="#FFD84A" strokeWidth={5} strokeLinecap="round" />)}
        </g>
      );
    case "♥":
      return <path transform={t} d="M 0 12 C -30 -8 -22 -30 -8 -30 C -2 -30 0 -24 0 -22 C 0 -24 2 -30 8 -30 C 22 -30 30 -8 0 12 Z" fill={BUDDY.accent} />;
    default:
      return (
        <g transform={t}>
          <circle r={30} fill="#fff" />
          <path d="M -18 22 L -26 34 L -6 26 Z" fill="#fff" />
          <text textAnchor="middle" y={kind === "…" ? 6 : 13} fontSize={kind === "…" ? 34 : 38} fontWeight={800} fontFamily="system-ui, sans-serif" fill={ink}>{kind}</text>
        </g>
      );
  }
};

/** Buddy with its feet at world/screen point (x, y). */
export const BuddyAt: React.FC<BuddyProps & { x: number; y: number; flip?: boolean }> = ({ x, y, flip, ...p }) => {
  const size = p.size ?? 360;
  return (
    <div style={{ position: "absolute", left: x - (size * 0.95) / 2, top: y - (size * 380) / 400, transform: flip ? "scaleX(-1)" : undefined }}>
      <Buddy {...p} />
    </div>
  );
};
