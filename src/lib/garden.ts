import type { PublicNote, GardenGraphNode, GraphEdge } from './content-model.ts';
import type { PublicationConfig } from './publication.ts';
import type { VaultNote } from './vault-files.ts';
import type { BlogPost } from './blog.ts';

export interface GardenConfig extends PublicationConfig {
  basePath?: string; entry?: string; minTopicNodes?: number;
  home?: { featured?: string[]; contacts?: { name: string; url: string; icon?: string }[]; about?: string };
}
type Candidate = VaultNote & { publicContent: string; linkTargets: string[] };
type BaseRecord = Omit<PublicNote, 'slug' | 'publicTags' | 'topic' | 'headings' | 'outgoing' | 'incoming' | 'thumbnail' | 'thumbnailStyle' | 'articleCards' | 'bodyText' | 'bodyHtml' | 'isEntry' | 'aliases' | 'readingMinutes' | 'topicTag'>;
type PublicEntry = Omit<PublicNote, 'thumbnail' | 'thumbnailStyle' | 'articleCards' | 'bodyHtml' | 'outgoing' | 'incoming' | 'topicTag'> & { publicContent: string };

import fs from 'node:fs/promises';
import path from 'node:path';
import { createMarkdownRenderer } from './markdown.ts';
import { developmentCategory, externalPublicationFor, pathMatches, publicUrl, isIncluded as includedByPolicy, validatePublicationConfig } from './publication.ts';
import { readBooks } from './books.ts';
import { createAssetResolver } from './public-assets.ts';
import { selectGraphNodes } from '../graph/select.ts';
import { slugFor, kindPrefix, noteUrl, assertUniqueSlugs } from './slug.ts';
import { plainText } from './text.ts';
import { publicTags, cleanTitle, topicFor } from './format.ts';
import { kstDate, noteDates } from './dates.ts';
import { groupDevelopment } from './development.ts';
import { assembleBlog } from './blog.ts';
import { kindFor } from './kinds.ts';
import { isMarkdown, normalize, numberValue, parseFrontmatter, stringList, tagList, walkIfPresent } from './vault-files.ts';
import { explicitSummary, firstHeading, headingsFor, publicBody, summaryFor } from './note-body.ts';
import { addTo, indexByBasename, noteTargets, resolveTarget, resolveTargets } from './links.ts';

// 지도에서 노드가 이보다 적은 주제는 색과 영역을 기타로 접는다. 범례가 길어지고 팔레트가 바닥나는 걸 막는다. 원래 주제는 topicTag에 남는다.
const MIN_TOPIC_NODES = 3;

// today는 미래 날짜 검사의 기준일이다. 테스트가 날짜를 고정할 수 있게 인자로 받는다.
export async function assembleGarden({ vaultRoot, config, basePath = '', today = kstDate() }: { vaultRoot: string; config: GardenConfig; basePath?: string; today?: string }) {
  validatePublicationConfig(config);
  const base = String(basePath).replace(/\/$/, '');
  const isIncluded = (relativePath: string, meta: VaultNote['meta']) => includedByPolicy(config, relativePath, meta);

  // 글 목록·개발 노트 목록·공개 엔트리가 같은 노트를 각자 계산하지 않도록, 공통 필드는 노트마다 한 번만 만든다.
  const baseRecords = new Map<string, BaseRecord>();
  function baseRecord(relativePath: string, note: Candidate): BaseRecord {
    if (baseRecords.has(relativePath)) return baseRecords.get(relativePath)!;
    const fileTitle = path.posix.basename(relativePath, '.md');
    const kind = kindFor(relativePath);
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    const externalPublisher = externalPublicationFor(config, relativePath, note.meta);
    const contentMode = externalPublisher ? 'external' : 'full';
    const tags = tagList(note.meta);
    const dates = noteDates(note.meta, { path: relativePath, today });
    const record: BaseRecord = {
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

  function blogRecord(relativePath: string, note: Candidate): BaseRecord & BlogPost {
    const record = baseRecord(relativePath, note);
    return { ...record, series: String(note.meta.series ?? ''), seriesOrder: numberValue(note.meta.series_order) };
  }

  const candidateFiles = new Map<string, Candidate>();
  // 공개 후보를 읽는 동안 파일 존재 여부만 기록한다. 비공개 본문·메타는 출력하지 않는다.
  const knownNotePaths = new Set<string>();
  for (const include of config.include) {
    // 설정에 적은 공개 폴더가 없으면 vault에서 이름을 바꾸거나 옮긴 것이다. 건너뛰면 그 폴더의 노트가 전부 빠진 사이트가 배포된다.
    const files = await walkIfPresent(path.join(vaultRoot, include.path), isMarkdown);
    if (!files) throw new Error(`Include path does not exist: ${include.path}. Restore the folder or update config.json.`);
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

  const slugByPath = new Map<string, string>();
  for (const [relativePath, note] of candidateFiles) {
    const fileTitle = path.posix.basename(relativePath, '.md');
    const title = String(note.meta.title ?? firstHeading(note.body, fileTitle));
    slugByPath.set(relativePath, slugFor(note.meta, title));
  }
  assertUniqueSlugs([...slugByPath].map(([relativePath, slug]) => ({ kind: kindFor(relativePath), slug, path: relativePath })));
  function siteUrl(relativePath: string, fragment = ''): string {
    return noteUrl(base, kindFor(relativePath), slugByPath.get(relativePath)!, fragment);
  }

  const graphCandidateFiles = new Map([...candidateFiles].filter(([relativePath]) => {
    const rule = config.include.find((entry) => pathMatches(relativePath, entry.path));
    return rule?.graph !== false;
  }));

  const blogCandidates = [...candidateFiles].filter(([relativePath]) => kindFor(relativePath) === 'blog');
  const blog = assembleBlog({
    hubs: blogCandidates
      .filter(([, note]) => note.meta.type === 'series')
      .map(([relativePath, note]) => ({ ...blogRecord(relativePath, note), ended: String(note.meta.ended ?? '') })),
    posts: blogCandidates
      .filter(([, note]) => note.meta.status === 'published')
      .map(([relativePath, note]) => blogRecord(relativePath, note))
  });

  const developmentRecords = [...candidateFiles]
    .filter(([relativePath]) => kindFor(relativePath) === 'development')
    .map(([relativePath, note]) => baseRecord(relativePath, note));
  const development = groupDevelopment(developmentRecords);

  const byBasename = indexByBasename(graphCandidateFiles.keys());

  const allEdges: GraphEdge[] = [];
  for (const [relativePath, note] of graphCandidateFiles) {
    for (const target of resolveTargets(relativePath, note.linkTargets, graphCandidateFiles, byBasename)) {
      allEdges.push({ source: relativePath, target });
    }
  }

  const books = await readBooks({ vaultRoot, base });

  function publicEntry(relativePath: string, note: Candidate): PublicEntry {
    const record = baseRecord(relativePath, note);
    const publicContent = note.publicContent;
    const bodyText = record.contentMode === 'external' ? '' : plainText(publicContent);
    return {
      ...record,
      isEntry: relativePath === config.entry,
      aliases: stringList(note.meta.aliases),
      slug: slugByPath.get(relativePath)!,
      publicTags: publicTags(record.tags),
      bodyText,
      // 한국어 평균 읽기 속도 분당 600자 기준. 리더 메타 줄의 "N분".
      readingMinutes: record.contentMode === 'external' ? 0 : Math.max(1, Math.round([...bodyText].length / 600)),
      topic: topicFor(record.tags),
      headings: record.contentMode === 'external' ? [] : headingsFor(publicContent),
      publicContent
    };
  }

  const publicEntries = new Map<string, PublicEntry | { path: string; kind: 'book' }>(
    [...candidateFiles].map(([relativePath, note]) => [relativePath, publicEntry(relativePath, note)])
  );
  // 책은 링크 해석에서 "공개된 책"으로 알아보기만 한다. 링크와 참조 간선은 책을 건너뛰고 노트 목록과 지도에도
  // 넣지 않으므로 본문·목차·요약은 만들지 않는다.
  for (const book of books) publicEntries.set(book.path, { path: book.path, kind: 'book' });

  for (const relativePath of publicEntries.keys()) knownNotePaths.add(relativePath);
  const knownByBasename = indexByBasename(knownNotePaths);
  const publicByBasename = indexByBasename(publicEntries.keys());

  const assets = await createAssetResolver({ vaultRoot, config, base });

  function resolvePublicNote(sourcePath: string, rawTarget: unknown, fragment = '') {
    const target = String(rawTarget ?? '').trim();
    const resolved = target === sourcePath
      ? sourcePath
      : resolveTarget(sourcePath, target, knownNotePaths, knownByBasename, publicEntries);
    if (!resolved) return null;
    if (!publicEntries.has(resolved)) return { visibility: 'private' as const };
    const entry = publicEntries.get(resolved)!;
    if (entry.kind === 'book') return null;
    return { title: entry.displayTitle || entry.title, url: siteUrl(resolved, entry.contentMode === 'external' ? '' : fragment) };
  }

  const renderMarkdown = createMarkdownRenderer({
    resolveAsset: assets.resolve,
    resolveNote: resolvePublicNote
  });

  const allPublicEdges: GraphEdge[] = [];
  for (const [relativePath, note] of candidateFiles) {
    for (const target of resolveTargets(relativePath, note.linkTargets, publicEntries, publicByBasename)) {
      if (publicEntries.get(target)?.kind === 'book') continue;
      allPublicEdges.push({ source: relativePath, target });
    }
  }

  const outgoingByPath = new Map<string, string[]>();
  const incomingByPath = new Map<string, string[]>();
  for (const edge of allPublicEdges) {
    addTo(outgoingByPath, edge.source, edge.target);
    addTo(incomingByPath, edge.target, edge.source);
  }
  const notes: PublicNote[] = [...publicEntries.values()]
    .filter((entry) => entry.kind !== 'book')
    .map(({ publicContent, ...entry }) => {
      const meta = candidateFiles.get(entry.path)?.meta ?? {};
      const reference = String(meta.thumbnail ?? '').trim();
      let thumbnail: string | null = null;
      if (reference) {
        const target = reference.match(/^!?\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/)?.[1] ?? reference;
        thumbnail = assets.resolve(entry.path, target, { copy: false })?.sourcePath ?? null;
        if (!thumbnail) throw new Error(`Missing or unreviewed thumbnail for ${entry.path}: ${reference}`);
      }
      const thumbnailStyle = String(meta.thumbnail_style ?? 'plain');
      if (thumbnailStyle !== 'plain' && thumbnailStyle !== 'soft') throw new Error(`Unknown thumbnail_style for ${entry.path}: ${thumbnailStyle}`);
      const articleCards: PublicNote['articleCards'] = [];
      const bodyHtml = entry.contentMode === 'external' ? '' : renderMarkdown(entry.path, publicContent, { articleCards });
      return {
        ...entry,
        topicTag: entry.topic,
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

  const nodes: GardenGraphNode[] = selectedPaths.map((relativePath) => {
    const entry = publicEntries.get(relativePath) as PublicEntry;
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
      topicTag: entry.topic,
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
  const topicCounts = new Map<string, number>();
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
    assetCopies: assets.copies
  };
}
