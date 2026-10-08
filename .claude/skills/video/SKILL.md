---
name: video
description: Make a narrated, captioned explainer video from anything — a blog post or article URL, a paper, one or more pull requests, a branch or diff, a repo, or rough notes — or revise an existing one. Two formats: a classic slide explainer, or an animated story (Kurzgesagt / 3Blue1Brown style: one continuous world, the Buddy mascot, music and sound design, optional two-voice dialogue). Triggers on "make a video of…", "/video <link|PRs|repo>", "explain this as a video", "video walkthrough of these PRs", or changes to a previous video (fix a scene, shorten, change voice, re-render).
---

# Video

Turn whatever the user hands you into a video someone would actually choose to watch instead of
reading the source: clear story, real visuals, every scene moving, and accurate claims.

All videos live in this studio (this repo's `videos/` folder). **Read `CLAUDE.md` first**: it has the
commands, workflow, scene conventions and gotchas. This skill is about judgment; CLAUDE.md is about
mechanics. Never scaffold a new project. Use `npm run new`, or edit an existing video in `videos/` in place.

## How to work

**Confirm the direction, then run end to end.** Videos differ in goal, audience and style, and a wrong
direction wastes the whole build. So after you've read the source (step 1), and before writing narration,
propose a direction with a concrete default and ask the user to confirm or adjust it, in one AskUserQuestion
call (see "0. Propose a direction"). After that, don't stop again: make reasonable assumptions, build the
video, and report what you assumed. Skip the check-in only when the user already settled the direction (they
named the format, metaphor or style, said "just make it", or it's a revision of an existing video), or when no
one can answer (a scheduled or unattended run). Then state the direction you picked at the top of your report.

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

## 0. Propose a direction

Read the source first, so the proposal is specific. Then ask, with your recommendation first and marked
"(Recommended)", at most four questions, only the ones that matter for this source:

- **Audience and goal**: who watches and what they should walk away with (e.g. "leadership: what changed
  and why it matters, 2–3 min" vs "engineers about to review: how it works, where the risk is").
- **Format**:
  - *Classic*: slides with diagrams, real screenshots and recordings. Best for PR walkthroughs, UI-heavy
    sources, and anything where the real artifacts are the point.
  - *Story*: one continuous animated world with Buddy, a camera that travels, music and sound design. Best for
    concepts, ideas, and posts people should *enjoy* and remember; costs more build time.
- **Metaphor** (story only): propose one central metaphor and show 2–3 of its key mappings
  ("eval = altimeter; train/test = a slope you can study vs one hidden in fog; cost = pack weight"). Offer
  "no metaphor: literal diagrams in a continuous world" as an option. Never force a metaphor that misleads.
- **Voice**: one narrator (default), or dialogue for dense, technical material where a skeptical voice helps.
  In story mode the default dialogue setup is **Buddy as the host** (voiced, asking what the viewer is thinking)
  and an **off-screen guide** who explains. Alternatives worth offering: a second on-screen character as the
  expert (more charm, but a second design and a drift toward kids' TV), or two off-screen voices with Buddy
  silent (podcast feel).

Fold length and tone into the format or audience option text rather than asking separately.

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
Gemini TTS (CLAUDE.md, "Voices"). Story mode should use Gemini. Direct the voice like casting a person, not
painting a mood: a natural persona ("a warm, clear, conversational explainer talking to a smart friend") gives
lively, believable delivery; theatrical words ("hushed", "dramatic") make it overact. Keep inline pauses and breaths
rare. For dialogue, see "3c. Write the dialogue".

## 3. Make it visual (classic)

- **Real artifacts first:** the source's own figures and recordings, actual UI (screenshots or
  recordings of the running app), and real code shown as focused snippets with highlighted
  lines, never walls of code.
- **Custom animated diagrams for everything else:** flows, before/after, architecture, numbers
  that count up, comparisons. Every scene should have something moving that explains the idea, in
  sync with the words.
- **Theme:** match the source's brand. For code with no brand, use the product's look or a clean,
  code-friendly theme.

## 3b. Make it a story (story mode)

Follow "Story mode" in CLAUDE.md for mechanics. Craft:

- **Write for the metaphor first.** Open inside the world ("Imagine climbing a mountain in thick fog…"), map the
  idea onto it, then name the real thing. Each beat names one concept and shows one picture. Keep exact
  numbers and claims; the metaphor never replaces them.
- **Invent the world for this video.** Follow "Every video gets its own world" in CLAUDE.md: setting and light,
  a few recurring objects that each mean one thing, stations, Buddy's role. The template is a skeleton and
  earlier videos are technique references; a new subject deserves its own look.
- **Plan the journey before drawing.** List stations (one per chapter) along a path, which beats play at each,
  and what Buddy wears and does there. Callbacks (revisiting an earlier element) make it feel like one story.
- **Everything moves with the words.** Every noun the narrator introduces appears when it's said, every
  reaction has a Buddy mood and a chirp, every reveal a quiet sound effect, every camera move a whoosh.
- **Buddy has restraint.** A reaction per idea, not per sentence. It talks only as the dialogue host, and then like a curious colleague, not a cartoon. No slapstick; small, specific
  emotions (curious, worried, proud) that mirror what the viewer should feel. That's what keeps it from being
  cringe for any age.
- **Know when to drop the metaphor.** For a technical audience, use it for the big picture, then show mechanisms as
  they really are (real text, the source's worked examples, verbatim prompts) and say so on screen. Half-metaphor,
  half-mechanism ends up confusing both the expert and the newcomer.
- **Charts become terrain** where it fits: a score climbing over rounds is a ridge Buddy can walk.

## 3c. Write the dialogue (story mode, two voices)

Default cast: **Buddy is the host**, on screen and voiced (a bright, natural voice, no robot effects); the **guide** is
an off-screen expert. The host is the viewer's stand-in.

- The host asks what *this* audience would actually be wondering right then, in their words. For engineers, real
  objections, not "tell me more". If a line doesn't resolve a doubt, cut it.
- Host lines are short; the guide answers briefly and stops. Now and then the host says the takeaway back, which
  doubles as Buddy's visible "aha". A little skepticism goes a long way; no banter, filler or praise.
- The outro is the host's recap in their own words.

An example beat, for tone (an engineering explainer of a chat-memory design):
```
host:  Why the last message, not the first?
guide: Take the doc's example. T is ten, and the view is zero plus four, four plus four, eight plus one,
       nine plus one. From the last message, eight and nine are most due, which is what push merges.
       From the first, zero to seven wins instead, rewriting an old line.
```

Build story videos a station at a time, checking stills as you go, and listen-check the music cues before relying
on them.

## 4. Verify, then deliver

Follow the check → stills → preview → full render loop in CLAUDE.md. Look at the stills and fix
what you see, including overlaps, empty stretches, unreadable text, and timing that doesn't match
the words. Then report:
the output path, length, what the video covers, what you verified, and any assumptions or gaps. You can't
hear the audio, but `npm run listen` can: use it to check the narration transcript, the music cues and the
final mix (narrator intelligible, music under the voice, effects not harsh).
Say plainly that you haven't watched it end to end.

## Leave the studio better

Keep CLAUDE.md and this skill about taste, judgement and constraints that aren't obvious from the code, plus enough
orientation to move fast. Don't log one-off incidents or details a capable model would work out on its own: they
crowd out the guidance that matters and box future models in. If you hit a gotcha that will recur and isn't
discoverable, add it to CLAUDE.md briefly. If you built something other videos will want
(a code-diff scene, a PR timeline, a chart primitive), move it to `lib/` or `templates/default`.
Generated assets in `videos/*/public/` are gitignored, so anything a fresh clone can't regenerate
(downloaded media, hand-made images) should be fetched by a script, not just dropped in.
Feel free to improve this skill or create new ones, especially if there was a long session with the user and there are learnings for future.
