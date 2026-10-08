// Fast pre-render sanity check for one video:
//  - every scene in index.tsx has narration + audio
//  - every useAt keyword (at("…")) exists in its scene's narration (otherwise the render throws)
//  - story mode: every at("beat", "keyword") anywhere in the folder names a real beat and a word in it
//  - TypeScript compiles
//   npm run check <video>
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, resolveVideo, parseArgs } from "./_video.mjs";

const { pos } = parseArgs();
const v = resolveVideo(pos[0]);
// dialogue scenes ({lines}) are checked against their lines joined; style tags like [curious] don't count
const narr = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(v.dir, "narration.json"), "utf8")).map((n) => [n.id, n.text ?? n.lines.map((l) => l.text).join(" ")]));
const plain = (s) => s.replace(/\[[^\]]*\]\s*|<[^>]*>\s*|\|[^|]*\|\s*/g, "").replace(/\s+([.,!?;:])/g, "$1").trim();
const vo = fs.existsSync(path.join(v.dir, "vo.json")) ? JSON.parse(fs.readFileSync(path.join(v.dir, "vo.json"), "utf8")) : [];
const voIds = new Set(vo.filter((e) => narr[e.id] === e.text).map((e) => e.id));
const index = fs.readFileSync(v.entry, "utf8");
const story = index.includes("defineStory");
const sceneMap = story
  ? [...index.matchAll(/\{\s*id:\s*"([\w-]+)"/g)].map((m) => ({ id: m[1], comp: null }))
  : [...index.matchAll(/id:\s*"([\w-]+)"[^}]*?C:\s*S\.(\w+)/g)].map((m) => ({ id: m[1], comp: m[2] }));
let problems = 0;
const bad = (m) => { problems++; console.log("✕ " + m); };

for (const { id } of sceneMap) {
  if (!narr[id]) bad(`scene "${id}" has no entry in narration.json`);
  else if (!voIds.has(id)) bad(`scene "${id}" audio is missing or stale — run npm run tts ${v.slug}`);
}
if (story) {
  const ids = new Set(sceneMap.map((b) => b.id));
  for (const f of fs.readdirSync(v.dir).filter((f) => f.endsWith(".tsx"))) {
    const src = fs.readFileSync(path.join(v.dir, f), "utf8");
    for (const m of src.matchAll(/\bat\("([\w-]+)",\s*"([^"]+)"/g)) {
      if (!ids.has(m[1])) bad(`${f}: at("${m[1]}", …) — no such beat`);
      else if (!plain(narr[m[1]] ?? "").includes(m[2])) bad(`${f}: keyword "${m[2]}" not in beat "${m[1]}"`);
    }
    for (const m of src.matchAll(/\b(?:start|end|voice)\("([\w-]+)"\)/g)) if (!ids.has(m[1])) bad(`${f}: ${m[0]} — no such beat`);
  }
}
// component bodies from every scenes*.tsx in the folder
const src = fs.readdirSync(v.dir).filter((f) => /^scenes.*\.tsx$/.test(f)).map((f) => fs.readFileSync(path.join(v.dir, f), "utf8")).join("\n");
const parts = src.split(/export const (\w+): React\.FC/).slice(1);
const bodies = {};
for (let i = 0; i < parts.length; i += 2) bodies[parts[i]] = parts[i + 1];
for (const { id, comp } of sceneMap) {
  const body = bodies[comp];
  if (!body || !narr[id]) continue;
  for (const m of body.matchAll(/\bat\("([^"]+)"/g)) if (!plain(narr[id]).includes(m[1])) bad(`${id}: keyword "${m[1]}" not in narration`);
}
const tsc = spawnSync(path.join(ROOT, "node_modules/.bin/tsc"), ["--noEmit", "-p", ROOT], { encoding: "utf8" });
const tsErrors = (tsc.stdout || "").split("\n").filter((l) => l.includes(`videos/${v.slug}/`) || l.includes("lib/"));
tsErrors.forEach((l) => bad(l));
console.log(problems ? `\n${problems} problem(s)` : `✓ ${v.slug}: ${sceneMap.length} scenes, keywords, audio and types OK`);
process.exit(problems ? 1 : 0);
