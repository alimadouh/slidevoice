// match.js — decide which recording belongs on which slide.
//
// Two rules shape everything here:
//
//   1. Never place a clip on evidence we don't have. A guess that looks like a match
//      is worse than an empty dropdown, because nobody checks a row that looks fine.
//   2. Confident placements go down first, so a clip we are unsure about can only
//      take a slide that nothing better wanted.
//
// Signals, strongest first: an explicit "Slide N" in the file name, what the recording
// actually says versus each slide's script, a bare number in the file name, and finally
// upload order — which is only reached when there is no transcript to reason from.

const STOP = new Set(('a an the and or but if then else of to in on at for with without by from as is are was ' +
  'were be been being this that these those it its their our your his her my we you they i he she them us ' +
  'will would can could should may might must shall do does did done have has had not no nor so than too very ' +
  'about into over under again further once here there all any both each few more most other some such only ' +
  'own same also which who whom whose what when where why how').split(/\s+/));

// A content score has to clear this before it counts as evidence of anything. Below it
// the recording and the slide simply have no words in common worth the name: the old
// code accepted a 0.000 match and let a test clip ("testing, testing, one two three")
// take a slide off a real recording.
export const MIN_CONTENT = 0.15;
// At or above this, a content match stands on its own — enough to overrule a file name.
export const SURE_CONTENT = 0.35;
// How far ahead of the runner-up a winner must be before we stop calling it a close call.
export const MIN_MARGIN = 0.06;

export function tokenize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

function vec(tokens) {
  const v = new Map();
  for (const t of tokens) v.set(t, (v.get(t) || 0) + 1);
  return v;
}

// Inverse document frequency over the slide references.
//
// Decks repeat themselves: every slide in a talk about remote work says "remote work".
// Plain term-frequency cosine lets that shared vocabulary carry the score, so slides
// look alike and the true match wins by a hair — or loses. Weighting each word by how
// FEW slides use it makes the distinctive words ("participants", "chargeback") decide,
// which is what a human matching these by ear would use too.
export function buildIdf(docs) {
  const n = docs.length || 1;
  const df = new Map();
  for (const d of docs) {
    for (const t of new Set(tokenize(d))) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map();
  for (const [t, c] of df) idf.set(t, Math.log(1 + n / c));
  return idf;
}

// Cosine similarity. `idf` is optional: without it this is the plain term-frequency
// cosine the first version used, which keeps the function usable on its own.
export function similarity(a, b, idf) {
  const va = vec(tokenize(a)), vb = vec(tokenize(b));
  if (!va.size || !vb.size) return 0;
  const w = (t) => (idf && idf.has(t) ? idf.get(t) : 1);
  let dot = 0;
  for (const [k, x] of va) if (vb.has(k)) dot += (x * w(k)) * (vb.get(k) * w(k));
  let na = 0, nb = 0;
  for (const [k, x] of va) na += (x * w(k)) ** 2;
  for (const [k, x] of vb) nb += (x * w(k)) ** 2;
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Pull a slide number out of a file name, and say how much to trust it.
//
// "Slide 7" is somebody telling us where the clip goes. A bare "07.mp3" might be that
// too — or it might be the phone's own counter, which numbers by the order you recorded
// in and has nothing to do with the deck. Both are worth reading; only the first is
// worth preferring over what the recording actually says.
export function nameHint(name) {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '');
  let m = base.match(/slide\s*[_\-#]?\s*0*(\d{1,3})/i);
  if (m) return { number: +m[1], strong: true };
  m = base.match(/\bs\s*0*(\d{1,3})\b/i);
  if (m) return { number: +m[1], strong: true };
  m = base.match(/(?:^|[^0-9])0*(\d{1,3})(?:[^0-9]|$)/);
  if (m && base.replace(/[^0-9]/g, '').length <= 3) return { number: +m[1], strong: false };
  return null;
}

// Kept for callers (and tests) that only want the number.
export function slideNumberFromName(name) {
  const h = nameHint(name);
  return h ? h.number : null;
}

// reference text used to match a recording against a slide
export function slideReference(slide, scriptMap) {
  const fromScript = scriptMap && scriptMap.get(slide.number);
  if (fromScript) return fromScript;
  return [slide.text, slide.notes].filter(Boolean).join(' ');
}

// Build the initial assignment proposal.
// audios: [{ id, name, transcript? }]  slides: [{number,text,notes}]
// Returns [{ id, name, slideNumber|null, method, confidence, note?, runnerUp? }]
//
// method is one of:
//   filename  — the name said which slide, and nothing contradicted it
//   content   — the recording's words matched that slide's script
//   conflict  — name and content disagree; we took content and flagged the row
//   unsure    — nothing scored above MIN_CONTENT; this is a suggestion, not a match
//   order     — no transcript to reason from, so upload order was all we had
//   unplaced  — every slide was taken
export function proposeAssignments(audios, slides, scriptMap, opts = {}) {
  const useFilenames = opts.useFilenames !== false;
  const candidates = (scriptMap && scriptMap.size)
    ? slides.filter(s => scriptMap.has(s.number))
    : slides.slice();
  const validNumbers = new Set(slides.map(s => s.number));

  const refs = new Map();
  for (const s of candidates) refs.set(s.number, slideReference(s, scriptMap));
  const idf = buildIdf([...refs.values()]);

  // score[audioId] -> Map(slideNumber -> similarity)
  const score = new Map();
  for (const a of audios) {
    const m = new Map();
    for (const s of candidates) {
      m.set(s.number, a.transcript ? similarity(a.transcript, refs.get(s.number), idf) : 0);
    }
    score.set(a.id, m);
  }
  const sc = (id, n) => (score.get(id) && score.get(id).get(n)) || 0;

  // Best and runner-up slide for one recording, ignoring who has claimed what.
  function ranked(id) {
    return [...(score.get(id) || new Map())].sort((x, y) => y[1] - x[1]);
  }

  const taken = new Map();     // slideNumber -> audioId
  const result = new Map();    // audioId -> assignment
  const place = (a, n, method, confidence, extra = {}) => {
    if (n != null) taken.set(n, a.id);
    result.set(a.id, {
      id: a.id, name: a.name, slideNumber: n, method, confidence, ...extra,
    });
  };

  const hints = new Map();
  if (useFilenames) {
    for (const a of audios) {
      const h = nameHint(a.name);
      if (h && validNumbers.has(h.number)) hints.set(a.id, h);
    }
  }

  // --- Pass 1: an explicit "Slide N" in the name, checked against the recording ------
  // The name is the strongest signal we have, but it is not beyond doubt — people
  // rename files, and a clip can end up with the wrong number on it. So we look at what
  // the recording says before trusting it: if some OTHER slide is a confident match and
  // the named slide is not, the row is flagged rather than silently placed either way.
  for (const a of audios) {
    const h = hints.get(a.id);
    if (!h || !h.strong || taken.has(h.number)) continue;
    const best = ranked(a.id)[0];
    const namedScore = sc(a.id, h.number);
    const contradicted = best && best[1] >= SURE_CONTENT && best[0] !== h.number
                         && namedScore < MIN_CONTENT;
    if (contradicted) continue;                    // settled by content in pass 2, flagged there
    place(a, h.number, 'filename', Math.max(namedScore, 0.9),
          { note: namedScore >= MIN_CONTENT ? 'name and audio agree' : 'from the file name' });
  }

  // --- Pass 2: what the recording actually says -------------------------------------
  // Global best-first over every remaining pair that clears MIN_CONTENT. Pairs below it
  // are not considered at all, so a slide is never consumed by a clip with no evidence.
  const pairs = [];
  for (const a of audios) {
    if (result.has(a.id)) continue;
    for (const [n, v] of score.get(a.id) || []) {
      if (v >= MIN_CONTENT) pairs.push({ a, n, v });
    }
  }
  pairs.sort((x, y) => y.v - x.v);
  for (const { a, n, v } of pairs) {
    if (result.has(a.id) || taken.has(n)) continue;
    const h = hints.get(a.id);
    // Only an explicit "Slide N" can be contradicted. A bare number in the name
    // ("x1.m4a", "recording 3.m4a") was never a claim about the deck, so treating a
    // disagreement as a conflict fills the review table with warnings about nothing --
    // and a review screen that cries wolf is one nobody reads.
    const conflict = h && h.strong && h.number !== n && v >= SURE_CONTENT;
    place(a, n, conflict ? 'conflict' : 'content', v, conflict
      ? { note: `the file name says slide ${h.number}, but it sounds like slide ${n}` }
      : {});
  }

  // --- Pass 3: swap refinement ------------------------------------------------------
  // Best-first is greedy, and greedy assignment can lock in a pair that costs more
  // elsewhere than it gains. Two clips at a time, swap them whenever the pair scores
  // better swapped than it does now, and repeat until nothing improves. Cheap at deck
  // sizes (<= 50 clips) and it can only raise the total.
  const swappable = () => [...result.values()]
    .filter(r => (r.method === 'content' || r.method === 'conflict') && r.slideNumber != null);
  for (let round = 0; round < 4; round++) {
    let improved = false;
    const rs = swappable();
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const x = rs[i], y = rs[j];
        const now = sc(x.id, x.slideNumber) + sc(y.id, y.slideNumber);
        const alt = sc(x.id, y.slideNumber) + sc(y.id, x.slideNumber);
        if (alt > now + 1e-9) {
          const xs = x.slideNumber, ys = y.slideNumber;
          x.slideNumber = ys; y.slideNumber = xs;
          x.confidence = sc(x.id, ys); y.confidence = sc(y.id, xs);
          taken.set(ys, x.id); taken.set(xs, y.id);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  // --- Pass 4: a bare number in the name, for clips content could not place ---------
  for (const a of audios) {
    if (result.has(a.id)) continue;
    const h = hints.get(a.id);
    if (h && !h.strong && !taken.has(h.number)) {
      place(a, h.number, 'filename', 0.5, { note: 'from the number in the file name' });
    }
  }

  // --- Pass 5: everything left, onto whatever nobody wanted -------------------------
  // Deliberately last. These are suggestions, not matches, and running them after the
  // confident placements is what stops a clip we cannot identify from taking a slide
  // that a real recording had earned.
  const freeSlides = () => candidates.filter(s => !taken.has(s.number)).map(s => s.number);
  for (const a of audios) {
    if (result.has(a.id)) continue;
    const open = freeSlides();
    if (!open.length) {
      place(a, null, 'unplaced', 0, { note: 'every slide already has a recording' });
      continue;
    }
    if (!a.transcript) {
      // Nothing was heard (the speech model did not load, or the clip is silent), so
      // upload order is genuinely all we have. Say so rather than dressing it up.
      place(a, open[0], 'order', 0.1, { note: 'no transcript — placed in upload order' });
      continue;
    }
    const best = ranked(a.id).filter(([n]) => !taken.has(n))[0];
    place(a, open[0], 'unsure', best ? best[1] : 0,
          { note: 'nothing in this recording matched a slide — please check' });
  }

  // Close calls are worth surfacing even when we did place them confidently.
  for (const r of result.values()) {
    if (r.method !== 'content' && r.method !== 'filename') continue;
    const rk = ranked(r.id);
    if (rk.length > 1 && rk[0][1] - rk[1][1] < MIN_MARGIN && rk[0][1] >= MIN_CONTENT) {
      r.runnerUp = rk[1][0];
      if (!r.note) r.note = `slide ${rk[1][0]} was almost as close a match`;
    }
  }

  return audios.map(a => result.get(a.id));
}

// Slides with nothing on them, for the review screen to warn about.
export function unnarratedSlides(assignments, slides) {
  const used = new Set(assignments.map(a => a.slideNumber).filter(n => n != null));
  return slides.map(s => s.number).filter(n => !used.has(n));
}
