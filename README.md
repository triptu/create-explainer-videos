# create-explainer-videos

Turn anything you'd rather watch than read into a short explainer video.

Give it a blog post, a research paper, a pull request or your own rough notes. You get back a narrated
video with captions, and visuals that move along with the story. It's free and runs on your own computer.

## How to use

Paste this into Claude Code, Codex, Cursor or any other coding agent:

> Use https://github.com/triptu/create-explainer-videos to make a video of https://example.com/some-post

It sets everything up and makes the video. Then ask for changes the way you'd brief an editor:
"shorten the intro", "try a calmer voice", "the third scene is confusing".

The default voice is free and runs locally. For a more natural one, add an [OpenRouter](https://openrouter.ai) key to
`.env` and ask for the Gemini voice.

Your videos stay on your computer and are never committed to the repo.

<!-- Agents: clone this repo if you haven't, work from inside it, and read AGENTS.md and
.claude/skills/video/SKILL.md before starting. -->
