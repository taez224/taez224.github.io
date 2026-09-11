import { newestFirst } from './dates.mjs';

const latestDay = (days) => days.map((day) => String(day ?? '')).filter(Boolean).sort().at(-1) ?? '';

// 연재가 마지막으로 발행한 날. 허브에 손으로 적는 last_published는 새 편을 내고 고치지 않으면 옛 날짜로 남으므로
// 공개된 편의 published에서 계산한다. 편마다 발행일은 선택 값이라 하나도 없으면 빈 문자열이다.
export function lastPublishedOf(posts = []) {
  return latestDay(posts.map((post) => post.published));
}

// 홈에서 권할 연재 하나. 조립 단계가 계산한 lastPublished가 가장 늦은 연재를 고른다.
// 아직 발행일이 있는 편이 없는 연재는 세지 않고, 고를 게 없으면 null을 돌려준다(홈은 그 칸을 그리지 않는다).
export function latestSeries(series = []) {
  return series.filter((item) => item.lastPublished).sort(newestFirst((item) => item.lastPublished))[0] ?? null;
}

// 글 목록의 연도별 장부. 단독 글과 연재를 한 장부에 넣고, 연재는 마지막 편이 나온 해에 한 행으로 둔다.
// 발행일이 없는 단독 글은 날짜별 행에 넣지 않는다. 연재는 편마다 있는 검증된 표시 날짜(published, 없으면 created)로
// 폴백하고, 허브의 started처럼 검증하지 않는 작성 필드로는 폴백하지 않는다.
export function blogLedger({ publications = [], series = [] } = {}) {
  const standalone = publications.flatMap((group) => group.posts).map((post) => ({ kind: 'post', date: post.published, post }));
  const seriesRows = series.map((item) => ({ kind: 'series', date: item.lastPublished || latestDay(item.posts.map((post) => post.date)), series: item }));
  const rows = [...standalone, ...seriesRows].filter((row) => row.date).sort(newestFirst((row) => row.date, (row) => (row.post ?? row.series).title));
  return [...new Set(rows.map((row) => row.date.slice(0, 4)))].map((year) => ({ year, rows: rows.filter((row) => row.date.startsWith(year)) }));
}
