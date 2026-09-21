export interface SearchRecord { title: string; aliases?: string[]; summary?: string; tags?: string[]; headings?: string[]; text?: string; url: string; label: string }

// 한 번에 보여 주는 결과 수. 더 보기를 누르면 이만큼씩 늘어난다.
export const SEARCH_PAGE = 30;

// 자른 결과를 결과가 없는 것으로 오해하지 않도록, 전체 개수와 지금 보이는 개수를 함께 알린다.
export function resultCountLabel(total: number, shown: number): string {
  return shown < total ? `검색 결과 ${total}개 중 ${shown}개 표시` : `검색 결과 ${total}개`;
}

export function normalizeQuery(query: unknown): string[] {
  return String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchRecord(record: SearchRecord, terms: readonly string[]): { score: number; snippet: string } | null {
  if (!terms.length) return null;
  const fields = {
    title: record.title.toLowerCase(),
    aliases: (record.aliases ?? []).join(' ').toLowerCase(),
    summary: (record.summary ?? '').toLowerCase(),
    tags: (record.tags ?? []).join(' ').toLowerCase(),
    headings: (record.headings ?? []).join(' ').toLowerCase(),
    text: (record.text ?? '').toLowerCase()
  };
  const priorities: [keyof typeof fields, number][] = [
    ['title', 8],
    ['aliases', 6],
    ['summary', 4],
    ['headings', 4],
    ['tags', 3],
    ['text', 1]
  ];
  const phraseBonuses = {
    title: 10,
    aliases: 8,
    summary: 6,
    headings: 6,
    tags: 4,
    text: 2
  };
  let score = 0;
  let cut: { source: string; at: number; length: number } | null = null;
  for (const term of terms) {
    const match = priorities.find(([field]) => fields[field].includes(term));
    if (!match) return null;
    score += match[1];
    // priorities는 점수를 매기려고 먼저 걸린 필드 하나만 돌려준다. 그 값만 보면 요약에 있는 말은 본문에서도 찾지 않아
    // 잘라 보일 줄이 만들어지지 않고, 결과 줄에 요약 전체가 앞에서부터 잘린 채 남는다. 그래서 자를 자리는 따로 찾는다.
    // 요약과 본문만 본다. 제목·별칭·태그는 결과 줄에 이미 보이거나 짧아서 자를 것이 없다.
    if (!cut) {
      for (const field of ['summary', 'text'] as const) {
        const at = fields[field].indexOf(term);
        if (at >= 0) { cut = { source: record[field] ?? '', at, length: term.length }; break; }
      }
    }
  }
  if (terms.length > 1) {
    const phrase = terms.join(' ');
    const phraseMatch = priorities.find(([field]) => fields[field].includes(phrase));
    if (phraseMatch) score += phraseBonuses[phraseMatch[0]];
  }
  return { score, snippet: cut ? excerpt(cut.source, cut.at, cut.length) : '' };
}

// 찾은 말을 가운데 두고 앞뒤로 잘라 낸다. 앞 40자는 375px에서 두 줄 가운데 첫 줄에 담기는 분량이라,
// 찾은 말이 둘째 줄 앞머리에 온다. 앞에서부터 자르면 그 말이 화면 밖에 남는다.
const SNIPPET_PAD = 40;
function excerpt(source: string, at: number, length: number): string {
  const start = Math.max(0, at - SNIPPET_PAD);
  const end = Math.min(source.length, at + length + SNIPPET_PAD);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
}

// 결과 줄에서 찾은 말에 표시를 남긴다. 조각을 그대로 HTML로 쓰면 원문이 태그가 되므로,
// 문자열 대신 조각 목록을 돌려주어 부르는 쪽이 조각마다 이스케이프하게 한다.
export function highlightParts(text: string, terms: readonly string[]): { text: string; hit: boolean }[] {
  const lower = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    if (!term) continue;
    for (let at = lower.indexOf(term); at >= 0; at = lower.indexOf(term, at + term.length)) {
      for (let i = at; i < at + term.length; i += 1) marked[i] = true;
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marked[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marked[i] });
  }
  return parts;
}
