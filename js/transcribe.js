// transcribe.js — in-browser speech-to-text with Whisper (transformers.js).
// Runs on WebGPU when available, otherwise WASM. The model is downloaded once
// and cached by the browser. Transcripts are only used to match recordings to
// slides, so a small English model is accurate enough and fast.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowLocalModels = false;
// Force single-threaded WASM so it runs without cross-origin isolation
// (SharedArrayBuffer). WebGPU is still tried first when available.
env.backends.onnx.wasm.numThreads = 1;

const MODEL = 'onnx-community/whisper-base.en';
let asr = null;
let loadingPromise = null;
let usingDevice = 'wasm';

export function device() { return usingDevice; }

export async function loadModel(onProgress) {
  if (asr) return asr;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const opts = { progress_callback: onProgress };
    if (navigator.gpu) {
      try {
        asr = await pipeline('automatic-speech-recognition', MODEL, { ...opts, device: 'webgpu' });
        usingDevice = 'webgpu';
        return asr;
      } catch (e) {
        console.warn('WebGPU unavailable, falling back to WASM:', e);
        asr = null;
      }
    }
    // Explicit device:'wasm' — without it, transformers.js re-selects WebGPU
    // whenever navigator.gpu exists (even if it has no working adapter).
    asr = await pipeline('automatic-speech-recognition', MODEL, { ...opts, device: 'wasm' });
    usingDevice = 'wasm';
    return asr;
  })();
  return loadingPromise;
}

// pcm: Float32Array at 16 kHz mono. Returns a plain transcript string.
export async function transcribe(pcm) {
  const model = await loadModel();
  const out = await model(pcm, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });
  return (out && out.text ? out.text : '').trim();
}
