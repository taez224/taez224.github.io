import { getGarden } from '../../lib/get-garden.mjs';
import { feedEntries, renderFeed } from '../../lib/rss.mjs';

const feeds = {
  posts: { kinds: ['blog'], title: 'TaeZ · 발행한 글', description: '발행일 순으로 읽는 글. 외부 발행처에서만 읽는 글은 원문으로 연결합니다.' },
  notes: { kinds: ['slipbox'], title: 'TaeZ · 생각 노트', description: '가든에 공개한 생각 노트. 노트의 기록 날짜를 기준으로 정렬합니다.' },
  dev: { kinds: ['development'], title: 'TaeZ · 개발 노트', description: '개발하며 배운 개념과 해결한 문제, 도구 기록. 노트의 기록 날짜를 기준으로 정렬합니다.' },
};

export const prerender = true;
export function getStaticPaths() {
  return Object.keys(feeds).map(kind => ({ params: { kind } }));
}

export async function GET({ site, params }) {
  const garden = await getGarden();
  return new Response(renderFeed(feedEntries(garden), {
    site,
    basePath: garden.config.basePath,
    feedPath: `feeds/${params.kind}.xml`,
    ...feeds[params.kind],
  }), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
