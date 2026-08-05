import assert from 'node:assert/strict';
import test from 'node:test';

import { CURRENT_RELEASE, RELEASES, releasesSince, updateNotice } from '../public/src/data/releases.js';
import { VERSION } from '../public/src/core/version.js';
import { SEEN_KEY, loadSeen, saveSeen } from '../public/src/panels/whatsnew.js';

/** A localStorage stand-in. `mode` lets a test make it behave badly on purpose. */
function fakeStorage(initial = {}, mode = 'ok') {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) {
      if (mode === 'throw-get') throw new Error('SecurityError');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (mode === 'throw-set') throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    get size() {
      return map.size;
    },
    read(k) {
      return map.get(k) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// The one that matters: notes and code cannot disagree about what shipped.
// ---------------------------------------------------------------------------

test('the newest release entry IS the running version', () => {
  // Doctrine §7d: generated from ONE source. If this fails, the panel is
  // showing a version stamp for one build and release notes for another, and
  // the reader has no way to tell which is lying.
  assert.equal(RELEASES[0].version, VERSION);
  assert.equal(CURRENT_RELEASE.version, VERSION);
});

test('every release carries a headline, changes, and a broken list', () => {
  for (const r of RELEASES) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/, `${r.version} is not a triplet`);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${r.version} has no ISO date`);
    assert.ok(r.headline && r.headline.length > 10, `${r.version} has no headline`);
    assert.ok(Array.isArray(r.changed) && r.changed.length, `${r.version} lists no changes`);
    // `broken` is REQUIRED and may be empty. The distinction matters: an empty
    // array is a claim that nothing is outstanding, a missing key is an author
    // who did not consider the question. Only the first is acceptable (§7d).
    assert.ok(Array.isArray(r.broken), `${r.version} has no broken list at all`);
    for (const line of [...r.changed, ...r.broken]) {
      assert.equal(typeof line, 'string');
      assert.ok(line.trim().length > 0, `${r.version} has an empty line`);
    }
  }
});

test('releases are unique and ordered newest first', () => {
  const seen = new Set();
  for (const r of RELEASES) {
    assert.ok(!seen.has(r.version), `${r.version} listed twice`);
    seen.add(r.version);
  }
  const dates = RELEASES.map((r) => r.date);
  const sorted = [...dates].sort().reverse();
  assert.deepEqual(dates, sorted, 'releases are not in newest-first order');
});

// ---------------------------------------------------------------------------
// releasesSince
// ---------------------------------------------------------------------------

test('releasesSince returns everything after the version the reader saw', () => {
  const third = RELEASES[2].version;
  const since = releasesSince(third);
  assert.equal(since.length, 2);
  assert.equal(since[0].version, RELEASES[0].version);
  assert.equal(since[1].version, RELEASES[1].version);
});

test('releasesSince on the current version returns nothing', () => {
  assert.deepEqual(releasesSince(VERSION), []);
});

test('an unknown version returns ONLY the current release, not the whole history', () => {
  // Cleared storage, a downgrade, or a hand-edited value. This is the case
  // where we know least, so it gets the smallest honest answer rather than
  // dumping six releases on someone.
  const since = releasesSince('0.0.1-nonsense');
  assert.equal(since.length, 1);
  assert.equal(since[0].version, VERSION);
});

test('no seen version returns nothing — a first run has no "before"', () => {
  assert.deepEqual(releasesSince(null), []);
  assert.deepEqual(releasesSince(''), []);
});

// ---------------------------------------------------------------------------
// updateNotice — what the banner asks
// ---------------------------------------------------------------------------

test('a first-ever run gets NO banner', () => {
  // Competing with the first-run instructions is the failure being avoided.
  assert.equal(updateNotice(null), null);
  assert.equal(updateNotice(''), null);
});

test('a reader already on the current version gets no banner', () => {
  assert.equal(updateNotice(VERSION), null);
});

test('a reader who missed releases is told how many', () => {
  const notice = updateNotice(RELEASES[2].version);
  assert.ok(notice, 'expected a notice');
  assert.equal(notice.version, VERSION);
  assert.equal(notice.count, 2);
  assert.equal(notice.headline, RELEASES[0].headline);
});

test('a reader who missed exactly one gets a count of one', () => {
  const notice = updateNotice(RELEASES[1].version);
  assert.ok(notice);
  assert.equal(notice.count, 1);
});

// ---------------------------------------------------------------------------
// Persistence, including the ways storage legitimately fails
// ---------------------------------------------------------------------------

test('loadSeen reads back what saveSeen wrote', () => {
  const storage = fakeStorage();
  assert.equal(loadSeen(storage), null);
  assert.equal(saveSeen('1.2.3', storage), true);
  assert.equal(storage.read(SEEN_KEY), '1.2.3');
  assert.equal(loadSeen(storage), '1.2.3');
});

test('an empty stored string is treated as never seen, not as a version', () => {
  assert.equal(loadSeen(fakeStorage({ [SEEN_KEY]: '' })), null);
});

test('storage that throws does not break the panel', () => {
  // Private browsing throws on setItem; some configurations throw on getItem.
  // Neither is a reason for the app to fail over a release note.
  assert.equal(loadSeen(fakeStorage({}, 'throw-get')), null);
  assert.equal(saveSeen('1.2.3', fakeStorage({}, 'throw-set')), false);
});

test('absent storage is handled, not assumed', () => {
  assert.equal(loadSeen(undefined), null);
  assert.equal(saveSeen('1.2.3', undefined), true);
});

// ---------------------------------------------------------------------------
// WHO THESE NOTES ARE ADDRESSED TO — a gate, because the rule was a paragraph
// at the top of releases.js for ten releases and every one of them broke it.
//
// Noah, 2026-08-05, on opening What's New: "WHAT THE *FUCK* ARE THESE RELEASE
// NOTES?!" They had become a support thread published inside the product:
// "You asked why every runway looks the same", "You sent a photo of DAL2229",
// "I only wrote the test AFTER you found it", "Follow a flight and send the
// report". The reader is not the person who reported the fault, there is no
// author character in a patch note, and nobody opening the app owes anyone a
// bug report.
//
// EVERY PATTERN BELOW WAS TAKEN FROM A NOTE THAT ACTUALLY SHIPPED. A gate
// written from imagination catches imaginary defects; this one is a list of
// real sentences that reached a real screen.
//
// Kept deliberately narrow. Ordinary second person is how the whole file
// speaks to its reader — "the aircraft over your desk", "you decide when",
// "put it back on you" — and banning "you" outright would make the notes
// worse. What is banned is "you" meaning SOMEBODY ELSE.
// ---------------------------------------------------------------------------

const PROSE_OF = (r) => [r.headline, ...r.changed, ...r.broken];

/** Each rule: what it catches, and why that sentence does not belong here. */
const FORBIDDEN = [
  {
    why: 'addresses the person who reported the fault, not the reader',
    // "You asked", "you said", "you sent me a photo", "you were right"
    re: /\byou(?:'ve| have)?\s+(?:asked|said|told|sent|reported|found|caught|held|were right|photographed|mentioned)\b/i,
  },
  {
    why: 'refers to a report the reader never filed',
    re: /\byour\s+(?:last\s+|latest\s+|own\s+)?(?:report|diagnostics report|photo|message|self test|probe)\b/i,
  },
  {
    why: 'asks the reader to send something to the author',
    re: /\bsend\s+(?:me|that\s+report|the\s+report|it\s+to\s+me)\b|\bthing\s+to\s+send\b/i,
  },
  {
    why: 'an author character — there is no "I" in a patch note',
    re: /(?:^|[\s"'(—-])(?:I|I'm|I'll|I've|I'd)[\s,.]|(?:^|\s)(?:my|me)\s+(?:probe|report|guess|fault|job|process|check|test|code)\b|\bnot\s+going\s+to\s+guess\b/,
  },
  {
    why: 'raw protocol — that belongs in the diagnostics report, one press away',
    re: /\bHTTP\s?\d{3}\b|\bcontent-type\b|\bcf-ray\b|\bstatus\s+code\b|\btext\/html\b/i,
  },
  {
    why: 'implementation measurement the reader cannot act on',
    re: /\b\d+\s*(?:px|pixels)\b|\bbelow the fold\b|\bviewport\b|\bDOM\b|\brem\b/i,
  },
];

test('release notes speak to the READER, not to whoever reported the bug', () => {
  const found = [];
  for (const release of RELEASES) {
    for (const line of PROSE_OF(release)) {
      for (const rule of FORBIDDEN) {
        const hit = line.match(rule.re);
        if (hit) found.push(`${release.version}: ${rule.why}\n      …"${hit[0].trim()}" in: ${line.slice(0, 110)}…`);
      }
    }
  }
  assert.deepEqual(found, [], `release notes addressed to the wrong person:\n\n  ${found.join('\n\n  ')}\n`);
});

test('the ban is narrow — ordinary second person still passes', () => {
  // If this ever fails, the gate above has been widened into something that
  // makes the notes worse. "You" IS how this file talks to its reader.
  const fine = [
    'The scope centres wherever you want it.',
    'It never installs itself — you decide when.',
    'Back to my position puts it back on you.',
    'On a desk you are at a few hundred feet, so NORM correctly hides every airliner overhead.',
  ];
  for (const line of fine) {
    for (const rule of FORBIDDEN) {
      assert.equal(rule.re.test(line), false, `over-broad (${rule.why}): "${line}"`);
    }
  }
});

test('every rule catches the real sentence it was written from', () => {
  // The shipped sentences, verbatim. A gate nobody has watched catch anything
  // is not evidence — hub LESSONS §54.
  const shipped = [
    'You asked why every runway looks the same at every scale.',
    'Your last report said the route feed answered with 201, content-type text/html.',
    'WHAT THE ROUTE FEED ACTUALLY SENT, in the diagnostics report, is the thing to send me.',
    'I had expected a rejection naming a field I had got wrong.',
    'The route feed answered your device with HTTP 201, which means it accepted the request.',
    'the target stopped about 24 pixels from the mark while the label sits 20 to 28 away',
  ];
  for (const line of shipped) {
    assert.ok(FORBIDDEN.some((r) => r.re.test(line)), `nothing caught: "${line}"`);
  }
});
