import type { PublicNote } from './content-model.ts';
import type { seriesNeighbors } from './note-nav.ts';

// 사이드바와 좁은 화면의 연결 판은 같은 목록을 쓴다. 연재에서 이미 보인 글을 연결 목록에 되풀이하지 않는다.
// 양쪽으로 이어진 글은 "서로 언급"에만 두어 판에서 같은 글이 두 번 나오지 않게 한다. 묶음 이름은 지도 패널과 같다.
export function noteConnections(outgoing: PublicNote[], incoming: PublicNote[], series: ReturnType<typeof seriesNeighbors>) {
  const inSeries = new Set(series && series.total > 0 ? [series.url, ...series.posts.map(post => post.url)].filter(Boolean) : []);
  const out = new Set(outgoing.map(note => note.path));
  const into = new Set(incoming.map(note => note.path));
  const mutual = outgoing.filter(note => into.has(note.path));
  return ([
    { label: '서로 언급한 글', items: mutual },
    { label: '이 글에서 언급한 글', items: outgoing.filter(note => !into.has(note.path)) },
    { label: '이 글을 언급한 글', items: incoming.filter(note => !out.has(note.path)) }
  ] as const)
    .map(block => ({ ...block, items: block.items.filter(note => !inSeries.has(note.url)) }))
    .filter(block => block.items.length);
}
