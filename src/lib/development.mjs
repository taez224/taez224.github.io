const ROLE_TAGS = new Set(['개발/트러블슈팅', '개발/도구']);

export function technologyTags(tags = []) {
  return tags.filter((tag) => tag.startsWith('개발/') && !ROLE_TAGS.has(tag)).map((tag) => tag.slice(3));
}

export function selectDevelopmentRecords(records, category = 'all', tag = 'all') {
  return records
    .filter((record) => category === 'all' || record.category === category)
    .filter((record) => tag === 'all' || technologyTags(record.tags).includes(tag))
    .sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title, 'ko'));
}
