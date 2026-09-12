import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, slugFor, kindPrefix, noteUrl, siteHome, assertUniqueSlugs } from '../src/lib/slug.ts';

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
  assert.throws(() => slugFor({ slug: 'dot.slug' }, 'x'), /slug/);
});

// 템플릿이 빈 slug를 달고 나오므로, 채우지 않은 노트 하나가 사이트 전체 빌드를 막지 않게 한다.
// frontmatter 파서는 값 없는 키를 빈 배열로, YAML의 null과 ~를 null로 준다. 셋 다 "값 없음"이다.
test('slugFor falls back to the title when the frontmatter slug is empty', () => {
  const title = 'K8s envFrom Secret은 Pod 재기동 없이 갱신되지 않는다';
  const derived = 'k8s-envfrom-secret은-pod-재기동-없이-갱신되지-않는다';
  for (const slug of ['', '   ', null, []]) {
    assert.equal(slugFor({ slug }, title), derived, `${JSON.stringify(slug)}는 제목으로 넘어간다`);
  }
});

test('kindPrefix and noteUrl build kind-scoped urls under the base path', () => {
  assert.equal(kindPrefix('blog'), 'posts');
  assert.equal(kindPrefix('slipbox'), 'notes');
  assert.equal(kindPrefix('development'), 'dev');
  assert.equal(noteUrl('/obsidian', 'blog', 'human-agency'), '/obsidian/posts/human-agency/');
  assert.equal(noteUrl('/obsidian', 'slipbox', 'ai-활용', '갈래'), '/obsidian/notes/ai-활용/#갈래');
  assert.equal(noteUrl('', 'development', 'x'), '/dev/x/');
});

test('siteHome is the absolute home url whether or not the base path ends with a slash', () => {
  assert.equal(siteHome('https://example.com', '/obsidian').href, 'https://example.com/obsidian/');
  assert.equal(siteHome('https://example.com', '/obsidian/').href, 'https://example.com/obsidian/');
  assert.equal(siteHome('https://example.com').href, 'https://example.com/');
  assert.equal(siteHome(new URL('https://example.com'), null).href, 'https://example.com/', 'Astro.site는 URL 객체이고 config에 basePath가 없을 수 있다');
});

test('assertUniqueSlugs fails on a collision within one kind only', () => {
  assert.doesNotThrow(() => assertUniqueSlugs([
    { kind: 'blog', slug: 'a', path: 'p1' }, { kind: 'slipbox', slug: 'a', path: 'p2' }
  ]));
  assert.throws(() => assertUniqueSlugs([
    { kind: 'blog', slug: 'a', path: 'p1' }, { kind: 'blog', slug: 'a', path: 'p2' }
  ]), /p1[\s\S]*p2/);
});
