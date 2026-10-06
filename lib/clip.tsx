// Recorded web visuals (from scripts/capture.mjs) framed inside a scene, with an optional
// slow camera and pinned callouts. Theme comes from the video via makeClips().
import React from "react";
import { Easing, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { useProgress, useSceneFrames } from "./engine";

export type ClipMeta = { w: number; h: number; secs: number };
export type Cam = { at: number; s: number; x: number; y: number };
type Theme = { bg: string; font: string; accent: string; shadow?: string };

const useCam = (cam: Cam[]) => {
  const f = useCurrentFrame();
  let cur = { s: 1, x: 0.5, y: 0.5 };
  for (const k of cam) {
    const p = interpolate(f, [k.at, k.at + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
    if (p <= 0) break;
    cur = { s: cur.s + (k.s - cur.s) * p, x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p };
  }
  return cur;
};

/** `registry` is the video's clips.json (written by capture.mjs). */
export const makeClips = (registry: Record<string, ClipMeta>, theme: Theme) => {
  const Clip: React.FC<{
    name: string;
    top?: number; // native px to crop off the top
    bottom?: number;
    from?: number; // seconds into the recording to start
    maxW?: number;
    maxH?: number;
    cam?: Cam[];
    loop?: boolean;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }> = ({ name, top = 0, bottom = 0, from = 0, maxW = 1720, maxH = 760, cam = [], loop, style, children }) => {
    const meta = registry[name];
    if (!meta) throw new Error(`clip "${name}" not in clips.json — run npm run capture`);
    const scene = useSceneFrames() + 40;
    const visH = meta.h - top - bottom;
    const k = Math.min(maxW / meta.w, maxH / visH);
    const avail = (meta.secs - from) * 30;
    // Slow the recording slightly if narration outlasts it, rather than freezing.
    const rate = loop ? 1 : Math.min(1, avail / scene);
    const c = useCam(cam);
    const intro = useProgress(0, 20);
    const video = (
      <OffthreadVideo
        src={staticFile(`clips/${name}.mp4`)}
        trimBefore={Math.round(from * 30)}
        playbackRate={rate}
        muted
        style={{ position: "absolute", left: 0, top: -top * k, width: meta.w * k, height: meta.h * k }}
      />
    );
    return (
      <div
        style={{
          position: "relative",
          width: Math.round(meta.w * k),
          height: Math.round(visH * k),
          borderRadius: 18,
          overflow: "hidden",
          background: theme.bg,
          boxShadow: theme.shadow ?? "0 30px 80px rgba(38,37,30,0.16), 0 0 0 2px #E4E2DA",
          opacity: intro,
          transform: `translateY(${(1 - intro) * 20}px)`,
          ...style,
        }}
      >
        <div style={{ position: "absolute", inset: 0, transform: `scale(${c.s})`, transformOrigin: `${c.x * 100}% ${c.y * 100}%` }}>
          {loop ? <Loop durationInFrames={Math.round(meta.secs * 30)}>{video}</Loop> : video}
        </div>
        {children}
      </div>
    );
  };

  /** A label pinned on top of a clip; x/y are fractions of the clip box. */
  const Callout: React.FC<{ at: number; x: number; y: number; color?: string; children: React.ReactNode; anchor?: "left" | "right" | "center" }> = ({
    at, x, y, color = theme.accent, children, anchor = "left",
  }) => {
    const p = useProgress(at, 14);
    const tx = anchor === "left" ? 0 : anchor === "right" ? -100 : -50;
    return (
      <div
        style={{
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          transform: `translate(${tx}%, ${(1 - p) * 14}px) scale(${0.9 + 0.1 * p})`,
          opacity: p,
          background: color,
          color: "white",
          fontFamily: theme.font,
          fontWeight: 650,
          fontSize: 27,
          padding: "10px 18px",
          borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </div>
    );
  };

  return { Clip, Callout };
};

export const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>{children}</div>
);
