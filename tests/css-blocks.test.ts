import test from 'node:test';
import assert from 'node:assert/strict';
import { flatRules, lastCompound, mediaBodies, mediaRuleBody, ruleBody, splitSelectors } from './css-blocks.ts';

const css = `
:root { --a: 1px; }
@media (max-width: 720px) {
  .ledger { gap: 8px; }
}
/* 주석이 블록 사이와 안에 끼어도 읽는다. */
@media   (max-width:  720px)   {
  /* 모바일 토큰 */
  :root { --a: 2px; /* } */ }
  :root:not([data-js]) { --a: 3px; }
}
:root:not([data-js]) { --a: 4px; }
`;

test('ruleBody reads the first top-level rule whose selector is exactly the one asked for', () => {
  assert.match(ruleBody(css, ':root'), /--a: 1px/);
  assert.match(ruleBody(css, ':root:not([data-js])'), /--a: 4px/);
});

test('mediaRuleBody finds the rule in whichever block of the same query has it, ignoring spaces and comments', () => {
  assert.equal(mediaBodies(css, '(max-width: 720px)').length, 2);
  assert.match(mediaRuleBody(css, '(max-width: 720px)', ':root'), /--a: 2px/);
  assert.match(mediaRuleBody(css, '(max-width: 720px)', '.ledger'), /gap: 8px/);
});

test('the helpers throw instead of returning an empty block when nothing matches', () => {
  assert.throws(() => ruleBody(css, '.missing'), /\.missing/);
  assert.throws(() => mediaBodies(css, '(min-width: 1px)'), /min-width: 1px/);
  assert.throws(() => mediaRuleBody(css, '(max-width: 720px)', '.missing'), /\.missing/);
  assert.throws(() => flatRules('.a { color: red;'), /닫히지 않았다/);
});

test('selectors split only at commas outside parentheses and the last compound ignores descendants inside :is()', () => {
  assert.deepEqual(splitSelectors('.a :is(.b, .c), .d'), ['.a :is(.b, .c)', '.d']);
  assert.equal(lastCompound('.graph .node.is-dim :is(.dot, .hub-ring)'), ':is(.dot, .hub-ring)');
  assert.equal(lastCompound('.graph > .node.is-dim'), '.node.is-dim');
  assert.equal(lastCompound('a[href="x y"]:hover'), 'a[href="x y"]:hover');
});

test('flatRules lists the innermost rules in document order', () => {
  assert.deepEqual(flatRules(css).map(({ selectors }) => selectors.join(',')), [':root', '.ledger', ':root', ':root:not([data-js])', ':root:not([data-js])']);
});
