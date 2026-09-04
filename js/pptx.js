// pptx.js - parse a .pptx, read slide order/text, and embed narration audio.
// Pure JS (no browser-only APIs) so it can be unit-tested under Node too.
// Self-hosted, like the ffmpeg runtime next to it: an esm.sh entry in the CSP allowlist
// buys nothing, since that host will serve any npm package anyone asks it for.
import JSZip from '../vendor/jszip/jszip.mjs';

const T_MEDIA = 'http://schemas.microsoft.com/office/2007/relationships/media';
const T_AUDIO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio';
const T_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

// A speaker icon (valid 128x128 PNG, base64) used as the on-slide poster.
const ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADyUlEQVR4nO2dW47bMBAEJWMvtLr/GbhH2iAfBhxHli1qSPawq4B8JECwo+niUA8iWRYAAABwZF0M+P3+/q39u+vPz9Q9murirgTtKkbqi+gZ+KxCpCtaKfQZZEhTaIbgM4ogXWDG0LPJIFnUTMGriyBVzMzBq4pwW0RwCl/peodbqNII12kwdAIQ/vg+DDGP4HWmQfcJQPha/ekqAOELftPo8UMIXndLaD4BCF+7f00FIHz9PjYTgPBz9LOJAITfhhZ9DReA8NsS3d9QAQi/D5F9DhOA8PsS1W+Zr4EwhhABWP1jiOj7ZQEIfyxX+39JAMLX4EoO3AOYUy0Aq1+L2jyqBCB8TWpyYQsw57QA9qu/lEWZs/mcEoDwy5KBMzmxBUwW/lk+FsB69ZeiVcv9V0BeX1F1TUspU9fx0QSwXP3l/Srryrb9/2cBU4B7gD2Ugm8MAmQKv2IKXBbAavwX4fAreZcfEyBb+MFT4FAAm9VfitxjXCRHOTIBSufwj34/AG8BSslZQ+A2cLMd/yPC33aC68SrPP0mgNoLnr8MrMdLAIXgt3FTwFsAhfAj6wu6D7hZ7P9q4W9jpsBervpfA9XCmwyfLSADpb/sCGB+M4gA5iBAZgKeBG7TPwHAYb5MgMkOeJwFAcxBAHMQwBwEMAcBzEEAcxDAHAQwBwHMQQBzEMAcBDAHAUay9+Gn80GRm+p/agxteM6XCWA+QRDAHAQwP+6OAOYnhb8smiKy2hTZnQDTPQmInMEfLeRerj5bgJoEV+sLeofgI4CKBEVrO/IS4C6BggiPDKznpQDT3QcoNL2MW/2v8vSbAI9sW84aAr8heAvQW4LnnyUg4KEA028DoyTofB9ylCMTQGg1jviE/FYAmymQSYITvMuPCZBJggYHSBAgmwTBfCSA1Tag+sKoYvV/khsT4B0qEjQS8tTKtv7nY0rRkyJgajMBPiVB6DWcEsDyXiChBGdyqgrUeisQ5+wiZQswp0oA+61AlJpcqicAEmhRmwdbgDmXBGAKaHAlh8sTAAnGcrX/IVsAEowhou/cA5gTJgBToC9R/Q6dAEjQh8g+h28BSNCW6P42uQdAgja06Guzm0AkyNHPpk8BSKDfx+aPgUig3b+uBzw4R6C3cLq+CGIa6PWp+5tAJNDqz9AzfmwJ4xfG0G8BTIPxfZA55es4DVaBU9YyXwMVmuF4vRJFOE2DVST4O1LFzCzCKhb8HcmiZpFhFQ39EfkCM4qwJgj+TppC1WVYE4X+SMqiFYRYkwb+zBQX0VKMdZKgAQAAln/5AyPLiH0r1EXbAAAAAElFTkSuQmCC';

function b64ToUint8(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function runsText(xml) {
  const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => decodeEntities(m[1]));
  return runs.join(' ').replace(/\s+/g, ' ').trim();
}

// Parse a pptx ArrayBuffer/Uint8Array. Returns { zip, slides } in display order.
export async function parsePptx(data) {
  const zip = await JSZip.loadAsync(data);
  // A .pptx is a zip with these two parts in it. A file that is merely NAMED .pptx -- a
  // renamed .ppt, a Keynote export, a PDF someone retyped the extension on -- opens as a
  // zip and then hands back null here, and the user was shown the raw
  // "Cannot read properties of null (reading 'async')". Say what is actually wrong.
  const relsFile = zip.file('ppt/_rels/presentation.xml.rels');
  const presFile = zip.file('ppt/presentation.xml');
  if (!relsFile || !presFile) {
    throw new Error("That doesn't look like a PowerPoint file. Open it in PowerPoint and " +
                    "use File > Save As to save a .pptx, then try again.");
  }
  const presRels = await relsFile.async('string');
  const presXml = await presFile.async('string');

  const ridToTarget = {};
  for (const m of presRels.matchAll(/<Relationship\b[^>]*?\/?>/g)) {
    const tag = m[0];
    const id = (tag.match(/Id="(rId\d+)"/) || [])[1];
    const tgt = (tag.match(/Target="([^"]+)"/) || [])[1];
    if (id && tgt && /slides\/slide\d+\.xml/.test(tgt)) {
      ridToTarget[id] = 'ppt/' + tgt.replace(/^\.\.\//, '').replace(/^\.\//, '').replace(/^\/?ppt\//, '');
    }
  }
  const order = [...presXml.matchAll(/<p:sldId\b[^>]*r:id="(rId\d+)"/g)].map(m => m[1]);

  const slides = [];
  let displayNo = 0;
  for (const rid of order) {
    const part = ridToTarget[rid];
    if (!part || !zip.file(part)) continue;
    displayNo++;
    const xml = await zip.file(part).async('string');
    let notes = '';
    const relPath = part.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
    const relFile = zip.file(relPath);
    if (relFile) {
      const rels = await relFile.async('string');
      const nm = rels.match(/Target="(\.\.\/notesSlides\/notesSlide\d+\.xml)"/);
      if (nm) {
        const npath = 'ppt/' + nm[1].replace('../', '');
        if (zip.file(npath)) notes = runsText(await zip.file(npath).async('string'));
      }
    }
    slides.push({ number: displayNo, part, relPath, text: runsText(xml), notes });
  }
  return { zip, slides };
}

function nextRid(relsXml) {
  const nums = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1]);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

function ensureRootNs(slideXml) {
  return slideXml.replace(/<p:sld\b([^>]*)>/, (full, attrs) => {
    let a = attrs;
    if (!/xmlns:r=/.test(a)) a += ` xmlns:r="${NS_R}"`;
    if (!/xmlns:a=/.test(a)) a += ` xmlns:a="${NS_A}"`;
    return `<p:sld${a}>`;
  });
}

function makePic(spid, mediaRid, audioRid, imageRid, name, geom) {
  const { x, y, cx, cy } = geom;
  return (
    '<p:pic>' +
    '<p:nvPicPr>' +
    `<p:cNvPr id="${spid}" name="${name}">` +
    '<a:hlinkClick r:id="" action="ppaction://media"/>' +
    '</p:cNvPr>' +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>' +
    '<p:nvPr>' +
    `<a:audioFile r:link="${audioRid}"/>` +
    '<p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}">' +
    `<p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="${mediaRid}"/>` +
    '</p:ext></p:extLst>' +
    '</p:nvPr>' +
    '</p:nvPicPr>' +
    `<p:blipFill><a:blip r:embed="${imageRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    '</p:pic>'
  );
}

function makeTiming(spid, durMs) {
  return (
    '<p:timing><p:tnLst><p:par>' +
    '<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
    '<p:seq concurrent="1" nextAc="seek">' +
    '<p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>' +
    '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>' +
    '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>' +
    '<p:par><p:cTn id="5" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect">' +
    '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>' +
    '<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr>' +
    `<p:cTn id="6" dur="${durMs}" fill="hold"/>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    '</p:cBhvr></p:cmd>' +
    '</p:childTnLst></p:cTn></p:par>' +
    '</p:childTnLst></p:cTn></p:par>' +
    '</p:childTnLst></p:cTn></p:par>' +
    '</p:childTnLst></p:cTn>' +
    '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>' +
    '</p:seq>' +
    '<p:audio><p:cMediaNode vol="80000">' +
    '<p:cTn id="7" fill="hold" display="0"><p:stCondLst><p:cond delay="0"/></p:stCondLst>' +
    '<p:endCondLst><p:cond evt="onStopAudio" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:endCondLst></p:cTn>' +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    '</p:cMediaNode></p:audio>' +
    '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'
  );
}

async function getSlideSize(zip) {
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const m = pres.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  return m ? { cx: +m[1], cy: +m[2] } : { cx: 9144000, cy: 6858000 };
}

// assignments: [{ slideNumber, mp3: Uint8Array, durationSec }]
export async function embedNarration(zip, slides, assignments, opts = {}) {
  const SLIDE = await getSlideSize(zip);
  const cx = Math.round(0.5 * 914400);
  const margin = Math.round(0.12 * 914400);
  const geom = { cx, cy: cx, x: SLIDE.cx - cx - margin, y: SLIDE.cy - cx - margin };

  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!/Extension="mp3"/i.test(ct))
    ct = ct.replace('</Types>', '<Default Extension="mp3" ContentType="audio/mpeg"/></Types>');
  if (!/Extension="png"/i.test(ct))
    ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  zip.file('[Content_Types].xml', ct);

  zip.file('ppt/media/narration_icon.png', b64ToUint8(ICON_B64), { binary: true });

  const byNumber = new Map(slides.map(s => [s.number, s]));
  const log = [];

  for (const a of assignments) {
    const slide = byNumber.get(a.slideNumber);
    if (!slide) { log.push(`! slide ${a.slideNumber} not found, skipped`); continue; }

    const mediaName = `narration_s${a.slideNumber}.mp3`;
    zip.file(`ppt/media/${mediaName}`, a.mp3, { binary: true });

    let rels = await zip.file(slide.relPath).async('string');
    const base = nextRid(rels);
    const mediaRid = `rId${base}`, audioRid = `rId${base + 1}`, imageRid = `rId${base + 2}`;
    const add =
      `<Relationship Id="${mediaRid}" Type="${T_MEDIA}" Target="../media/${mediaName}"/>` +
      `<Relationship Id="${audioRid}" Type="${T_AUDIO}" Target="../media/${mediaName}"/>` +
      `<Relationship Id="${imageRid}" Type="${T_IMAGE}" Target="../media/narration_icon.png"/>`;
    rels = rels.replace('</Relationships>', add + '</Relationships>');
    zip.file(slide.relPath, rels);

    let x = await zip.file(slide.part).async('string');
    x = ensureRootNs(x);
    const ids = [...x.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => +m[1]);
    const spid = (ids.length ? Math.max(...ids) : 10) + 1;
    const durMs = Math.round((a.durationSec || 1) * 1000);
    const pic = makePic(spid, mediaRid, audioRid, imageRid, `Narration ${a.slideNumber}`, geom);
    x = x.replace('</p:spTree>', pic + '</p:spTree>');

    const autoplay = opts.autoplay !== false;
    const hasTiming = /<p:timing>/.test(x);
    const willAutoplay = autoplay && !hasTiming;
    if (willAutoplay) x = x.replace('</p:sld>', makeTiming(spid, durMs) + '</p:sld>');
    else if (hasTiming) log.push(`~ slide ${a.slideNumber}: existing animations - audio added as click-to-play`);
    zip.file(slide.part, x);
    log.push(`slide ${a.slideNumber}: narration embedded${willAutoplay ? ' (auto-play)' : ' (click to play)'}`);
  }

  const isNode = typeof window === 'undefined';
  const out = await zip.generateAsync({
    type: isNode ? 'uint8array' : 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
  });
  return { out, log };
}
