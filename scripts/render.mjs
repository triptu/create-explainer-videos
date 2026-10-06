// Render one video (or a subset of its scenes) to videos/<slug>/out/.
//   npm run render <video>                      full video → out/<slug>.mp4
//   npm run render <video> kv pack --scale 0.5  just those scenes, half-res → out/preview.mp4
// Only this video's folder is bundled (own entry + own public dir), so renders stay fast.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, resolveVideo, parseArgs, die } from "./_video.mjs";

const { pos, flags } = parseArgs();
const v = resolveVideo(pos[0]);
const only = pos.slice(1);
if (!fs.existsSync(path.join(v.dir, "vo.json"))) die("no vo.json yet — run: npm run tts " + v.slug);
const out = flags.out ?? path.join(v.dir, "out", only.length ? "preview.mp4" : `${v.slug}.mp4`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const args = ["render", v.entry, "Main", out, "--public-dir", v.publicDir, "--props", JSON.stringify({ only }), "--log", "error"];
if (flags.scale) args.push("--scale", String(flags.scale));
if (flags.frames) args.push("--frames", String(flags.frames));
const t0 = Date.now();
const r = spawnSync(path.join(ROOT, "node_modules/.bin/remotion"), args, { stdio: "inherit", cwd: ROOT });
if (r.status) process.exit(r.status);
console.log(`\n✓ ${path.relative(process.cwd(), out)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
