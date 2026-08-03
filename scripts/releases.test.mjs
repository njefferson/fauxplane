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
