// One still per scene + a contact sheet, for reviewing layout without a full render.
//   npm run stills <video> [scene ids...] [--at 0.8]   (at = fraction through each scene's narration)
// Writes videos/<slug>/stills/<id>.png and stills/sheet.png.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { resolveVideo, parseArgs } from "./_video.mjs";

const { pos, flags } = parseArgs();
const v = resolveVideo(pos[0]);
const only = pos.slice(1);
const at = Number(flags.at ?? 0.8);
const t = { fps: 30, lead: 8, tail: 20, fade: 12, ...v.cfg.timing };
const vo = JSON.parse(fs.readFileSync(path.join(v.dir, "vo.json"), "utf8"));
const order = JSON.parse(fs.readFileSync(path.join(v.dir, "narration.json"), "utf8")).map((n) => n.id);
const outDir = path.join(v.dir, "stills");
fs.mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: v.entry, publicDir: v.publicDir });
const composition = await selectComposition({ serveUrl, id: "Main", inputProps: { only: [] } });
const byId = Object.fromEntries(vo.map((e) => [e.id, e]));
let start = 0;
const made = [];
for (const id of order) {
  const vf = Math.ceil(byId[id].dur * t.fps);
  if (!only.length || only.includes(id)) {
    const output = path.join(outDir, `${id}.png`);
    await renderStill({ serveUrl, composition, frame: start + t.lead + Math.round(vf * at), output, imageFormat: "png", scale: 0.5, inputProps: { only: [] } });
    made.push(output);
    process.stdout.write(".");
  }
  start += t.lead + vf + t.tail - t.fade;
}
// contact sheet, 3 per row
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-"));
made.forEach((f, i) => fs.copyFileSync(f, path.join(tmp, `${String(i).padStart(3, "0")}.png`)));
const rows = Math.ceil(made.length / 3);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(tmp, "%03d.png"), "-vf", `scale=640:-1,tile=3x${rows}:padding=6:color=gray`, "-frames:v", "1", path.join(outDir, "sheet.png")]);
fs.rmSync(tmp, { recursive: true });
console.log(`\n✓ ${made.length} stills → ${path.join(outDir, "sheet.png")}`);
