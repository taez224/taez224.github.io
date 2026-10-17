import type { BlogPost } from './blog.ts';

export const RHYTHM_WIDTH = 220;
export const RHYTHM_HEIGHT = 60;
export interface PublishingMonth { month: string; count: number; x: number; y: number }

// 작성일이나 수정일로 대체하지 않고, 첫 발행 월부터 이번 달까지 센다.
// 연재 소개 페이지는 입력에 넣지 않으며, 같은 글이 여러 묶음에 있어도 한 번만 센다.
export function publishingRhythm(posts: readonly Pick<BlogPost, 'path' | 'published'>[], today: string) {
  const [year, month] = today.slice(0, 7).split('-').map(Number);
  const last = year * 12 + month - 1;
  const seen = new Set<string>();
  const published = posts.filter(post => {
    if (!post.published || post.published > today || seen.has(post.path)) return false;
    seen.add(post.path);
    return true;
  });
  if (!published.length) return { months: [], total: 0 };
  const firstDate = published.reduce((first, post) => post.published < first ? post.published : first, published[0].published);
  const [firstYear, firstMonth] = firstDate.slice(0, 7).split('-').map(Number);
  const first = firstYear * 12 + firstMonth - 1;
  const buckets = Array.from({ length: last - first + 1 }, (_, index) => {
    const serial = first + index;
    return { month: `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(2, '0')}`, count: 0 };
  });
  const byMonth = new Map(buckets.map(bucket => [bucket.month, bucket]));
  for (const post of published) {
    const bucket = byMonth.get(post.published.slice(0, 7));
    if (bucket) bucket.count++;
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const maximum = Math.max(1, ...buckets.map(bucket => bucket.count));
  const months: PublishingMonth[] = buckets.map((bucket, index) => ({ ...bucket,
    x: buckets.length === 1 ? RHYTHM_WIDTH / 2 : 5 + index / (buckets.length - 1) * (RHYTHM_WIDTH - 10),
    y: RHYTHM_HEIGHT - 7 - bucket.count / maximum * (RHYTHM_HEIGHT - 16)
  }));
  return { months, total };
}
