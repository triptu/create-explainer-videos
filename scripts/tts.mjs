// Narration → public/vo/<id>.mp3 + vo.json, using Kokoro (local, free).
// Only re-synthesizes scenes whose text/voice/speed changed (cached by hash in vo.json).
//   npm run tts <video> [--force] [--voice af_heart] [--speed 1.1]
// NOTE: must run as a file; kokoro's phonemizer crashes under `node -e`.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolveVideo, parseArgs } from "./_video.mjs";

const { pos, flags } = parseArgs();
const v = resolveVideo(pos[0]);
const voice = flags.voice ?? v.cfg.voice ?? "af_heart";
const speed = Number(flags.speed ?? v.cfg.speed ?? 1.1);
const pause = Number(v.cfg.sentencePause ?? 0.22);
// video.json "speech": { "regex": "replacement" } — pronunciation fixes; captions keep the written form.
const speech = Object.entries(v.cfg.speech ?? {}).map(([re, to]) => [new RegExp(re, "g"), to]);
const forSpeech = (s) => speech.reduce((acc, [re, to]) => acc.replace(re, to), s);

const narration = JSON.parse(fs.readFileSync(path.join(v.dir, "narration.json"), "utf8"));
const voPath = path.join(v.dir, "vo.json");
const prev = Object.fromEntries((fs.existsSync(voPath) ? JSON.parse(fs.readFileSync(voPath, "utf8")) : []).map((e) => [e.id, e]));
const outDir = path.join(v.publicDir, "vo");
fs.mkdirSync(outDir, { recursive: true });

let tts;
const load = async () => {
  if (tts) return tts;
  const { KokoroTTS } = await import("kokoro-js");
  return (tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" }));
};

const writeWav = (file, samples, rate) => {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => buf.writeInt16LE(Math.max(-1, Math.min(1, x)) * 32767, 44 + i * 2));
  fs.writeFileSync(file, buf);
};

const out = [];
for (const s of narration) {
  const spoken = forSpeech(s.text);
  const hash = crypto.createHash("sha1").update(JSON.stringify([spoken, voice, speed, pause])).digest("hex").slice(0, 12);
  const mp3 = path.join(outDir, `${s.id}.mp3`);
  if (!flags.force && prev[s.id]?.hash === hash && fs.existsSync(mp3)) {
    out.push({ ...prev[s.id], text: s.text });
    continue;
  }
  const t = await load();
  const sentences = spoken.match(/\S.*?(?:[.!?:](?=\s|$)|$)/g).filter(Boolean);
  const parts = [];
  let rate = 24000;
  for (const sentence of sentences) {
    const a = await t.generate(sentence, { voice, speed });
    rate = a.sampling_rate;
    parts.push(a.audio, new Float32Array(Math.round(rate * pause)));
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const wav = path.join(outDir, `${s.id}.wav`);
  writeWav(wav, all, rate);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "160k", mp3]);
  fs.rmSync(wav);
  const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString());
  out.push({ id: s.id, dur, text: s.text, hash });
  console.log(`  ${s.id.padEnd(16)} ${dur.toFixed(1)}s`);
}
// drop audio for scenes that no longer exist
const ids = new Set(narration.map((s) => s.id));
for (const f of fs.readdirSync(outDir)) if (!ids.has(f.replace(/\.mp3$/, ""))) fs.rmSync(path.join(outDir, f));
fs.writeFileSync(voPath, JSON.stringify(out, null, 1));
const total = out.reduce((a, b) => a + b.dur, 0);
console.log(`${v.slug}: ${out.length} scenes, ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")} of narration (voice ${voice}, speed ${speed})`);
