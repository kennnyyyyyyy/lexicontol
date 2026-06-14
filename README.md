# lexicontol

**A speed-reading trainer that paces your eyes by un-blurring words — not flashing them.**

[![License: MIT](https://img.shields.io/badge/license-MIT-e2b714.svg)](LICENSE)
[![Made with vanilla JS](https://img.shields.io/badge/made%20with-vanilla%20JS-323437.svg)](#tech-stack)
[![Deploy: GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-323437.svg)](#deploy-to-github-pages)

![lexicontol](assets/screenshot.png)

---

## Why blur-reveal instead of flashing?

Most speed-reading tools use **RSVP** (Rapid Serial Visual Presentation): they flash
one word at a time in the centre of the screen. It feels fast, but it strips away the
natural left-to-right eye movement your brain relies on to build meaning, which tends
to hurt comprehension.

**lexicontol takes the opposite approach.** The *entire* paragraph stays on screen in a
normal horizontal layout. Every word begins **blurred**, and a reading "head" sweeps
left-to-right at your target speed, **sharpening words as it reaches them**. The blur acts
as a pacer that gently pulls your eyes forward at a controlled WPM while preserving the
natural flow of reading. Long passages **auto-scroll** to keep the active word in view.

The result: the discipline of a pacer, without the comprehension cost of flashing.

## Features

- **Blur-reveal pacing** — the whole paragraph stays visible; words un-blur as the head reaches them.
- **Drift-free WPM engine** — a timestamp-based scheduler keeps speed accurate over long passages.
- **Chunk reading** — reveal 1–6 words at a time for wider fixations at higher speeds.
- **Feathered blur radius** — control how far the "clear halo" extends around the active chunk.
- **Auto & manual modes** — let it sweep automatically, or advance chunk-by-chunk yourself.
- **Smooth auto-scroll** — keeps the active line comfortably in view.
- **Fully themeable** — font, size, colours, alignment, and reader dimensions, all live.
- **Paste your own text** — or cycle through five built-in academic passages.
- **Everything persists** — settings are saved to `localStorage`.
- **Zero build step** — open `index.html` directly, or host it as a static site.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `space` | Play / pause (auto mode) · advance one chunk (manual mode) |
| `r` | Restart — reset to the start, paused |
| `n` | New text — open the paste-text overlay |
| `s` | Settings |
| `←` | Skip back one chunk |
| `→` | Skip ahead one chunk |
| `↑` | WPM +25 |
| `↓` | WPM −25 |
| `esc` | Close any open overlay / panel |

Shortcuts are suppressed while you're typing in the text box or a settings field.

## Settings

| Setting | Range | Default | Notes |
|---|---|---|---|
| WPM | 50–1500 | 300 | also `↑`/`↓` (±25) and the preset chips |
| Chunk size | 1–6 | 1 | words un-blurred at once |
| Blur strength | 0–20px | 5 | how strong blurred words are |
| Blur radius | 1.0–4.0 | 1.0 | feather / falloff around the active chunk |
| Auto-advance | on / off | on | off = manual mode |
| Smooth scroll | on / off | on | |
| Window width | 30–100% | 70% | reading container width |
| Window height | 120–640px | 320 | reading container height |
| Font size | 14–64px | 32 | |
| Font family | select | Roboto Mono | + Courier New, Inter, Georgia |
| Font color | colour | `#d1d0c5` | |
| Background color | colour | `#323437` | colours double as theming |
| Text alignment | left / center / justify | left | |

### How the blur radius works

The active chunk is always perfectly sharp. For any other word at a word-distance `d`
from the nearest active word, the applied blur is:

```
blurFraction = clamp(d − (R − 1), 0, 1)
appliedBlurPx = blurFraction × maxBlur
```

So with radius `R = 1.0`, only the active chunk is clear and its immediate neighbours are
fully blurred. Raising `R` extends a "clear halo" outward and feathers the falloff — e.g.
at `R = 1.5` a word one step away sits at 50% blur; at `R = 2.0` it's fully sharp while a
word two steps away takes over the full blur.

## Getting started

```bash
git clone https://github.com/kennnyyyyyyy/lexicontol.git
cd lexicontol
```

Then either:

- **Double-click `index.html`** — it runs straight from the filesystem, or
- **Serve it locally** (recommended for a clean origin):

  ```bash
  python -m http.server 8000
  # then open http://localhost:8000
  ```

No install, no build, no dependencies beyond a Google Font.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **`main`** and folder **`/ (root)`**, then **Save**.
5. Your site goes live at:

   ```
   https://<your-username>.github.io/lexicontol/
   ```

   For this repo that's `https://kennnyyyyyyy.github.io/lexicontol/`.

Because the app uses classic `<script>` tags (no ES modules) and only relative paths, it
works identically when opened locally or served from a Pages subpath.

## Tech stack

- **Vanilla HTML / CSS / JavaScript** — no framework, no bundler, no build step.
- Classic `<script>` tags loaded in order; shared state lives on a single global `LC` namespace.
- **`localStorage`** for settings persistence.
- One Google Fonts request (Roboto Mono + Inter).

```
lexicontol/
├── index.html
├── css/style.css
├── js/
│   ├── samples.js    # LC.samples — built-in passages
│   ├── settings.js   # LC.settings — state, panel, localStorage
│   ├── reader.js     # LC.reader — blur-reveal engine, timing, scroll
│   └── app.js        # init, keyboard shortcuts, wiring (loads last)
└── assets/
```

## Roadmap

- Saved passage library with tags and search
- Comprehension quiz mode after each passage
- Reading stats over time (WPM trend, sessions, streaks)
- Import from URL, PDF, or `.txt`
- Per-passage bookmarks and resume

## Acknowledgements

- UI and palette ("serika dark") inspired by [monkeytype](https://monkeytype.com).
- The blur-reveal concept is a comprehension-first reimagining of RSVP pacers such as
  [accelareader](https://accelareader.com) — keeping the whole paragraph and natural eye
  movement instead of flashing single words.

## License

[MIT](LICENSE) © 2026 Kenny
