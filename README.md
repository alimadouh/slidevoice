# B7oothKw

The front-end for **B7oothKw** — an AI-text humanizer sold in Kuwait, at
**https://b7ooth-ai.com**.

> This repo began life as SlideVoice, a browser-only slide-narration tool. That tool is
> still here as the **Slide Narrator**, but it is now one page of a larger product, and
> the rest of the site is **not** browser-only — see *Privacy* below. The old README
> described the narrator as if it were the whole site, which made its "no backend, files
> are never uploaded" line false for everything else. It is served publicly
> (`publish = "."`), so it is corrected here rather than left to mislead.

## What's on the site

| Page | What it does | Where the work happens |
|---|---|---|
| **Humanizer** | Rewrites AI-sounding text sentence by sentence, with a Go Green pass over whatever still reads as AI | Server |
| **Word Humanizer** | Rewrites a whole `.docx`, formatting intact | Server (members only) |
| **PowerPoint Humanizer** | Same for a whole `.pptx` | Server (members only) |
| **Turnitin Scan** | You upload a document; our team runs it on a licensed Turnitin account and returns the AI and similarity PDFs | Server + a person |
| **Slide Narrator** | Matches your voice recordings to slides and embeds them in the deck | **Your browser** |
| Pricing, Redeem, Support, WhatsApp | Plans, promo codes, FAQ, live chat | — |

Prices are in Kuwaiti dinar and paid through MyFatoorah (KNET, Visa, Mastercard,
Apple Pay). Nothing renews on its own.

## Privacy

Not one rule for the whole site — it depends on the tool:

- **Slide Narrator** really is browser-only. Recordings, slides and the generated file
  never leave the tab; the only network calls fetch the libraries and the Whisper model
  from public CDNs.
- **Humanizer, Word, PowerPoint** send your text or file to the API, which processes it
  and returns the result. Pasted text is held in memory and discarded. Uploaded files
  are kept only long enough to build your download, then dropped 15 minutes after it's
  ready.
- **Turnitin Scan** stores your document, because a human has to submit it and send the
  reports back. Those files are deleted seven days after the order is completed.

## Architecture

Static HTML/CSS/JS with **no build step and no bundler** — Netlify serves the folder as
it is. Each page loads its own `css/*.css` and `js/*.js`; the sidebar is built once in
`js/shell.js`; `js/guard.js` decides which pages a signed-out visitor may read.

The backend is a separate repository. `js/config.js` points at it
(`window.HUMANIZER_API`) and carries the **public** branch key that tags requests as
coming from this site. That key grants nothing on its own — every entitlement is
decided server-side from the account.

## Slide Narrator, in detail

1. **Read the deck** — [JSZip](https://stuk.github.io/jszip/) opens the `.pptx` (a zip of
   XML), reads the slides in true display order, and pulls each slide's text.
2. **Read the script** — a `.docx`/`.txt` with `Slide N` headings is parsed into
   per-slide scripts.
3. **Normalize the audio** — [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) converts any
   recording (mp3, m4a, wav, ogg/opus, webm…) to PowerPoint-friendly MP3, and extracts
   16 kHz mono PCM for transcription.
4. **Figure out the placement** — every recording is transcribed with
   [Whisper](https://huggingface.co/onnx-community/whisper-base.en) via
   [Transformers.js](https://github.com/huggingface/transformers.js) and matched to the
   best slide by comparing what it says to each slide's script (cosine similarity). File
   names are ignored; upload order is only a fallback.
5. **Review & fix** — every proposed match is shown, and any clip can be reassigned.
6. **Embed** — the audio is written into each slide as an OOXML `<p:pic>` media shape
   with auto-play timing.

> Auto-listen runs best in a WebGPU browser (Chrome/Edge). Without it, name recordings
> `Slide N.ext` for exact matching, or assign clips yourself.

## Run locally

```bash
npm run dev      # serves the folder at http://localhost:8123
```

Any static server works — there is no build step. Use **8123** or **8124**: those two
origins are the ones the API's CORS list and the Google OAuth client accept.

## Deploy

Netlify, continuous from `origin/main`. `netlify.toml` sets `publish = "."` with no build
command, and puts HTML, CSS and JS on `must-revalidate` — the filenames carry no version
hash, so a long cache would serve fresh markup against a stale stylesheet.

## Tech

| Concern | Library |
|---|---|
| Edit the `.pptx` (zip + OOXML) | JSZip |
| Audio conversion | ffmpeg.wasm (single-threaded core, self-hosted worker — no COOP/COEP needed) |
| Speech-to-text | Whisper `base.en` via Transformers.js (WebGPU → WASM fallback) |
| Matching | cosine similarity over tokenized script/transcript text |

## License

MIT
