// Buddy model sheet: every mood and a range of outfits. Review with
//   npx remotion still lib/sheet/index.tsx Moods /tmp/moods.png   (or Outfits, Poses)
//   npx remotion render lib/sheet/index.tsx Talk /tmp/talk.mp4      (lip sync from a real speech envelope)
import React from "react";
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame } from "remotion";
import { MOODS, Buddy, type Mood, type Outfit } from "../buddy";
import { loudnessAt } from "../engine";

const Grid: React.FC<{ items: { label: string; el: React.ReactNode }[]; cols: number; bg?: string }> = ({ items, cols, bg = "#E9EEF2" }) => (
  <AbsoluteFill style={{ background: bg, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, padding: 30, gap: 10, fontFamily: "system-ui", alignItems: "end" }}>
    {items.map((it) => (
      <div key={it.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {it.el}
        <div style={{ fontSize: 22, fontWeight: 600, color: "#3A4152", marginTop: 4 }}>{it.label}</div>
      </div>
    ))}
  </AbsoluteFill>
);

const Moods = () => <Grid cols={7}  items={(Object.keys(MOODS) as Mood[]).map((m) => ({ label: m, el: <Buddy mood={m} size={300} seed={3} frame={10} /> }))} />;

const OUTFITS: [string, Outfit][] = [
  ["hiker", { hat: "beanie", neck: "scarf", back: "backpack", hold: "lantern", color2: "#2E8B7A" }],
  ["builder", { hat: "hardhat", hold: "wrench", neck: "badge" }],
  ["scholar", { hat: "grad", face: "glasses", hold: "clipboard", neck: "bowtie" }],
  ["host", { hat: "headphones", hold: "mug" }],
  ["explorer", { hat: "explorer", back: "backpack", hold: "flag", color: "#7A5B33", color2: "#2E8B7A" }],
  ["detective", { hat: "detective", hold: "magnifier", neck: "scarf", color2: "#8A3B3B" }],
  ["chef", { hat: "chef", neck: "bowtie" }],
  ["party", { hat: "party", neck: "bowtie", color: "#8B5CF6" }],
  ["pilot", { face: "goggles", back: "jetpack", neck: "scarf", color2: "#D9364C" }],
  ["fan", { hat: "cap", hold: "flag", neck: "tie" }],
  ["hero", { back: "cape", hold: "pickaxe" }],
  ["plain", {}],
];
const Outfits = () => <Grid cols={6} items={OUTFITS.map(([l, o], i) => ({ label: l, el: <Buddy outfit={o} mood={(["happy", "determined", "proud", "neutral", "excited", "skeptical"] as Mood[])[i % 6]} size={380} frame={10} seed={5} /> }))} />;

const Poses = () => (
  <Grid
    cols={6}
    items={[
      { label: "wave", el: <Buddy mood="happy" wave={1} frame={4} size={340} /> },
      { label: "walk 0.25", el: <Buddy walk={0.25} size={340} turn={0.6} /> },
      { label: "walk 0.75", el: <Buddy walk={0.75} size={340} turn={0.6} /> },
      { label: "arms up", el: <Buddy mood="excited" arms={[150, 150]} hop={40} size={340} /> },
      { label: "squash", el: <Buddy mood="determined" squash={0.25} arms={[30, 30]} size={340} /> },
      { label: "turn left", el: <Buddy mood="curious" turn={-0.8} look={[-0.6, 0]} size={340} /> },
      { label: "talk", el: <Buddy mood="neutral" talk={1} frame={7} size={340} /> },
      { label: "emote ?", el: <Buddy mood="confused" emote="?" size={340} /> },
      { label: "emote idea", el: <Buddy mood="excited" emote="idea" arms={[10, 120]} size={340} /> },
      { label: "sweat", el: <Buddy mood="worried" emote="sweat" emoteP={0.4} size={340} /> },
      { label: "lean", el: <Buddy mood="determined" lean={-10} walk={0.1} outfit={{ hat: "beanie", hold: "lantern", back: "backpack" }} size={340} /> },
      { label: "♥", el: <Buddy mood="happy" emote="♥" size={340} /> },
    ]}
  />
);

// a real speech envelope (tts "env": one base-36 digit per frame) from a short spoken question
const ENV = "4hqsyurigvw60kljjn000muxyq0051000e2fomni4000he913mi104d0000000";
const Talk: React.FC = () => {
  const f = useCurrentFrame();
  const talk = loudnessAt({ text: "", frames: ENV.length, points: [[0, 0], [1, 1]], lines: [], env: ENV }, f) ?? 0;
  return (
    <AbsoluteFill style={{ background: "#1E2335", alignItems: "center", justifyContent: "center" }}>
      <Buddy mood="curious" talk={talk} size={760} outfit={{ hat: "headphones", neck: "scarf" }} frame={f} />
    </AbsoluteFill>
  );
};

registerRoot(() => (
  <>
    <Composition id="Moods" component={Moods} width={2200} height={900} fps={30} durationInFrames={60} />
    <Composition id="Outfits" component={Outfits} width={2400} height={1000} fps={30} durationInFrames={60} />
    <Composition id="Poses" component={Poses} width={1920} height={880} fps={30} durationInFrames={60} />
    <Composition id="Talk" component={Talk} width={800} height={800} fps={30} durationInFrames={62} />
  </>
));
