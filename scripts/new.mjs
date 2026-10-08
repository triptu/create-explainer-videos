// Scaffold a new video:  npm run new <slug> [--source <url>] [--title "…"] [--template default|story]
//   default: slides (one component per scene)   story: one continuous animated world with Buddy (lib/story.tsx)
import fs from "node:fs";
import path from "node:path";
import { ROOT, VIDEOS, parseArgs, die } from "./_video.mjs";

const { pos, flags } = parseArgs();
const slug = pos[0];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) die("usage: npm run new <kebab-slug> [--source url] [--title text] [--template default|story]");
const template = flags.template ?? "default";
if (!fs.existsSync(path.join(ROOT, "templates", template))) die(`no template "${template}" (templates/: ${fs.readdirSync(path.join(ROOT, "templates")).join(", ")})`);
const dir = path.join(VIDEOS, slug);
if (fs.existsSync(dir)) die(`${dir} already exists`);
fs.cpSync(path.join(ROOT, "templates", template), dir, { recursive: true });
const cfgPath = path.join(dir, "video.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
Object.assign(cfg, { title: flags.title ?? slug, source: flags.source ?? "" });
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(template === "story"
  ? `✓ videos/${slug} (story)\nnext: narration.json → npm run tts ${slug} → npm run sound ${slug} → world.tsx/index.tsx → npm run check ${slug} → npm run stills ${slug} -- --at 0.2,0.6,0.95 → npm run render ${slug}`
  : `✓ videos/${slug}\nnext: write narration.json → npm run tts ${slug} → edit scenes.tsx/index.tsx → npm run check ${slug} → npm run stills ${slug} → npm run render ${slug}`);
