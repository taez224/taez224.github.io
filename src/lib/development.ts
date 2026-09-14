import { newestFirst } from './dates.ts';
import { displayTag, publicTags } from './format.ts';

export type DevelopmentCategory = 'Concepts' | 'Troubleshooting' | 'Tools';

interface DevelopmentRecord {
  title: string;
  date: string;
  category: DevelopmentCategory | null;
  tags?: string[];
}

// 도구 활용이 맥락임을 나타내는 조건 태그. vault 스키마가 첫 태그로 쓰지 않도록 정하므로 기술 필터에서는 뺀다.
const CONTEXT_TAGS = new Set(['개발/도구']);

export function technologyTags(tags: readonly string[] = []): string[] {
  return tags.filter((tag) => tag.startsWith('개발/') && !CONTEXT_TAGS.has(tag)).map((tag) => tag.slice(3));
}

// 목록의 첫 칸은 첫 공개 태그다. 어떤 태그가 앞에 오는지는 vault 스키마가 정하고, 사이트는 그 순서를 고쳐 쓰지 않는다.
// 그래서 지도 색을 정하는 topicFor와 같은 근거를 쓰며, 첫 태그가 폴더 분류와 겹치면 그것이 태그를 손볼 신호다.
export function primaryTopicTag(tags: readonly string[] = []): string {
  const tag = publicTags(tags)[0];
  return tag ? displayTag(tag) : '';
}

// 개발 노트 목록을 분류별로 나눈다. 분류 이름은 publication.ts의 developmentCategory가 폴더에서 정하고, 각 분류 안은 최신순이다.
export function groupDevelopment<T extends DevelopmentRecord>(records: readonly T[]): { concepts: T[]; troubleshooting: T[]; tools: T[] } {
  const sorted = [...records].sort(newestFirst());
  return {
    concepts: sorted.filter((record) => record.category === 'Concepts'),
    troubleshooting: sorted.filter((record) => record.category === 'Troubleshooting'),
    tools: sorted.filter((record) => record.category === 'Tools')
  };
}

export function selectDevelopmentRecords<T extends DevelopmentRecord>(records: readonly T[], category: DevelopmentCategory | 'all' = 'all', tag: string = 'all'): T[] {
  return records
    .filter((record) => category === 'all' || record.category === category)
    .filter((record) => tag === 'all' || technologyTags(record.tags).includes(tag))
    .sort(newestFirst());
}
