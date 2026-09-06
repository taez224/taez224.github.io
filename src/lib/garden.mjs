import fs from 'node:fs/promises';
import path from 'node:path';
import { createMarkdownRenderer, slugifyHeading } from './markdown.mjs';
import { developmentCategory, pathMatches, isExcluded as excludedByPolicy, isIncluded as includedByPolicy, validatePublicationConfig } from './publication.mjs';
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

function headingsFor(body) {
  const headingIds = new Map();
  return [...String(body ?? '').matchAll(/^(#{2,4})\s+(.+)$/gm)]
    .map((match) => {
      const title = match[2].trim();
      const baseId = slugifyHeading(title);
      const count = (headingIds.get(baseId) ?? 0) + 1;
      headingIds.set(baseId, count);
      return { id: count === 1 ? baseId : `${baseId}-${count}`, level: match[1].length, title };
    })
    .slice(0, 8);
}

function excerpt(body) {
  const withoutHeadings = String(body ?? '').replace(/^#{1,6}\s+.+$/gm, ' ');
  const cleaned = plainText(withoutHeadings, { includeCodeBlocks: false });
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 220).replace(/\s+\S*$/, '')}…`;
}

function summaryFor(note) {
  const summary = String(note.meta.summary ?? '').trim();
  return summary || excerpt(note.body);
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

function seriesSummaryFor(note) {
  const summary = String(note.meta.summary ?? '').trim();
  return summary || sectionExcerpt(note.body, ['연재 목적', '시리즈 소개']) || excerpt(note.body);
}

function topicFor(tags) {
  const topic = tags.find((tag) => tag !== 'slipbox');
  return topic ? topic.split('/')[0] : '기타';
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
  return relativePath === '01_Slipbox/생각의 정원.md' ? '시작점' : title;
}

function publicUrl(value, fallback) {
  return /^https:\/\//.test(String(value ?? '')) ? String(value) : fallback;
}

function stripLinkTarget(rawTarget) {
  return rawTarget.split('|')[0].split('#')[0].trim().replace(/^!/, '');
}

function resolveTarget(sourcePath, rawTarget, byPath, byBasename) {
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
  return matches.length === 1 ? matches[0] : null;
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

const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
function isImagePath(value) {
  return imageExtensions.has(path.posix.extname(value).toLowerCase());
}

export async function assembleGarden({ vaultRoot, config, basePath = '' }) {
  validatePublicationConfig(config);
  const base = String(basePath).replace(/\/$/, '');
  const isExcluded = (relativePath) => excludedByPolicy(config, relativePath);
  const isIncluded = (relativePath, meta) => includedByPolicy(config, relativePath, meta);

  function blogRecord(relativePath, note) {
    const fileTitle = path.posix.basename(relativePath, '.md');
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    const publishedUrl = publicUrl(note.meta.source, '');
    return {
      path: relativePath,
      fileTitle,
      title,
      displayTitle: displayTitleFor(relativePath, title),
      url: siteUrl(relativePath),
      publishedUrl,
      publication: String(note.meta.publication ?? ''),
      published: String(note.meta.published ?? ''),
      series: String(note.meta.series ?? ''),
      seriesOrder: numberValue(note.meta.series_order),
      summary: note.meta.type === 'series' ? seriesSummaryFor(note) : summaryFor(note),
      summaryIsExplicit: Boolean(String(note.meta.summary ?? '').trim()),
      status: String(note.meta.status ?? ''),
      tags: Array.isArray(note.meta.tags) ? note.meta.tags : [],
      created: firstDate(note.meta)
    };
  }

  const candidateFiles = new Map();
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
    standaloneByPublication.set(publication, [...(standaloneByPublication.get(publication) ?? []), post]);
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
    .map(([relativePath, note]) => ({
      path: relativePath,
      fileTitle: path.posix.basename(relativePath, '.md'),
      title: firstHeading(note.body, path.posix.basename(relativePath, '.md')),
      url: siteUrl(relativePath),
      category: developmentCategory(relativePath),
      summary: summaryFor(note),
      summaryIsExplicit: Boolean(String(note.meta.summary ?? '').trim()),
      tags: Array.isArray(note.meta.tags) ? note.meta.tags : [],
      date: firstDate(note.meta)
    }))
    .sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title, 'ko'));

  const development = {
    concepts: developmentRecords.filter((record) => record.category === 'Concepts'),
    troubleshooting: developmentRecords.filter((record) => record.category === 'Troubleshooting'),
    tools: developmentRecords.filter((record) => record.category === 'Tools')
  };

  const byPath = new Map(graphCandidateFiles);
  const byBasename = new Map();
  for (const relativePath of graphCandidateFiles.keys()) {
    const basename = path.posix.basename(relativePath).toLowerCase();
    byBasename.set(basename, [...(byBasename.get(basename) ?? []), relativePath]);
  }

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
    const kind = kindFor(relativePath);
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    return {
      path: relativePath,
      fileTitle,
      title,
      displayTitle: displayTitleFor(relativePath, title),
      kind,
      category: kind === 'development' ? developmentCategory(relativePath) : null,
      status: String(note.meta.status ?? ''),
      type: String(note.meta.type ?? ''),
      tags: Array.isArray(note.meta.tags) ? note.meta.tags : [],
      slug: slugByPath.get(relativePath),
      publicTags: publicTags(Array.isArray(note.meta.tags) ? note.meta.tags : []),
      bodyText: plainText(stripLeadingTitle(note.body)),
      topic: topicFor(Array.isArray(note.meta.tags) ? note.meta.tags : []),
      date: firstDate(note.meta),
      summary: kind === 'blog' && note.meta.type === 'series' ? seriesSummaryFor(note) : summaryFor(note),
      summaryIsExplicit: Boolean(String(note.meta.summary ?? '').trim()),
      headings: headingsFor(note.body),
      url: siteUrl(relativePath),
      publishedUrl: kind === 'blog' ? publicUrl(note.meta.source, '') : '',
      publication: String(note.meta.publication ?? ''),
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
  const publicByBasename = new Map();
  for (const relativePath of publicEntries.keys()) {
    const basename = path.posix.basename(relativePath).toLowerCase();
    publicByBasename.set(basename, [...(publicByBasename.get(basename) ?? []), relativePath]);
  }

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

  const publicAssetsByBasename = new Map();
  for (const relativePath of publicAssetPaths) {
    const basename = path.posix.basename(relativePath).toLowerCase();
    publicAssetsByBasename.set(basename, [...(publicAssetsByBasename.get(basename) ?? []), relativePath]);
  }

  const assetCopies = new Map();

  function resolvePublicAsset(sourcePath, rawTarget) {
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
    assetCopies.set(assetPath, destination);
    return { url: `${base}/${destination}` };
  }

  function resolvePublicNote(sourcePath, rawTarget, fragment = '') {
    const target = String(rawTarget ?? '').trim();
    const resolved = target === sourcePath
      ? sourcePath
      : resolveTarget(sourcePath, target, publicByPath, publicByBasename);
    if (!resolved || !publicEntries.has(resolved)) return null;
    const entry = publicEntries.get(resolved);
    if (entry.kind === 'book') return null;
    return { title: entry.displayTitle || entry.title, url: siteUrl(resolved, fragment) };
  }

  const renderMarkdown = createMarkdownRenderer({
    resolveAsset: resolvePublicAsset,
    resolveNote: resolvePublicNote
  });

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
    outgoingByPath.set(edge.source, [...(outgoingByPath.get(edge.source) ?? []), edge.target]);
    incomingByPath.set(edge.target, [...(incomingByPath.get(edge.target) ?? []), edge.source]);
  }
  const notes = [...publicEntries.values()]
    .filter((entry) => entry.kind !== 'book')
    .map(({ body, ...entry }) => ({
      ...entry,
      bodyHtml: renderMarkdown(entry.path, stripLeadingTitle(body)),
      outgoing: outgoingByPath.get(entry.path) ?? [],
      incoming: incomingByPath.get(entry.path) ?? []
    }));

  const seedSet = new Set();
  for (const seed of config.seeds) {
    const normalizedSeed = normalize(seed);
    if (graphCandidateFiles.has(normalizedSeed)) seedSet.add(normalizedSeed);
    else console.warn(`Seed is outside the public graph scope: ${normalizedSeed}`);
  }

  const pathItemSet = new Set();
  for (const readingPath of config.paths) {
    for (const item of readingPath.items) {
      if (typeof item === 'string') pathItemSet.add(normalize(item));
    }
  }

  const selected = graphAll
    ? new Set(graphCandidateFiles.keys())
    : new Set([...seedSet, ...[...pathItemSet].filter((item) => graphCandidateFiles.has(item))]);
  for (let level = 0; level < config.depth; level += 1) {
    for (const edge of allEdges) {
      if (selected.has(edge.source)) selected.add(edge.target);
      if (selected.has(edge.target)) selected.add(edge.source);
    }
  }

  const degree = new Map();
  for (const edge of allEdges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const required = new Set([...seedSet, ...[...pathItemSet].filter((item) => graphCandidateFiles.has(item))]);
  let selectedPaths = [...selected];
  if (selectedPaths.length > config.maxGraphNodes) {
    const optional = selectedPaths
      .filter((item) => !required.has(item))
      .sort((left, right) => (degree.get(right) ?? 0) - (degree.get(left) ?? 0));
    selectedPaths = [...required, ...optional.slice(0, config.maxGraphNodes - required.size)];
  }
  // graphRule "linked": a note from such a folder joins the map only when it is connected, through public graph
  // notes, to the thought map itself (a node outside any linked-only folder). Pairs that only cite each other stay out.
  const linkedOnlyRoots = config.include.filter((rule) => rule.graphRule === 'linked').map((rule) => rule.path);
  const isLinkedOnly = (item) => linkedOnlyRoots.some((root) => pathMatches(item, root));
  const selectedNow = new Set(selectedPaths);
  const adjacency = new Map();
  for (const edge of allEdges) {
    if (!selectedNow.has(edge.source) || !selectedNow.has(edge.target)) continue;
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge.source]);
  }
  const reached = new Set(selectedPaths.filter((item) => !isLinkedOnly(item)));
  const queue = [...reached];
  while (queue.length) {
    const current = queue.pop();
    for (const next of adjacency.get(current) ?? []) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  }
  selectedPaths = selectedPaths.filter((item) => !isLinkedOnly(item) || reached.has(item));
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
    notes, nodes, edges, noteEdges: allPublicEdges, paths, blog, development, books,
    stats: {
      candidates: graphCandidateFiles.size, nodes: nodes.length, edges: edges.length,
      blogPosts: blog.stats.posts, blogSeries: blog.stats.series, developmentNotes: developmentRecords.length
    },
    assetCopies
  };
}
