// match.js — decide which recording belongs on which slide.
// Signals, in priority order: (1) slide number in the file name,
// (2) content similarity between the transcript and each slide's script/text,
// (3) upload order as a last resort.

const STOP = new Set(('a an the and or but if then else of to in on at for with without by from as is are was ' +
  'were be been being this that these those it its their our your his her my we you they i he she them us ' +
  'will would can could should may might must shall do does did done have has had not no nor so than too very ' +
  'about into over under again further once here there all any both each few more most other some such only ' +
  'own same also which who whom whose what when where why how').split(/\s+/));

export function tokenize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

function vec(tokens) {
  const v = new Map();
  for (const t of tokens) v.set(t, (v.get(t) || 0) + 1);
  return v;
}

export function similarity(a, b) {
  const va = vec(tokenize(a)), vb = vec(tokenize(b));
  if (!va.size || !vb.size) return 0;
  let dot = 0;
  for (const [k, x] of va) if (vb.has(k)) dot += x * vb.get(k);
  let na = 0, nb = 0;
  for (const x of va.values()) na += x * x;
  for (const x of vb.values()) nb += x * x;
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Pull a slide number out of a filename: "Slide 7", "slide_07", "s7", "07 - ...".
export function slideNumberFromName(name) {
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  let m = base.match(/slide\s*[_\-#]?\s*0*(\d{1,3})/i);
  if (m) return +m[1];
  m = base.match(/\bs\s*0*(\d{1,3})\b/i);
  if (m) return +m[1];
  // a lone leading/standalone number (e.g. "07.mp3", "3 intro.m4a")
  m = base.match(/(?:^|[^0-9])0*(\d{1,3})(?:[^0-9]|$)/);
  if (m && base.replace(/[^0-9]/g, '').length <= 3) return +m[1];
  return null;
}

// reference text used to match a recording against a slide
export function slideReference(slide, scriptMap) {
  const fromScript = scriptMap && scriptMap.get(slide.number);
  if (fromScript) return fromScript;
  return [slide.text, slide.notes].filter(Boolean).join(' ');
}

// Build the initial assignment proposal.
// audios: [{ id, name, transcript? }]  slides: [{number,text,notes}]
// Returns [{ id, name, slideNumber|null, method, confidence }]
export function proposeAssignments(audios, slides, scriptMap) {
  const taken = new Set();
  const result = new Map(); // id -> assignment
  const candidates = (scriptMap && scriptMap.size)
    ? slides.filter(s => scriptMap.has(s.number))
    : slides.slice();
  const validNumbers = new Set(slides.map(s => s.number));

  // Pass 1 — filename slide numbers (strongest signal)
  for (const a of audios) {
    const n = slideNumberFromName(a.name);
    if (n != null && validNumbers.has(n) && !taken.has(n)) {
      taken.add(n);
      result.set(a.id, { id: a.id, name: a.name, slideNumber: n, method: 'filename', confidence: 0.99 });
    }
  }

  // Pass 2 — content similarity for the rest (needs transcripts)
  const remaining = audios.filter(a => !result.has(a.id));
  const free = () => candidates.filter(s => !taken.has(s.number));
  const scored = [];
  for (const a of remaining) {
    if (!a.transcript) continue;
    for (const s of candidates) {
      scored.push({ a, s, score: similarity(a.transcript, slideReference(s, scriptMap)) });
    }
  }
  scored.sort((x, y) => y.score - x.score);
  for (const { a, s, score } of scored) {
    if (result.has(a.id) || taken.has(s.number)) continue;
    taken.add(s.number);
    result.set(a.id, { id: a.id, name: a.name, slideNumber: s.number, method: 'content', confidence: score });
  }

  // Pass 3 — order fallback for anything still unplaced
  for (const a of audios) {
    if (result.has(a.id)) continue;
    const open = free();
    if (open.length) {
      const s = open[0];
      taken.add(s.number);
      result.set(a.id, { id: a.id, name: a.name, slideNumber: s.number, method: 'order', confidence: 0.1 });
    } else {
      result.set(a.id, { id: a.id, name: a.name, slideNumber: null, method: 'unplaced', confidence: 0 });
    }
  }

  return audios.map(a => result.get(a.id));
}
