import test from 'node:test';
import assert from 'node:assert/strict';
import { dateOnly, kstDate, noteDates } from '../src/lib/dates.mjs';

const path = '01_Slipbox/노트.md';
const today = '2026-09-11';
const dates = (meta) => noteDates(meta, { path, today });
const failsWith = (meta, ...parts) => assert.throws(() => dates(meta), (error) => parts.every((part) => error.message.includes(part)), parts.join(' '));

test('the build day is the calendar day in Korea, not in UTC', () => {
  assert.equal(kstDate(new Date('2026-09-10T19:00:00Z')), '2026-09-11', '04:00 KST 예약 빌드는 UTC로 전날 19:00이다');
  assert.equal(kstDate(new Date('2026-09-10T14:59:59Z')), '2026-09-10');
});

test('a public note is dated by published when present, otherwise by created', () => {
  assert.equal(dates({ created: '2026-01-02' }).date, '2026-01-02');
  assert.equal(dates({ created: '2026-01-02', published: '2026-09-10' }).date, '2026-09-10');
  assert.equal(dates({ created: '2026-01-02', published: null }).date, '2026-01-02', 'null로 적은 published는 없는 값이다');
  assert.equal(dates({ created: '2026-09-11' }).date, '2026-09-11', '빌드한 날 자체는 미래가 아니다');
});

test('empty parser values are absent dates but date lists are invalid', () => {
  assert.equal(dates({ created: '2026-01-02', published: [], updated: [] }).updated, '');
  failsWith({ created: [] }, 'Missing created', path);
  failsWith({ created: '2026-01-02', updated: ['2026-02-01'] }, 'Invalid updated', path);
});

test('a note without created fails the build and names the file', () => {
  failsWith({ published: '2026-09-10' }, 'created', path);
});

test('dates must be real YYYY-MM-DD days, and the error names the field, the value and the file', () => {
  for (const [field, value] of [['created', '2026-9-10'], ['created', '2026-02-30'], ['published', '2026-09-10 12:00'], ['updated', '2026/09/10']]) {
    failsWith({ created: '2026-01-02', [field]: value }, field, value, path);
  }
});

test('a date after the build day in Korea fails the build', () => {
  failsWith({ created: '2026-09-12' }, 'created', '2026-09-12', path);
  failsWith({ created: '2026-01-02', published: '2027-01-01' }, 'published', '2027-01-01', path);
  failsWith({ created: '2026-01-02', updated: '2026-09-12' }, 'updated', '2026-09-12', path);
});

test('updated is kept only when it is later than the note date', () => {
  assert.equal(dates({ created: '2026-01-02', updated: '2026-03-01' }).updated, '2026-03-01');
  assert.equal(dates({ created: '2026-01-02' }).updated, '');
  assert.equal(dates({ created: '2026-01-02', updated: '2026-01-02' }).updated, '', '같은 날 고친 것은 수정으로 보지 않는다');
  assert.equal(dates({ created: '2026-01-02', published: '2026-05-04', updated: '2026-04-20' }).updated, '', '발행 전에 고친 날은 독자에게 수정이 아니다');
});

test('dateOnly keeps the day from a value that also carries a time', () => {
  assert.equal(dateOnly('2025-08-12 18:40'), '2025-08-12');
  assert.equal(dateOnly(''), '');
  assert.equal(dateOnly(null), '');
});
