export type Issue = { number: number; title: string; body: string | null; labels: string[]; isPullRequest: boolean };
// GitHub API와 이벤트 파일이 주는 이슈에서 이 스크립트가 읽는 칸만 적는다.
export type RawIssue = { number: number; title: string; body?: string | null; labels?: (string | { name?: string })[]; pull_request?: unknown; created_at?: string };

export type Client = {
  getIssue(number: number): Promise<Issue>;
  recentIssueCount(nowMs: number, stopAbove: number): Promise<number | null>;
  addLabels(number: number, labels: string[]): Promise<void>;
  removeLabel(number: number, label: string): Promise<void>;
  addComment(number: number, body: string): Promise<void>;
};

export function toIssue(raw: RawIssue): Issue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? null,
    labels: (raw.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name ?? '')).filter(Boolean),
    isPullRequest: raw.pull_request !== undefined
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// 이슈 목록 API는 PR도 함께 돌려주고, since 값은 수정 시각 기준이다. 그래서 PR을 빼고 created_at으로 직접 거른다.
export function countIssuesCreatedSince(items: readonly RawIssue[], sinceMs: number): number {
  return items.filter((item) => item.pull_request === undefined && Date.parse(item.created_at ?? '') >= sinceMs).length;
}

const PAGE_SIZE = 100;
export const RECENT_PAGE_LIMIT = 5;

// 생성 시각 내림차순으로 쪽을 넘기며 센다. stopAbove를 넘으면 더 볼 필요가 없고, 기간 밖의 항목이 나오면 그 뒤는 모두 기간 밖이다.
// 한 쪽만 보면 PR 100건 뒤에 있는 이슈를 놓친다. PR은 누구나 열 수 있어서 그렇게 상한을 피해 갈 수 있다.
// 정해진 쪽수 안에 결론이 나지 않으면 null을 돌려준다. 부르는 쪽은 이것을 상한을 넘은 것과 같게 다룬다.
export async function countRecentIssues(fetchPage: (page: number) => Promise<RawIssue[]>, sinceMs: number, stopAbove: number): Promise<number | null> {
  let count = 0;
  for (let page = 1; page <= RECENT_PAGE_LIMIT; page += 1) {
    const items = await fetchPage(page);
    count += countIssuesCreatedSince(items, sinceMs);
    if (count > stopAbove) return count;
    const last = items.at(-1);
    if (items.length < PAGE_SIZE || !last || Date.parse(last.created_at ?? '') < sinceMs) return count;
  }
  return null;
}

export function createClient(options: { token: string; repository: string; apiUrl?: string; fetch?: typeof fetch }): Client {
  const doFetch = options.fetch ?? fetch;
  const base = `${options.apiUrl ?? 'https://api.github.com'}/repos/${options.repository}`;
  async function request(method: string, path: string, body?: unknown, allowMissing = false): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'issue-triage',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000)
    });
    if (allowMissing && res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API ${method} ${path}: ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
  // 이 권한(issues: write)으로는 이슈를 닫거나 댓글을 고칠 수도 있다. 여기서는 라벨을 붙이고 떼는 호출과 댓글을 다는 호출만 만든다.
  return {
    async getIssue(number) {
      return toIssue(await request('GET', `/issues/${number}`) as RawIssue);
    },
    async recentIssueCount(nowMs, stopAbove) {
      const fetchPage = async (page: number) => await request('GET', `/issues?state=all&sort=created&direction=desc&per_page=${PAGE_SIZE}&page=${page}`) as RawIssue[];
      return countRecentIssues(fetchPage, nowMs - DAY_MS, stopAbove);
    },
    async addLabels(number, labels) {
      await request('POST', `/issues/${number}/labels`, { labels });
    },
    // 이미 떼어진 라벨이면 404가 온다. 재실행에서 흔한 일이라 오류로 보지 않는다.
    async removeLabel(number, label) {
      await request('DELETE', `/issues/${number}/labels/${encodeURIComponent(label)}`, undefined, true);
    },
    async addComment(number, body) {
      await request('POST', `/issues/${number}/comments`, { body });
    }
  };
}
