import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_COLORS, GRAPH_LABEL_COLORS, topicColor, topicLabelColor } from '../src/lib/format.ts';
import { PALETTE } from '../src/lib/palette.ts';

const channel = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('topic node colors keep 3:1 against the map paper', () => {
  for (const [topic, color] of Object.entries(GRAPH_COLORS)) assert.ok(contrast(color, PALETTE.paper) >= 3, `${topic} ${color}`);
});

test('every topic has a region label color that reads at 4.5:1 on the map paper', () => {
  assert.deepEqual(Object.keys(GRAPH_LABEL_COLORS).sort(), Object.keys(GRAPH_COLORS).sort());
  for (const [topic, color] of Object.entries(GRAPH_LABEL_COLORS)) assert.ok(contrast(color, PALETTE.paper) >= 4.5, `${topic} ${color}`);
});

test('unknown topics fall back to the 기타 node and label colors', () => {
  assert.equal(topicColor('없는 주제'), GRAPH_COLORS.기타);
  assert.equal(topicLabelColor('없는 주제'), GRAPH_LABEL_COLORS.기타);
});
