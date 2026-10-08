import React from "react";
import { useCaption, useProgress } from "../../lib/engine";
import { makeClips, Center } from "../../lib/clip";
import clips from "./clips.json";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: sans } = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
const { fontFamily: mono } = loadMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
});
export const FONT = { sans, mono };

// Palette lifted from the blog's own diagram theme.
export const C = {
  bg: "#F7F7F4",
  panel: "#FFFFFF",
  panel2: "#F0EFEA",
  line: "#DEDCD3",
  text: "#26251E",
  dim: "#7A776C",
  orange: "#ED4C00",
  orangeT: "#FBDBCC",
  blue: "#2268FF",
  blueT: "#D3E1FF",
  green: "#2C9F28",
  greenT: "#D5ECD4",
  red: "#DC322F",
  redT: "#F8D6D5",
  pink: "#EC77BF",
  pinkT: "#FBE4F2",
  amber: "#A88D02",
  amberT: "#EEE8CC",
};

export { SceneCtx, useAt, useProgress, useRamp, useSceneFrames } from "../../lib/engine";

export const Reveal: React.FC<{
  at: number;
  y?: number;
  x?: number;
  scale?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, y = 24, x = 0, scale, style, children }) => {
  const p = useProgress(at);
  return (
    <div
      style={{
        opacity: p,
        transform: `translate(${(1 - p) * x}px, ${(1 - p) * y}px) scale(${scale ? 0.85 + 0.15 * p : 1})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Tag: React.FC<{ children: React.ReactNode; color?: string; tint?: string; style?: React.CSSProperties }> = ({
  children,
  color = C.orange,
  tint,
  style,
}) => (
  <span
    style={{
      fontFamily: mono,
      fontSize: 24,
      fontWeight: 500,
      letterSpacing: 1,
      textTransform: "uppercase",
      color,
      background: tint ?? `${color}18`,
      border: `2px solid ${color}`,
      borderRadius: 8,
      padding: "6px 14px",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </span>
);

/** A node box styled like the blog's diagrams: mono uppercase label + sublabel, coloured left rail. */
export const Box: React.FC<{
  label: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  tint?: string;
  dashed?: boolean;
  w?: number;
  h?: number;
  style?: React.CSSProperties;
  big?: boolean;
  children?: React.ReactNode;
}> = ({ label, sub, color = C.line, tint = C.panel, dashed, w, h, style, big, children }) => (
  <div
    style={{
      width: w,
      height: h,
      background: tint,
      border: `2px ${dashed ? "dashed" : "solid"} ${color === C.line ? C.line : color}`,
      borderLeft: color === C.line ? `2px solid ${C.line}` : `8px solid ${color}`,
      borderRadius: 10,
      padding: big ? "20px 26px" : "14px 20px",
      boxSizing: "border-box",
      fontFamily: mono,
      ...style,
    }}
  >
    <div style={{ fontSize: big ? 32 : 24, fontWeight: 700, letterSpacing: 1, color: C.text, textTransform: "uppercase" }}>
      {label}
    </div>
    {sub ? (
      <div style={{ fontSize: big ? 20 : 17, letterSpacing: 1.5, color: C.dim, marginTop: 6, textTransform: "uppercase" }}>
        {sub}
      </div>
    ) : null}
    {children}
  </div>
);

export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; title?: string }> = ({
  children,
  style,
  title,
}) => (
  <div
    style={{
      background: C.panel2,
      border: `2px solid ${C.line}`,
      borderRadius: 16,
      overflow: "hidden",
      ...style,
    }}
  >
    {title ? (
      <div
        style={{
          fontFamily: mono,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 2,
          padding: "14px 22px",
          borderBottom: `2px solid ${C.line}`,
          background: "#E9E8E2",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
    ) : null}
    {children}
  </div>
);

export const Mark: React.FC<{ ok: boolean; size?: number }> = ({ ok, size = 44 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: ok ? C.green : C.red,
      color: "white",
      fontWeight: 800,
      fontSize: size * 0.55,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {ok ? "✓" : "✕"}
  </div>
);

export const prettify = (s: string) =>
  s
    .replace(/N V M E/g, "NVMe")
    .replace(/C I\b/g, "CI")
    .replace(/U D P/g, "UDP")
    .replace(/R P C/g, "RPC")
    .replace(/N F S/g, "NFS")
    .replace(/G F S/g, "GFS")
    .replace(/D R B D/g, "DRBD")
    .replace(/J Git/g, "JGit")
    .replace(/e tag/g, "ETag")
    .replace(/three phase commit/g, "three-phase commit")
    .replace(/pre commit/g, "pre-commit")
    .replace(/write ahead log/g, "write-ahead log")
    .replace(/compare and swap/g, "compare-and-swap")
    .replace(/key value/g, "key-value")
    .replace(/fast forward/g, "fast-forward")
    .replace(/cursor dot com/g, "cursor.com")
    .replace(/Git repository hosting, no longer/g, "“Git repository hosting: no longer")
    .replace(/pain in the ass\./g, "pain in the ass.”");

export const Captions: React.FC = () => {
  const caption = useCaption(prettify);
  return (
    <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          fontSize: 30,
          color: "#FAFAF7",
          background: "rgba(38,37,30,0.88)",
          padding: "12px 26px",
          borderRadius: 12,
          maxWidth: 1500,
          textAlign: "center",
        }}
      >
        {caption}
      </div>
    </div>
  );
};

export { Center };
export const { Clip, Callout } = makeClips(clips, { bg: C.bg, font: FONT.sans, accent: C.orange });

export const Shell: React.FC<{
  section: string;
  title?: string;
  index: number;
  count: number;
  children: React.ReactNode;
}> = ({ section, title, index, count, children }) => {
  const f = useCurrentFrame();
  const titleIn = interpolate(f, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: sans, color: C.text }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${C.line} 1.5px, transparent 1.5px)`,
          backgroundSize: "36px 36px",
          opacity: 0.55,
        }}
      />
      <div style={{ position: "absolute", top: 48, left: 100, right: 100, display: "flex", alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 21, letterSpacing: 3, color: C.orange, textTransform: "uppercase", fontWeight: 500 }}>
          {section}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 360, height: 6, borderRadius: 3, background: C.line, overflow: "hidden" }}>
          <div style={{ width: `${((index + 1) / count) * 100}%`, height: "100%", background: C.orange }} />
        </div>
      </div>
      {title ? (
        <div
          style={{
            position: "absolute",
            top: 92,
            left: 100,
            right: 100,
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: -1.5,
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * 14}px)`,
          }}
        >
          {title}
        </div>
      ) : null}
      <div style={{ position: "absolute", top: title ? 200 : 0, left: 100, right: 100, bottom: 120 }}>{children}</div>
      <Captions />
    </AbsoluteFill>
  );
};

/** Lays children out at 1720/s px wide, then scales them up by s to fill the content area. */
export const Fit: React.FC<{ s: number; top?: number; children: React.ReactNode }> = ({ s, top = 0, children }) => (
  <div style={{ position: "absolute", left: 0, top, width: 1720 / s, transform: `scale(${s})`, transformOrigin: "0 0" }}>{children}</div>
);
