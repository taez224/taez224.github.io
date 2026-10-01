import test from 'node:test';
import assert from 'node:assert/strict';
import { RECENT_PAGE_LIMIT, countIssuesCreatedSince, countRecentIssues, toIssue, type Issue, type RawIssue } from '../scripts/issue-triage/github.ts';
import { readRecord } from '../scripts/issue-triage/comment.ts';
import { TriageError } from '../scripts/issue-triage/jev.ts';
import type { Verdict } from '../scripts/issue-triage/questions.ts';
import { kind, verdict as makeVerdict } from './helpers/triage.ts';
import { renderSummary } from '../scripts/issue-triage/report.ts';
import { DAILY_NEW_ISSUE_LIMIT, runTriage } from '../scripts/issue-triage/run.ts';

const verdict: Verdict = makeVerdict({ type: kind('content'), impact: { score: 0.01, confidence: 0.99 }, hasReproInfo: 0.96 });
const issue = (over: Partial<Issue> = {}): Issue => ({ number: 7, title: '[제보] 오타', body: '방벙 → 방법', labels: ['needs-triage'], isPullRequest: false, ...over });

type Options = {
  recent?: number | null;
  ask?: () => Promise<Verdict>;
  // 라벨을 적용하기 직전에 GitHub에서 다시 읽은 라벨이다. 주지 않으면 이벤트의 라벨과 같다.
  labelsNow?: string[];
  fail?: 'count' | 'get' | 'add' | 'remove' | 'comment';
};

// GitHub 호출과 Jev 호출을 기록하는 대역이다. 실제 GitHub과 Jev를 부르지 않는다.
function fixture(target: Issue, { recent = 1, ask = async () => verdict, labelsNow, fail }: Options = {}) {
  const calls: string[] = [];
  const outage = (step: string) => { if (fail === step) throw new Error(`GitHub API ${step}: 503`); };
  const client = {
    async getIssue(number: number) { calls.push(`get #${number}`); outage('get'); return { ...target, labels: labelsNow ?? target.labels }; },
    async recentIssueCount(_now: number, stopAbove: number) { calls.push(`count>${stopAbove}`); outage('count'); return recent; },
    async addLabels(number: number, labels: string[]) { calls.push(`add #${number} ${labels.join(',')}`); outage('add'); },
    async removeLabel(number: number, label: string) { calls.push(`remove #${number} ${label}`); outage('remove'); },
    async addComment(number: number, body: string) { calls.push(`comment #${number}`); comments.push(body); outage('comment'); }
  };
  const comments: string[] = [];
  const deps = { client, ask: async () => { calls.push('ask'); return ask(); }, now: Date.parse('2026-10-01T00:00:00Z'), owner: 'taez224' };
  return { calls, comments, run: (trigger: 'opened' | 'dispatch') => runTriage(target, trigger, deps) };
}

const since = Date.parse('2026-09-30T00:00:00Z');
const recentPr = (number: number): RawIssue => ({ number, title: 'pr', created_at: '2026-09-30T12:00:00Z', pull_request: {} });
const recentIssue = (number: number): RawIssue => ({ number, title: 'issue', created_at: '2026-09-30T11:00:00Z' });
const oldIssue = (number: number): RawIssue => ({ number, title: 'old', created_at: '2026-09-29T23:59:59Z' });
const many = (length: number, make: (number: number) => RawIssue) => Array.from({ length }, (_, index) => make(index + 1));

test('GitHub label objects and strings both become label names, and a pull request is recognised', () => {
  const converted = toIssue({ number: 3, title: '제목', body: null, labels: ['bug', { name: 'area:map' }, {}], pull_request: {} });
  assert.deepEqual(converted, { number: 3, title: '제목', body: null, labels: ['bug', 'area:map'], isPullRequest: true });
  assert.equal(toIssue({ number: 4, title: '제목' }).isPullRequest, false);
});

test('the daily count takes issues by creation time and leaves pull requests out', () => {
  assert.equal(countIssuesCreatedSince([recentIssue(1), recentPr(2), oldIssue(3), { number: 4, title: 'd' }], since), 1);
});

test('issues hidden behind a full page of pull requests are still counted', async () => {
  // PR은 누구나 열 수 있다. 한 쪽만 보면 PR 100건 뒤의 이슈 21건이 0건으로 세어진다.
  const pages = [many(100, recentPr), [...many(21, recentIssue), oldIssue(99)]];
  const asked: number[] = [];
  const count = await countRecentIssues(async (page) => { asked.push(page); return pages[page - 1] ?? []; }, since, 20);
  assert.equal(count, 21);
  assert.deepEqual(asked, [1, 2]);
});

test('counting stops at the first item older than the window, or at a short page', async () => {
  const asked: number[] = [];
  const fetchPage = (pages: RawIssue[][]) => async (page: number) => { asked.push(page); return pages[page - 1] ?? []; };
  assert.equal(await countRecentIssues(fetchPage([[...many(99, recentIssue), oldIssue(100)], many(100, recentIssue)]), since, 500), 99);
  assert.equal(await countRecentIssues(fetchPage([many(3, recentIssue)]), since, 500), 3);
  assert.equal(await countRecentIssues(fetchPage([[]]), since, 500), 0);
  assert.deepEqual(asked, [1, 1, 1]);
});

test('the count is unknown when the page limit is reached without an answer', async () => {
  const asked: number[] = [];
  const count = await countRecentIssues(async (page) => { asked.push(page); return many(100, recentPr); }, since, 20);
  assert.equal(count, null);
  assert.equal(asked.length, RECENT_PAGE_LIMIT);
});

test('a new issue is classified against the labels it has at that moment', async () => {
  const { calls, run } = fixture(issue());
  const record = await run('opened');
  assert.deepEqual(calls, [`count>${DAILY_NEW_ISSUE_LIMIT}`, 'ask', 'get #7', 'add #7 content,area:reader', 'comment #7']);
  assert.equal(record.outcome, 'classified');
  assert.equal(record.stage, 'done');
  assert.deepEqual(record.added, ['content', 'area:reader']);
  assert.match(record.inputHash ?? '', /^[0-9a-f]{64}$/);
  assert.equal(record.truncated, false);
});

test('a type the owner set while the job was waiting is kept', async () => {
  // 이벤트에는 needs-triage만 실려 있다. 그사이 소유자가 bug를 붙였고 Jev는 content라고 답한다.
  const { calls, comments, run } = fixture(issue(), { labelsNow: ['needs-triage', 'bug'] });
  const record = await run('opened');
  assert.ok(calls.includes('add #7 area:reader'));
  assert.deepEqual(record.added, ['area:reader']);
  assert.deepEqual(record.labelsBefore, ['needs-triage', 'bug']);
  // 댓글도 실제로 일어난 일을 적는다. 판정은 내용 정정이지만 남은 라벨은 소유자의 bug다.
  assert.ok(comments[0]?.includes('| 종류 | 내용 정정 | 기존 `bug` 유지 |'));
});

test('an issue the owner confirmed while the job was waiting is left alone', async () => {
  const { calls, run } = fixture(issue(), { labelsNow: ['bug'] });
  const record = await run('opened');
  assert.deepEqual(calls, [`count>${DAILY_NEW_ISSUE_LIMIT}`, 'ask', 'get #7']);
  assert.equal(record.outcome, 'skipped');
  assert.deepEqual(record.added, []);
});

test('over the daily limit, or when the count is unknown, a new issue is only marked for triage', async () => {
  for (const recent of [DAILY_NEW_ISSUE_LIMIT + 1, null]) {
    const { calls, run } = fixture(issue({ labels: [] }), { recent });
    const record = await run('opened');
    assert.deepEqual(calls, [`count>${DAILY_NEW_ISSUE_LIMIT}`, 'get #7', 'add #7 needs-triage']);
    assert.equal(record.outcome, 'capped');
    assert.equal(record.notes.length, 1);
  }
  // 정확히 상한까지는 분류한다.
  assert.equal((await fixture(issue(), { recent: DAILY_NEW_ISSUE_LIMIT }).run('opened')).outcome, 'classified');
});

test('a triage failure is recorded on the issue instead of being turned into a verdict', async () => {
  const { calls, run } = fixture(issue(), { ask: async () => { throw new TriageError('Jev 응답 503'); } });
  const record = await run('opened');
  assert.deepEqual(calls, [`count>${DAILY_NEW_ISSUE_LIMIT}`, 'ask', 'get #7', 'add #7 triage-failed', 'comment #7']);
  assert.equal(record.outcome, 'failed');
  assert.equal(record.error, 'Jev 응답 503');
  assert.equal(record.verdict, null);
});

test('a manual rerun skips the daily limit and clears the failure label', async () => {
  const { calls, run } = fixture(issue({ labels: ['needs-triage', 'triage-failed'] }), { recent: 999 });
  const record = await run('dispatch');
  assert.deepEqual(calls, ['get #7', 'ask', 'get #7', 'add #7 content,area:reader', 'remove #7 triage-failed']);
  assert.deepEqual(record.removed, ['triage-failed']);
});

test('a rerun judges an issue by its current labels, not the ones in the event', async () => {
  // 빈 이슈로 열어 이벤트에는 라벨이 없다. 첫 실행이 needs-triage와 영역을 붙였고, 그 실행을 Actions에서 다시 돌린다.
  const { calls, run } = fixture(issue({ labels: [] }), { labelsNow: ['needs-triage', 'area:map'] });
  const record = await run('dispatch');
  assert.deepEqual(calls, ['get #7', 'ask', 'get #7', 'add #7 content']);
  assert.equal(record.outcome, 'classified');
});

test('a confirmed issue and a pull request are left untouched without calling Jev', async () => {
  const confirmed = fixture(issue({ labels: ['bug'] }));
  assert.equal((await confirmed.run('dispatch')).outcome, 'skipped');
  assert.deepEqual(confirmed.calls, ['get #7']);
  // 이벤트에는 needs-triage가 실려 있어도, 그 뒤에 소유자가 뗐으면 확인이 끝난 것이다.
  const confirmedLater = fixture(issue(), { labelsNow: ['content'] });
  assert.equal((await confirmedLater.run('dispatch')).outcome, 'skipped');
  assert.deepEqual(confirmedLater.calls, ['get #7']);
  const pull = fixture(issue({ isPullRequest: true }));
  assert.equal((await pull.run('dispatch')).outcome, 'skipped');
  assert.deepEqual(pull.calls, []);
});

test('a GitHub outage or a script bug ends as a recorded error with its stage, never as an exception', async () => {
  const count = await fixture(issue(), { fail: 'count' }).run('opened');
  assert.deepEqual([count.outcome, count.stage, count.error], ['error', 'count', 'GitHub API count: 503']);

  const bug = fixture(issue(), { ask: async () => { throw new TypeError('bug in the script'); } });
  const bugRecord = await bug.run('opened');
  assert.deepEqual([bugRecord.outcome, bugRecord.stage, bugRecord.error], ['error', 'ask', 'bug in the script']);
  // 스크립트의 버그를 분류 실패로 바꾸지 않는다. triage-failed를 붙이지 않는다.
  assert.deepEqual(bug.calls, [`count>${DAILY_NEW_ISSUE_LIMIT}`, 'ask']);

  const get = await fixture(issue(), { fail: 'get' }).run('opened');
  assert.deepEqual([get.outcome, get.stage, get.verdict?.type.choice], ['error', 'labels', 'content']);
});

test('the first run leaves one comment with the verdict, and reruns leave none', async () => {
  const first = fixture(issue());
  const record = await first.run('opened');
  assert.equal(first.comments.length, 1);
  const comment = first.comments[0] ?? '';
  assert.ok(comment.includes('| 종류 | 내용 정정 | `content` |'));
  assert.ok(comment.includes('@taez224가'));
  // 댓글에 숨겨 넣은 기록은 라벨 적용까지 끝난 상태의 것이다.
  assert.deepEqual(readRecord(comment), record);
  // 독자가 쓴 제목과 본문은 댓글에 옮기지 않는다.
  assert.ok(!comment.includes('방벙'));
  assert.ok(!comment.includes('[제보] 오타'));

  const rerun = fixture(issue());
  await rerun.run('dispatch');
  assert.deepEqual(rerun.comments, []);
});

test('a failed classification is announced, but a capped or skipped run is not', async () => {
  const failed = fixture(issue(), { ask: async () => { throw new TriageError('Jev 응답 503'); } });
  await failed.run('opened');
  assert.match(failed.comments[0] ?? '', /자동으로 분류하지 못했습니다/);

  const capped = fixture(issue(), { recent: null });
  await capped.run('opened');
  assert.deepEqual(capped.comments, []);

  const confirmed = fixture(issue(), { labelsNow: ['bug'] });
  await confirmed.run('opened');
  assert.deepEqual(confirmed.comments, []);
});

test('a comment that cannot be posted is an error, but the labels already applied are kept in the record', async () => {
  const record = await fixture(issue(), { fail: 'comment' }).run('opened');
  assert.deepEqual([record.outcome, record.stage], ['error', 'comment']);
  assert.deepEqual(record.added, ['content', 'area:reader']);
});

test('labels applied before an outage stay in the record', async () => {
  const added = await fixture(issue(), { fail: 'add' }).run('opened');
  assert.deepEqual([added.outcome, added.stage, added.added], ['error', 'labels', []]);

  // 라벨 추가는 성공했고 triage-failed 제거가 실패했다.
  const removed = await fixture(issue({ labels: ['needs-triage', 'triage-failed'] }), { fail: 'remove' }).run('dispatch');
  assert.deepEqual([removed.outcome, removed.stage], ['error', 'labels']);
  assert.deepEqual(removed.added, ['content', 'area:reader']);
  assert.deepEqual(removed.removed, []);
});

test('the run summary lists versions, the stage, the input hash and the verdict, but never the issue text', async () => {
  const record = await fixture(issue()).run('opened');
  const summary = renderSummary(record);
  for (const expected of ['이슈 #7', 'jev-1.13.0', '질문 버전', '규칙 버전', '마지막 단계', record.inputHash ?? '', 'content', 'area:reader', '1700']) assert.ok(summary.includes(expected), expected);
  assert.ok(!summary.includes('방벙'));
  assert.ok(!summary.includes('[제보] 오타'));
  // 이슈를 읽기도 전에 실패한 실행도 요약을 만든다.
  assert.ok(renderSummary({ ...record, issue: null, outcome: 'error', stage: 'load', error: '환경 변수 없음: GITHUB_TOKEN' }).includes('실행 오류'));
});
