// Narration → public/vo/<id>.mp3 + vo.json.
// Engines (video.json "tts"): "kokoro" (default, local, free) or an OpenRouter speech model id,
// e.g. "google/gemini-3.8-flash-tts" (needs OPENROUTER_API_KEY in .env at the studio root).
// Only re-synthesizes scenes whose text/voice/speed/engine changed (cached by hash in vo.json).
//   npm run tts <video> [--force | --redo id1,id2] [--voice af_heart] [--speed 1.1] [--tts kokoro|<openrouter model>]
//
// Two narration shapes (mix freely):
//   {"id": "x", "text": "…"}                                   one narrator (video.json "voice")
//   {"id": "x", "lines": [{"who": "host", "text": "…"}, …]}     dialogue; voices from video.json "cast":
//                                                             {"host": {"voice": "Puck"}, "guide": {"voice": "Charon"}}
// Gemini reads leading style tags as tone, not words: "[curious] Wait, why?". Captions and at() ignore them.
// It occasionally speaks a tag aloud instead ("Question mark. Wait, why?"), so tagged lines are transcribed after
// synthesis and re-done (up to 3 tries) unless the speech starts with the line's real words.
// Each scene also gets sync marks (sentence/line starts measured from pauses in the audio), so at("kw")
// lands on the spoken word rather than a character-count estimate.
// NOTE: must run as a file; kokoro's phonemizer crashes under `node -e`.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { resolveVideo, parseArgs, loadEnv } from "./_video.mjs";

loadEnv();
const { pos, flags } = parseArgs();
const v = resolveVideo(pos[0]);
const engine = flags.tts ?? v.cfg.tts ?? "kokoro";
const kokoro = engine === "kokoro";
// Kokoro voices look like "af_heart"; Gemini voices like "Charon". Gemini already speaks at a natural pace.
const voice = flags.voice ?? v.cfg.voice ?? (kokoro ? "af_heart" : "Charon");
const speed = Number(flags.speed ?? v.cfg.speed ?? (kokoro ? 1.1 : 1));
const pause = Number(v.cfg.sentencePause ?? 0.22);
const gap = Number(v.cfg.lineGap ?? 0.3); // silence between dialogue lines
const cast = v.cfg.cast ?? {};
const castOf = (who) => {
  const c = cast[who];
  if (!c) throw new Error(`speaker "${who}" is not in video.json "cast"`);
  return { voice: c.voice, speed: Number(c.speed ?? speed), fx: c.fx ?? "" };
};

/** OpenRouter /audio/speech → raw 24 kHz mono s16le PCM (Gemini TTS only returns pcm). One request per scene/line keeps prosody natural. */
const openrouterPcm = async (text, voice, file) => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing (add it to .env)");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: engine, input: text, voice, response_format: "pcm" }),
    });
    if (res.ok) {
      const rate = Number((res.headers.get("content-type") ?? "").match(/rate=(\d+)/)?.[1] ?? 24000);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return rate;
    }
    const msg = await res.text();
    if (attempt >= 3 || res.status < 500) throw new Error(`openrouter tts ${res.status}: ${msg.slice(0, 300)}`);
  }
};
// video.json "speech": { "regex": "replacement" } — pronunciation fixes; captions keep the written form.
const speech = Object.entries(v.cfg.speech ?? {}).map(([re, to]) => [new RegExp(re, "g"), to]);
const forSpeech = (s) => speech.reduce((acc, [re, to]) => acc.replace(re, to), s);
const plain = (s) => s.replace(/\[[^\]]*\]\s*/g, "");
const sentenceStarts = (s) => [...s.matchAll(/\S.*?(?:[.!?:](?=\s|$)|$)/g)].filter((m) => m[0]).map((m) => m.index);

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
const ff = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
const duration = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

/** One utterance → loudness-normalized 44.1 kHz mono wav with edge silence trimmed. */
const synth = async (spoken, { voice, speed, fx }, out) => {
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse";
  const tail = [fx, "loudnorm=I=-16:TP=-1.5:LRA=11"].filter(Boolean).join(",");
  if (!kokoro) {
    const pcm = out + ".pcm";
    const rate = await openrouterPcm(spoken, voice, pcm);
    const tempo = speed === 1 ? "" : `atempo=${speed},`;
    ff("-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", pcm, "-af", `${tempo}${trim},${tail}`, "-ar", "44100", "-ac", "1", out);
    fs.rmSync(pcm);
    return;
  }
  const t = await load();
  const parts = [];
  let rate = 24000;
  for (const sentence of spoken.match(/\S.*?(?:[.!?:](?=\s|$)|$)/g).filter(Boolean)) {
    const a = await t.generate(plain(sentence), { voice, speed });
    rate = a.sampling_rate;
    parts.push(a.audio, new Float32Array(Math.round(rate * pause)));
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const raw = out + ".raw.wav";
  writeWav(raw, all, rate);
  ff("-i", raw, "-af", `${trim},${tail}`, "-ar", "44100", "-ac", "1", out);
  fs.rmSync(raw);
};

/** Transcribe a short clip with Gemini (same check as `npm run listen`). */
const transcribe = async (file) => {
  const mp3 = file + ".check.mp3";
  ff("-i", file, "-ac", "1", "-b:a", "96k", mp3);
  const data = fs.readFileSync(mp3).toString("base64");
  fs.rmSync(mp3);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3.8-flash", messages: [{ role: "user", content: [{ type: "text", text: "Transcribe this audio verbatim. Output only the transcript." }, { type: "input_audio", input_audio: { data, format: "mp3" } }] }] }),
  });
  if (!res.ok) return null;
  return (await res.json()).choices?.[0]?.message?.content ?? null;
};
const words = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
/** True if the transcript starts with the line's first words (i.e. no style tag was read aloud). */
const startsRight = (transcript, line) => {
  const heard = words(transcript);
  while (/^(hmm+|mm+|oh|ah|uh|um)$/.test(heard[0] ?? "")) heard.shift(); // a natural interjection is fine
  const a = heard.slice(0, 2).join(" "), b = words(plain(line)).slice(0, 2).join(" ");
  return a === b;
};

/** Ends of pauses (seconds) in an audio file: where speech resumes. */
const pauseEnds = (file) => {
  const r = spawnSync("ffmpeg", ["-i", file, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"], { encoding: "utf8" });
  return [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
};

/**
 * Speech loudness per video frame (30 fps) as a compact string: one base-36 digit per frame, 0 (silent) … z (loud).
 * Drives mouth animation (story mode's useTalk), so a character's mouth opens on syllables and shuts on pauses.
 */
const speechEnv = (file) => {
  const r = spawnSync("ffmpeg", ["-i", file, "-af", "aresample=48000,asetnsamples=n=1600:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const db = [...r.stdout.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
  return db.map((d) => Math.round(Math.min(1, Math.max(0, (d + 32) / 22)) * 35).toString(36)).join("");
};

/**
 * Sentence starts of `text` → times, matched to the pauses in the audio (dynamic programming:
 * monotonic, each sentence takes the pause nearest its estimated time, or none if nothing is close).
 */
const alignSentences = (text, file, dur) => {
  const starts = sentenceStarts(text).slice(1);
  const ends = pauseEnds(file).filter((t) => t > 0.05 && t < dur - 0.05);
  if (!starts.length || !ends.length) return [];
  const est = starts.map((i) => (i / text.length) * dur);
  const tol = Math.max(1.2, dur * 0.12), n = starts.length, m = ends.length, SKIP = tol;
  // cost[k][j]: best cost placing sentences k.. using pauses j..
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const pick = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
  for (let k = n - 1; k >= 0; k--) {
    for (let j = m; j >= 0; j--) {
      let best = SKIP + cost[k + 1][j], choice = -1;
      for (let jj = j; jj < m; jj++) {
        const d = Math.abs(ends[jj] - est[k]);
        if (d > tol) continue;
        const c = d + cost[k + 1][jj + 1];
        if (c < best) { best = c; choice = jj; }
      }
      cost[k][j] = best; pick[k][j] = choice;
    }
  }
  const marks = [];
  for (let k = 0, j = 0; k < n; k++) {
    const c = pick[k][j];
    if (c >= 0) { marks.push([starts[k], +ends[c].toFixed(3)]); j = c + 1; }
  }
  return marks;
};

const out = [];
for (const s of narration) {
  const mp3 = path.join(outDir, `${s.id}.mp3`);
  const lines = s.lines ?? null;
  const text = lines ? lines.map((l) => l.text).join(" ") : s.text;
  const key = lines
    ? [engine, lines.map((l) => [l.who, forSpeech(l.text), castOf(l.who)]), gap]
    : kokoro ? [forSpeech(s.text), voice, speed, pause] : [engine, forSpeech(s.text), voice, speed];
  const hash = crypto.createHash("sha1").update(JSON.stringify(key)).digest("hex").slice(0, 12);
  const cached = prev[s.id];
  const redo = String(flags.redo ?? "").split(",").includes(s.id);
  if (!flags.force && !redo && cached?.hash === hash && fs.existsSync(mp3)) {
    // older entries predate sync marks: measure them from the existing audio, no re-synthesis
    const marks = cached.marks ?? (lines ? [] : alignSentences(plain(text), mp3, cached.dur));
    const env = cached.env ?? speechEnv(mp3);
    out.push({ ...cached, text, marks, env });
    continue;
  }

  const segs = lines ?? [{ who: null, text: s.text }];
  const files = [];
  for (const [k, l] of segs.entries()) {
    const f = path.join(outDir, `${s.id}.${k}.wav`);
    const tagged = !kokoro && /\[[^\]]*\]/.test(l.text);
    for (let attempt = 1; ; attempt++) {
      // after 3 tries with the tag spoken aloud, drop the tag: right words matter more than the tone hint
      const text = attempt <= 3 ? l.text : plain(l.text);
      await synth(forSpeech(text), l.who ? castOf(l.who) : { voice, speed, fx: "" }, f);
      if (!tagged || attempt > 3) break;
      const heard = await transcribe(f);
      if (heard === null || startsRight(heard, l.text)) break;
      console.log(`  ${s.id}: tag spoken aloud ("${heard.slice(0, 40)}…")${attempt === 3 ? ", dropping the tag" : ", retrying"}`);
    }
    files.push(f);
  }
  // stitch lines with a short gap, measuring each line's start/end and its sentence marks
  const marks = [], voLines = [];
  let t = 0, ci = 0;
  for (const [k, l] of segs.entries()) {
    const d = duration(files[k]);
    const p = plain(l.text);
    if (k > 0) marks.push([ci, +t.toFixed(3)]);
    for (const [i, at] of alignSentences(p, files[k], d)) marks.push([ci + i, +(t + at).toFixed(3)]);
    if (lines) voLines.push({ who: l.who, text: l.text, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
    t += d + (k < segs.length - 1 ? gap : 0);
    ci += p.length + 1;
  }
  const inputs = files.flatMap((f) => ["-i", f]);
  const silence = `anullsrc=r=44100:cl=mono,atrim=duration=${gap}`;
  const graph = files.length === 1
    ? "[0:a]anull[out]"
    : files.map((_, k) => (k < files.length - 1 ? `[${k}:a]` + `[g${k}]` : `[${k}:a]`)).join("") + `concat=n=${files.length * 2 - 1}:v=0:a=1[out]`;
  const gaps = files.slice(0, -1).map((_, k) => `${silence}[g${k}]`).join(";");
  ff(...inputs, "-filter_complex", [gaps, graph].filter(Boolean).join(";"), "-map", "[out]", "-ar", "44100", "-b:a", "160k", mp3);
  files.forEach((f) => fs.rmSync(f));
  const dur = duration(mp3);
  out.push({ id: s.id, dur, text, hash, marks, ...(lines ? { lines: voLines } : {}), env: speechEnv(mp3) });
  console.log(`  ${s.id.padEnd(16)} ${dur.toFixed(1)}s${lines ? `  (${lines.length} lines)` : ""}`);
}
// drop audio for scenes that no longer exist
const ids = new Set(narration.map((s) => s.id));
for (const f of fs.readdirSync(outDir)) if (!ids.has(f.replace(/\.mp3$/, ""))) fs.rmSync(path.join(outDir, f));
fs.writeFileSync(voPath, JSON.stringify(out, null, 1));
const total = out.reduce((a, b) => a + b.dur, 0);
const who = Object.keys(cast).length ? `cast ${Object.entries(cast).map(([k, c]) => `${k}=${c.voice}`).join(", ")}` : voice;
console.log(`${v.slug}: ${out.length} scenes, ${Math.floor(Math.round(total) / 60)}:${String(Math.round(total) % 60).padStart(2, "0")} of narration (${engine} ${who}, speed ${speed})`);
