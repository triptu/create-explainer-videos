import React from "react";
import { C, Panel, Reveal, Tag, useAt } from "./ui";

// Content area is 1720×760 (Shell adds section label, title, captions). Scenes without a
// `title` get the full frame. Reveal things with at("keyword") so motion follows the voice.

export const Title: React.FC = () => {
  const at = useAt();
  return (
    <div style={{ position: "absolute", left: 20, top: 260, width: 1100 }}>
      <Reveal at={2}>
        <Tag>Video summary</Tag>
      </Reveal>
      <Reveal at={6}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, lineHeight: 1, marginTop: 30 }}>Title goes here</div>
      </Reveal>
      <Reveal at={at("why it matters")}>
        <div style={{ fontSize: 36, color: C.dim, marginTop: 30 }}>One-line subtitle.</div>
      </Reveal>
    </div>
  );
};

export const Point: React.FC = () => {
  const at = useAt();
  return (
    <div style={{ display: "flex", gap: 40 }}>
      {["keyword", "this one", "final one"].map((kw, i) => (
        <Reveal key={kw} at={at(kw)} style={{ flex: 1 }}>
          <Panel title={`Step 0${i + 1}`} style={{ background: C.panel, height: 400 }}>
            <div style={{ padding: 28, fontSize: 34, fontWeight: 650 }}>Revealed at “{kw}”</div>
          </Panel>
        </Reveal>
      ))}
    </div>
  );
};

export const Outro: React.FC = () => {
  const at = useAt();
  return (
    <Reveal at={at("where to read")}>
      <div style={{ fontSize: 40, fontWeight: 700 }}>source.com/blog/post</div>
    </Reveal>
  );
};
