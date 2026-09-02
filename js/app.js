// app.js — UI orchestration for SlideVoice.
import { parsePptx, embedNarration } from './pptx.js';
import { parseScript } from './scriptdoc.js';
import { processAudio, loadFfmpeg } from './audio.js';
import { loadModel, transcribe, device } from './transcribe.js';
import { proposeAssignments, slideReference, unnarratedSlides } from './match.js';

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
  // The zones are role="button" tabindex="0", so a keyboard user can reach them — and
  // until now nothing happened when they pressed Enter or Space.
  zone.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!blocked()) input.click();
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

// Accept ANY file the user drops or picks — no extension or MIME filtering here.
// Whatever it is (audio, a video with narration, an odd codec, or a file with no
// extension), ffmpeg tries to pull an audio track out of it and convert it to
// MP3 at process time. Files that genuinely contain no readable audio are
// skipped there with a note, so nothing is silently excluded up front.
wireDrop('#drop-audio', '#file-audio', (files) => {
  let skippedCap = 0;
  for (const f of files) {
    if (state.audioFiles.length >= MAX_AUDIO) { skippedCap++; continue; }
    state.audioFiles.push({ id: ++uid, file: f, name: f.name });
  }
  renderLists();
  const note = $('#audio-note');
  const msgs = [];
  if (skippedCap) msgs.push(`Limit is ${MAX_AUDIO} — ${skippedCap} not added.`);
  if (state.audioFiles.length) msgs.push(`${state.audioFiles.length} / ${MAX_AUDIO} added`);
  note.textContent = msgs.join(' ');
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

    state.processed.clear();
    const n = state.audioFiles.length;
    let modelLoaded = false, smartFailed = false;
    const failedFiles = [];
    for (let i = 0; i < n; i++) {
      const a = state.audioFiles[i];
      setStage(`Converting audio ${i + 1}/${n}: ${a.name}`);
      setBar(12 + (i / n) * 55);
      // Convert whatever this file is into MP3 first. ffmpeg reads almost any
      // container/codec (and strips video via -vn in processAudio). If it can't
      // find any audio track, we skip just this one file and keep going.
      let mp3, durationSec, pcm;
      try {
        ({ mp3, durationSec, pcm } = await processAudio(a.file));
      } catch (e) {
        failedFiles.push(a.name);
        logLine(`Skipped "${a.name}" — no audio could be read from it.`);
        continue;
      }
      // Always listen to every recording and match it against the script.
      // If the speech model can't load (e.g. a browser without WebGPU/WASM ML
      // support) we degrade gracefully to order matching + manual review.
      let transcript = '';
      if (!smartFailed) {
        if (!modelLoaded) {
          setStage('Loading speech model (first time downloads ~50 MB)…');
          try {
            await loadModel((p) => { if (p && p.progress) setStage(`Loading speech model… ${Math.round(p.progress)}%`); });
            modelLoaded = true;
            logLine(`Speech model ready (${device()}).`);
          } catch (e) {
            smartFailed = true;
            logLine('Auto-listen is not available in this browser — falling back to order. Assign clips manually in the table below, or use Chrome/Edge for auto-matching.');
          }
        }
        if (modelLoaded) {
          try {
            setStage(`Listening to ${a.name} (${i + 1}/${n})…`);
            transcript = await transcribe(pcm);
            logLine(`"${a.name}" → ${transcript.slice(0, 70)}${transcript.length > 70 ? '…' : ''}`);
          } catch (e) {
            logLine(`Could not transcribe "${a.name}" — assign it manually below.`);
          }
        }
      }
      state.processed.set(a.id, { mp3, durationSec, pcm, transcript });
    }

    // Drop any files that had no readable audio so they don't linger in the
    // review table or the final merge.
    if (failedFiles.length) {
      state.audioFiles = state.audioFiles.filter(a => state.processed.has(a.id));
      logLine(`${failedFiles.length} file(s) could not be converted and were skipped.`);
    }
    if (!state.audioFiles.length) throw new Error('None of the added files contained audio we could read.');

    setStage('Matching recordings to slides…'); setBar(72);
    const audios = state.audioFiles.map(a => ({
      id: a.id, name: a.name, transcript: state.processed.get(a.id).transcript,
    }));
    // File names are read again. They used to be ignored outright (useFilenames:false),
    // so a clip a user had carefully named "Slide 3.m4a" was placed by content alone --
    // and when that clip opened with "um, so, yeah", content had nothing to go on and
    // put it on whichever slide came first. The matcher now weighs the name against what
    // the recording says and flags the row when the two disagree, so reading the name
    // costs nothing on the occasions it is wrong.
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
// Rows that need a human eye come first. Sorted by upload order, the one uncertain clip
// sits in the middle of nine confident ones, which is the same as not showing it -- the
// whole point of this table is the row that is wrong.
const ATTENTION = { unplaced: 0, conflict: 1, unsure: 2, order: 3 };
function needsAttention(a) { return a.method in ATTENTION; }
function reviewOrder(a, b) {
  const ra = needsAttention(a) ? ATTENTION[a.method] : 9;
  const rb = needsAttention(b) ? ATTENTION[b.method] : 9;
  if (ra !== rb) return ra - rb;
  if (ra === 9) return (a.slideNumber ?? 999) - (b.slideNumber ?? 999);
  return (a.confidence || 0) - (b.confidence || 0);
}

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
  for (const a of [...state.assignments].sort(reviewOrder)) {
    const proc = state.processed.get(a.id);
    const url = URL.createObjectURL(state.audioFiles.find(x => x.id === a.id).file);
    const tr = document.createElement('tr');
    if (needsAttention(a)) tr.className = 'row-check';
    // What the slide it landed on actually says. Without it the reviewer is asked to
    // confirm a match while being shown only one of the two things being matched.
    const slide = state.slides.find(s => s.number === a.slideNumber);
    const against = slide ? slideReference(slide, state.scriptMap) : '';
    tr.innerHTML = `
      <td class="file"><div class="fname">${escapeHtml(a.name)}</div>
        <audio controls preload="none" src="${url}"></audio></td>
      <td class="trans">${escapeHtml((proc.transcript || '').slice(0, 140))
        || '<span class="muted">nothing was heard in this clip</span>'}</td>
      <td><span class="badge ${a.method}">${methodLabel(a.method, a.confidence)}</span>
        ${a.note ? `<div class="why">${escapeHtml(a.note)}</div>` : ''}</td>
      <td><select data-id="${a.id}" class="slide-pick">${slideOpts(a.slideNumber)}</select>
        ${against ? `<div class="against">slide says: ${escapeHtml(against.slice(0, 90))}${against.length > 90 ? '…' : ''}</div>` : ''}</td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('.slide-pick').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = +sel.dataset.id;
      const v = sel.value ? +sel.value : null;
      const asg = state.assignments.find(a => a.id === id);
      asg.slideNumber = v; asg.method = 'manual'; asg.confidence = 1; asg.note = '';
      // keep one-audio-per-slide: whatever was on this slide has to come off it. Say so
      // on that row -- it used to be emptied silently, so a clip could drop out of the
      // deck because of a change the user made elsewhere in the table.
      if (v != null) for (const o of state.assignments) {
        if (o.id !== id && o.slideNumber === v) {
          o.slideNumber = null; o.method = 'unplaced';
          o.note = `moved off slide ${v} when you put "${asg.name}" there`;
        }
      }
      renderReview();
    });
  });
  const placed = state.assignments.filter(a => a.slideNumber != null).length;
  const check = state.assignments.filter(needsAttention).length;
  $('#review-summary').textContent =
    `${placed} of ${state.assignments.length} placed` +
    (check ? ` — ${check} need${check === 1 ? 's' : ''} a look` : ' — all confident');
  $('#review-summary').classList.toggle('warn', check > 0);

  // Slides that will play silently. Nothing said this before: you found out by opening
  // the finished deck and pressing F5.
  const silent = unnarratedSlides(state.assignments, state.slides);
  const el = $('#review-gaps');
  if (el) {
    if (silent.length) {
      const list = silent.length > 12
        ? silent.slice(0, 12).join(', ') + ` and ${silent.length - 12} more`
        : silent.join(', ');
      el.textContent = silent.length === state.slides.length
        ? 'No slide has a recording yet.'
        : `No recording for slide${silent.length > 1 ? 's' : ''} ${list} — ${silent.length > 1 ? 'they' : 'it'} will play silently.`;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
}

function methodLabel(m, c) {
  const pct = Math.round((c || 0) * 100);
  if (m === 'filename') return 'file name';
  if (m === 'content') return `heard it ${pct}%`;
  if (m === 'conflict') return 'name vs audio';
  if (m === 'unsure') return 'not sure';
  if (m === 'order') return 'order only';
  if (m === 'manual') return 'you set';
  return 'not placed';
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
