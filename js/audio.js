// audio.js — normalize any uploaded recording to PowerPoint-friendly MP3,
// and extract 16 kHz mono PCM for the speech recognizer. Uses ffmpeg.wasm
// (single-threaded core, so no cross-origin-isolation headers are required).
import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL, fetchFile } from 'https://esm.sh/@ffmpeg/util@0.12.1';

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
let ffmpeg = null;
let loadingPromise = null;

export function isLoaded() { return !!(ffmpeg && ffmpeg.loaded); }

export async function loadFfmpeg(onProgress) {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const inst = new FFmpeg();
    if (onProgress) inst.on('log', ({ message }) => onProgress(message));
    await inst.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpeg = inst;
    return inst;
  })();
  return loadingPromise;
}

function extOf(name) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'dat';
}

// Returns { mp3: Uint8Array, durationSec, pcm: Float32Array(16k mono) }
export async function processAudio(file) {
  const f = await loadFfmpeg();
  const inName = 'in_' + Math.abs(hash(file.name + file.size)) + '.' + extOf(file.name);
  await f.writeFile(inName, await fetchFile(file));

  // 16 kHz mono float PCM (for Whisper + exact duration)
  const pcmName = inName + '.pcm';
  await f.exec(['-i', inName, '-ac', '1', '-ar', '16000', '-f', 'f32le', pcmName]);
  const pcmBytes = await f.readFile(pcmName);
  const pcm = new Float32Array(pcmBytes.buffer, pcmBytes.byteOffset, Math.floor(pcmBytes.byteLength / 4));
  const durationSec = pcm.length / 16000;

  // MP3 for embedding (mono, 96 kbps is plenty for speech)
  const mp3Name = inName + '.mp3';
  await f.exec(['-i', inName, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', mp3Name]);
  const mp3 = await f.readFile(mp3Name);

  // cleanup virtual FS
  for (const n of [inName, pcmName, mp3Name]) { try { await f.deleteFile(n); } catch (_) {} }

  // copy out of ffmpeg's heap so it isn't detached by later runs
  return { mp3: new Uint8Array(mp3), durationSec, pcm: new Float32Array(pcm) };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
