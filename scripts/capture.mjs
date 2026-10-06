// Record animated visuals from a web page as crisp 30fps clips → public/clips/<name>.mp4 + clips.json.
// Config lives in videos/<slug>/capture.mjs:
//   export default { url, selector?: 'css for candidate elements', jobs: { name: { sel: 0 | "css", secs: 40, setup?: async (page, el) => {} } } }
// `sel` is an index into document.querySelectorAll(selector) or a CSS selector.
//   npm run capture <video> [job names...]
//
// How it works (lessons learned): render at CSS zoom 2 in a 2560px viewport (CDP screencast ignores
// deviceScaleFactor), lock window scroll (some visuals call scrollIntoView and shift the crop), hide
// fixed headers/cookie banners, record real-time screencast frames, then crop + resample with ffmpeg.
// Frames go to a temp dir and are deleted afterwards.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { resolveVideo, parseArgs, die } from "./_video.mjs";

const { pos } = parseArgs();
const v = resolveVideo(pos[0]);
const cfgFile = path.join(v.dir, "capture.mjs");
if (!fs.existsSync(cfgFile)) die(`no ${cfgFile}`);
const { default: cfg } = await import(pathToFileURL(cfgFile).href);
const only = pos.slice(1);
const W = 2560;
const clipsDir = path.join(v.publicDir, "clips");
fs.mkdirSync(clipsDir, { recursive: true });
const registryPath = path.join(v.dir, "clips.json");
const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : {};

let browser;
try {
  browser = await chromium.launch();
} catch {
  die("playwright browser missing — run: npx playwright install chromium-headless-shell");
}
for (const [name, job] of Object.entries(cfg.jobs)) {
  if (only.length && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: 1440 } });
  const page = await ctx.newPage();
  await page.goto(cfg.url, { waitUntil: "networkidle" });
  for (const label of ["Reject All", "Reject all", "Accept All Cookies", "Accept all"]) {
    const b = page.getByRole("button", { name: label }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
  }
  await page.addStyleTag({ content: `html { zoom: 2; scroll-behavior: auto !important } header, nav, #onetrust-consent-sdk { display: none !important }` });
  await page.waitForTimeout(500);
  const el = typeof job.sel === "number" ? page.locator(cfg.selector ?? '[class*="-shell"]:has(svg)').nth(job.sel) : page.locator(job.sel).first();
  // hide fixed/sticky page chrome, but not anything inside the visual itself
  await el.evaluate((root) => {
    for (const e of document.querySelectorAll("body *")) {
      const p = getComputedStyle(e).position;
      if ((p === "fixed" || p === "sticky") && !root.contains(e)) e.style.display = "none";
    }
  });
  if (job.setup) { await el.scrollIntoViewIfNeeded(); await job.setup(page, el); await page.waitForTimeout(600); }
  const h = await el.evaluate((e) => e.getBoundingClientRect().height);
  await page.setViewportSize({ width: W, height: Math.ceil(h) + 80 });
  for (let i = 0; i < 3; i++) {
    await el.evaluate((e) => e.scrollIntoView({ block: "start", behavior: "instant" }));
    await el.evaluate((e) => { const d = document.documentElement; d.scrollTop = d.scrollTop + e.getBoundingClientRect().top - 40; });
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => {
    const y = window.scrollY;
    window.scrollTo = window.scroll = window.scrollBy = () => {};
    Element.prototype.scrollIntoView = function () {};
    window.addEventListener("scroll", () => { if (window.scrollY !== y) document.documentElement.scrollTop = y; });
  });
  await page.waitForTimeout(300);
  const box = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cap-${name}-`));
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(tmp, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: 4000 });
  await page.waitForTimeout((job.secs ?? 40) * 1000);
  await cdp.send("Page.stopScreencast");
  await ctx.close();

  const lines = [];
  frames.forEach((f, i) => lines.push(`file '${f.file}'`, `duration ${(i + 1 < frames.length ? frames[i + 1].t - f.t : 1 / 30).toFixed(4)}`));
  lines.push(`file '${frames.at(-1).file}'`);
  fs.writeFileSync(path.join(tmp, "list.txt"), lines.join("\n"));
  const cw = Math.floor(box.w / 2) * 2, ch = Math.floor(box.h / 2) * 2;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "list.txt"),
    "-vf", `crop=${cw}:${ch}:${Math.round(box.x)}:${Math.round(box.y)},fps=30`, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", path.join(clipsDir, `${name}.mp4`)]);
  fs.rmSync(tmp, { recursive: true });
  registry[name] = { w: cw, h: ch, secs: job.secs ?? 40 };
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 1));
  console.log(`  ${name.padEnd(14)} ${cw}x${ch}  ${frames.length} frames`);
}
await browser.close();
