import { registerRoot } from "remotion";
import { defineExplainer, type Scene } from "../../lib/engine";
import vo from "./vo.json";
import cfg from "./video.json";
import { Shell } from "./ui";
import * as S from "./scenes";

// Order = video order. `id` must match narration.json; `section` is the small label, `title` the heading.
const SCENES: Scene[] = [
  { id: "title", section: "source.com/blog", C: S.Title },
  { id: "point", section: "Part 1", title: "One idea per scene", C: S.Point },
  { id: "outro", section: "Recap", title: "Takeaways", C: S.Outro },
];

registerRoot(defineExplainer({ scenes: SCENES, vo, Shell, timing: cfg.timing }).Root);
