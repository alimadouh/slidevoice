# B7oothKw

Add your **voice narration to every PowerPoint slide** — automatically.

Upload a `.pptx`, your script, and your voice recordings. B7oothKw
**listens to each recording, figures out which slide it belongs to**, and gives you
back a narrated `.pptx` with the audio embedded and set to play on each slide.

Everything runs **100% in your browser**. Your files are never uploaded to a server.

🔗 **Live:** https://slidevoice.netlify.app

---

## How it works

1. **Read the deck** — [JSZip](https://stuk.github.io/jszip/) opens the `.pptx`
   (a zip of XML), reads the slides in true display order, and pulls each slide's text.
2. **Read the script** — a `.docx`/`.txt` with `Slide N` headings is parsed into
   per-slide scripts. This tells B7oothKw which slides are narrated and gives each
   recording a slide to match against.
3. **Normalize the audio** — [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) converts any
   recording (mp3, m4a, wav, ogg/opus, webm…) to PowerPoint-friendly MP3, and extracts
   16 kHz mono PCM for transcription.
4. **Figure out the placement** — three signals, in order:
   - a **slide number in the file name** (`Slide 7.m4a` → slide 7),
   - **content similarity** between the recording's transcript and each slide's
     script/text, using [Whisper](https://huggingface.co/onnx-community/whisper-base.en)
     via [Transformers.js](https://github.com/huggingface/transformers.js),
   - **upload order** as a fallback.
5. **Review & fix** — you see every proposed match, can listen to each clip, and can
   reassign any slide before generating.
6. **Embed** — the audio is written into each slide as an OOXML `<p:pic>` media shape
   with auto-play timing, the relationships and content-types are wired up, and you
   download the finished deck.

> **Auto-listen (Whisper)** runs best in a WebGPU browser (Chrome/Edge). If it isn't
> available, B7oothKw still works — name recordings `Slide N.ext` for exact matching,
> or assign any clip yourself in the review table.

## Privacy

There is no backend. The site is static HTML/CSS/JS. Recordings, slides, and the
generated file all stay in your browser tab. The only network calls are to public CDNs
to load the libraries and (once, cached) the Whisper model.

## Run locally

```bash
npm run dev      # serves the folder at http://localhost:5000
```
(or any static server — there is no build step).

## Deploy

It's a static site, so any static host works. This repo is set up for **Netlify**:

```bash
# one-time
npm i -g netlify-cli
netlify deploy --prod          # publishes the current folder
```

For continuous deploys, connect the GitHub repo in the Netlify dashboard
(**Add new site → Import from GitHub**). `netlify.toml` already sets `publish = "."`
with no build command.

## Tech

| Concern | Library |
|---|---|
| Edit the `.pptx` (zip + OOXML) | JSZip |
| Audio conversion | ffmpeg.wasm (single-threaded core, self-hosted worker — no COOP/COEP needed) |
| Speech-to-text | Whisper `base.en` via Transformers.js (WebGPU → WASM fallback) |
| Matching | cosine similarity over tokenized script/transcript text |

## License

MIT
