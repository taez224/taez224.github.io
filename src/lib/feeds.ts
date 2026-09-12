import { SITE_TITLE } from './site-meta.ts';

// 종류별 피드. 주소는 feeds/<key>.xml. 통합 피드 rss.xml은 세 종류를 몫만큼 섞는다.
import type { NoteKind } from './kinds.ts';

export const FEEDS: Record<string, { kinds: NoteKind[]; title: string; description: string }> = {
  posts: { kinds: ['blog'], title: 'TaeZ · 발행한 글', description: '발행일 순으로 읽는 글. 외부 발행처에서만 읽는 글은 원문으로 연결합니다.' },
  notes: { kinds: ['slipbox'], title: 'TaeZ · 생각 노트', description: '가든에 공개한 생각 노트. 노트의 기록 날짜를 기준으로 정렬합니다.' },
  dev: { kinds: ['development'], title: 'TaeZ · 개발 노트', description: '개발하며 배운 개념과 해결한 문제, 도구 기록. 노트의 기록 날짜를 기준으로 정렬합니다.' }
};

// 통합 피드의 종류별 몫. 글은 발행일, 노트는 기록일이라 시간축이 달라서, 날짜순으로만 합치면 최근 노트가 글을 밀어낸다.
export const UNIFIED_QUOTA = { blog: 10, slipbox: 10, development: 10 };

// 모든 페이지의 <head>에 알리는 피드 목록. 리더가 통합·종류별 중 고를 수 있게 넷을 다 건다.
export const FEED_LINKS = [
  { title: SITE_TITLE, path: '/rss.xml' },
  ...Object.entries(FEEDS).map(([key, feed]) => ({ title: feed.title, path: `/feeds/${key}.xml` }))
];
