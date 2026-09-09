import test from 'node:test';
import assert from 'node:assert/strict';
import { technologyTags, selectDevelopmentRecords } from '../src/lib/development.mjs';

const record = (category, title, tag, date) => ({ category, title, path: `${title}.md`, date, tags: [`개발/${tag}`] });
const records = [
  record('Concepts', '멀티테넌시', '데이터베이스', '2026-09-06'),
  record('Troubleshooting', 'ZIP', 'Java', '2026-08-25'),
  record('Troubleshooting', 'Async', 'Spring', '2026-08-20'),
  record('Tools', '터미널', '도구', '2026-07-15')
];

test('technologyTags strips the 개발 prefix and drops role tags', () => {
  assert.deepEqual(technologyTags(['개발/Spring', '개발/트러블슈팅', '개발/도구', 'AI']), ['Spring']);
});

test('selectDevelopmentRecords filters by category and technology, newest first', () => {
  assert.deepEqual(selectDevelopmentRecords(records, 'all', 'all').map((r) => r.title), ['멀티테넌시', 'ZIP', 'Async', '터미널']);
  assert.deepEqual(selectDevelopmentRecords(records, 'Troubleshooting', 'all').map((r) => r.title), ['ZIP', 'Async']);
  assert.deepEqual(selectDevelopmentRecords(records, 'all', 'Spring').map((r) => r.title), ['Async']);
  assert.deepEqual(selectDevelopmentRecords(records, 'Concepts', 'Spring'), []);
});
