// Live preview of one video in Remotion Studio:  npm run studio <video>
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, resolveVideo, parseArgs } from "./_video.mjs";

const { pos } = parseArgs();
const v = resolveVideo(pos[0]);
spawnSync(path.join(ROOT, "node_modules/.bin/remotion"), ["studio", v.entry, "--public-dir", v.publicDir], { stdio: "inherit", cwd: ROOT });
