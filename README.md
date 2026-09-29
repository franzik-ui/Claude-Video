# PAYBACK AI Enablement: "The Dot"

Internal brand film (29 s, 1920×1080, 30 fps, H.264 + AAC).

**Final video:** `output/PAYBACK_AI_Enablement_TheDot_1080p.mp4`

## Concept
The film opens on a typed sentence: "AI sounds interesting." Its full stop grows into the Pointee.
The dot runs through four chapters (Learn, Try, Share, Build), multiplies into the network of 80+ AI Ambassadors,
peaks at the Promptathon and closes as the four circles of the PAYBACK logo. The typed line comes back as
"AI is part of my everyday work."

| Time | Scene | Content |
|---|---|---|
| 0–3 s | Hook | Typed line, full stop inflates into the Pointee |
| 3–7 s | 01 Learn | Pointee with AI cap, "?" flips to "!", Expert Hour / Lunch & Learn / What's New @ Copilot |
| 7–11 s | 02 Try | Laptop Pointee, prompt → Context → Instructions → My agent. "You build it. We help." |
| 11–15 s | 03 Share | Ambassador network lights up across departments. 80+ AI Ambassadors, 1,400+ colleagues |
| 15–21 s | 04 Build | Promptathon: teams, 09:00 → 16:00, Idea → Prompt → Prototype → Pitch, wizard Pointee, confetti |
| 21–29 s | Resolve | Learn. Try. Share. Build. → circles become the PAYBACK logo → AI Enablement |

## Structure
```
assets/brand/      supplied logo + Pointee artwork (unchanged, source of truth)
assets/fonts/      Plus Jakarta Sans, JetBrains Mono (SIL Open Font License)
src/film.js        the whole animation: deterministic renderFrame(t)
src/index.html     canvas host (open via a local web server, ?play to preview, ?t=12.5 for one frame)
src/render.mjs     headless Chromium (Playwright) → PNG frames → ffmpeg H.264
src/contact.py     contact sheets for visual QC
audio/soundtrack.py  procedural music + sound design (numpy/scipy), writes audio/soundtrack.wav
output/            final deliverable
```

## Rebuild
Requirements: Node 18+ with Playwright + Chromium, Python 3 with numpy, scipy, pillow, and ffmpeg
(`pip install imageio-ffmpeg` provides a binary; set `FFMPEG=/path/to/ffmpeg`).

```bash
python3 audio/soundtrack.py
node src/render.mjs video render/film_silent.mp4
ffmpeg -y -i render/film_silent.mp4 -i audio/soundtrack.wav -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 320k -shortest -movflags +faststart output/PAYBACK_AI_Enablement_TheDot_1080p.mp4
```
All timings live in `src/film.js`; the matching audio cues are in `audio/soundtrack.py`.

## Rights
Music and sound effects are synthesised from scratch in code (no samples, no third-party music).
No generative image, voice or external API was used. Fonts are OFL-licensed.
