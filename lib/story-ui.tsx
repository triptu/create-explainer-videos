// Theme-independent pieces every story-mode video needs: motion helpers and the caption/chapter overlay.
// Everything visual about the world itself (palette, shapes, props) belongs to the video, not here.
import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { useChapter, useStoryCaption } from "./story";

/* ---------------------------------------------------------------- motion (global frames) */

/** Minimum-jerk easing (6t⁵ − 15t⁴ + 10t³): continuous velocity and acceleration, so travel starts and lands smoothly. */
export const smootherstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** 0→1 between frames a and b along a minimum-jerk curve: use for things that travel from a source to a target. */
export const travel = (f: number, a: number, b: number) => smootherstep((f - a) / Math.max(1, b - a));

/** Bouncy 0→1 starting at frame `at`. */
export const pop = (f: number, at: number, damping = 14, mass = 0.6) => spring({ frame: f - at, fps: 30, config: { damping, mass, stiffness: 140 } });
/** Smooth 0→1 over `dur` frames starting at `at`. */
export const soft = (f: number, at: number, dur = 18) => spring({ frame: f - at, fps: 30, config: { damping: 200 }, durationInFrames: dur });
/** Eased from→to between frames a and b. Safe when a ≥ b. */
export const lin = (f: number, a: number, b: number, from = 0, to = 1, ease = Easing.inOut(Easing.cubic)) =>
  interpolate(f, [a, Math.max(a + 1, b)], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
/** 1 between frames a and b, with `fade`-frame soft edges. */
export const span = (f: number, a: number, b: number, fade = 12) => Math.min(lin(f, a, a + fade), 1 - lin(f, b - fade, b));

/* ---------------------------------------------------------------- overlay */

export type Speaker = { name: string; color: string; ink?: string };

/**
 * Captions (with a speaker chip in dialogue beats), a chapter label when a chapter starts, and a vignette.
 * Style it per video through props; build your own overlay if the world calls for a different treatment.
 */
export const StoryOverlay: React.FC<{
  font: string;
  prettify?: (s: string) => string;
  speakers?: Record<string, Speaker>;
  /** chapter dot color */
  accent?: string;
  text?: string;
  /** caption background */
  plate?: string;
  /** edge darkening (0 = none) */
  vignette?: number;
  maxWords?: number;
}> = ({ font, prettify, speakers = {}, accent = "#FFC857", text = "#F4F6FF", plate = "rgba(6,9,20,0.6)", vignette = 0.5, maxWords = 12 }) => {
  const f = useCurrentFrame();
  const cap = useStoryCaption(prettify, maxWords);
  const ch = useChapter();
  const chIn = soft(f, ch.since + 8, 20) * (1 - lin(f, ch.since + 150, ch.since + 175));
  const who = cap?.who ? speakers[cap.who] : undefined;
  return (
    <AbsoluteFill style={{ fontFamily: font, pointerEvents: "none" }}>
      {vignette > 0 && (
        <>
          <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(4,6,14,${vignette}) 100%)` }} />
          <AbsoluteFill style={{ background: `linear-gradient(to top, rgba(4,6,14,${vignette * 1.1}), transparent 18%)` }} />
        </>
      )}
      {ch.name && (
        <div style={{ position: "absolute", left: 70, top: 56, opacity: chIn, transform: `translateY(${(1 - chIn) * -10}px)`, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: accent }} />
          <div style={{ color: text, fontSize: 26, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>{ch.name}</div>
        </div>
      )}
      {cap && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 1460, display: "flex", alignItems: "center", gap: 16, padding: who ? "10px 26px 10px 14px" : "10px 26px", borderRadius: 14, background: plate }}>
            {who && <div style={{ flexShrink: 0, fontSize: 22, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: who.ink ?? "#1C2336", background: who.color, borderRadius: 9, padding: "4px 10px" }}>{who.name}</div>}
            <div style={{ color: "#fff", fontSize: 37, fontWeight: 500, lineHeight: 1.3, textAlign: "center" }}>{cap.s}</div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
