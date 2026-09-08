// 홈에서 권할 연재 하나. 공개된 마지막 편의 발행일이 가장 늦은 연재를 고른다.
// 아직 한 편도 발행하지 않은 연재는 세지 않고, 고를 게 없으면 null을 돌려준다(홈은 그 칸을 그린다).
export function latestSeries(series = []) {
  const published = (item) => [...item.posts].map((post) => String(post.published ?? '')).filter(Boolean).sort().at(-1) ?? '';
  return series
    .filter((item) => published(item))
    .sort((left, right) => published(right).localeCompare(published(left)) || left.title.localeCompare(right.title, 'ko'))[0] ?? null;
}
