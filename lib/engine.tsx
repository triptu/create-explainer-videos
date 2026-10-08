// Shared engine for narrated explainer videos.
// A video = ordered scenes; each scene has one narration clip (public/vo/<id>.mp3) whose
// duration (vo.json) sets the scene length. Animations sync to words via useAt("keyword").
import React, { createContext, useContext } from "react";
import { Audio, Composition, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export type Scene = { id: string; section: string; title?: string; C: React.FC };
/** One spoken line in a dialogue scene: who says it and when (seconds into the scene's audio). */
export type VoLine = { who: string; text: string; start: number; end: number };
/**
 * vo.json entry. `marks` are [charIndex, seconds] sync points (sentence starts, line starts) measured
 * from the audio by tts, over the plain text (style tags stripped). `lines` only for dialogue scenes.
 */
export type VoEntry = { id: string; dur: number; text: string; marks?: number[][]; lines?: VoLine[]; env?: string };
export type ShellProps = { section: string; title?: string; index: number; count: number; children: React.ReactNode };
export type Timing = { fps: number; lead: number; tail: number; fade: number; width: number; height: number };
export type Props = { only: string[] };

const DEFAULT_TIMING: Timing = { fps: 30, lead: 8, tail: 20, fade: 12, width: 1920, height: 1080 };

/* ---------------------------------------------------------------- narration timing */

/** Narration minus direction: [style] tags, <vocal> tags and |backchannels| are never shown or timed. */
export const plain = (s: string) => s.replace(/\[[^\]]*\]\s*|<[^>]*>\s*|\|[^|]*\|\s*/g, "").replace(/\s+([.,!?;:])/g, "$1").trim();

/** Sync points (character index → frame) for one scene. Falls back to even pacing without marks. */
export type Timeline = { text: string; frames: number; points: [number, number][]; lines: (VoLine & { from: number; to: number; i: number })[]; env?: string };

export const sceneTimeline = (v: VoEntry, fps: number): Timeline => {
  const text = plain(v.text);
  const frames = Math.ceil(v.dur * fps);
  const pts: [number, number][] = [[0, 0], ...(v.marks ?? []).map(([i, t]) => [i, t * fps] as [number, number]), [text.length, frames]];
  // keep strictly increasing in both axes so interpolation never runs backwards
  const points = pts.filter((p, k) => k === 0 || (p[0] > pts[k - 1][0] && p[1] >= pts[k - 1][1]));
  let i = 0;
  const lines = (v.lines ?? []).map((l) => {
    const t = plain(l.text);
    const line = { ...l, text: t, from: Math.round(l.start * fps), to: Math.round(l.end * fps), i };
    i += t.length + 1;
    return line;
  });
  return { text, frames, points, lines, env: v.env };
};

/**
 * Mouth openness 0..1 at scene frame g from tts's per-frame speech envelope (undefined without one).
 * Smoothed like hand-animated lip flap: opens fast, closes slower, and holds each shape for 4 frames, so the
 * mouth moves about 1.5 times a second instead of jittering with every frame of loudness.
 */
export const loudnessAt = (tl: Timeline, g: number) => {
  const env = tl.env;
  if (!env) return undefined;
  const raw = (k: number) => (k >= 0 && k < env.length ? parseInt(env[k], 36) / 35 : 0);
  const held = g - (g % 4);
  let s = 0;
  for (let k = Math.max(0, held - 24); k <= held; k++) {
    const v = raw(k);
    s = v > s ? s + (v - s) * 0.45 : s * 0.75;
  }
  return s > 0.15 ? Math.min(1, s * 1.15) : 0;
};

/** Frame (within the scene) at which the narrator reaches character `i`. */
export const frameAtChar = (tl: Timeline, i: number) => {
  const p = tl.points;
  let k = 1;
  while (k < p.length - 1 && p[k][0] <= i) k++;
  const [i0, f0] = p[k - 1], [i1, f1] = p[k];
  return f0 + ((i - i0) / Math.max(1, i1 - i0)) * (f1 - f0);
};

/** Frame (within the scene) at which the narrator reaches `kw`. */
export const frameOf = (tl: Timeline, kw: string, offset = 0) => {
  const i = tl.text.indexOf(kw);
  if (i < 0) throw new Error(`keyword not in narration: ${kw}`);
  return Math.max(0, Math.round(frameAtChar(tl, i)) + offset);
};

/* ---------------------------------------------------------------- per-scene narration context */

export const SceneCtx = createContext<Timeline>({ text: "", frames: 1, points: [[0, 0], [1, 1]], lines: [] });

/** Returns at(kw, offset) → frame (within the scene) at which the narrator reaches `kw`. */
export const useAt = () => {
  const tl = useContext(SceneCtx);
  return (kw: string, offset = 0) => frameOf(tl, kw, offset);
};
export const useSceneFrames = () => useContext(SceneCtx).frames;

/** Spring 0→1 starting at frame `at`. */
export const useProgress = (at: number, dur = 18) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping: 200 }, durationInFrames: dur });
};

/** Eased linear 0→1 between two frames. */
export const useRamp = (from: number, to: number, ease = Easing.inOut(Easing.cubic)) => {
  const f = useCurrentFrame();
  return interpolate(f, [from, Math.max(from + 1, to)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
};

/* ---------------------------------------------------------------- captions */

/** Splits narration into short caption chunks, each tagged with its character offset. */
export const chunkCaptions = (text: string, maxWords = 11) => {
  const out: { s: string; i: number }[] = [];
  // sentence = up to . ! ? : followed by whitespace (so "A.P.I." and "4.6" don't split)
  const re = /\S.*?(?:[.!?:](?=\s|$)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m[0]) {
    const sentence = m[0];
    const words = sentence.trim().split(/\s+/);
    if (!words[0]) continue;
    const pieces = Math.ceil(words.length / maxWords);
    const per = Math.ceil(words.length / pieces);
    let offset = m.index + sentence.indexOf(words[0]);
    for (let p = 0; p < pieces; p++) {
      const piece = words.slice(p * per, (p + 1) * per).join(" ");
      out.push({ s: piece, i: offset });
      offset += piece.length + 1;
    }
  }
  return out;
};

/** The caption chunk being spoken at scene frame `f`, and who says it (dialogue scenes). */
export const captionAt = (tl: Timeline, f: number, prettify: (s: string) => string = (s) => s, maxWords = 11) => {
  // dialogue: caption within the current line only, so speakers never share a caption
  const line = tl.lines.length ? tl.lines[Math.max(0, tl.lines.findLastIndex((l) => l.from <= f))] : undefined;
  const raw = line ? line.text : tl.text;
  const base = line ? line.i : 0;
  const text = prettify(raw);
  // chunks are found in the prettified text; map their offsets back to the raw text proportionally
  const k = raw.length / Math.max(1, text.length);
  const chunks = chunkCaptions(text, maxWords);
  const idx = chunks.findLastIndex((c) => frameAtChar(tl, base + c.i * k) <= f);
  return { s: chunks[Math.max(0, idx)]?.s ?? "", who: line?.who };
};

/** The caption chunk being spoken right now. `prettify` maps spoken forms to written ones. */
export const useCaption = (prettify: (s: string) => string = (s) => s, maxWords = 11) =>
  captionAt(useContext(SceneCtx), useCurrentFrame(), prettify, maxWords).s;

/* ---------------------------------------------------------------- composition */

const makePlan = (scenes: Scene[], vo: VoEntry[], t: Timing, only: string[]) => {
  const byId = Object.fromEntries(vo.map((v) => [v.id, v]));
  const missing = scenes.filter((s) => !byId[s.id]).map((s) => s.id);
  if (missing.length) throw new Error(`no narration audio for: ${missing.join(", ")} — run npm run tts`);
  const plan = scenes
    .map((s, index) => {
      const v = byId[s.id];
      const voFrames = Math.ceil(v.dur * t.fps);
      return { ...s, index, tl: sceneTimeline(v, t.fps), voFrames, frames: t.lead + voFrames + t.tail };
    })
    .filter((p) => !only.length || only.includes(p.id));
  const total = plan.reduce((a, p) => a + p.frames, 0) - t.fade * Math.max(0, plan.length - 1);
  return { plan, total };
};

/**
 * Builds the Remotion root for one video. Composition id is always "Main".
 * Pass inputProps {only: ["sceneId", ...]} to render/preview a subset of scenes.
 */
export const defineExplainer = (cfg: {
  scenes: Scene[];
  vo: VoEntry[];
  Shell: React.FC<ShellProps>;
  timing?: Partial<Timing>;
}) => {
  const t = { ...DEFAULT_TIMING, ...cfg.timing };
  const { Shell } = cfg;

  const Explainer: React.FC<Props> = ({ only }) => {
    const { plan } = makePlan(cfg.scenes, cfg.vo, t, only);
    return (
      <TransitionSeries>
        {plan.flatMap((p, i) => {
          const seq = (
            <TransitionSeries.Sequence key={p.id} durationInFrames={p.frames}>
              <Sequence from={t.lead} layout="none">
                <Audio src={staticFile(`vo/${p.id}.mp3`)} />
              </Sequence>
              <SceneCtx.Provider value={p.tl}>
                <Sequence from={t.lead}>
                  <Shell section={p.section} title={p.title} index={p.index} count={cfg.scenes.length}>
                    <p.C />
                  </Shell>
                </Sequence>
              </SceneCtx.Provider>
            </TransitionSeries.Sequence>
          );
          return i === 0
            ? [seq]
            : [<TransitionSeries.Transition key={`t-${p.id}`} presentation={fade()} timing={linearTiming({ durationInFrames: t.fade })} />, seq];
        })}
      </TransitionSeries>
    );
  };

  const Root: React.FC = () => (
    <Composition
      id="Main"
      component={Explainer}
      fps={t.fps}
      width={t.width}
      height={t.height}
      durationInFrames={1}
      defaultProps={{ only: [] as string[] }}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, makePlan(cfg.scenes, cfg.vo, t, props.only).total) })}
    />
  );
  return { Root };
};
