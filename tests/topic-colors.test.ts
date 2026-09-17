import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_COLORS, GRAPH_LABEL_COLORS, DARK_GRAPH_COLORS, DARK_GRAPH_LABEL_COLORS, topicColor, topicLabelColor, topicHex, topicColorCss } from '../src/lib/format.ts';
import { PALETTE, DARK_PALETTE } from '../src/lib/palette.ts';

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

test('dark topic colors keep the same contrast floors against the dark paper', () => {
  assert.deepEqual(Object.keys(DARK_GRAPH_COLORS).sort(), Object.keys(GRAPH_COLORS).sort());
  assert.deepEqual(Object.keys(DARK_GRAPH_LABEL_COLORS).sort(), Object.keys(GRAPH_COLORS).sort());
  for (const [topic, color] of Object.entries(DARK_GRAPH_COLORS)) assert.ok(contrast(color, DARK_PALETTE.paper) >= 3, `${topic} ${color}`);
  for (const [topic, color] of Object.entries(DARK_GRAPH_LABEL_COLORS)) assert.ok(contrast(color, DARK_PALETTE.paper) >= 4.5, `${topic} ${color}`);
});

test('topic colors are CSS variables whose values change with the color scheme', () => {
  const css = topicColorCss();
  const [light, dark] = css.split('@media (prefers-color-scheme: dark)');
  for (const [topic, color] of Object.entries(GRAPH_COLORS)) {
    const name = topicColor(topic).match(/^var\((--topic-[a-z]+)\)$/)?.[1];
    const label = topicLabelColor(topic).match(/^var\((--topic-label-[a-z]+)\)$/)?.[1];
    assert.ok(name && label, topic);
    assert.ok(light.includes(`${name}:${color};`) && light.includes(`${label}:${GRAPH_LABEL_COLORS[topic]};`), `${topic} 밝은 값`);
    assert.ok(dark.includes(`${name}:${DARK_GRAPH_COLORS[topic]};`) && dark.includes(`${label}:${DARK_GRAPH_LABEL_COLORS[topic]};`), `${topic} 어두운 값`);
  }
});

test('unknown topics fall back to the 기타 node and label colors', () => {
  assert.equal(topicColor('없는 주제'), topicColor('기타'));
  assert.equal(topicLabelColor('없는 주제'), topicLabelColor('기타'));
  assert.equal(topicHex('없는 주제'), GRAPH_COLORS.기타, 'OG 카드는 밝은 화면 값을 직접 쓴다');
});
