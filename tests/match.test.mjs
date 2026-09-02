// Tests for the recording -> slide matcher.  Run: npm test
//
// Every case below is a failure this code actually produced. The two that gave the
// matcher its shape:
//
//   * a test clip ("testing, testing, one two three") was placed on a slide at
//     confidence 0.000 and badged "content 0%", indistinguishable from a real match --
//     and it consumed the slide, so a genuine recording could be pushed off it.
//   * files named "Slide 3.m4a" were ignored entirely, because app.js called the
//     matcher with useFilenames:false, and landed on whatever slide the greedy content
//     pass happened to reach first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  proposeAssignments, unnarratedSlides, nameHint, similarity, buildIdf, MIN_CONTENT,
} from '../js/match.js';

const slides = [
  { number: 1, text: 'Introduction to remote work', notes: '' },
  { number: 2, text: 'Remote work and productivity data', notes: '' },
  { number: 3, text: 'Remote work challenges for teams', notes: '' },
  { number: 4, text: 'Conclusion and future research', notes: '' },
];
const scriptMap = new Map([
  [1, 'Good morning. Today I will introduce our study of remote work in modern organisations.'],
  [2, 'This chart shows the productivity data we collected from two hundred and forty participants.'],
  [3, 'The main challenges were collaboration, communication and team culture.'],
  [4, 'To conclude, remote work helps when managers trust their teams. Future research should follow careers.'],
]);
const run = (audios, opts) => proposeAssignments(audios, slides, scriptMap, opts);
const by = (r, name) => r.find(x => x.name === name);

const CLEAN = [
  { id: 1, name: 'a.m4a', transcript: 'the main challenges were collaboration communication and team culture' },
  { id: 2, name: 'b.m4a', transcript: 'good morning today I will introduce our study of remote work in modern organisations' },
  { id: 3, name: 'c.m4a', transcript: 'this chart shows the productivity data we collected from two hundred and forty participants' },
  { id: 4, name: 'd.m4a', transcript: 'to conclude remote work helps when managers trust their teams future research should follow careers' },
];

test('places every recording on the slide it was read from', () => {
  const r = run(CLEAN);
  assert.equal(by(r, 'a.m4a').slideNumber, 3);
  assert.equal(by(r, 'b.m4a').slideNumber, 1);
  assert.equal(by(r, 'c.m4a').slideNumber, 2);
  assert.equal(by(r, 'd.m4a').slideNumber, 4);
  assert.ok(r.every(x => x.method === 'content'));
});

test('a clip that matches nothing is never called a match', () => {
  const junk = { id: 9, name: 'test.m4a', transcript: 'testing testing one two three is this thing on' };
  const r = run(CLEAN.slice(0, 3).concat([junk]));
  const t = by(r, 'test.m4a');
  assert.equal(t.method, 'unsure', 'must not be reported as a content match');
  assert.ok(t.confidence < MIN_CONTENT);
  assert.ok(t.note, 'the row has to say why it is doubtful');
});

test('an unidentifiable clip cannot take a slide a real recording matched', () => {
  // The junk clip is listed FIRST, so an order-dependent matcher gives it slide 3 and
  // pushes the recording that actually says those words onto something else.
  const junk = { id: 9, name: 'aaa-test.m4a', transcript: 'testing testing one two three' };
  const r = run([junk].concat(CLEAN));
  assert.equal(by(r, 'a.m4a').slideNumber, 3);
  assert.equal(by(r, 'b.m4a').slideNumber, 1);
  assert.equal(by(r, 'c.m4a').slideNumber, 2);
  assert.equal(by(r, 'd.m4a').slideNumber, 4);
  assert.equal(by(r, 'aaa-test.m4a').slideNumber, null);
});

test('"Slide N" in the file name is honoured', () => {
  const r = run([
    { id: 1, name: 'Slide 3.m4a', transcript: 'um so yeah this part here' },
    { id: 2, name: 'Slide 1.m4a', transcript: 'right ok lets begin' },
  ]);
  assert.equal(by(r, 'Slide 3.m4a').slideNumber, 3);
  assert.equal(by(r, 'Slide 1.m4a').slideNumber, 1);
  assert.ok(r.every(x => x.method === 'filename'));
});

test('a file name that contradicts the audio is flagged, not silently obeyed', () => {
  const r = run([{
    id: 1, name: 'Slide 4.m4a',
    transcript: 'this chart shows the productivity data we collected from two hundred and forty participants',
  }]);
  const a = r[0];
  assert.equal(a.method, 'conflict');
  assert.equal(a.slideNumber, 2, 'what it says beats what it is called');
  assert.match(a.note, /slide 4/);
});

test('a bare number in a file name never raises a conflict', () => {
  // "x1.m4a" is a file name, not a claim about the deck. Warning about it would fill
  // the review table with noise, and a review screen that cries wolf is not read.
  const r = run([
    { id: 1, name: 'x1.m4a', transcript: 'the main challenges were collaboration communication and team culture' },
    { id: 2, name: 'x2.m4a', transcript: 'good morning today I will introduce our study' },
  ]);
  assert.ok(r.every(x => x.method !== 'conflict'));
  assert.equal(by(r, 'x1.m4a').slideNumber, 3);
});

test('a bare number still helps when the audio says nothing useful', () => {
  const r = run([{ id: 1, name: '3.m4a', transcript: 'mmm' }]);
  assert.equal(r[0].slideNumber, 3);
  assert.equal(r[0].method, 'filename');
});

test('no transcripts at all falls back to upload order, and says so', () => {
  const r = run([
    { id: 1, name: 'a.m4a', transcript: '' },
    { id: 2, name: 'b.m4a', transcript: '' },
  ]);
  assert.deepEqual(r.map(x => x.slideNumber), [1, 2]);
  assert.ok(r.every(x => x.method === 'order'));
});

test('more recordings than slides leaves the extra one unplaced', () => {
  const r = run(CLEAN.concat([
    { id: 5, name: 'extra.m4a', transcript: 'completely unrelated words about gardening and tomatoes' },
  ]));
  assert.equal(by(r, 'extra.m4a').slideNumber, null);
  assert.equal(by(r, 'extra.m4a').method, 'unplaced');
});

test('one recording per slide — no slide is used twice', () => {
  const r = run(CLEAN);
  const used = r.map(x => x.slideNumber).filter(n => n != null);
  assert.equal(new Set(used).size, used.length);
});

test('unnarratedSlides names the slides left silent', () => {
  const r = run(CLEAN.slice(0, 2));
  assert.deepEqual(unnarratedSlides(r, slides), [2, 4]);
});

test('works with no script at all, matching against the slides own text', () => {
  const r = proposeAssignments(
    [{ id: 1, name: 'a.m4a', transcript: 'conclusion and future research directions' }],
    slides, null);
  assert.equal(r[0].slideNumber, 4);
});

test('idf weighting favours the distinctive words over shared boilerplate', () => {
  // Every slide says "remote work"; only slide 2 says "participants".
  const idf = buildIdf([...scriptMap.values()]);
  const t = 'participants';
  const plain = similarity(t, scriptMap.get(2));
  const weighted = similarity(t, scriptMap.get(2), idf);
  assert.ok(weighted >= plain, 'a rare word should not be worth less once weighted');
  assert.equal(similarity('remote work', scriptMap.get(3), idf) < 0.5, true);
});

test('nameHint separates an explicit slide number from an incidental one', () => {
  assert.deepEqual(nameHint('Slide 7.mp3'), { number: 7, strong: true });
  assert.deepEqual(nameHint('slide_07.wav'), { number: 7, strong: true });
  assert.deepEqual(nameHint('07.mp3'), { number: 7, strong: false });
  assert.equal(nameHint('narration.mp3'), null);
});
