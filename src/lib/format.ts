/// <reference types="astro/client" />
import { KINDS } from './kinds.ts';

// 주제마다 색상(hue)은 유지하고 명도만 나눈다(2026-09-17). 9색이 같은 명도대에 몰려 있어 녹색약에서 AI와 개발,
// 적색약에서 지식관리와 기타가 거의 같은 색으로 보였다. 노트가 많은 AI·지식관리·조직은 중간 톤(OKLCH 명도 52~58)에 두어
// 지도가 무거워지지 않게 하고, 나머지 주제의 명도를 벌려 지도에 보이는 주제 사이의 거리를 최대화했다. 기타는 무채색이다.
// 노드는 종이색 위 3:1 이상이어야 한다(tests/topic-colors.test.ts).
export const GRAPH_COLORS: Record<string, string> = { AI: '#877096', 개발: '#405a78', 커리어: '#8c6a45', 지식관리: '#5a7e6a', 글쓰기: '#7c5050', 철학: '#94833e', 조직: '#36737d', 심리: '#793a58', 기타: '#868684' };
// 지도 영역 이름은 15px 굵은 글자라 4.5:1이 필요한데, 밝은 주제색은 노드 기준(3:1)만 넘는다.
// 같은 색상에서 명도만 낮춘 글자용 색이다. 이미 4.5:1을 넘는 주제는 노드 색과 같다.
export const GRAPH_LABEL_COLORS: Record<string, string> = { AI: '#7e678d', 개발: '#405a78', 커리어: '#8a6944', 지식관리: '#547864', 글쓰기: '#7c5050', 철학: '#7f6e28', 조직: '#36737d', 심리: '#793a58', 기타: '#70706e' };
const HIDDEN_TAGS = new Set(['slipbox', 'blog', 'inbox', 'clippings']);

// 어두운 화면의 주제색. 같은 색상에서 밝기만 다시 골랐다. 모두 같은 대비로 맞추면 명도 차이가 사라져 색각 이상 시뮬레이션에서
// 이웃 주제가 붙으므로(적색약 AI-개발 1.6), 주제마다 밝기 단계를 달리해 지도에 보이는 7개의 최소 구분 거리를 넓혔다(6.6, 라이트는 4.1).
// 노드는 어두운 바탕에서 3.3:1 이상, 영역 이름은 5:1 이상이다.
export const DARK_GRAPH_COLORS: Record<string, string> = { AI: '#7c628d', 개발: '#6686ab', 커리어: '#8b6438', 지식관리: '#6e9981', 글쓰기: '#925e5e', 철학: '#96822d', 조직: '#5ea6b2', 심리: '#d483a8', 기타: '#787876' };
export const DARK_GRAPH_LABEL_COLORS: Record<string, string> = { AI: '#9a7fac', 개발: '#6c8cb1', 커리어: '#ab8256', 지식관리: '#6e9981', 글쓰기: '#b27b7b', 철학: '#9d8936', 조직: '#5ea6b2', 심리: '#d483a8', 기타: '#8a8a88' };
// 주제색은 SVG 속성과 인라인 스타일에 들어가므로 hex를 박으면 CSS가 화면 모드를 따라 바꿀 수 없다. CSS 변수를 참조하고,
// 변수 값은 Shell이 topicColorCss()로 페이지 머리에 싣는다. 변수 이름에는 한글 주제 이름 대신 이 키를 쓴다.
const TOPIC_KEYS: Record<string, string> = { AI: 'ai', 개발: 'dev', 커리어: 'career', 지식관리: 'knowledge', 글쓰기: 'writing', 철학: 'philosophy', 조직: 'org', 심리: 'psychology', 기타: 'other' };
const topicKey = (topic: string) => TOPIC_KEYS[topic] ?? TOPIC_KEYS.기타;
export function topicColor(topic: string): string { return `var(--topic-${topicKey(topic)})`; }
export function topicLabelColor(topic: string): string { return `var(--topic-label-${topicKey(topic)})`; }
// CSS 변수를 읽지 못하는 곳(resvg로 그리는 OG 카드)은 밝은 화면의 값을 직접 쓴다.
export function topicHex(topic: string): string { return GRAPH_COLORS[topic] ?? GRAPH_COLORS.기타; }
export function topicColorCss(): string {
  const block = (nodes: Record<string, string>, labels: Record<string, string>) => Object.entries(TOPIC_KEYS).map(([topic, key]) => `--topic-${key}:${nodes[topic]};--topic-label-${key}:${labels[topic]};`).join('');
  // 주제색도 화면 모드를 따른다. 조건은 site.css와 같다. 스크립트가 없어 data-theme이 없을 때만 시스템 설정을 본다.
  const dark = block(DARK_GRAPH_COLORS, DARK_GRAPH_LABEL_COLORS);
  return `:root{${block(GRAPH_COLORS, GRAPH_LABEL_COLORS)}}@media (prefers-color-scheme: dark){:root:not([data-theme]){${dark}}}:root[data-theme="dark"]{${dark}}`;
}
export function publicTags(tags: readonly string[] = []): string[] { return tags.filter((tag) => !HIDDEN_TAGS.has(tag) && !tag.startsWith('프로젝트/')); }
// 노트의 주제는 첫 공개 태그의 앞 조각이다. 공개 태그가 없으면 기타다.
export function topicFor(tags?: readonly string[]): string { const topic = publicTags(tags).find(Boolean); return topic ? topic.split('/')[0] : '기타'; }
export function displayTag(tag: string): string { return tag.startsWith('개발/') ? tag.slice(3) : tag; }
export function cleanTitle(title: unknown): string { return String(title ?? '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]\s*/gu, '').trim(); }
export function escapeHtml(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]); }
// 피드와 OG 카드 SVG는 XML이다. XML 1.0이 담지 못하는 제어 문자는 지우고, 이모지 같은 보충 평면 문자는 남긴다.
export function escapeXml(value: unknown): string { return String(value ?? '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]); }
// <script type="application/json"> 안에 넣는 JSON. 제목의 '<'가 태그를 닫지 못하게 이스케이프한다.
export function inlineJson(data: unknown): string { return JSON.stringify(data).replace(/</g, '\\u003c'); }
export function formatDate(iso: unknown): string { return String(iso ?? '').slice(0, 10).replaceAll('-', '.'); }
// 목록에서는 작성한 요약의 첫 문장만 사용한다. 원문과 검색 데이터는 그대로 둔다.
export function firstSentence(text = '') { return text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text; }
export function developmentCategoryLabel(category: string | null | undefined): string { return ({ Concepts: '개념·설계', Troubleshooting: '문제 해결', Tools: '도구·워크플로' } as Record<string, string>)[category ?? ''] || '개발 노트'; }
export function kindLabel(note: { kind?: string; category?: string | null }): string {
  if (note.kind === 'development') return developmentCategoryLabel(note.category);
  return KINDS[note.kind as keyof typeof KINDS]?.label ?? KINDS.slipbox.label;
}
export function withBase(path: string): string {
  const base = String(import.meta.env?.BASE_URL ?? '').replace(/\/$/, '');
  return `${base}${path}`;
}
