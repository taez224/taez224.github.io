import fs from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { createMarkdownRenderer, extractNoteTargets, headingTextForId, headingId, stripObsidianComments } from './markdown.mjs';
import { developmentCategory, externalPublicationFor, pathMatches, isExcluded as excludedByPolicy, isIncluded as includedByPolicy, validatePublicationConfig } from './publication.mjs';
import { isImagePath } from './image-types.mjs';
import { coverUrl } from './books.mjs';
import { selectGraphNodes } from '../graph/select.mjs';
import { slugFor, slugify, kindPrefix, noteUrl, assertUniqueSlugs } from './slug.mjs';
import { plainText } from './text.mjs';
import { publicTags, cleanTitle } from './format.mjs';
import { dateOnly, kstDate, newestFirst, noteDates } from './dates.mjs';
import { lastPublishedOf } from './blog.mjs';

const normalize = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '');

const isMarkdown = (name) => name.endsWith('.md');

async function walk(directory, accept = () => true) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute, accept));
    else if (entry.isFile() && accept(entry.name)) files.push(absolute);
  }
  return files;
}

// 폴더 자체가 없을 때만 null을 돌려준다. 권한 오류나 파일을 폴더로 잘못 적은 경우까지 건너뛰면
// 하위 폴더 하나 때문에 공개 폴더 전체가 조용히 사이트에서 빠진다.
async function walkIfPresent(directory, accept) {
  try {
    return await walk(directory, accept);
  } catch (error) {
    if (error.code === 'ENOENT' && error.path === directory) return null;
    throw error;
  }
}

export function parseFrontmatter(source) {
  if (!source.startsWith('---')) return { body: source, meta: {} };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { body: source, meta: {} };

  const frontmatter = source.slice(3, end).replace(/^\n/, '');
  const meta = {};
  let activeListKey = null;
  const parseValue = (rawValue) => {
    const value = String(rawValue ?? '').trim();
    if (value === 'null' || value === '~') return null;
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    return quoted ? quoted[2] : value;
  };
  for (const line of frontmatter.split('\n')) {
    const listItem = line.match(/^\s*-\s*(.*?)\s*$/);
    if (activeListKey && listItem) {
      meta[activeListKey] ??= [];
      const value = parseValue(listItem[1]);
      if (value !== null && value !== '') meta[activeListKey].push(value);
      continue;
    }
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    if (rawValue.trim() === '') {
      activeListKey = key;
      meta[key] = [];
      continue;
    }
    activeListKey = null;
    meta[key] = parseValue(rawValue);
  }
  return { body: source.slice(end + 4), meta };
}

function firstHeading(body, fallback) {
  const heading = body.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

// 목차·검색용 헤딩. 개수 제한은 두지 않는다(사이드바가 스크롤한다). 제목의 굵게·코드·위키링크 표시는 지운다.
// 본문 흐름의 헤딩만 센다. 인용·콜아웃·목록 안의 헤딩(token.level > 0)은 인용한 남의 글이라 목차에 넣지 않는다.
// 렌더러도 같은 규칙으로 id를 매기므로 목차 id와 실제 id가 어긋나지 않는다.
const contentParser = new MarkdownIt({ html: true });
function bodyHeadings(body) {
  const tokens = contentParser.parse(body, {});
  return tokens.flatMap((token, index) => token.type === 'heading_open' && token.level === 0
    ? [{ start: token.map[0], end: token.map[1], level: Number(token.tag.slice(1)), text: tokens[index + 1].content.trim() }]
    : []);
}

export function headingsFor(body) {
  const headingIds = new Map();
  const headings = [];
  for (const { text, level } of bodyHeadings(stripObsidianComments(body))) {
    const id = headingId(headingIds, text);
    if (level >= 2 && level <= 4) headings.push({ id, level, title: headingTextForId(text) });
  }
  return headings;
}

function excerpt(body) {
  const withoutHeadings = String(body ?? '').replace(/^#{1,6}\s+.+$/gm, ' ');
  const cleaned = plainText(withoutHeadings, { includeCodeBlocks: false });
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 220).replace(/\s+\S*$/, '')}…`;
}

// 노트 한 편의 요약 규칙. 목록·카드·노트 엔트리가 모두 이 함수를 부른다.
// 외부 발행 글은 원문을 옮기지 않기로 했으므로 명시 요약만 쓰고, 없으면 요약을 비운다.
function summaryFor(note, { kind = '', contentMode = 'full' } = {}) {
  const explicit = explicitSummary(note);
  if (contentMode === 'external') return explicit;
  if (kind === 'blog' && note.meta.type === 'series') return explicit || sectionExcerpt(note.publicContent, ['연재 목적', '시리즈 소개']) || excerpt(note.publicContent);
  return explicit || excerpt(note.publicContent);
}

// frontmatter의 tags. 목록이 아니면 빈 배열로 본다.
function tagList(meta) {
  return Array.isArray(meta.tags) ? meta.tags : [];
}

function explicitSummary(note) {
  return String(note.meta.summary ?? '').trim();
}

function sectionExcerpt(body, sectionNames) {
  const wanted = sectionNames.map((name) => name.toLowerCase());
  const headings = bodyHeadings(body).filter((heading) => heading.level <= 2);
  const index = headings.findIndex((heading) => heading.level === 2 && wanted.includes(heading.text.toLowerCase()));
  if (index < 0) return '';
  return excerpt(body.split('\n').slice(headings[index].end, headings[index + 1]?.start).join('\n'));
}

// 지도에서 노드가 이보다 적은 주제는 색과 영역을 기타로 접는다. 범례가 길어지고 팔레트가 바닥나는 걸 막는다. 원래 주제는 topicTag에 남는다.
const MIN_TOPIC_NODES = 3;

function topicFor(tags) {
  const topic = publicTags(tags).find(Boolean);
  return topic ? topic.split('/')[0] : '기타';
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function bookTier(rate) {
  return ({ 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D' })[Math.floor(rate)] ?? '미분류';
}

function kindFor(relativePath) {
  if (relativePath.startsWith('01_Slipbox/')) return 'slipbox';
  if (relativePath.startsWith('20_Projects/blog/')) return 'blog';
  return 'development';
}

function publicUrl(value, fallback) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}

function stripLinkTarget(rawTarget) {
  return rawTarget.split('|')[0].split('#')[0].trim().replace(/^!/, '');
}

// 같은 열쇠에 값을 모은다. 붙일 때마다 배열을 통째로 복사하지 않는다.
function addTo(map, key, value) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

// 경로를 소문자 파일명으로 묶은 색인. 위키 링크가 폴더를 안 밝힐 때 후보를 찾는 데 쓴다.
function indexByBasename(paths) {
  const index = new Map();
  for (const relativePath of paths) addTo(index, path.posix.basename(relativePath).toLowerCase(), relativePath);
  return index;
}

function resolveTarget(sourcePath, rawTarget, byPath, byBasename, preferred = null) {
  const target = stripLinkTarget(rawTarget);
  if (!target || target.startsWith('http://') || target.startsWith('https://')) return null;
  const sourceDirectory = path.posix.dirname(sourcePath);
  const withExtension = target.endsWith('.md') ? target : `${target}.md`;
  const relativeCandidate = normalize(path.posix.join(sourceDirectory, withExtension));
  if (byPath.has(relativeCandidate)) return relativeCandidate;
  const rootCandidate = normalize(withExtension);
  if (byPath.has(rootCandidate)) return rootCandidate;
  const basename = path.posix.basename(withExtension).toLowerCase();
  const matches = byBasename.get(basename) ?? [];
  if (matches.length === 1) return matches[0];
  // 이름이 겹치면 공개 노트를 먼저 고른다. 같은 이름의 초안이 생겨도 공개 노트의 링크가 평문으로 떨어지지 않는다.
  const preferredMatches = preferred ? matches.filter((item) => preferred.has(item)) : [];
  return preferredMatches.length === 1 ? preferredMatches[0] : null;
}

function noteTargets(body, related = []) {
  const targets = new Set(extractNoteTargets(body));
  for (const value of Array.isArray(related) ? related : []) {
    const target = typeof value === 'string' ? value.trim().match(/^\[\[([^\]\n]+)\]\]$/)?.[1] : null;
    if (target) targets.add(target);
  }
  return [...targets];
}

// 링크 문법은 한 번만 해석하고, 전체 공개 목록과 그래프 후보에 맞춰 각각 대상을 찾는다.
function resolveTargets(sourcePath, targets, byPath, byBasename) {
  return [...new Set(targets.map((target) => resolveTarget(sourcePath, target, byPath, byBasename)).filter(Boolean))];
}

function stripLeadingTitle(body) {
  return String(body ?? '').replace(/^\s*#\s+.+(?:\r?\n){1,2}/, '');
}

// 저자만 보는 절. vault 원문은 그대로 두고 사이트로 나가는 사본에서만 제목과 그 아래 내용을 뺀다.
// 연재 허브의 "운영 메모"가 frontmatter·정본 같은 작업 용어를 독자에게 보여주고 있었다. 절 이름을 여기 늘리면 함께 빠진다.
const AUTHOR_ONLY_SECTIONS = ['운영 메모'];
// 절의 끝은 다음 헤딩이다. 코드 블록 안의 `# 주석` 줄은 헤딩이 아니므로 펜스 안에서는 헤딩을 보지 않는다.
function stripAuthorSections(body) {
  const lines = body.split('\n'), kept = [];
  const headings = bodyHeadings(body);
  let start = 0;
  for (const [index, heading] of headings.entries()) {
    if (!AUTHOR_ONLY_SECTIONS.includes(heading.text)) continue;
    kept.push(...lines.slice(start, heading.start));
    start = headings[index + 1]?.start ?? lines.length;
  }
  return [...kept, ...lines.slice(start)].join('\n');
}

function publicBody(body) {
  return stripAuthorSections(stripLeadingTitle(stripObsidianComments(body)));
}

// today는 미래 날짜 검사의 기준일이다. 테스트가 날짜를 고정할 수 있게 인자로 받는다.
export async function assembleGarden({ vaultRoot, config, basePath = '', today = kstDate() }) {
  validatePublicationConfig(config);
  const base = String(basePath).replace(/\/$/, '');
  const isExcluded = (relativePath) => excludedByPolicy(config, relativePath);
  const isIncluded = (relativePath, meta) => includedByPolicy(config, relativePath, meta);

  // 글 목록·개발 노트 목록·공개 엔트리가 같은 노트를 각자 계산하지 않도록, 공통 필드는 노트마다 한 번만 만든다.
  const baseRecords = new Map();
  function baseRecord(relativePath, note) {
    if (baseRecords.has(relativePath)) return baseRecords.get(relativePath);
    const fileTitle = path.posix.basename(relativePath, '.md');
    const kind = kindFor(relativePath);
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    const externalPublisher = externalPublicationFor(config, relativePath, note.meta);
    const contentMode = externalPublisher ? 'external' : 'full';
    const tags = tagList(note.meta);
    const dates = noteDates(note.meta, { path: relativePath, today });
    const record = {
      path: relativePath,
      fileTitle,
      title,
      displayTitle: title,
      kind,
      category: kind === 'development' ? developmentCategory(relativePath) : null,
      url: siteUrl(relativePath),
      publishedUrl: kind === 'blog' ? publicUrl(note.meta.source, '') : '',
      publication: String(note.meta.publication ?? ''),
      published: dates.published,
      contentMode,
      externalPublisher,
      status: String(note.meta.status ?? ''),
      type: String(note.meta.type ?? ''),
      tags,
      date: dates.date,
      // 외부 발행 글은 본문을 싣지 않아 독자가 무엇이 고쳐졌는지 볼 수 없다.
      updated: contentMode === 'external' ? '' : dates.updated,
      summary: summaryFor(note, { kind, contentMode }),
      summaryIsExplicit: Boolean(explicitSummary(note))
    };
    baseRecords.set(relativePath, record);
    return record;
  }

  function blogRecord(relativePath, note) {
    const base = baseRecord(relativePath, note);
    return { ...base, series: String(note.meta.series ?? ''), seriesOrder: numberValue(note.meta.series_order) };
  }

  const candidateFiles = new Map();
  // 공개 후보를 읽는 동안 파일 존재 여부만 기록한다. 비공개 본문·메타는 출력하지 않는다.
  const knownNotePaths = new Set();
  for (const include of config.include) {
    const files = await walkIfPresent(path.join(vaultRoot, include.path), isMarkdown);
    if (!files) {
      console.warn(`Skipped missing include path: ${include.path}`);
      continue;
    }
    for (const absoluteFile of files) {
      const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
      knownNotePaths.add(relativePath);
      const source = await fs.readFile(absoluteFile, 'utf8');
      const parsed = parseFrontmatter(source);
      if (isIncluded(relativePath, parsed.meta)) {
        const publicContent = publicBody(parsed.body);
        candidateFiles.set(relativePath, { ...parsed, publicContent, linkTargets: noteTargets(publicContent, parsed.meta.related) });
      }
    }
  }

  // 연재 허브는 type이 series라 글의 status와 상관없이 후보로 들어온다. 한 편도 발행하지 않은 연재까지
  // 페이지·사이트맵·검색에 올라가 독자가 집필 계획서에 닿는다. 발행한 편이 생기면 저절로 풀린다.
  const publishedSeriesNames = new Set(
    [...candidateFiles]
      .filter(([, note]) => note.meta.status === 'published' && String(note.meta.series ?? '').trim())
      .map(([, note]) => String(note.meta.series).trim())
  );
  for (const [relativePath, note] of [...candidateFiles]) {
    if (kindFor(relativePath) !== 'blog' || note.meta.type !== 'series') continue;
    const seriesName = String(note.meta.title ?? firstHeading(note.body, path.posix.basename(relativePath, '.md'))).trim();
    if (!publishedSeriesNames.has(seriesName)) {
      candidateFiles.delete(relativePath);
      console.warn(`Series has no published post yet, kept off the site: ${relativePath}`);
    }
  }

  for (const [relativePath, note] of candidateFiles) {
    const category = developmentCategory(relativePath);
    if ((category === 'Concepts' || category === 'Troubleshooting') && !String(note.meta.summary ?? '').trim()) {
      throw new Error(`Missing required summary for public ${category} note: ${relativePath}`);
    }
  }

  const slugByPath = new Map();
  for (const [relativePath, note] of candidateFiles) {
    const fileTitle = path.posix.basename(relativePath, '.md');
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    slugByPath.set(relativePath, slugFor(note.meta, title));
  }
  assertUniqueSlugs([...slugByPath].map(([relativePath, slug]) => ({ kind: kindFor(relativePath), slug, path: relativePath })));
  function siteUrl(relativePath, fragment = '') {
    return noteUrl(base, kindFor(relativePath), slugByPath.get(relativePath), fragment);
  }

  const graphCandidateFiles = new Map([...candidateFiles].filter(([relativePath]) => {
    const rule = config.include.find((entry) => pathMatches(relativePath, entry.path));
    return rule?.graph !== false;
  }));

  const blogHubRecords = new Map();
  for (const [relativePath, note] of candidateFiles) {
    if (kindFor(relativePath) !== 'blog' || note.meta.type !== 'series') continue;
    const record = blogRecord(relativePath, note);
    blogHubRecords.set(record.title, { ...record, ended: String(note.meta.ended ?? '') });
  }

  const publishedBlogPosts = [...candidateFiles]
    .filter(([relativePath, note]) => kindFor(relativePath) === 'blog' && note.meta.status === 'published')
    .map(([relativePath, note]) => blogRecord(relativePath, note));

  const blogSeriesNames = [...new Set(publishedBlogPosts.map((post) => post.series).filter(Boolean))];
  const blogSeries = blogSeriesNames.map((seriesName) => {
    const hub = blogHubRecords.get(seriesName);
    const posts = publishedBlogPosts
      .filter((post) => post.series === seriesName)
      .sort((left, right) => left.seriesOrder - right.seriesOrder || left.published.localeCompare(right.published));
    return {
      title: seriesName,
      noteUrl: hub?.url ?? '',
      summary: hub?.summary ?? '',
      status: hub?.status ?? '',
      ended: hub?.ended ?? '',
      // 허브의 last_published와 started는 vault Base가 쓰는 작성 필드다. 사이트는 발행된 편에서 계산해 홈·글 목록이 같은 날짜를 본다.
      lastPublished: lastPublishedOf(posts),
      posts
    };
  }).sort(newestFirst((series) => series.lastPublished));

  const standaloneByPublication = new Map();
  for (const post of publishedBlogPosts.filter((candidate) => !candidate.series)) {
    const publication = post.publication || '발행처 미상';
    addTo(standaloneByPublication, publication, post);
  }
  const blogPublications = [...standaloneByPublication.entries()]
    .map(([publication, posts]) => ({
      publication,
      posts: posts.sort(newestFirst((post) => post.published))
    }))
    .sort((left, right) => left.publication.localeCompare(right.publication, 'ko'));

  const blog = {
    series: blogSeries,
    publications: blogPublications,
    stats: {
      posts: publishedBlogPosts.length,
      series: blogSeries.length,
      standalone: publishedBlogPosts.filter((post) => !post.series).length
    }
  };

  const developmentRecords = [...candidateFiles]
    .filter(([relativePath]) => kindFor(relativePath) === 'development')
    .map(([relativePath, note]) => baseRecord(relativePath, note))
    .sort(newestFirst());

  const development = {
    concepts: developmentRecords.filter((record) => record.category === 'Concepts'),
    troubleshooting: developmentRecords.filter((record) => record.category === 'Troubleshooting'),
    tools: developmentRecords.filter((record) => record.category === 'Tools')
  };

  const byBasename = indexByBasename(graphCandidateFiles.keys());

  const allEdges = [];
  for (const [relativePath, note] of graphCandidateFiles) {
    for (const target of resolveTargets(relativePath, note.linkTargets, graphCandidateFiles, byBasename)) {
      allEdges.push({ source: relativePath, target });
    }
  }

  const books = [];
  const booksDirectory = path.join(vaultRoot, '30_Resources/References/Books');
  const bookFiles = await walkIfPresent(booksDirectory, isMarkdown);
  if (!bookFiles) console.warn('Skipped missing books directory');
  for (const absoluteFile of bookFiles ?? []) {
    const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
    if (path.posix.basename(relativePath).startsWith('_')) continue;
    const source = await fs.readFile(absoluteFile, 'utf8');
    const parsed = parseFrontmatter(source);
    const rate = numberValue(parsed.meta.my_rate);
    const author = Array.isArray(parsed.meta.author)
      ? parsed.meta.author.join(', ')
      : String(parsed.meta.author ?? '');
    books.push({
      path: relativePath,
      fileTitle: path.posix.basename(relativePath, '.md'),
      title: String(parsed.meta.title ?? firstHeading(parsed.body, path.posix.basename(relativePath, '.md'))),
      slug: slugify(path.posix.basename(relativePath, '.md')),
      url: `${base}/books/#book-${slugify(path.posix.basename(relativePath, '.md'))}`,
      author,
      publisher: String(parsed.meta.publisher ?? ''),
      category: String(parsed.meta.category ?? ''),
      publishDate: String(parsed.meta.publish_date ?? ''),
      coverUrl: coverUrl(parsed.meta.cover_url),
      status: String(parsed.meta.status ?? ''),
      startDate: String(parsed.meta.start_read_date ?? ''),
      finishDate: String(parsed.meta.finish_read_date ?? ''),
      rate,
      tier: bookTier(rate),
      note: String(parsed.meta.book_note ?? ''),
      created: dateOnly(parsed.meta.created)
    });
  }
  const newestCreated = newestFirst((book) => book.created);
  books.sort((left, right) => right.rate - left.rate || newestCreated(left, right));
  assertUniqueSlugs(books.map((book) => ({ kind: 'book', slug: book.slug, path: book.path })));

  function publicEntry(relativePath, note) {
    const base = baseRecord(relativePath, note);
    const publicContent = note.publicContent;
    const bodyText = base.contentMode === 'external' ? '' : plainText(publicContent);
    return {
      ...base,
      isEntry: relativePath === config.entry,
      aliases: stringList(note.meta.aliases),
      slug: slugByPath.get(relativePath),
      publicTags: publicTags(base.tags),
      bodyText,
      // 한국어 평균 읽기 속도 분당 600자 기준. 리더 메타 줄의 "N분".
      readingMinutes: base.contentMode === 'external' ? 0 : Math.max(1, Math.round([...bodyText].length / 600)),
      topic: topicFor(base.tags),
      headings: base.contentMode === 'external' ? [] : headingsFor(publicContent),
      publicContent
    };
  }

  const publicEntries = new Map(
    [...candidateFiles].map(([relativePath, note]) => [relativePath, publicEntry(relativePath, note)])
  );
  // 책은 링크 해석에서 "공개된 책"으로 알아보기만 한다. 링크와 참조 간선은 책을 건너뛰고 노트 목록과 지도에도
  // 넣지 않으므로 본문·목차·요약은 만들지 않는다.
  for (const book of books) publicEntries.set(book.path, { path: book.path, kind: 'book' });

  for (const relativePath of publicEntries.keys()) knownNotePaths.add(relativePath);
  const knownByBasename = indexByBasename(knownNotePaths);
  const publicByBasename = indexByBasename(publicEntries.keys());

  const publicAssetPaths = new Set();
  // General vault attachments are available only after explicit review.
  for (const asset of config.assets ?? []) {
    const info = await fs.stat(path.join(vaultRoot, asset));
    if (!info.isFile()) throw new Error(`Reviewed asset is not a file: ${asset}`);
    publicAssetPaths.add(asset);
  }
  // 없는 폴더는 위의 Markdown 탐색이 이미 경고했다.
  for (const include of config.include) {
    for (const absoluteFile of (await walkIfPresent(path.join(vaultRoot, include.path))) ?? []) {
      const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
      if (!relativePath.endsWith('.md') && !isExcluded(relativePath)) publicAssetPaths.add(relativePath);
    }
  }
  for (const absoluteFile of (await walkIfPresent(booksDirectory)) ?? []) {
    const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
    if (!relativePath.endsWith('.md') && !isExcluded(relativePath)) publicAssetPaths.add(relativePath);
  }

  const publicAssetsByBasename = indexByBasename(publicAssetPaths);

  const assetCopies = new Map();

  function resolvePublicAsset(sourcePath, rawTarget, { copy = true } = {}) {
    const target = String(rawTarget ?? '').split('#')[0].trim();
    if (/^(?:https?:)?\/\//i.test(target)) return { url: target };
    if (!target || !isImagePath(target)) return null;
    const cleanTarget = target.replace(/^\//, '');
    const candidates = [
      normalize(path.posix.join(path.posix.dirname(sourcePath), cleanTarget)),
      normalize(cleanTarget)
    ];
    let assetPath = candidates.find((candidate) => publicAssetPaths.has(candidate));
    if (!assetPath) {
      const matches = publicAssetsByBasename.get(path.posix.basename(cleanTarget).toLowerCase()) ?? [];
      if (matches.length === 1) assetPath = matches[0];
    }
    if (!assetPath) return null;
    const destination = `assets/vault/${assetPath.split('/').map(encodeURIComponent).join('/')}`;
    if (copy) assetCopies.set(assetPath, destination);
    return { url: `${base}/${destination}`, sourcePath: assetPath };
  }

  function resolvePublicNote(sourcePath, rawTarget, fragment = '') {
    const target = String(rawTarget ?? '').trim();
    const resolved = target === sourcePath
      ? sourcePath
      : resolveTarget(sourcePath, target, knownNotePaths, knownByBasename, publicEntries);
    if (!resolved) return null;
    if (!publicEntries.has(resolved)) return { visibility: 'private' };
    const entry = publicEntries.get(resolved);
    if (entry.kind === 'book') return null;
    return { title: entry.displayTitle || entry.title, url: siteUrl(resolved, entry.contentMode === 'external' ? '' : fragment) };
  }

  const renderMarkdown = createMarkdownRenderer({
    resolveAsset: resolvePublicAsset,
    resolveNote: resolvePublicNote
  });

  const allPublicEdges = [];
  for (const [relativePath, note] of candidateFiles) {
    for (const target of resolveTargets(relativePath, note.linkTargets, publicEntries, publicByBasename)) {
      if (publicEntries.get(target)?.kind === 'book') continue;
      allPublicEdges.push({ source: relativePath, target });
    }
  }

  const outgoingByPath = new Map();
  const incomingByPath = new Map();
  for (const edge of allPublicEdges) {
    addTo(outgoingByPath, edge.source, edge.target);
    addTo(incomingByPath, edge.target, edge.source);
  }
  const notes = [...publicEntries.values()]
    .filter((entry) => entry.kind !== 'book')
    .map(({ publicContent, ...entry }) => {
      const meta = candidateFiles.get(entry.path)?.meta ?? {};
      const reference = String(meta.thumbnail ?? '').trim();
      let thumbnail = null;
      if (reference) {
        const target = reference.match(/^!?\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/)?.[1] ?? reference;
        thumbnail = resolvePublicAsset(entry.path, target, { copy: false })?.sourcePath ?? null;
        if (!thumbnail) throw new Error(`Missing or unreviewed thumbnail for ${entry.path}: ${reference}`);
      }
      const thumbnailStyle = String(meta.thumbnail_style ?? 'plain');
      if (!['plain', 'soft'].includes(thumbnailStyle)) throw new Error(`Unknown thumbnail_style for ${entry.path}: ${thumbnailStyle}`);
      const articleCards = [];
      const bodyHtml = entry.contentMode === 'external' ? '' : renderMarkdown(entry.path, publicContent, { articleCards });
      return {
        ...entry,
        thumbnail,
        thumbnailStyle,
        articleCards,
        bodyHtml,
        outgoing: outgoingByPath.get(entry.path) ?? [],
        incoming: incomingByPath.get(entry.path) ?? []
      };
    });

  // graphRule "linked" 폴더의 노트는 지도에서 종점이다. 자세한 규칙은 selectGraphNodes에 있다.
  const linkedOnlyRoots = config.include.filter((rule) => rule.graphRule === 'linked').map((rule) => rule.path);
  const { paths: selectedPaths, degree } = selectGraphNodes({
    candidates: new Set(graphCandidateFiles.keys()),
    edges: allEdges,
    isEndpoint: (item) => linkedOnlyRoots.some((root) => pathMatches(item, root))
  });
  const selectedSet = new Set(selectedPaths);

  const nodes = selectedPaths.map((relativePath) => {
    const entry = publicEntries.get(relativePath);
    return {
      id: relativePath,
      title: entry.title,
      displayTitle: cleanTitle(entry.displayTitle),
      slug: entry.slug,
      mapKey: `${kindPrefix(entry.kind)}/${entry.slug}`,
      path: relativePath,
      url: entry.url,
      kind: entry.kind,
      status: entry.status,
      type: entry.type,
      isEntry: Boolean(entry.isEntry),
      tags: entry.tags,
      topic: entry.topic,
      date: entry.date,
      summary: entry.summary,
      summaryIsExplicit: entry.summaryIsExplicit,
      headings: entry.headings,
      excerpt: entry.summary,
      degree: degree.get(relativePath) ?? 0
    };
  }).sort((left, right) => left.title.localeCompare(right.title, 'ko'));

  const edges = allEdges.filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target));
  // 주제 접기: 지도 노드 수 기준. 노트(리더의 점·레일)도 같은 규칙을 따라 사이트 어디서든 한 노트의 색이 하나다.
  const minTopicNodes = Number(config.minTopicNodes ?? MIN_TOPIC_NODES);
  const topicCounts = new Map();
  for (const node of nodes) topicCounts.set(node.topic, (topicCounts.get(node.topic) ?? 0) + 1);
  const topicFold = Object.fromEntries([...topicCounts].filter(([topic, count]) => topic !== '기타' && count < minTopicNodes).map(([topic]) => [topic, '기타']));
  for (const node of nodes) { node.topicTag = node.topic; node.topic = topicFold[node.topic] ?? node.topic; }
  for (const note of notes) { note.topicTag = note.topic; note.topic = topicFold[note.topic] ?? note.topic; }

  return {
    home: {
      featured: (config.home?.featured || []).filter((notePath) => notes.some((note) => note.path === notePath)),
      contacts: config.home?.contacts || [],
      about: String(config.home?.about ?? '')
    },
    notes, nodes, edges, noteEdges: allPublicEdges, blog, development, books, topicFold,
    stats: {
      candidates: graphCandidateFiles.size, nodes: nodes.length, edges: edges.length,
      blogPosts: blog.stats.posts, blogSeries: blog.stats.series, developmentNotes: developmentRecords.length
    },
    assetCopies
  };
}
