// Shared engine for narrated explainer videos.
// A video = ordered scenes; each scene has one narration clip (public/vo/<id>.mp3) whose
// duration (vo.json) sets the scene length. Animations sync to words via useAt("keyword").
import React, { createContext, useContext } from "react";
import { Audio, Composition, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export type Scene = { id: string; section: string; title?: string; C: React.FC };
export type VoEntry = { id: string; dur: number; text: string };
export type ShellProps = { section: string; title?: string; index: number; count: number; children: React.ReactNode };
export type Timing = { fps: number; lead: number; tail: number; fade: number; width: number; height: number };
export type Props = { only: string[] };

const DEFAULT_TIMING: Timing = { fps: 30, lead: 8, tail: 20, fade: 12, width: 1920, height: 1080 };

/* ---------------------------------------------------------------- per-scene narration context */

type Ctx = { text: string; frames: number };
export const SceneCtx = createContext<Ctx>({ text: "", frames: 1 });

/** Returns at(kw, offset) → frame (within the scene) at which the narrator reaches `kw`. */
export const useAt = () => {
  const { text, frames } = useContext(SceneCtx);
  return (kw: string, offset = 0) => {
    const i = text.indexOf(kw);
    if (i < 0) throw new Error(`keyword not in narration: ${kw}`);
    return Math.max(0, Math.round((i / text.length) * frames) + offset);
  };
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

/** The caption chunk being spoken right now. `prettify` maps spoken forms to written ones. */
export const useCaption = (prettify: (s: string) => string = (s) => s, maxWords = 11) => {
  const { text: raw, frames } = useContext(SceneCtx);
  const f = useCurrentFrame();
  const text = prettify(raw);
  const chunks = chunkCaptions(text, maxWords);
  const idx = chunks.findLastIndex((c) => (c.i / text.length) * frames <= f);
  return chunks[Math.max(0, idx)]?.s ?? "";
};

/* ---------------------------------------------------------------- composition */

const makePlan = (scenes: Scene[], vo: VoEntry[], t: Timing, only: string[]) => {
  const byId = Object.fromEntries(vo.map((v) => [v.id, v]));
  const missing = scenes.filter((s) => !byId[s.id]).map((s) => s.id);
  if (missing.length) throw new Error(`no narration audio for: ${missing.join(", ")} — run npm run tts`);
  const plan = scenes
    .map((s, index) => {
      const v = byId[s.id];
      const voFrames = Math.ceil(v.dur * t.fps);
      return { ...s, index, text: v.text, voFrames, frames: t.lead + voFrames + t.tail };
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
              <SceneCtx.Provider value={{ text: p.text, frames: p.voFrames }}>
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
