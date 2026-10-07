---
name: video
description: Make a narrated, captioned explainer video from anything — a blog post or article URL, a paper, one or more pull requests, a branch or diff, a repo, or rough notes — or revise an existing one. Triggers on "make a video of…", "/video <link|PRs|repo>", "explain this as a video", "video walkthrough of these PRs", or changes to a previous video (fix a scene, shorten, change voice, re-render).
---

# Video

Turn whatever the user hands you into a video someone would actually choose to watch instead of
reading the source: clear story, real visuals, every scene moving, and accurate claims.

All videos live in this studio (this repo's `videos/` folder). **Read `CLAUDE.md` first**: it has the
commands, workflow, scene conventions and gotchas. This skill is about judgment; CLAUDE.md is about
mechanics. Never scaffold a new project. Use `npm run new`, or edit an existing video in `videos/` in place.

## How to work

**Run end to end.** Make reasonable assumptions, build the video, and report what you assumed.
Pause to ask only if the user explicitly asked you to check in, or if you're truly blocked (the
source is inaccessible, or it's genuinely unclear which PRs or what scope they mean).

**Be resourceful.** Aim for the best possible video, not the minimum that works from what you were
handed. Use any tool that helps: web search, the source's references and linked pages, related
posts or docs, the author's earlier work, `gh`, cloning and running code, the live product, and
other skills. Fill in missing context, check claims, find better visuals, and figure out what a
term or system is rather than guessing. A narrow source doesn't limit you to what's in it.
If an approach fails, try another before you settle for less.

**Audience defaults:**
- Articles, posts and papers: a smart viewer who hasn't read the source.
- PRs, branches, repos and code: **internal.** The viewer is the user, who wants to understand what
  was done, often because they're about to review it. Optimize for "I could now review or discuss
  this confidently." Make it a public or launch-style video only when the user says so.

**Length follows content.** A single small PR might be 1–2 minutes; a dense post, 5–8. Don't pad,
and don't cram. One idea per scene.

## 1. Understand it better than a skim

Go to the primary material and read all of it before writing a word.

- **Links and papers:** fetch the page itself. Raw HTML first, then Playwright if it's client-rendered,
  if you need to see or record visuals, or if it's blocked (see CLAUDE.md). Never work from a summary.
  Get the full text and every figure, video and interactive. If it's behind a login, say so.
- **PRs and diffs:** description, full diff, commits, review threads, linked issues, CI results.
  Read the surrounding code too, not just the changed lines: callers, data flow, tests. Work out
  *why* it was done, what the alternatives were, and where the risk is. If seeing behavior helps,
  run it and capture before/after.
- **Repos:** entry points, architecture, the main data or control flow, and what's unusual.
- **Notes or a topic:** research enough to be correct, and cite where claims came from.

## 2. Find the story

Decide the one-sentence takeaway first, then the arc that earns it. Usually that's the problem,
the key insight, how it works, the evidence, and what it means. For review-oriented PR videos, also
cover: the shape of the change, the important decisions, what's risky or subtle, how it's tested,
and where a reviewer should look.

Write narration for the ear, in your own words. Keep exact numbers, names and quotes from the
source, and never invent metrics. If you simplify, stay truthful.

Voice: Kokoro by default. If the user wants a more natural voice, or `.env` has `OPENROUTER_API_KEY`, use
Gemini TTS (CLAUDE.md, "Voices").

## 3. Make it visual

- **Real artifacts first:** the source's own figures and recordings, actual UI (screenshots or
  recordings of the running app), and real code shown as focused snippets with highlighted
  lines, never walls of code.
- **Custom animated diagrams for everything else:** flows, before/after, architecture, numbers
  that count up, comparisons. Every scene should have something moving that explains the idea, in
  sync with the words.
- **Theme:** match the source's brand. For code with no brand, use the product's look or a clean,
  code-friendly theme.

## 4. Verify, then deliver

Follow the check → stills → preview → full render loop in CLAUDE.md. Look at the stills and fix
what you see, including overlaps, empty stretches, unreadable text, and timing that doesn't match
the words. Then report:
the output path, length, what the video covers, what you verified, and any assumptions or gaps.
Say plainly that you haven't watched it end to end.

## Leave the studio better

If you hit a reusable gotcha, add it to CLAUDE.md. If you built something other videos will want
(a code-diff scene, a PR timeline, a chart primitive), move it to `lib/` or `templates/default`.
Generated assets in `videos/*/public/` are gitignored, so anything a fresh clone can't regenerate
(downloaded media, hand-made images) should be fetched by a script, not just dropped in.
