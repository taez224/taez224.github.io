import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { prepare, check } from './character-story.ts';

async function fixture(fn: (root: string, run: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'character-eval-'));
  try {
    const skill = join(root, 'skill');
    await mkdir(join(skill, 'references'), { recursive: true });
    await mkdir(join(skill, 'evals'));
    await writeFile(join(skill, 'SKILL.md'), '# 평가 스킬');
    await writeFile(join(skill, 'references/production.md'), '원본을 보존한다.');
    await writeFile(join(root, 'USAGE.md'), '작품마다 소품을 고른다.');
    await writeFile(join(skill, 'evals/cases.json'), JSON.stringify({ version: 1, cases: [{ id: 'c1', request: '압축해 줘', artifacts: { size: '1MB' } }] }));
    await writeFile(join(skill, 'evals/rubric.json'), JSON.stringify({ version: 1, cases: [{ id: 'c1', criteria: [{ id: 'c1.1', requirement: 'SECRET_RUBRIC' }] }] }));
    const run = join(root, 'run');
    await prepare(skill, join(root, 'USAGE.md'), run);
    await writeFile(join(run, 'responses.json'), JSON.stringify({ evaluator: 'candidate', model: 'test', answers: { c1: '작은 글씨를 비교한다.' } }));
    await judgment(run, 'pass');
    await fn(root, run);
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function judgment(run: string, outcome: string, quote = '작은 글씨를 비교한다.') {
  await writeFile(join(run, 'judgment.json'), JSON.stringify({ evaluator: 'reviewer', model: 'test', cases: [{ id: 'c1', scores: [{ id: 'c1.1', outcome, quote, reason: '응답에 비교 작업을 명시했다.' }] }] }));
}

test('평가 입력에 채점표를 넣지 않고 원본을 독립된 사본으로 보존한다', async () => fixture(async (root, run) => {
  const paths = await readdir(join(run, 'input'), { recursive: true });
  assert(!paths.some(p => p.includes('rubric')));
  for (const name of ['cases.json', 'TASK.md', 'skill/SKILL.md', 'USAGE.md']) {
    assert(!(await readFile(join(run, 'input', name), 'utf8')).includes('SECRET_RUBRIC'));
  }
  await writeFile(join(root, 'USAGE.md'), '원본에서 바뀐 결정');
  assert.equal(await readFile(join(run, 'input/USAGE.md'), 'utf8'), '작품마다 소품을 고른다.');
  await assert.rejects(prepare(join(root, 'skill'), join(root, 'USAGE.md'), run), /EEXIST/);
}));

test('입력 변경을 검사하여 실행 뒤 자료를 바꾼 결과를 통과시키지 않는다', async () => fixture(async (_root, run) => {
  await writeFile(join(run, 'input/USAGE.md'), '바뀐 기준');
  await assert.rejects(check(run), /평가 입력 변경/);
}));

test('합격과 실패, 미확인 결과를 별도 종료 코드로 구분한다', async () => fixture(async (_root, run) => {
  assert.equal((await check(run)).exitCode, 0);
  await judgment(run, 'fail');
  assert.equal((await check(run)).exitCode, 1);
  await judgment(run, 'inconclusive');
  assert.equal((await check(run)).exitCode, 2);
}));

test('응답에 없는 인용과 누락한 평가를 거부한다', async () => fixture(async (_root, run) => {
  await judgment(run, 'pass', '압축을 마쳤다.');
  await assert.rejects(check(run), /응답에 없는 인용/);
  await writeFile(join(run, 'judgment.json'), JSON.stringify({ evaluator: 'reviewer', model: 'test', cases: [] }));
  await assert.rejects(check(run), /id 누락/);
}));

test('같은 실행자가 자신을 평가하거나 기준을 중복 집계한 기록을 거부한다', async () => fixture(async (_root, run) => {
  const path = join(run, 'judgment.json');
  const value = JSON.parse(await readFile(path, 'utf8'));
  value.evaluator = 'candidate';
  await writeFile(path, JSON.stringify(value));
  await assert.rejects(check(run), /응답자와 검토자/);
  value.evaluator = 'reviewer';
  value.cases[0].scores.push(value.cases[0].scores[0]);
  await writeFile(path, JSON.stringify(value));
  await assert.rejects(check(run), /중복 id/);
}));


test('실행 준비 뒤 입력 폴더에 추가한 자료를 탐지한다', async () => fixture(async (_root, run) => {
  await writeFile(join(run, 'input/extra.md'), '나중에 섞인 답안');
  await assert.rejects(check(run), /입력 파일/);
}));


test('CLI가 합격·실패·불완전한 기록의 종료 코드를 실제로 반환한다', async () => fixture(async (_root, run) => {
  const cli = new URL('./character-story.ts', import.meta.url).pathname;
  const execute = () => spawnSync(process.execPath, [cli, 'check', run], { encoding: 'utf8' });
  assert.equal(execute().status, 0);
  await judgment(run, 'fail');
  assert.equal(execute().status, 1);
  await judgment(run, 'inconclusive');
  assert.equal(execute().status, 2);
  await rm(join(run, 'judgment.json'));
  assert.equal(execute().status, 2);
}));
