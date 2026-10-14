import type { PublicNote } from './content-model.ts';
import type { seriesNeighbors } from './note-nav.ts';

// 사이드바와 좁은 화면의 연결 판은 같은 목록을 쓴다. 연재에서 이미 보인 글을 참조 목록에 되풀이하지 않는다.
export function noteConnections(outgoing: PublicNote[], incoming: PublicNote[], series: ReturnType<typeof seriesNeighbors>) {
  const inSeries = new Set(series && series.total > 0 ? [series.url, ...series.posts.map(post => post.url)].filter(Boolean) : []);
  return ([{ label: '참조', icon: 'out', items: outgoing }, { label: '역참조', icon: 'in', items: incoming }] as const)
    .map(block => ({ ...block, items: block.items.filter(note => !inSeries.has(note.url)) }))
    .filter(block => block.items.length)
    .map(block => ({ ...block, long: block.items.length > 6 }));
}
