// Music + sound effects for a story-mode video.
//   npm run sound <video> [--force] [--only <cueId>] [--critique]
// - Sound effects: synthesizes the studio library (scripts/sfx.mjs) into public/sfx/.
// - Music: one Lyria cue per entry in video.json "music" → public/music/<id>.mp3, cached by prompt.
//     "musicStyle": "shared style text for every cue",
//     "music": [{ "id": "fog", "prompt": "…", "from": "cold", "to": "two", "volume": 0.2 }]
//   Each cue's length is aimed at the narration between `from` and `to` (from vo.json).
//   --critique asks Gemini to describe each new cue (instruments, structure, whether it fights a voice).
// Needs OPENROUTER_API_KEY in .env. Lyria cues cost about $0.08 each.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { ROOT, resolveVideo, parseArgs, loadEnv, die } from "./_video.mjs";

loadEnv();
const { pos, flags } = parseArgs();
const v = resolveVideo(pos[0]);

// ---- sound effects
const sfxDir = path.join(v.publicDir, "sfx");
const sfxSrc = path.join(ROOT, "scripts/sfx.mjs");
if (fs.existsSync(sfxSrc)) {
  const stamp = path.join(sfxDir, ".hash");
  const h = crypto.createHash("sha1").update(fs.readFileSync(sfxSrc)).digest("hex").slice(0, 12);
  if (flags.force || !fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== h) {
    fs.mkdirSync(sfxDir, { recursive: true });
    const { writeSfx } = await import(sfxSrc);
    await writeSfx(sfxDir);
    fs.writeFileSync(stamp, h);
    console.log(`✓ sound effects → ${path.relative(ROOT, sfxDir)}`);
  } else console.log("· sound effects up to date");
} else console.log("! scripts/sfx.mjs missing; skipping sound effects");

// ---- music
const cues = v.cfg.music ?? [];
if (!cues.length) process.exit(0);
const key = process.env.OPENROUTER_API_KEY;
if (!key) die("OPENROUTER_API_KEY missing (add it to .env)");
const vo = JSON.parse(fs.readFileSync(path.join(v.dir, "vo.json"), "utf8"));
const order = vo.map((e) => e.id);
const t = { fps: 30, lead: 6, tail: 14, ...v.cfg.timing };
const span = (from, to) => {
  const a = order.indexOf(from), b = to ? order.indexOf(to) : order.length - 1;
  if (a < 0 || b < 0) die(`music cue range ${from}→${to} doesn't match narration ids`);
  return vo.slice(a, b + 1).reduce((s, e) => s + e.dur + (t.lead + t.tail) / t.fps, 0);
};
const musicDir = path.join(v.publicDir, "music");
fs.mkdirSync(musicDir, { recursive: true });

const lyria = async (prompt, out) => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/lyria-3-pro-preview", stream: true, modalities: ["audio", "text"], audio: { format: "mp3" }, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      const msg = await res.text();
      if (attempt >= 3 || res.status < 500) die(`lyria ${res.status}: ${msg.slice(0, 300)}`);
      continue;
    }
    // server-sent events; audio arrives as base64 chunks in delta.audio.data
    const body = await res.text();
    const chunks = [];
    for (const line of body.split("\n")) {
      if (!line.startsWith("data: {")) continue;
      for (const c of JSON.parse(line.slice(6)).choices ?? []) if (c.delta?.audio?.data) chunks.push(Buffer.from(c.delta.audio.data, "base64"));
    }
    if (!chunks.length) { if (attempt >= 3) die("lyria returned no audio"); continue; }
    fs.writeFileSync(out, Buffer.concat(chunks));
    return;
  }
};

for (const c of cues) {
  if (flags.only && flags.only !== c.id) continue;
  const secs = Math.round(span(c.from, c.to));
  const prompt = [
    "Instrumental only, no vocals, no choir, no spoken words.",
    `Length: about ${secs} seconds${secs > 150 ? " (or as long as you can)" : ""}, with a clean natural ending.`,
    "This is background score under a voice-over narrator for an animated explainer: keep the 300 Hz to 4 kHz speech range sparse, no prominent lead melody, steady dynamics, no big climaxes or drops.",
    v.cfg.musicStyle ?? "",
    c.prompt,
  ].filter(Boolean).join(" ");
  const out = path.join(musicDir, `${c.id}.mp3`);
  const meta = path.join(musicDir, `${c.id}.json`);
  const h = crypto.createHash("sha1").update(prompt).digest("hex").slice(0, 12);
  if (!flags.force && fs.existsSync(out) && fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, "utf8")).hash === h) {
    console.log(`· music ${c.id} up to date`);
    continue;
  }
  process.stdout.write(`  music ${c.id} (${secs}s)… `);
  await lyria(prompt, out);
  const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
  fs.writeFileSync(meta, JSON.stringify({ hash: h, dur, target: secs, prompt }, null, 1));
  console.log(`${dur.toFixed(0)}s`);
  if (flags.critique) {
    const r = spawnSync("node", [path.join(ROOT, "scripts/listen.mjs"), out, "You are a film composer reviewing a background cue that will sit under a voice-over narrator. In under 120 words: instruments, mood, structure with timestamps, and anything that would fight with a voice (vocals, loud climaxes, busy midrange, drums)."], { encoding: "utf8" });
    console.log(r.stdout.trim().replace(/^/gm, "    "));
  }
}
