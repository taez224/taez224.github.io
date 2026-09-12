import { newestFirst } from './dates.ts';

export type DevelopmentCategory = 'Concepts' | 'Troubleshooting' | 'Tools';

interface DevelopmentRecord {
  title: string;
  date: string;
  category: DevelopmentCategory | null;
  tags?: string[];
}

const ROLE_TAGS = new Set(['개발/트러블슈팅', '개발/도구']);

export function technologyTags(tags: readonly string[] = []): string[] {
  return tags.filter((tag) => tag.startsWith('개발/') && !ROLE_TAGS.has(tag)).map((tag) => tag.slice(3));
}

// 개발 노트 목록을 분류별로 나눈다. 분류 이름은 publication.mjs의 developmentCategory가 폴더에서 정하고, 각 분류 안은 최신순이다.
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
