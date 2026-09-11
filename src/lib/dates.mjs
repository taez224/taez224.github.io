// 노트 날짜 규칙. 조립 단계가 여기서 한 번 검증하고, 페이지·목록·RSS·OG 카드는 결과를 다시 검사하지 않는다.
// vault-lint(vault의 .agents/skills/vault-lint/scripts/lint_scan.py)가 같은 규칙으로 쓰는 단계에서 먼저 알린다. 규칙을 바꾸면 함께 고친다.
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KST_OFFSET_MS = 9 * 3600000;

// 빌드한 날은 한국 날짜로 센다. CI는 UTC로 돌고, 04:00 KST 예약 빌드는 UTC로 전날 19:00이라 UTC 날짜로 세면 그날 쓴 노트가 미래가 된다.
export function kstDate(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 책의 created처럼 시각이 붙을 수 있는 값에서 날짜만 뽑는다. 책 날짜는 화면에 나오지 않아 검증하지 않는다.
export function dateOnly(value) {
  return String(value ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

// 2026-02-30은 Date가 3월로 넘기거나 거부한다. 되돌린 문자열이 같아야 달력에 있는 날이다.
function isCalendarDay(value) {
  if (!DAY_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function readDate(meta, field, { path, today }) {
  const raw = meta[field];
  // frontmatter 파서는 값 없는 키를 빈 배열로 읽고, null 표기는 null로 읽는다.
  if (raw === null || raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0)) return '';
  const value = String(raw);
  if (typeof raw !== 'string' || !isCalendarDay(value)) throw new Error(`Invalid ${field} date "${value}" in ${path}: use a real YYYY-MM-DD day`);
  // 미래 날짜는 대개 연도 오타다. 예약 발행으로 받지 않고, 공개 시점은 폴더와 status로만 정한다.
  if (value > today) throw new Error(`Future ${field} date ${value} in ${path} (today in Korea: ${today})`);
  return value;
}

// 모든 공개 노트는 published를 우선하고, 없으면 created를 쓴다. updated는 표시 날짜보다 늦을 때만 남긴다.
// 발행 전이나 같은 날 고친 것은 독자에게 수정이 아니므로 오류로 보지 않고 버린다.
export function noteDates(meta, { path, today }) {
  const created = readDate(meta, 'created', { path, today });
  if (!created) throw new Error(`Missing created date in ${path}`);
  const published = readDate(meta, 'published', { path, today });
  const updated = readDate(meta, 'updated', { path, today });
  const date = published || created;
  return { date, published, updated: updated > date ? updated : '' };
}
