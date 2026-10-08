// Story mode: one continuous animated world instead of a slide per scene.
// Narration is still split into beats (one audio clip each, for TTS and captions), but there are no cuts:
// a single <World> renders across the whole timeline, a camera moves through it, and anything can be
// choreographed across beats with at("beatId", "keyword"). Music, ambience and sound effects are layered
// on top, with music ducking under the voice.
import React, { createContext, useContext } from "react";
import { AbsoluteFill, Audio, Composition, Easing, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { captionAt, frameOf, loudnessAt, sceneTimeline, type Timeline, type VoEntry } from "./engine";

export type Beat = { id: string; chapter?: string };
export type StoryTiming = { fps: number; lead: number; tail: number; width: number; height: number };
const DEFAULT_TIMING: StoryTiming = { fps: 30, lead: 6, tail: 14, width: 1920, height: 1080 };

/** A music or ambience cue, from video.json "sound". `from`/`to` are beat ids (to = until the end of that beat). */
export type Cue = { file: string; from: string; to?: string; volume?: number; fadeIn?: number; fadeOut?: number; duck?: number; loop?: boolean; offset?: number };
/** A moment of near-silence in the music for a dramatic turn: starts when beat `beat` starts, lasts `secs`. */
export type Dip = { beat: string; secs?: number; depth?: number };
export type Sound = { music?: Cue[]; ambience?: Cue[]; dips?: Dip[] };

/* ---------------------------------------------------------------- timeline */

export type BeatPlan = Beat & { index: number; start: number; vo: number; voEnd: number; end: number; tl: Timeline };
export type StoryTimeline = {
  beats: BeatPlan[];
  total: number;
  /** Global frame at which the narrator says `kw` in beat `id`. */
  at: (id: string, kw: string, offset?: number) => number;
  /** Global frame where beat `id` starts (its lead-in) / its voice starts / it ends. */
  start: (id: string) => number;
  voice: (id: string) => number;
  end: (id: string) => number;
  /** Beat playing at global frame f. */
  beatAt: (f: number) => BeatPlan;
};

export const planStory = (beats: Beat[], vo: VoEntry[], t: StoryTiming): StoryTimeline => {
  const byVo = Object.fromEntries(vo.map((v) => [v.id, v]));
  const missing = beats.filter((b) => !byVo[b.id]).map((b) => b.id);
  if (missing.length) throw new Error(`no narration audio for: ${missing.join(", ")} — run npm run tts`);
  let f = 0;
  let chapter: string | undefined;
  const plan = beats.map((b, index) => {
    const tl = sceneTimeline(byVo[b.id], t.fps);
    chapter = b.chapter ?? chapter;
    const p = { ...b, chapter, index, start: f, vo: f + t.lead, voEnd: f + t.lead + tl.frames, end: f + t.lead + tl.frames + t.tail, tl };
    f = p.end;
    return p;
  });
  const byId = Object.fromEntries(plan.map((p) => [p.id, p]));
  const get = (id: string) => {
    const p = byId[id];
    if (!p) throw new Error(`no beat "${id}"`);
    return p;
  };
  return {
    beats: plan,
    total: f,
    at: (id, kw, offset = 0) => get(id).vo + frameOf(get(id).tl, kw, offset),
    start: (id) => get(id).start,
    voice: (id) => get(id).vo,
    end: (id) => get(id).end,
    beatAt: (fr) => plan[Math.max(0, plan.findLastIndex((p) => p.start <= fr))],
  };
};

const StoryCtx = createContext<StoryTimeline | null>(null);
export const useStory = () => {
  const s = useContext(StoryCtx);
  if (!s) throw new Error("useStory outside defineStory");
  return s;
};

/** Caption being spoken right now (prettified), who says it, and the beat; null between beats. */
export const useStoryCaption = (prettify?: (s: string) => string, maxWords = 11) => {
  const st = useStory();
  const f = useCurrentFrame();
  const b = st.beatAt(f);
  if (f < b.vo - 2 || f > b.voEnd + 8) return null;
  return { ...captionAt(b.tl, f - b.vo, prettify, maxWords), beat: b };
};

/**
 * Mouth openness 0..1 for speaker `who` (dialogue lines; plain narration counts as "narrator"): the speech
 * loudness envelope while that speaker's line plays, 0 otherwise. Pass it to a character's `talk` prop:
 * <BuddyAt talk={useTalk("host")} …/>. Without an envelope (re-run tts), falls back to a gentle ~3.5 Hz flap.
 */
export const useTalk = (who: string) => {
  const st = useStory();
  const f = useCurrentFrame();
  const b = st.beatAt(f);
  const g = f - b.vo;
  const lines = b.tl.lines.length ? b.tl.lines : [{ who: "narrator", from: 0, to: b.tl.frames }];
  const l = lines.find((x) => x.from <= g && g < x.to);
  if (!l || l.who !== who) return 0;
  const gate = Math.min(ramp(g, l.from - 1, l.from + 2), 1 - ramp(g, l.to - 3, l.to));
  const loud = loudnessAt(b.tl, g);
  return gate * (loud ?? 0.35 + 0.35 * Math.sin(g * 0.75));
};

/** Current chapter and the frame its first beat started (for chapter cards). */
export const useChapter = () => {
  const st = useStory();
  const b = st.beatAt(useCurrentFrame());
  const first = st.beats.find((p) => p.chapter === b.chapter) ?? b;
  return { name: b.chapter, since: first.start, first: first.id === b.id || first.start === b.start };
};

/* ---------------------------------------------------------------- motion helpers */

const fract = (x: number) => x - Math.floor(x);
const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
/** Smooth 1D value noise in [-1, 1]. Same seed → same curve. */
export const noise = (seed: number, t: number) => {
  const i = Math.floor(t), u = t - i;
  const s = u * u * (3 - 2 * u);
  return (hash(i + seed * 57.3) * (1 - s) + hash(i + 1 + seed * 57.3) * s) * 2 - 1;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0→1 between frames a and b with easing (smooth by default). Order-safe: never throws on a ≥ b. */
export const ramp = (f: number, a: number, b: number, ease: (t: number) => number = Easing.inOut(Easing.cubic)) =>
  ease(clamp01((f - a) / Math.max(1, b - a)));

/** Keyframed value: [[frame, value], …] with smooth easing between keys. */
export const track = (f: number, keys: [number, number][], ease: (t: number) => number = Easing.inOut(Easing.cubic)) => {
  if (!keys.length) return 0;
  if (f <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    if (f < keys[k][0]) return lerp(keys[k - 1][1], keys[k][1], ease(clamp01((f - keys[k - 1][0]) / Math.max(1, keys[k][0] - keys[k - 1][0]))));
  }
  return keys[keys.length - 1][1];
};

/* ---------------------------------------------------------------- camera */

/** A camera move that starts at frame `at` and takes `dur` frames. x/y = world point at screen center. */
export type Shot = { at: number; x: number; y: number; zoom?: number; rot?: number; dur?: number; ease?: (t: number) => number };
export type Cam = { x: number; y: number; zoom: number; rot: number };
const camEase = Easing.bezier(0.6, 0, 0.3, 1);

/** Camera state at frame f. Moves blend: a move starting mid-way through another continues from wherever it is. */
export const cameraAt = (f: number, shots: Shot[], drift = 0): Cam => {
  const sorted = [...shots].sort((a, b) => a.at - b.at);
  const first = sorted[0] ?? { x: 0, y: 0 };
  let c: Cam = { x: first.x, y: first.y, zoom: first.zoom ?? 1, rot: first.rot ?? 0 };
  for (const s of sorted.slice(1)) {
    if (f <= s.at) break;
    const p = (s.ease ?? camEase)(clamp01((f - s.at) / (s.dur ?? 45)));
    c = { x: lerp(c.x, s.x, p), y: lerp(c.y, s.y, p), zoom: Math.exp(lerp(Math.log(c.zoom), Math.log(s.zoom ?? c.zoom), p)), rot: lerp(c.rot, s.rot ?? c.rot, p) };
  }
  if (drift) {
    const t = f / 90;
    c = { ...c, x: c.x + noise(1, t) * drift * 14, y: c.y + noise(2, t) * drift * 9, rot: c.rot + noise(3, t * 0.7) * drift * 0.25 };
  }
  return c;
};
export const useCamera = (shots: Shot[], drift = 0.6) => cameraAt(useCurrentFrame(), shots, drift);

const CamCtx = createContext<Cam>({ x: 960, y: 540, zoom: 1, rot: 0 });
export const useCam = () => useContext(CamCtx);

/** Full-frame viewport that looks through `cam`. Put <Layer>s inside. */
export const Stage: React.FC<{ cam: Cam; bg?: string; children: React.ReactNode }> = ({ cam, bg, children }) => (
  <CamCtx.Provider value={cam}>
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>{children}</AbsoluteFill>
  </CamCtx.Provider>
);

/**
 * A parallax plane. depth 1 = the main world plane (moves with the camera); <1 is farther away (moves
 * and zooms less); >1 is closer (foreground). Children use world coordinates of that plane.
 */
export const Layer: React.FC<{ depth?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ depth = 1, style, children }) => {
  const c = useCam();
  const z = Math.pow(c.zoom, depth);
  return (
    <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(960px, 540px) scale(${z}) rotate(${c.rot * depth}deg) translate(${-c.x * depth}px, ${-c.y * depth}px)`, ...style }}>
      {children}
    </AbsoluteFill>
  );
};

/** Place children with their anchor point (default: center) at world (x, y). */
export const Place: React.FC<{ x: number; y: number; anchor?: [number, number]; scale?: number; rot?: number; opacity?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  x, y, anchor = [0.5, 0.5], scale = 1, rot = 0, opacity = 1, style, children,
}) => (
  <div style={{ position: "absolute", left: x, top: y, opacity, transform: `translate(${-anchor[0] * 100}%, ${-anchor[1] * 100}%) scale(${scale}) rotate(${rot}deg)`, transformOrigin: `${anchor[0] * 100}% ${anchor[1] * 100}%`, ...style }}>
    {children}
  </div>
);

/* ---------------------------------------------------------------- sound */

/** One-shot sound effect from public/sfx/<name>.wav at global frame `at` (see npm run sound). */
export const Sfx: React.FC<{ name: string; at: number; volume?: number; rate?: number }> = ({ name, at, volume = 0.5, rate }) => (
  <Sequence from={Math.round(at)} durationInFrames={300} layout="none" name={`sfx ${name}`}>
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} playbackRate={rate} />
  </Sequence>
);

/** 0 (silence) … 1 (voice speaking) around each beat's narration, with soft edges, for ducking. */
const speaking = (st: StoryTimeline, f: number, edge = 12) => {
  const b = st.beatAt(f);
  const near = [b, st.beats[b.index + 1]].filter(Boolean);
  return Math.max(0, ...near.map((p) => Math.min(ramp(f, p.vo - edge, p.vo), 1 - ramp(f, p.voEnd, p.voEnd + edge * 2))));
};

/** Music gain multiplier at global frame g from dips (eased down fast, back up slowly). */
const dipAt = (st: StoryTimeline, dips: Dip[], g: number, fps: number) =>
  dips.reduce((k, d) => {
    const a = st.start(d.beat), b = a + (d.secs ?? 2.5) * fps;
    const down = Math.min(ramp(g, a - 20, a + 6), 1 - ramp(g, b, b + fps * 2.5));
    return k * (1 - (d.depth ?? 0.55) * down);
  }, 1);

const CueAudio: React.FC<{ cue: Cue; st: StoryTimeline; fps: number; music: boolean; dips: Dip[] }> = ({ cue, st, fps, music, dips }) => {
  const from = st.start(cue.from);
  const fadeIn = cue.fadeIn ?? (music ? 30 : 45), fadeOut = cue.fadeOut ?? (music ? 60 : 45);
  const to = (cue.to ? st.end(cue.to) : st.total) + (cue.to ? fadeOut / 2 : 0);
  const base = cue.volume ?? (music ? 0.22 : 0.35);
  const duck = cue.duck ?? (music ? 0.45 : 1);
  return (
    <Sequence from={from} durationInFrames={Math.max(1, to - from)} layout="none" name={`${music ? "music" : "amb"} ${cue.file}`}>
      <Audio
        src={staticFile(cue.file)}
        loop={cue.loop ?? !music}
        startFrom={Math.round((cue.offset ?? 0) * fps)}
        volume={(f) => {
          const g = from + f;
          const env = interpolate(f, [0, fadeIn, Math.max(fadeIn + 1, to - from - fadeOut), Math.max(fadeIn + 2, to - from)], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return base * env * lerp(1, duck, speaking(st, g)) * (music ? dipAt(st, dips, g, fps) : 1);
        }}
      />
    </Sequence>
  );
};

/* ---------------------------------------------------------------- composition */

export type StoryProps = { only: string[] };

/**
 * Builds the Remotion root for a story-mode video. Composition id "Main".
 * inputProps {only: ["beatId", …]} renders just that stretch of the timeline (first to last listed beat).
 */
export const defineStory = (cfg: {
  beats: Beat[];
  vo: VoEntry[];
  World: React.FC;
  Overlay?: React.FC;
  timing?: Partial<StoryTiming>;
  sound?: Sound;
}) => {
  const t = { ...DEFAULT_TIMING, ...cfg.timing };
  const range = (st: StoryTimeline, only: string[]) => {
    if (!only.length) return [0, st.total];
    const sel = st.beats.filter((b) => only.includes(b.id));
    return [Math.min(...sel.map((b) => b.start)), Math.max(...sel.map((b) => b.end))];
  };

  const Story: React.FC<StoryProps> = ({ only }) => {
    const st = planStory(cfg.beats, cfg.vo, t);
    const [from] = range(st, only);
    const { World, Overlay } = cfg;
    return (
      <StoryCtx.Provider value={st}>
        <Sequence from={-from} layout="none">
          <AbsoluteFill>
            <World />
            {Overlay && <Overlay />}
          </AbsoluteFill>
          {st.beats.map((b) => (
            <Sequence key={b.id} from={b.vo} durationInFrames={b.end - b.vo + t.tail} layout="none" name={`vo ${b.id}`}>
              <Audio src={staticFile(`vo/${b.id}.mp3`)} />
            </Sequence>
          ))}
          {cfg.sound?.music?.map((c, i) => <CueAudio key={`m${i}`} cue={c} st={st} fps={t.fps} music dips={cfg.sound?.dips ?? []} />)}
          {cfg.sound?.ambience?.map((c, i) => <CueAudio key={`a${i}`} cue={c} st={st} fps={t.fps} music={false} dips={[]} />)}
        </Sequence>
      </StoryCtx.Provider>
    );
  };

  const Root: React.FC = () => (
    <Composition
      id="Main"
      component={Story}
      fps={t.fps}
      width={t.width}
      height={t.height}
      durationInFrames={1}
      defaultProps={{ only: [] as string[] }}
      calculateMetadata={({ props }) => {
        const [a, b] = range(planStory(cfg.beats, cfg.vo, t), props.only);
        return { durationInFrames: Math.max(1, b - a) };
      }}
    />
  );
  return { Root };
};
