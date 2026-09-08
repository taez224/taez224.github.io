import fs from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { createMarkdownRenderer, slugifyHeading, stripInlineMarkup } from './markdown.mjs';
import { developmentCategory, externalPublicationFor, pathMatches, isExcluded as excludedByPolicy, isIncluded as includedByPolicy, validatePublicationConfig } from './publication.mjs';
import { isImagePath } from './image-types.mjs';
import { selectGraphNodes } from '../graph/select.mjs';
import { slugFor, slugify, kindPrefix, noteUrl, assertUniqueSlugs } from './slug.mjs';
import { plainText } from './text.mjs';
import { publicTags, cleanTitle } from './format.mjs';

const toPosix = (value) => value.split(path.sep).join('/');
const normalize = (value) => toPosix(value).replace(/^\.\//, '').replace(/\\/g, '/');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
  }
  return files;
}

async function walkAll(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkAll(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function parseFrontmatter(source) {
  if (!source.startsWith('---')) return { body: source, meta: {} };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { body: source, meta: {} };

  const frontmatter = source.slice(3, end).replace(/^\n/, '');
  const meta = {};
  let activeListKey = null;
  for (const line of frontmatter.split('\n')) {
    const listItem = line.match(/^\s*-\s*["']?(.*?)["']?\s*$/);
    if (activeListKey && listItem) {
      meta[activeListKey] ??= [];
      meta[activeListKey].push(listItem[1]);
      continue;
    }
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    if (!rawValue) {
      activeListKey = key;
      meta[key] = [];
      continue;
    }
    activeListKey = null;
    meta[key] = rawValue.replace(/^['"]|['"]$/g, '');
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
const headingParser = new MarkdownIt({ html: true });
export function headingsFor(body) {
  const headingIds = new Map();
  const tokens = headingParser.parse(String(body ?? ''), {}), headings = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'heading_open' || tokens[index].level !== 0) continue;
    const title = stripInlineMarkup(tokens[index + 1].content.trim());
    const baseId = slugifyHeading(title), level = Number(tokens[index].tag.slice(1));
    const count = (headingIds.get(baseId) ?? 0) + 1;
    headingIds.set(baseId, count);
    if (level >= 2 && level <= 4) headings.push({ id: count === 1 ? baseId : `${baseId}-${count}`, level, title });
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
  if (kind === 'blog' && note.meta.type === 'series') return explicit || sectionExcerpt(note.body, ['연재 목적', '시리즈 소개']) || excerpt(note.body);
  return explicit || excerpt(note.body);
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
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)];
  const heading = headings.find((match) => wanted.includes(match[1].trim().toLowerCase()));
  if (!heading || heading.index === undefined) return '';
  const contentStart = heading.index + heading[0].length;
  const rest = body.slice(contentStart);
  const nextHeading = rest.search(/^##\s+/m);
  const content = nextHeading < 0 ? rest : rest.slice(0, nextHeading);
  return excerpt(content);
}

// 지도에서 노드가 이보다 적은 주제는 색과 영역을 기타로 접는다. 범례가 길어지고 팔레트가 바닥나는 걸 막는다. 원래 주제는 topicTag에 남는다.
export const MIN_TOPIC_NODES = 3;

function topicFor(tags) {
  const topic = tags.find((tag) => tag !== 'slipbox');
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

function firstDate(meta) {
  const value = [meta.published, meta.created, meta.date].find(Boolean);
  return String(value ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

function kindFor(relativePath) {
  if (relativePath.startsWith('01_Slipbox/')) return 'slipbox';
  if (relativePath.startsWith('20_Projects/blog/')) return 'blog';
  return 'development';
}

function displayTitleFor(relativePath, title) {
  return title;
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

function extractTargets(sourcePath, body, byPath, byBasename) {
  const targets = new Set();
  for (const match of body.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    const resolved = resolveTarget(sourcePath, match[1], byPath, byBasename);
    if (resolved) targets.add(resolved);
  }
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+\.md(?:#[^)]*)?)\)/g)) {
    const resolved = resolveTarget(sourcePath, match[1], byPath, byBasename);
    if (resolved) targets.add(resolved);
  }
  return [...targets];
}

function stripLeadingTitle(body) {
  return String(body ?? '').replace(/^\s*#\s+.+(?:\r?\n){1,2}/, '');
}

// 연재 글의 "연결된 노트" 절에서 "- [[…]] - 이전 글/다음 글" 줄을 뺀다. 리더가 연재 내비를 따로 그리므로 본문에서는 중복이다.
// 간선은 원문에서 뽑으므로 로컬 그래프와 참조 목록에는 그대로 남는다. 줄을 빼서 절이 비면 제목도 뺀다.
function stripSeriesLinks(body) {
  const withoutLines = String(body ?? '').replace(/^[ \t]*[-*+][ \t]+.*(?:이전|다음) 글[ \t]*(?:\r?\n|(?![\s\S]))/gm, '');
  return withoutLines.replace(/^#{1,6}[ \t]+연결된 노트[ \t]*(?:\r?\n[ \t]*)*(?=#{1,6}[ \t]|(?![\s\S]))/gm, '');
}

function publicBody(kind, body) {
  return stripLeadingTitle(kind === 'blog' ? stripSeriesLinks(body) : body);
}

export async function assembleGarden({ vaultRoot, config, basePath = '' }) {
  validatePublicationConfig(config);
  const base = String(basePath).replace(/\/$/, '');
  const isExcluded = (relativePath) => excludedByPolicy(config, relativePath);
  const isIncluded = (relativePath, meta) => includedByPolicy(config, relativePath, meta);

  // 외부 발행 판정은 글 목록과 노트 엔트리가 같이 쓴다. 노트마다 한 번만 판정해 두 목록이 갈라지지 않게 한다.
  const publicationVerdicts = new Map();
  function publicationFor(relativePath, note) {
    if (!publicationVerdicts.has(relativePath)) {
      const externalPublisher = externalPublicationFor(config, relativePath, note.meta);
      publicationVerdicts.set(relativePath, { externalPublisher, contentMode: externalPublisher ? 'external' : 'full' });
    }
    return publicationVerdicts.get(relativePath);
  }

  function blogRecord(relativePath, note) {
    const fileTitle = path.posix.basename(relativePath, '.md');
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    const publishedUrl = publicUrl(note.meta.source, '');
    const { externalPublisher, contentMode } = publicationFor(relativePath, note);
    return {
      path: relativePath,
      fileTitle,
      title,
      displayTitle: displayTitleFor(relativePath, title),
      url: siteUrl(relativePath),
      publishedUrl,
      publication: String(note.meta.publication ?? ''),
      published: String(note.meta.published ?? ''),
      contentMode,
      externalPublisher,
      series: String(note.meta.series ?? ''),
      seriesOrder: numberValue(note.meta.series_order),
      summary: summaryFor(note, { kind: 'blog', contentMode }),
      summaryIsExplicit: Boolean(explicitSummary(note)),
      status: String(note.meta.status ?? ''),
      tags: tagList(note.meta),
      created: firstDate(note.meta)
    };
  }

  const candidateFiles = new Map();
  // 공개 후보를 읽는 동안 파일 존재 여부만 기록한다. 비공개 본문·메타는 출력하지 않는다.
  const knownNotePaths = new Set();
  for (const include of config.include) {
    const absoluteDirectory = path.join(vaultRoot, include.path);
    let files = [];
    try {
      files = await walk(absoluteDirectory);
    } catch {
      console.warn(`Skipped missing include path: ${include.path}`);
      continue;
    }
    for (const absoluteFile of files) {
      const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
      knownNotePaths.add(relativePath);
      const source = await fs.readFile(absoluteFile, 'utf8');
      const parsed = parseFrontmatter(source);
      if (isIncluded(relativePath, parsed.meta)) {
        candidateFiles.set(relativePath, { source, ...parsed });
      }
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
  const graphAll = config.include.some((entry) => entry.graph === true && entry.mode === 'all');

  const blogHubRecords = new Map();
  for (const [relativePath, note] of candidateFiles) {
    if (kindFor(relativePath) !== 'blog' || note.meta.type !== 'series') continue;
    const record = blogRecord(relativePath, note);
    blogHubRecords.set(record.title, {
      ...record,
      started: String(note.meta.started ?? ''),
      ended: String(note.meta.ended ?? ''),
      lastPublished: String(note.meta.last_published ?? ''),
      nextAction: String(note.meta.next_action ?? '')
    });
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
      started: hub?.started ?? '',
      ended: hub?.ended ?? '',
      lastPublished: hub?.lastPublished ?? '',
      nextAction: hub?.nextAction ?? '',
      posts
    };
  }).sort((left, right) => right.lastPublished.localeCompare(left.lastPublished) || left.title.localeCompare(right.title, 'ko'));

  const standaloneByPublication = new Map();
  for (const post of publishedBlogPosts.filter((candidate) => !candidate.series)) {
    const publication = post.publication || '발행처 미상';
    addTo(standaloneByPublication, publication, post);
  }
  const blogPublications = [...standaloneByPublication.entries()]
    .map(([publication, posts]) => ({
      publication,
      posts: posts.sort((left, right) => right.published.localeCompare(left.published) || left.title.localeCompare(right.title, 'ko'))
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
    .map(([relativePath, note]) => {
      const fileTitle = path.posix.basename(relativePath, '.md');
      return {
        path: relativePath,
        fileTitle,
        title: firstHeading(note.body, fileTitle),
        url: siteUrl(relativePath),
        category: developmentCategory(relativePath),
        summary: summaryFor(note),
        summaryIsExplicit: Boolean(explicitSummary(note)),
        tags: tagList(note.meta),
        date: firstDate(note.meta)
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title, 'ko'));

  const development = {
    concepts: developmentRecords.filter((record) => record.category === 'Concepts'),
    troubleshooting: developmentRecords.filter((record) => record.category === 'Troubleshooting'),
    tools: developmentRecords.filter((record) => record.category === 'Tools')
  };

  const byPath = new Map(graphCandidateFiles);
  const byBasename = indexByBasename(graphCandidateFiles.keys());

  const allEdges = [];
  for (const [relativePath, note] of graphCandidateFiles) {
    for (const target of extractTargets(relativePath, note.body, byPath, byBasename)) {
      allEdges.push({ source: relativePath, target });
    }
  }

  const books = [];
  const bookSources = new Map();
  const booksDirectory = path.join(vaultRoot, '30_Resources/References/Books');
  try {
    for (const absoluteFile of await walk(booksDirectory)) {
      const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
      if (path.posix.basename(relativePath).startsWith('_')) continue;
      const source = await fs.readFile(absoluteFile, 'utf8');
      const parsed = parseFrontmatter(source);
      bookSources.set(relativePath, parsed);
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
        coverUrl: String(parsed.meta.cover_url ?? ''),
        status: String(parsed.meta.status ?? ''),
        startDate: String(parsed.meta.start_read_date ?? ''),
        finishDate: String(parsed.meta.finish_read_date ?? ''),
        rate,
        tier: bookTier(rate),
        note: String(parsed.meta.book_note ?? ''),
        created: firstDate(parsed.meta)
      });
    }
  } catch {
    console.warn('Skipped missing books directory');
  }
  books.sort((left, right) => right.rate - left.rate || right.created.localeCompare(left.created) || left.title.localeCompare(right.title, 'ko'));
  assertUniqueSlugs(books.map((book) => ({ kind: 'book', slug: book.slug, path: book.path })));

  function publicEntry(relativePath, note) {
    const fileTitle = path.posix.basename(relativePath, '.md');
    const tags = tagList(note.meta);
    const kind = kindFor(relativePath);
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    const { externalPublisher, contentMode } = publicationFor(relativePath, note);
    const publicContent = publicBody(kind, note.body);
    const bodyText = contentMode === 'external' ? '' : plainText(publicContent);
    const headings = contentMode === 'external' ? [] : headingsFor(publicContent);
    return {
      path: relativePath,
      fileTitle,
      title,
      displayTitle: displayTitleFor(relativePath, title),
      kind,
      category: kind === 'development' ? developmentCategory(relativePath) : null,
      isEntry: relativePath === config.entry,
      status: String(note.meta.status ?? ''),
      type: String(note.meta.type ?? ''),
      tags,
      aliases: stringList(note.meta.aliases),
      slug: slugByPath.get(relativePath),
      publicTags: publicTags(tags),
      bodyText,
      // 한국어 평균 읽기 속도 분당 600자 기준. 리더 메타 줄의 "N분".
      readingMinutes: contentMode === 'external' ? 0 : Math.max(1, Math.round([...bodyText].length / 600)),
      topic: topicFor(tags),
      date: firstDate(note.meta),
      summary: summaryFor(note, { kind, contentMode }),
      summaryIsExplicit: Boolean(explicitSummary(note)),
      headings,
      url: siteUrl(relativePath),
      publishedUrl: kind === 'blog' ? publicUrl(note.meta.source, '') : '',
      publication: String(note.meta.publication ?? ''),
      published: String(note.meta.published ?? ''),
      contentMode,
      externalPublisher,
      publicContent,
      body: note.body
    };
  }

  const publicEntries = new Map(
    [...candidateFiles].map(([relativePath, note]) => [relativePath, publicEntry(relativePath, note)])
  );
  for (const book of books) {
    const source = bookSources.get(book.path);
    publicEntries.set(book.path, {
      path: book.path,
      fileTitle: book.fileTitle,
      title: book.title,
      displayTitle: book.fileTitle,
      kind: 'book',
      status: book.status,
      type: 'book',
      tags: Array.isArray(source?.meta.tags) ? source.meta.tags : [],
      slug: book.slug,
      publicTags: [],
      bodyText: plainText(source?.body ?? ''),
      topic: topicFor(Array.isArray(source?.meta.tags) ? source.meta.tags : []),
      date: book.created,
      summary: book.note || excerpt(source?.body ?? ''),
      summaryIsExplicit: Boolean(book.note),
      headings: headingsFor(source?.body ?? ''),
      url: book.url,
      publication: '',
      body: source?.body ?? ''
    });
  }

  const publicByPath = new Map(publicEntries);
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
  for (const include of config.include) {
    const absoluteDirectory = path.join(vaultRoot, include.path);
    try {
      for (const absoluteFile of await walkAll(absoluteDirectory)) {
        const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
        if (!relativePath.endsWith('.md') && !isExcluded(relativePath)) publicAssetPaths.add(relativePath);
      }
    } catch {
      // The Markdown include loop already reports missing public directories.
    }
  }
  for (const absoluteFile of await walkAll(booksDirectory).catch(() => [])) {
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

  // 소개처럼 노트 목록에는 없지만 vault 원고로 쓰는 페이지. 노트와 같은 링크·자산·콜아웃 규칙을 쓰되,
  // 공개 색인에 없는 경로라 같은 문서 안의 절 링크만 페이지 앵커로 돌린다. 해석에 실패한 링크는 노트와 똑같이
  // 자물쇠나 평문으로 낮춘다. 페이지 하나 때문에 빌드가 멈추지 않는다.
  function renderPage({ sourcePath, title, body, articleCards = [] }) {
    const render = createMarkdownRenderer({
      resolveAsset: resolvePublicAsset,
      resolveNote: (source, target, fragment = '') => (target === sourcePath
        ? { title, url: fragment ? `#${fragment}` : '' }
        : resolvePublicNote(source, target, fragment))
    });
    return render(sourcePath, stripLeadingTitle(body), { articleCards });
  }

  const allPublicEdges = [];
  for (const [relativePath, entry] of publicEntries) {
    if (entry.kind === 'book') continue;
    for (const target of extractTargets(relativePath, entry.body, publicByPath, publicByBasename)) {
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
    .map(({ body, publicContent, ...entry }) => {
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

  const seeds = [];
  for (const seed of config.seeds) {
    const normalizedSeed = normalize(seed);
    if (graphCandidateFiles.has(normalizedSeed)) seeds.push(normalizedSeed);
    else console.warn(`Seed is outside the public graph scope: ${normalizedSeed}`);
  }
  const pathItems = config.paths
    .flatMap((readingPath) => readingPath.items)
    .filter((item) => typeof item === 'string')
    .map(normalize);
  // graphRule "linked" 폴더의 노트는 지도에서 종점이다. 자세한 규칙은 selectGraphNodes에 있다.
  const linkedOnlyRoots = config.include.filter((rule) => rule.graphRule === 'linked').map((rule) => rule.path);
  const { paths: selectedPaths, degree } = selectGraphNodes({
    candidates: new Set(graphCandidateFiles.keys()),
    edges: allEdges,
    seeds,
    pathItems,
    depth: config.depth,
    maxNodes: config.maxGraphNodes,
    isEndpoint: (item) => linkedOnlyRoots.some((root) => pathMatches(item, root)),
    all: graphAll
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
  const nodeByPath = new Map(nodes.map((node) => [node.path, node]));
  const blogByPath = new Map(publishedBlogPosts.map((post) => [post.path, { ...post, kind: 'blog' }]));
  const developmentByPath = new Map(developmentRecords.map((record) => [record.path, { ...record, kind: 'development' }]));
  const pathEntries = new Map([...nodeByPath, ...blogByPath, ...developmentByPath]);
  const paths = config.paths.map((readingPath) => ({
    ...readingPath,
    items: readingPath.items.map((item) => {
      if (typeof item !== 'string') return { ...item, external: true };
      const normalized = normalize(item);
      const entry = pathEntries.get(normalized);
      return entry
        ? { label: entry.displayTitle ?? entry.title, path: entry.path, url: entry.url, kind: entry.kind }
        : null;
    }).filter(Boolean)
  })).filter((readingPath) => readingPath.items.length);

  return {
    home: {
      featured: (config.home?.featured || []).filter((notePath) => notes.some((note) => note.path === notePath)),
      contacts: config.home?.contacts || [],
      about: String(config.home?.about ?? '')
    },
    notes, nodes, edges, noteEdges: allPublicEdges, paths, blog, development, books, topicFold, renderPage,
    stats: {
      candidates: graphCandidateFiles.size, nodes: nodes.length, edges: edges.length,
      blogPosts: blog.stats.posts, blogSeries: blog.stats.series, developmentNotes: developmentRecords.length
    },
    assetCopies
  };
}
