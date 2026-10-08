// Resolves a video folder from a (partial) slug: `npm run render intro` → videos/intro-to-rust
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIDEOS = path.join(ROOT, "videos");

export const resolveVideo = (slug) => {
  const all = (fs.existsSync(VIDEOS) ? fs.readdirSync(VIDEOS) : []).filter((d) => fs.existsSync(path.join(VIDEOS, d, "index.tsx")));
  if (!slug) die(`usage: <command> <video>\nvideos: ${all.join(", ")}`);
  const hits = all.includes(slug) ? [slug] : all.filter((d) => d.includes(slug));
  if (hits.length !== 1) die(hits.length ? `ambiguous "${slug}": ${hits.join(", ")}` : `no video matches "${slug}". videos: ${all.join(", ")}`);
  const dir = path.join(VIDEOS, hits[0]);
  const cfgPath = path.join(dir, "video.json");
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
  return { slug: hits[0], dir, cfg, entry: path.join(dir, "index.tsx"), publicDir: path.join(dir, "public") };
};

export const die = (msg) => { console.error(msg); process.exit(1); };

/** Splits argv into positionals and --flags (--key=value or --key value or bare --flag). */
export const parseArgs = (argv = process.argv.slice(2)) => {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) flags[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
    else flags[k] = true;
  }
  return { pos, flags };
};

/** Loads .env at the studio root (KEY=value lines) without overriding the real environment. */
export const loadEnv = () => {
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};
