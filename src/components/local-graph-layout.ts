import type { PublicNote } from '../lib/content-model.ts';
type LocalNode = Pick<PublicNote, 'path' | 'displayTitle' | 'url' | 'topic'>;
export interface LocalEdge { x1: number; y1: number; x2: number; y2: number; direction: 'in' | 'out' | 'both' }

import { topicColor } from '../lib/format.ts';

export function localGraphLayout(center: LocalNode, outgoing: readonly LocalNode[], incoming: readonly LocalNode[], { width, height, max = 8 }: { width: number; height: number; max?: number }) {
  const outSet = new Set(outgoing.map((n) => n.path));
  const inSet = new Set(incoming.map((n) => n.path));
  const byPath = new Map([...outgoing, ...incoming].map((n) => [n.path, n]));
  const all = [...byPath.values()];
  const shown = all.slice(0, max);
  const cx = width / 2, cy = height / 2;
  const rx = width / 2 - 52, ry = height / 2 - 34;
  const nodes = [{ id: center.path, x: cx, y: cy, title: center.displayTitle, url: center.url, color: topicColor(center.topic), current: true }];
  const edges: LocalEdge[] = [];
  shown.forEach((n, index) => {
    const angle = -Math.PI / 2 + (index / shown.length) * Math.PI * 2;
    const x = +(cx + Math.cos(angle) * rx).toFixed(1), y = +(cy + Math.sin(angle) * ry).toFixed(1);
    nodes.push({ id: n.path, x, y, title: n.displayTitle, url: n.url, color: topicColor(n.topic), current: false });
    const direction = outSet.has(n.path) && inSet.has(n.path) ? 'both' : outSet.has(n.path) ? 'out' : 'in';
    edges.push({ x1: cx, y1: cy, x2: x, y2: y, direction });
  });
  return { nodes, edges, hidden: all.length - shown.length };
}
