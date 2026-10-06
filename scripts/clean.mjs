// Free disk: removes stills/ and out/preview.mp4 for every video (or one). --all also removes final renders in out/.
//   npm run clean [video] [--all]
import fs from "node:fs";
import path from "node:path";
import { VIDEOS, resolveVideo, parseArgs } from "./_video.mjs";

const { pos, flags } = parseArgs();
const dirs = pos[0] ? [resolveVideo(pos[0]).dir] : fs.readdirSync(VIDEOS).map((d) => path.join(VIDEOS, d)).filter((d) => fs.statSync(d).isDirectory());
for (const d of dirs) {
  const targets = [path.join(d, "stills"), path.join(d, "out/preview.mp4")];
  if (flags.all) targets.push(path.join(d, "out"));
  for (const t of targets) if (fs.existsSync(t)) { fs.rmSync(t, { recursive: true }); console.log("removed", path.relative(VIDEOS, t)); }
}
