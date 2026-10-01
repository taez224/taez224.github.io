import type { Client, Issue } from './github.ts';
import { buildInput } from './input.ts';
import { TriageError } from './jev.ts';
import { MODEL, QUESTIONS_VERSION, type Verdict } from './questions.ts';
import { NEEDS_TRIAGE, RULES_VERSION, decide, decideCapped, decideFailure, isConfirmed, type Decision, type Trigger } from './rules.ts';

// 신규 이슈 수의 상한이다. Jev 호출 횟수의 상한이 아니다. 한 실행의 호출 횟수는 jev.ts의 MAX_ATTEMPTS가 묶는다.
export const DAILY_NEW_ISSUE_LIMIT = 20;

export type Outcome = 'classified' | 'failed' | 'capped' | 'skipped' | 'error';
// 실행이 어디까지 갔는지를 적는다. 오류로 끝났을 때 어느 단계에서 멈췄는지 알 수 있다.
export type Stage = 'load' | 'count' | 'ask' | 'labels' | 'done';

// 한 번의 실행이 남기는 기록이다. 이슈의 제목과 본문은 넣지 않고 해시만 넣는다. 공개 저장소의 실행 요약과 아티팩트는 누구나 볼 수 있다.
export type TriageRecord = {
  issue: number | null;
  trigger: Trigger;
  outcome: Outcome;
  stage: Stage;
  model: string;
  questionsVersion: string;
  rulesVersion: string;
  inputHash: string | null;
  truncated: boolean | null;
  verdict: Verdict | null;
  added: string[];
  removed: string[];
  notes: string[];
  error: string | null;
};

export function newRecord(issue: number | null, trigger: Trigger): TriageRecord {
  return {
    issue, trigger, outcome: 'skipped', stage: 'load', model: MODEL, questionsVersion: QUESTIONS_VERSION, rulesVersion: RULES_VERSION,
    inputHash: null, truncated: null, verdict: null, added: [], removed: [], notes: [], error: null
  };
}

type Deps = {
  client: Pick<Client, 'getIssue' | 'recentIssueCount' | 'addLabels' | 'removeLabel'>;
  ask: (state: { title: string; body: string }) => Promise<Verdict>;
  now: number;
};

// 예외를 올리지 않는다. 어떤 오류든 기록에 담아 돌려주어, 진입점이 요약과 아티팩트를 남긴 뒤에 실패로 끝낼 수 있게 한다.
export async function runTriage(issue: Issue, trigger: Trigger, deps: Deps): Promise<TriageRecord> {
  const record = newRecord(issue.number, trigger);
  // 실행을 시작할 때의 라벨이다. 재실행에서는 아래에서 GitHub의 현재 라벨로 바꾼다.
  let labelsAtStart: readonly string[] = issue.labels;

  const apply = async (make: (current: readonly string[]) => Decision, outcome: Outcome): Promise<void> => {
    record.stage = 'labels';
    // 이벤트에 실린 라벨은 이슈가 열릴 때의 것이다. 작업이 기다리는 동안 소유자가 고쳤을 수 있으므로 지금의 라벨을 다시 읽어 정한다.
    const current = (await deps.client.getIssue(issue.number)).labels;
    const confirmedMeanwhile = labelsAtStart.includes(NEEDS_TRIAGE) && !current.includes(NEEDS_TRIAGE);
    if (confirmedMeanwhile || isConfirmed(current, trigger)) {
      record.notes = ['확인을 마친 이슈라 건드리지 않음'];
      record.stage = 'done';
      return;
    }
    const decision = make(current);
    record.notes = decision.notes;
    // 붙이고 뗀 것을 호출이 성공할 때마다 적는다. 도중에 실패해도 어디까지 반영됐는지 기록에 남는다.
    if (decision.add.length > 0) {
      await deps.client.addLabels(issue.number, decision.add);
      record.added = decision.add;
    }
    for (const label of decision.remove) {
      await deps.client.removeLabel(issue.number, label);
      record.removed.push(label);
    }
    record.outcome = outcome;
    record.stage = 'done';
  };

  try {
    if (issue.isPullRequest) {
      record.notes = ['PR이라 분류하지 않음'];
      return record;
    }
    // Actions에서 같은 실행을 다시 돌리면 이슈는 이벤트 파일에서 오고, 거기 실린 라벨은 이슈가 열릴 때의 것이다.
    // 빈 이슈로 연 이슈는 그때 라벨이 없어서, 그 라벨로 판단하면 아직 확인하지 않은 이슈를 확인이 끝난 것으로 보고 건너뛴다.
    if (trigger === 'dispatch') labelsAtStart = (await deps.client.getIssue(issue.number)).labels;
    if (isConfirmed(labelsAtStart, trigger)) {
      record.notes = ['확인을 마친 이슈라 건드리지 않음'];
      return record;
    }
    // 상한은 새로 열린 이슈에만 건다. 수동 재실행은 소유자가 일으키므로 넣지 않는다.
    if (trigger === 'opened') {
      record.stage = 'count';
      const recent = await deps.client.recentIssueCount(deps.now, DAILY_NEW_ISSUE_LIMIT);
      if (recent === null || recent > DAILY_NEW_ISSUE_LIMIT) {
        const reason = recent === null ? '최근 이슈 수를 확인하지 못해 Jev를 부르지 않음' : '하루 상한을 넘어 Jev를 부르지 않음';
        await apply((current) => decideCapped(current, reason), 'capped');
        return record;
      }
    }

    record.stage = 'ask';
    const input = buildInput(issue.title, issue.body);
    record.inputHash = input.hash;
    record.truncated = input.truncated;
    let verdict: Verdict;
    try {
      verdict = await deps.ask(input.state);
    } catch (error) {
      // 분류 실패만 triage-failed로 남긴다. 다른 오류는 아래에서 실행 오류로 기록한다.
      if (!(error instanceof TriageError)) throw error;
      record.error = error.message;
      await apply(decideFailure, 'failed');
      return record;
    }
    record.verdict = verdict;
    record.model = verdict.model;
    await apply((current) => decide(verdict, current, trigger), 'classified');
  } catch (error) {
    // GitHub 장애나 스크립트의 버그다. 라벨을 더 붙이려 하지 않는다. GitHub이 실패한 것이라면 그 호출도 실패한다.
    record.outcome = 'error';
    record.error = error instanceof Error ? error.message : String(error);
  }
  return record;
}
