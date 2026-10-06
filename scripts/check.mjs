// Fast pre-render sanity check for one video:
//  - every scene in index.tsx has narration + audio
//  - every useAt keyword (at("…")) exists in its scene's narration (otherwise the render throws)
//  - TypeScript compiles
//   npm run check <video>
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, resolveVideo, parseArgs } from "./_video.mjs";

const { pos } = parseArgs();
const v = resolveVideo(pos[0]);
const narr = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(v.dir, "narration.json"), "utf8")).map((n) => [n.id, n.text]));
const vo = fs.existsSync(path.join(v.dir, "vo.json")) ? JSON.parse(fs.readFileSync(path.join(v.dir, "vo.json"), "utf8")) : [];
const voIds = new Set(vo.filter((e) => narr[e.id] === e.text).map((e) => e.id));
const index = fs.readFileSync(v.entry, "utf8");
const sceneMap = [...index.matchAll(/id:\s*"([\w-]+)"[^}]*?C:\s*S\.(\w+)/g)].map((m) => ({ id: m[1], comp: m[2] }));
let problems = 0;
const bad = (m) => { problems++; console.log("✕ " + m); };

for (const { id } of sceneMap) {
  if (!narr[id]) bad(`scene "${id}" has no entry in narration.json`);
  else if (!voIds.has(id)) bad(`scene "${id}" audio is missing or stale — run npm run tts ${v.slug}`);
}
// component bodies from every scenes*.tsx in the folder
const src = fs.readdirSync(v.dir).filter((f) => /^scenes.*\.tsx$/.test(f)).map((f) => fs.readFileSync(path.join(v.dir, f), "utf8")).join("\n");
const parts = src.split(/export const (\w+): React\.FC/).slice(1);
const bodies = {};
for (let i = 0; i < parts.length; i += 2) bodies[parts[i]] = parts[i + 1];
for (const { id, comp } of sceneMap) {
  const body = bodies[comp];
  if (!body || !narr[id]) continue;
  for (const m of body.matchAll(/\bat\("([^"]+)"/g)) if (!narr[id].includes(m[1])) bad(`${id}: keyword "${m[1]}" not in narration`);
}
const tsc = spawnSync(path.join(ROOT, "node_modules/.bin/tsc"), ["--noEmit", "-p", ROOT], { encoding: "utf8" });
const tsErrors = (tsc.stdout || "").split("\n").filter((l) => l.includes(`videos/${v.slug}/`) || l.includes("lib/"));
tsErrors.forEach((l) => bad(l));
console.log(problems ? `\n${problems} problem(s)` : `✓ ${v.slug}: ${sceneMap.length} scenes, keywords, audio and types OK`);
process.exit(problems ? 1 : 0);
