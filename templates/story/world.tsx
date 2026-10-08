// The world. This file is a SKELETON, not a style: replace the backdrop, the stations and everything in them
// with a world designed for this video's metaphor. What's worth keeping is the structure:
//   - stations at world coordinates along a path, each rendered only near its beats (split into s-*.tsx files,
//     with shared coordinates in a layout.ts so stations can import them without a circular import)
//   - one camera, moved by shots keyed to the narration
//   - Buddy placed ONCE here with a position track across the whole video, so it walks between stations
//     instead of popping in and out (stations only decide where it should be and how it feels)
//   - every reveal cued with at(beatId, keyword), in global frames, plus a quiet sound effect
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Layer, Sfx, Stage, track, useCamera, useStory, useTalk, type Shot } from "../../lib/story";
import { BuddyAt, moodAt } from "../../lib/buddy";
import { C, Label, Text, pop, soft } from "./ui";

const GROUND = 820;
const A = 960, B = 3200; // station centers

export const World: React.FC = () => {
  const { at, start, end } = useStory();
  const f = useCurrentFrame();
  const talk = useTalk("host"); // Buddy speaks the host's dialogue lines

  const shots: Shot[] = [
    { at: 0, x: A, y: 520, zoom: 1.2 },
    { at: at("hook", "one object") - 20, x: A + 120, y: 500, zoom: 1, dur: 60 },
    { at: start("idea") - 6, x: B, y: 500, zoom: 1, dur: 80 },
    { at: start("outro"), x: (A + B) / 2, y: 480, zoom: 0.6, dur: 90 },
  ];
  const cam = useCamera(shots);

  // Buddy's journey: where it stands (x) over time, walking between stations
  const walkA = start("idea") - 6, walkB = start("idea") + 70;
  const bx = track(f, [[0, A - 420], [walkA, A - 420], [walkB, B - 420]]);
  const walking = f > walkA && f < walkB;
  const face = moodAt(f, [[0, "curious"], [at("hook", "a place"), "thinking"], [at("idea", "this one"), "excited"], [start("outro"), "proud"]]);

  return (
    <Stage cam={cam}>
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${C.bg0}, ${C.bg1})` }} />
      <Layer depth={1}>
        <div style={{ position: "absolute", left: -3000, top: GROUND, width: 12000, height: 1200, background: C.ground }} />
        {/* station A: placeholder */}
        <Text x={A + 200} y={GROUND - 560} p={soft(f, at("hook", "Open inside"))} size={48}>Station A</Text>
        <Label x={A + 200} y={GROUND - 480} p={pop(f, at("hook", "one object"))} size={30} bg={C.accent}>revealed at “one object”</Label>
        {/* station B: placeholder */}
        <Text x={B + 200} y={GROUND - 560} p={soft(f, start("idea"))} size={48}>Station B</Text>
        <Label x={B + 200} y={GROUND - 480} p={pop(f, at("idea", "this one"))} size={30} bg={C.accent}>revealed at “this one”</Label>
        <BuddyAt x={bx} y={GROUND} size={250} face={face} talk={talk} walk={walking ? f / 14 : undefined} turn={walking ? 0.7 : 0.4} outfit={{ hat: "headphones", neck: "scarf" }} look={[0.6, -0.3]} />
      </Layer>
      <Sfx name="pop" at={at("hook", "one object")} volume={0.35} />
      <Sfx name="whoosh" at={walkA} volume={0.3} />
      <Sfx name="chirp-excited" at={at("idea", "this one") + 4} volume={0.3} />
      <Sfx name="whoosh-soft" at={end("idea")} volume={0.25} />
    </Stage>
  );
};
