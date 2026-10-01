import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, toIssue, type Client, type Issue, type RawIssue } from './issue-triage/github.ts';
import { askJev } from './issue-triage/jev.ts';
import { renderSummary } from './issue-triage/report.ts';
import { triggerFor } from './issue-triage/rules.ts';
import { newRecord, runTriage, type TriageRecord } from './issue-triage/run.ts';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 없음: ${name}`);
  return value;
}

// 입력을 어디서 읽는가와 최초 분류인가는 다른 문제다. 같은 실행을 다시 돌리면 이벤트 파일은 그대로 읽지만 최초 분류는 아니다.
const fromEvent = process.env.GITHUB_EVENT_NAME === 'issues';
const trigger = triggerFor(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_RUN_ATTEMPT);

// 시험 실행은 라벨을 고치지 않고 무엇을 고치려 했는지만 적는다. 병합 전에는 워크플로를 실행할 수 없어서 로컬에서 이렇게 확인한다.
function dryClient(eventIssue: Issue | null): Client {
  return {
    async getIssue() {
      if (!eventIssue) throw new Error('시험 실행은 이벤트 파일의 이슈만 읽는다');
      return eventIssue;
    },
    async recentIssueCount() { return 0; },
    async addLabels(number, labels) { console.log(`[시험] #${number} 라벨 추가: ${labels.join(', ')}`); },
    async removeLabel(number, label) { console.log(`[시험] #${number} 라벨 제거: ${label}`); },
    async addComment(number, body) { console.log(`[시험] #${number} 댓글:\n${body}\n`); }
  };
}

async function run(): Promise<TriageRecord> {
  // 이슈 제목과 본문은 이벤트 파일에서 읽는다. 워크플로 식으로 셸에 끼워 넣으면 독자가 쓴 글이 명령의 일부가 된다.
  let issue: Issue | null = null;
  if (fromEvent) {
    const event = JSON.parse(await fs.readFile(env('GITHUB_EVENT_PATH'), 'utf8')) as { issue: RawIssue };
    issue = toIssue(event.issue);
  }
  const client = process.env.TRIAGE_DRY_RUN === '1'
    ? dryClient(issue)
    : createClient({ token: env('GITHUB_TOKEN'), repository: env('GITHUB_REPOSITORY'), apiUrl: process.env.GITHUB_API_URL });
  if (!issue) {
    const number = Number(env('ISSUE_NUMBER'));
    if (!Number.isInteger(number) || number <= 0) throw new Error('ISSUE_NUMBER가 이슈 번호가 아님');
    issue = await client.getIssue(number);
  }
  // 키가 없으면 askJev가 분류 실패로 처리해 triage-failed를 남긴다. 여기서 멈추면 이슈에 흔적이 남지 않는다.
  const apiKey = process.env.TYPESAFE_API_KEY ?? '';
  // 저장소 소유자는 Actions가 주는 값이다. 이슈의 내용으로 바꿀 수 없다.
  const owner = process.env.GITHUB_REPOSITORY_OWNER ?? null;
  return runTriage(issue, trigger, { client, ask: (state) => askJev(state, { apiKey }), now: Date.now(), owner });
}

// 이슈를 읽기 전에 실패해도 기록을 남긴다. GitHub 장애 중에는 실패 라벨도 붙일 수 없어서 이 기록이 유일한 흔적이다.
let record: TriageRecord;
try {
  record = await run();
} catch (error) {
  record = { ...newRecord(null, trigger), outcome: 'error', error: error instanceof Error ? error.message : String(error) };
}

const summary = renderSummary(record);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (process.env.RUNNER_TEMP) await fs.writeFile(path.join(process.env.RUNNER_TEMP, 'triage-record.json'), `${JSON.stringify(record, null, 2)}\n`);
// 분류 실패를 알리는 수단은 triage-failed 라벨이다. 작업도 실패로 끝내 Actions 목록에서 구분되게 한다.
if (record.outcome === 'failed' || record.outcome === 'error') process.exitCode = 1;
