import { newestFirst } from './dates.ts';
import { addTo } from './links.mjs';

const latestDay = (days) => days.map((day) => String(day ?? '')).filter(Boolean).sort().at(-1) ?? '';

// 연재가 마지막으로 발행한 날. 허브에 손으로 적는 last_published는 새 편을 내고 고치지 않으면 옛 날짜로 남으므로
// 공개된 편의 published에서 계산한다. 편마다 발행일은 선택 값이라 하나도 없으면 빈 문자열이다.
export function lastPublishedOf(posts = []) {
  return latestDay(posts.map((post) => post.published));
}

// 공개된 글을 연재와 발행처로 묶는다. hubs는 연재 허브 레코드(제목이 연재 이름), posts는 status가 published인 글 레코드다.
// 레코드는 조립 단계가 만들어 넘기므로 여기서는 vault를 읽지 않는다. 허브가 없는 연재도 편만으로 만든다.
export function assembleBlog({ hubs = [], posts = [] }) {
  const hubByTitle = new Map(hubs.map((hub) => [hub.title, hub]));
  const seriesNames = [...new Set(posts.map((post) => post.series).filter(Boolean))];
  const series = seriesNames.map((seriesName) => {
    const hub = hubByTitle.get(seriesName);
    const episodes = posts
      .filter((post) => post.series === seriesName)
      .sort((left, right) => left.seriesOrder - right.seriesOrder || left.published.localeCompare(right.published));
    return {
      title: seriesName,
      noteUrl: hub?.url ?? '',
      summary: hub?.summary ?? '',
      status: hub?.status ?? '',
      ended: hub?.ended ?? '',
      // 허브의 last_published와 started는 vault Base가 쓰는 작성 필드다. 사이트는 발행된 편에서 계산해 홈·글 목록이 같은 날짜를 본다.
      lastPublished: lastPublishedOf(episodes),
      posts: episodes
    };
  }).sort(newestFirst((item) => item.lastPublished));

  const byPublication = new Map();
  for (const post of posts.filter((candidate) => !candidate.series)) addTo(byPublication, post.publication || '발행처 미상', post);
  const publications = [...byPublication.entries()]
    .map(([publication, grouped]) => ({ publication, posts: grouped.sort(newestFirst((post) => post.published)) }))
    .sort((left, right) => left.publication.localeCompare(right.publication, 'ko'));

  return {
    series,
    publications,
    stats: { posts: posts.length, series: series.length, standalone: posts.filter((post) => !post.series).length }
  };
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
