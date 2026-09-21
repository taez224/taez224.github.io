import type { PublicNote } from '../lib/content-model.ts';
type LocalNode = Pick<PublicNote, 'path' | 'displayTitle' | 'url' | 'topic'>;
export interface LocalEdge { x1: number; y1: number; x2: number; y2: number; direction: 'in' | 'out' | 'both' }
export interface LocalLabel { lines: string[]; x: number; y: number; box: { left: number; right: number; top: number; bottom: number } }
export interface LocalGraphNode { id: string; x: number; y: number; title: string; url: string; color: string; current: boolean; label?: LocalLabel }

import { cleanTitle, topicColor } from '../lib/format.ts';
import { estimateTextWidth } from '../graph/label.ts';

// 이웃 제목은 11px 글자에 줄 간격 13px이고, 한 줄은 약 100px(이웃 노드 사이 간격)이다.
const FONT = 11, LINE = 13, LABEL_WIDTH = 100, NODE_RADIUS = 6;
const fits = (text: string) => estimateTextWidth(text, FONT) <= LABEL_WIDTH;

// 제목을 단어 경계에서 최대 두 줄로 나눈다. 글자 수로 자르면 "Human Agenc…"처럼 단어 가운데가 끊기고,
// 한 줄로는 어떤 생각이 연결됐는지 알기 어렵다.
// 남는 글이 있으면 마지막 줄을 줄임표로 맺고, 한 단어가 한 줄보다 길면 그 단어만 글자 단위로 나눈다.
export function localGraphLabelLines(title: string, maxLines = 2): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let index = 0;
  while (lines.length < maxLines && index < words.length) {
    let line = '';
    while (index < words.length && fits(line ? `${line} ${words[index]}` : words[index])) {
      line = line ? `${line} ${words[index]}` : words[index];
      index += 1;
    }
    if (!line) {
      const characters = [...words[index]];
      while (characters.length && fits(line + characters[0])) line += characters.shift();
      words[index] = characters.join('');
    }
    lines.push(line);
  }
  if (index < words.length) {
    let last = lines[lines.length - 1];
    while (!fits(`${last}…`)) last = last.includes(' ') ? last.slice(0, last.lastIndexOf(' ')) : [...last].slice(0, -1).join('');
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

export function localGraphLayout(center: LocalNode, outgoing: readonly LocalNode[], incoming: readonly LocalNode[], { width, height, max = 6 }: { width: number; height: number; max?: number }) {
  const outSet = new Set(outgoing.map((n) => n.path));
  const inSet = new Set(incoming.map((n) => n.path));
  const byPath = new Map([...outgoing, ...incoming].map((n) => [n.path, n]));
  const all = [...byPath.values()];
  const shown = all.slice(0, max);
  const cx = width / 2, cy = height / 2;
  const rx = width / 2 - 52, ry = height / 2 - 34;
  const nodes: LocalGraphNode[] = [{ id: center.path, x: cx, y: cy, title: center.displayTitle, url: center.url, color: topicColor(center.topic), current: true }];
  const edges: LocalEdge[] = [];
  shown.forEach((n, index) => {
    const angle = -Math.PI / 2 + (index / shown.length) * Math.PI * 2;
    const x = +(cx + Math.cos(angle) * rx).toFixed(1), y = +(cy + Math.sin(angle) * ry).toFixed(1);
    // 위쪽 이웃은 제목을 노드 위에, 나머지는 아래에 둔다. 제목이 가운데 노드와 관계선에서 바깥쪽으로 떨어진다.
    // 이웃이 6개 이하면 이 규칙만으로 제목끼리 겹치지 않는다. 그보다 많으면 글자를 줄이지 않고 그리는 이웃을 줄인다.
    const lines = localGraphLabelLines(cleanTitle(n.displayTitle));
    const baseline = y < cy ? y - NODE_RADIUS - 6 - (lines.length - 1) * LINE : y + NODE_RADIUS + 14;
    const labelWidth = Math.max(...lines.map((line) => estimateTextWidth(line, FONT)));
    const box = { left: x - labelWidth / 2, right: x + labelWidth / 2, top: baseline - 9, bottom: baseline + (lines.length - 1) * LINE + 3 };
    nodes.push({ id: n.path, x, y, title: n.displayTitle, url: n.url, color: topicColor(n.topic), current: false, label: { lines, x, y: baseline, box } });
    const direction = outSet.has(n.path) && inSet.has(n.path) ? 'both' : outSet.has(n.path) ? 'out' : 'in';
    edges.push({ x1: cx, y1: cy, x2: x, y2: y, direction });
  });
  return { nodes, edges, hidden: all.length - shown.length };
}

