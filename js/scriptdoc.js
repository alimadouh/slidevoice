// scriptdoc.js — turn an uploaded script into a map of slideNumber -> text.
// Supports .docx (Word), .txt and .md. Recognizes "Slide N" headings; if none
// are found, falls back to splitting on blank lines in upload order.
import JSZip from 'https://esm.sh/jszip@3.10.1';

function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

async function docxToParagraphs(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const xml = await zip.file('word/document.xml').async('string');
  // each <w:p> is a paragraph; text lives in <w:t>
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(p => {
    const runs = [...p[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => decodeEntities(m[1]));
    return runs.join('').trim();
  });
}

function paragraphsToMap(paragraphs) {
  const map = new Map();
  const lines = paragraphs.map(p => p.trim());
  let current = null;
  let buf = [];
  const flush = () => { if (current != null && buf.length) map.set(current, (map.get(current) ? map.get(current) + ' ' : '') + buf.join(' ').trim()); buf = []; };

  const headRe = /^\s*slide\s*[_\-#:]?\s*0*(\d{1,3})\b[^0-9]*/i;
  let sawHeading = false;
  for (const line of lines) {
    if (!line) continue;
    const m = line.match(headRe);
    if (m) {
      sawHeading = true;
      flush();
      current = +m[1];
      const rest = line.replace(headRe, '').replace(/^[\s\-–—:.]+/, '').trim();
      // drop a short title remainder like "Title Slide"; keep longer narration text
      if (rest && rest.split(/\s+/).length > 6) buf.push(rest);
    } else if (current != null) {
      buf.push(line);
    }
  }
  flush();

  if (!sawHeading) {
    // no "Slide N" markers: treat each non-empty paragraph as sequential slides
    const seq = lines.filter(Boolean);
    seq.forEach((t, i) => map.set(i + 1, t));
  }
  return map;
}

export async function parseScript(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    return paragraphsToMap(await docxToParagraphs(await file.arrayBuffer()));
  }
  const text = await file.text();
  return paragraphsToMap(text.split(/\r?\n/));
}
