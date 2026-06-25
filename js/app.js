// app.js — UI orchestration for SlideVoice.
import { parsePptx, embedNarration } from './pptx.js';
import { parseScript } from './scriptdoc.js';
import { processAudio, loadFfmpeg } from './audio.js';
import { loadModel, transcribe, device } from './transcribe.js';
import { proposeAssignments, slideNumberFromName } from './match.js';

const $ = (s) => document.querySelector(s);
let uid = 0;

const state = {
  pptxFile: null,
  scriptFile: null,
  audioFiles: [],      // [{ id, file, name }]
  slides: [],
  scriptMap: null,
  processed: new Map(), // id -> { mp3, durationSec, pcm, transcript }
  assignments: [],
};

// ---------- file pickers / drag & drop ----------
function wireDrop(zoneSel, inputSel, onFiles, canAdd) {
  const zone = $(zoneSel), input = $(inputSel);
  const blocked = () => (canAdd && !canAdd());   // true when a file is already present
  zone.addEventListener('click', (e) => {
    if (e.target.closest('.chip-x')) return;      // the remove button handles its own click
    if (blocked()) return;                         // already filled — must remove first
    input.click();
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); if (!blocked()) zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag');
    if (blocked()) return;
    onFiles([...e.dataTransfer.files]);
  });
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
}

function makeChip(name, onRemove) {
  const span = document.createElement('span');
  span.className = 'chip';
  const label = document.createElement('span');
  label.className = 'chip-name';
  label.textContent = name;
  span.appendChild(label);
  if (onRemove) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chip-x';
    x.setAttribute('aria-label', 'Remove ' + name);
    x.textContent = '×';
    x.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
    span.appendChild(x);
  }
  return span;
}

function renderLists() {
  const lp = $('#list-pptx'); lp.innerHTML = '';
  if (state.pptxFile) lp.appendChild(makeChip(state.pptxFile.name, () => {
    state.pptxFile = null; $('#file-pptx').value = ''; renderLists();
  }));
  const ls = $('#list-script'); ls.innerHTML = '';
  if (state.scriptFile) ls.appendChild(makeChip(state.scriptFile.name, () => {
    state.scriptFile = null; $('#file-script').value = ''; renderLists();
  }));
  const la = $('#list-audio'); la.innerHTML = '';
  state.audioFiles.forEach(a => la.appendChild(makeChip(a.name)));
  // lock the single-file cards once filled
  $('#drop-pptx').classList.toggle('filled', !!state.pptxFile);
  $('#drop-script').classList.toggle('filled', !!state.scriptFile);
  $('#btn-process').disabled = !(state.pptxFile && state.scriptFile && state.audioFiles.length);
}

wireDrop('#drop-pptx', '#file-pptx', (files) => {
  if (state.pptxFile) return;                 // only one — remove it first to change
  const f = files.find(f => /\.pptx$/i.test(f.name));
  if (f) state.pptxFile = f;
  renderLists();
}, () => !state.pptxFile);
wireDrop('#drop-script', '#file-script', (files) => {
  if (state.scriptFile) return;
  const f = files.find(f => /\.(docx|txt|md)$/i.test(f.name));
  if (f) state.scriptFile = f;
  renderLists();
}, () => !state.scriptFile);
const MAX_AUDIO = 50;
wireDrop('#drop-audio', '#file-audio', (files) => {
  const valid = files.filter(f => /\.(mp3|m4a|wav|ogg|oga|opus|aac|webm|mp4|flac|wma|3gp|m4b)$/i.test(f.name));
  let skipped = 0;
  for (const f of valid) {
    if (state.audioFiles.length >= MAX_AUDIO) { skipped++; continue; }
    state.audioFiles.push({ id: ++uid, file: f, name: f.name });
  }
  renderLists();
  const note = $('#audio-note');
  if (skipped) note.textContent = `Limit is ${MAX_AUDIO} recordings — ${skipped} not added.`;
  else if (state.audioFiles.length) note.textContent = `${state.audioFiles.length} / ${MAX_AUDIO} added`;
  else note.textContent = '';
});

// ---------- progress helpers ----------
function setStage(text) { $('#stage').textContent = text; }
function setBar(pct) { $('#bar-fill').style.width = Math.max(0, Math.min(100, pct)) + '%'; }
function logLine(text) {
  const el = $('#log');
  el.textContent += text + '\n';
  el.scrollTop = el.scrollHeight;
}

// ---------- main: match ----------
$('#btn-process').addEventListener('click', async () => {
  try {
    $('#btn-process').disabled = true;
    show('#progress'); hide('#review'); hide('#result');
    $('#log').textContent = '';
    const smart = true; // auto-match by listening is always on

    setStage('Reading PowerPoint…'); setBar(4);
    const buf = await state.pptxFile.arrayBuffer();
    const parsed = await parsePptx(buf);
    state.slides = parsed.slides;
    logLine(`Found ${state.slides.length} slides.`);

    state.scriptMap = null;
    if (state.scriptFile) {
      setStage('Reading script…'); setBar(8);
      state.scriptMap = await parseScript(state.scriptFile);
      logLine(`Script parsed: ${state.scriptMap.size} slide scripts.`);
    }

    setStage('Loading audio engine…'); setBar(10);
    await loadFfmpeg();

    // Which files need transcription? (those whose name has no slide number)
    const needsTranscript = new Map();
    for (const a of state.audioFiles)
      needsTranscript.set(a.id, smart && slideNumberFromName(a.name) == null);

    state.processed.clear();
    const n = state.audioFiles.length;
    let modelLoaded = false, smartFailed = false;
    for (let i = 0; i < n; i++) {
      const a = state.audioFiles[i];
      setStage(`Converting audio ${i + 1}/${n}: ${a.name}`);
      setBar(12 + (i / n) * 55);
      const { mp3, durationSec, pcm } = await processAudio(a.file);
      let transcript = '';
      if (needsTranscript.get(a.id) && !smartFailed) {
        // Transcription is a best-effort enhancement. If the speech model
        // can't load (e.g. a browser without WebGPU/WASM ML support), we
        // degrade gracefully to file-name / order matching + manual review
        // instead of failing the whole job.
        if (!modelLoaded) {
          setStage('Loading speech model (first time downloads ~50 MB)…');
          try {
            await loadModel((p) => { if (p && p.progress) setStage(`Loading speech model… ${Math.round(p.progress)}%`); });
            modelLoaded = true;
            logLine(`Speech model ready (${device()}).`);
          } catch (e) {
            smartFailed = true;
            logLine('Auto-listen is not available in this browser — falling back to file-name/order matching. You can fix any clip manually in the table below. (Tip: name files like "Slide 3.mp3", or use Chrome/Edge for auto-matching.)');
          }
        }
        if (modelLoaded) {
          try {
            setStage(`Listening to ${a.name}…`);
            transcript = await transcribe(pcm);
            logLine(`"${a.name}" → ${transcript.slice(0, 70)}${transcript.length > 70 ? '…' : ''}`);
          } catch (e) {
            logLine(`Could not transcribe "${a.name}" — assign it manually below.`);
          }
        }
      } else if (!needsTranscript.get(a.id)) {
        logLine(`"${a.name}" → matched by file name`);
      }
      state.processed.set(a.id, { mp3, durationSec, pcm, transcript });
    }

    setStage('Matching recordings to slides…'); setBar(72);
    const audios = state.audioFiles.map(a => ({
      id: a.id, name: a.name, transcript: state.processed.get(a.id).transcript,
    }));
    state.assignments = proposeAssignments(audios, state.slides, state.scriptMap);

    setBar(100); setStage('Review the matches below.');
    renderReview();
    show('#review');
  } catch (err) {
    console.error(err);
    logLine('ERROR: ' + (err && err.message ? err.message : err));
    setStage('Something went wrong — see the log.');
  } finally {
    $('#btn-process').disabled = false;
  }
});

// ---------- review table ----------
function renderReview() {
  const tbody = $('#review-rows');
  tbody.innerHTML = '';
  const slideOpts = (sel) => {
    let html = `<option value="">— none —</option>`;
    for (const s of state.slides) {
      const label = s.text ? s.text.slice(0, 40) : '(no text)';
      html += `<option value="${s.number}" ${s.number === sel ? 'selected' : ''}>Slide ${s.number} · ${escapeHtml(label)}</option>`;
    }
    return html;
  };
  for (const a of state.assignments) {
    const proc = state.processed.get(a.id);
    const url = URL.createObjectURL(state.audioFiles.find(x => x.id === a.id).file);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="file"><div class="fname">${escapeHtml(a.name)}</div>
        <audio controls preload="none" src="${url}"></audio></td>
      <td class="trans">${escapeHtml((proc.transcript || '').slice(0, 140)) || '<span class="muted">matched by name</span>'}</td>
      <td><span class="badge ${a.method}">${methodLabel(a.method, a.confidence)}</span></td>
      <td><select data-id="${a.id}" class="slide-pick">${slideOpts(a.slideNumber)}</select></td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('.slide-pick').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = +sel.dataset.id;
      const v = sel.value ? +sel.value : null;
      const asg = state.assignments.find(a => a.id === id);
      asg.slideNumber = v; asg.method = 'manual';
      // keep one-audio-per-slide: clear others pointing at the same slide
      if (v != null) for (const o of state.assignments)
        if (o.id !== id && o.slideNumber === v) { o.slideNumber = null; }
      renderReview();
    });
  });
  const placed = state.assignments.filter(a => a.slideNumber != null).length;
  $('#review-summary').textContent = `${placed} of ${state.assignments.length} recordings placed.`;
}

function methodLabel(m, c) {
  if (m === 'filename') return 'file name';
  if (m === 'content') return `content ${Math.round((c || 0) * 100)}%`;
  if (m === 'order') return 'order (check)';
  if (m === 'manual') return 'you set';
  return 'unplaced';
}

// ---------- generate ----------
$('#btn-generate').addEventListener('click', async () => {
  try {
    $('#btn-generate').disabled = true;
    show('#progress'); setStage('Building narrated PowerPoint…'); setBar(20);
    // fresh parse so repeated generations start clean
    const parsed = await parsePptx(await state.pptxFile.arrayBuffer());
    const assignments = state.assignments
      .filter(a => a.slideNumber != null)
      .map(a => ({ slideNumber: a.slideNumber, mp3: state.processed.get(a.id).mp3, durationSec: state.processed.get(a.id).durationSec }));
    setBar(55);
    const { out, log } = await embedNarration(parsed.zip, parsed.slides, assignments, { autoplay: true });
    log.forEach(logLine);
    setBar(100); setStage('Done.');
    const base = state.pptxFile.name.replace(/\.pptx$/i, '');
    const url = URL.createObjectURL(out);
    $('#download').href = url;
    $('#download').download = `${base} - with narration.pptx`;
    $('#result-text').textContent = `${assignments.length} recordings embedded into "${base}".`;
    show('#result');
    $('#download').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    console.error(err);
    logLine('ERROR: ' + (err && err.message ? err.message : err));
  } finally {
    $('#btn-generate').disabled = false;
  }
});

$('#btn-restart').addEventListener('click', () => location.reload());

// ---------- tiny utils ----------
function show(sel) { $(sel).classList.remove('hidden'); }
function hide(sel) { $(sel).classList.add('hidden'); }
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

renderLists();
