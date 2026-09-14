import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDevelopment, primaryTopicTag, technologyTags, selectDevelopmentRecords, type DevelopmentCategory } from '../src/lib/development.ts';

const record = (category: DevelopmentCategory, title: string, tag: string, date: string) => ({ category, title, path: `${title}.md`, date, tags: [`개발/${tag}`] });
const records = [
  record('Concepts', '멀티테넌시', '데이터베이스', '2026-09-06'),
  record('Troubleshooting', 'ZIP', 'Java', '2026-08-25'),
  record('Troubleshooting', 'Async', 'Spring', '2026-08-20'),
  record('Tools', '터미널', '도구', '2026-07-15')
];

test('technologyTags strips the 개발 prefix and drops the 개발/도구 context tag', () => {
  assert.deepEqual(technologyTags(['개발/Spring', '개발/도구', 'AI']), ['Spring']);
});

test('selectDevelopmentRecords filters by category and technology, newest first', () => {
  assert.deepEqual(selectDevelopmentRecords(records, 'all', 'all').map((r) => r.title), ['멀티테넌시', 'ZIP', 'Async', '터미널']);
  assert.deepEqual(selectDevelopmentRecords(records, 'Troubleshooting', 'all').map((r) => r.title), ['ZIP', 'Async']);
  assert.deepEqual(selectDevelopmentRecords(records, 'all', 'Spring').map((r) => r.title), ['Async']);
  assert.deepEqual(selectDevelopmentRecords(records, 'Concepts', 'Spring'), []);
});

// 목록의 첫 칸은 태그 순서가 정한다. 어떤 태그가 앞에 올지는 vault 스키마의 규칙이지 사이트가 고쳐 쓰지 않는다.
test('primaryTopicTag shows the first public tag exactly as the author ordered it', () => {
  assert.equal(primaryTopicTag(['개발/데이터베이스', '개발/설계']), '데이터베이스');
  assert.equal(primaryTopicTag(['지식관리', 'AI/에이전트']), '지식관리');
  assert.equal(primaryTopicTag(['개발/도구', 'AI/에이전트']), '도구');
  assert.equal(primaryTopicTag(['slipbox', 'AI/에이전트', '개발/도구']), 'AI/에이전트');
  assert.equal(primaryTopicTag(['slipbox', '프로젝트/demo']), '');
  assert.equal(primaryTopicTag(), '');
});

test('groupDevelopment splits notes into the three categories, each newest first', () => {
  const grouped = groupDevelopment([
    record('Concepts', '옛 개념', '설계', '2026-01-01'),
    record('Tools', '도구', '도구', '2026-03-01'),
    record('Concepts', '새 개념', '설계', '2026-05-01'),
    record('Troubleshooting', '문제', 'Java', '2026-02-01')
  ]);
  const titles = (items: readonly { title: string }[]) => items.map((item) => item.title);
  assert.deepEqual([titles(grouped.concepts), titles(grouped.troubleshooting), titles(grouped.tools)], [['새 개념', '옛 개념'], ['문제'], ['도구']]);
});
