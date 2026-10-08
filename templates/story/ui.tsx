// This video's look. Everything here is a PLACEHOLDER: design the palette, fonts and props from the subject and
// its metaphor (a warehouse, a city, a kitchen, the inside of a cell…), not from this file or another video.
// Theme-independent helpers (pop/soft/lin/span, StoryOverlay) come from lib/story-ui.tsx.
import React from "react";
import { loadFont as loadRubik } from "@remotion/google-fonts/Rubik";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { StoryOverlay } from "../../lib/story-ui";

export { pop, soft, lin, span } from "../../lib/story-ui";

const { fontFamily: sans } = loadRubik("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });
const { fontFamily: mono } = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] });
export const FONT = { sans, mono };

// placeholder palette: replace with the world's own colors and light
export const C = {
  bg0: "#151A2B",
  bg1: "#252C45",
  ground: "#10131F",
  paper: "#F6F2EA",
  ink: "#1C2336",
  text: "#F4F6FF",
  dim: "#A3ACC9",
  accent: "#FFC857",
  host: "#FF6B4A",
  guide: "#4FD1C5",
  green: "#5ED39B",
  red: "#FF6F6F",
};

/** Written forms for captions (narration is written for the ear: "A.P.I." → "API"). */
export const prettify = (s: string) => s.replace(/A\.P\.I\./g, "API").replace(/A\.I\./g, "AI");

/** Captions with speaker chips (dialogue), chapter labels, vignette. Speaker ids match video.json "cast". */
export const Overlay: React.FC = () => (
  <StoryOverlay font={sans} prettify={prettify} accent={C.accent} speakers={{ host: { name: "Buddy", color: C.host }, guide: { name: "Guide", color: C.guide } }} />
);

/* ---------------------------------------------------------------- generic primitives (restyle freely) */

/** A pill label placed at world (x, y). */
export const Label: React.FC<{ x: number; y: number; p?: number; size?: number; color?: string; bg?: string; anchor?: "center" | "left" | "right"; children: React.ReactNode; style?: React.CSSProperties }> = ({
  x, y, p = 1, size = 32, color = C.ink, bg = C.paper, anchor = "center", children, style,
}) => {
  const tx = anchor === "center" ? "-50%" : anchor === "right" ? "-100%" : "0%";
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, transform: `translate(${tx}, -50%) scale(${0.6 + 0.4 * p})`, opacity: Math.min(1, p * 1.5), whiteSpace: "nowrap",
        fontFamily: sans, fontSize: size, fontWeight: 600, color, background: bg, padding: bg === "none" ? 0 : `${size * 0.32}px ${size * 0.62}px`, borderRadius: size * 0.5,
        boxShadow: bg === "none" ? undefined : "0 6px 20px rgba(0,0,0,0.3)", ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Plain text in the world. */
export const Text: React.FC<{ x: number; y: number; p?: number; size?: number; color?: string; anchor?: "center" | "left" | "right"; children: React.ReactNode; style?: React.CSSProperties }> = (props) => (
  <Label bg="none" color={C.text} {...props} style={{ fontWeight: 700, textShadow: "0 3px 14px rgba(0,0,0,0.5)", ...props.style }} />
);
