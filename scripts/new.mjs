// Scaffold a new video from templates/default:  npm run new <slug> [--source <url>] [--title "…"]
import fs from "node:fs";
import path from "node:path";
import { ROOT, VIDEOS, parseArgs, die } from "./_video.mjs";

const { pos, flags } = parseArgs();
const slug = pos[0];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) die("usage: npm run new <kebab-slug> [--source url] [--title text]");
const dir = path.join(VIDEOS, slug);
if (fs.existsSync(dir)) die(`${dir} already exists`);
fs.cpSync(path.join(ROOT, "templates/default"), dir, { recursive: true });
const cfgPath = path.join(dir, "video.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
Object.assign(cfg, { title: flags.title ?? slug, source: flags.source ?? "" });
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(`✓ videos/${slug}\nnext: write narration.json → npm run tts ${slug} → edit scenes.tsx/index.tsx → npm run check ${slug} → npm run stills ${slug} → npm run render ${slug}`);
