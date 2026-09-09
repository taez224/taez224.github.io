import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, slugFor, kindPrefix, noteUrl, assertUniqueSlugs } from '../src/lib/slug.mjs';

test('slugify keeps Korean, lowercases Latin, and joins with hyphens', () => {
  assert.equal(slugify('AI Agent 시대의 Human Agency'), 'ai-agent-시대의-human-agency');
  assert.equal(slugify('ONLYOFFICE 01 - 그냥 문서 편집기인 줄 알았는데'), 'onlyoffice-01-그냥-문서-편집기인-줄-알았는데');
  assert.equal(slugify('K8s envFrom Secret은 Pod 재기동 없이 갱신되지 않는다'), 'k8s-envfrom-secret은-pod-재기동-없이-갱신되지-않는다');
  assert.equal(slugify('  Mac Terminal Tool 추천  '), 'mac-terminal-tool-추천');
  assert.equal(slugify('🗺 AI 활용'), 'ai-활용');
  assert.equal(slugify('생성은 AI에게, 검증은 나에게'), '생성은-ai에게-검증은-나에게');
});

test('slugFor prefers a valid frontmatter slug and rejects an invalid one', () => {
  assert.equal(slugFor({ slug: 'human-agency' }, 'AI Agent 시대의 Human Agency'), 'human-agency');
  assert.equal(slugFor({}, 'AI Agent 시대의 Human Agency'), 'ai-agent-시대의-human-agency');
  assert.throws(() => slugFor({ slug: 'has space' }, 'x'), /slug/);
  assert.throws(() => slugFor({ slug: '' }, 'x'), /slug/);
});

test('kindPrefix and noteUrl build kind-scoped urls under the base path', () => {
  assert.equal(kindPrefix('blog'), 'posts');
  assert.equal(kindPrefix('slipbox'), 'notes');
  assert.equal(kindPrefix('development'), 'dev');
  assert.equal(noteUrl('/obsidian', 'blog', 'human-agency'), '/obsidian/posts/human-agency/');
  assert.equal(noteUrl('/obsidian', 'slipbox', 'ai-활용', '갈래'), '/obsidian/notes/ai-활용/#갈래');
  assert.equal(noteUrl('', 'development', 'x'), '/dev/x/');
});

test('assertUniqueSlugs fails on a collision within one kind only', () => {
  assert.doesNotThrow(() => assertUniqueSlugs([
    { kind: 'blog', slug: 'a', path: 'p1' }, { kind: 'slipbox', slug: 'a', path: 'p2' }
  ]));
  assert.throws(() => assertUniqueSlugs([
    { kind: 'blog', slug: 'a', path: 'p1' }, { kind: 'blog', slug: 'a', path: 'p2' }
  ]), /p1[\s\S]*p2/);
});
