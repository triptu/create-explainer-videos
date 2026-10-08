import { registerRoot } from "remotion";
import { defineStory, type Beat, type Cue } from "../../lib/story";
import vo from "./vo.json";
import cfg from "./video.json";
import { World } from "./world";
import { Overlay } from "./ui";

// Order = narration order. `chapter` starts a new chapter label (carries forward to later beats).
const BEATS: Beat[] = [
  { id: "hook" },
  { id: "idea", chapter: "The idea" },
  { id: "outro", chapter: "Recap" },
];

const music: Cue[] = cfg.music.map((m) => ({ file: `music/${m.id}.mp3`, from: m.from, to: m.to, volume: m.volume }));
registerRoot(defineStory({ beats: BEATS, vo, World, Overlay, timing: cfg.timing, sound: { music, ambience: cfg.ambience, dips: cfg.dips ?? [] } }).Root);
