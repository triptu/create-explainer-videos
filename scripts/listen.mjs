// Ask Gemini about an audio file, for checking TTS, music and sound effects without listening.
//   npm run listen <file.mp3|wav> ["question"]     default question: verbatim transcript
// Needs OPENROUTER_API_KEY in .env. Converts to mp3 first (Gemini input_audio wants mp3/wav).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs, die, loadEnv } from "./_video.mjs";

loadEnv();
const { pos } = parseArgs();
const file = pos[0];
if (!file || !fs.existsSync(file)) die('usage: npm run listen <audio file> ["question"]');
const question = pos[1] ?? "Transcribe this audio verbatim. Output only the transcript.";
const key = process.env.OPENROUTER_API_KEY;
if (!key) die("OPENROUTER_API_KEY missing (add it to .env)");

const tmp = path.join(os.tmpdir(), `listen-${process.pid}.mp3`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-ac", "1", "-b:a", "96k", tmp]);
const data = fs.readFileSync(tmp).toString("base64");
fs.rmSync(tmp);
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "google/gemini-3.8-flash",
    messages: [{ role: "user", content: [{ type: "text", text: question }, { type: "input_audio", input_audio: { data, format: "mp3" } }] }],
  }),
});
if (!res.ok) die(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
console.log((await res.json()).choices[0].message.content.trim());
