import test from 'node:test';
import assert from 'node:assert/strict';
import { staticImports, withModulePreloads } from '../src/integrations/module-preload.ts';

test('staticImports lists the relative static imports of a built module and ignores dynamic ones', () => {
  const js = 'import{a}from"./engine.B1.js";import"./side.C2.js";const x=await import("./lazy.D3.js");export{a};';
  assert.deepEqual(staticImports(js), ['./engine.B1.js', './side.C2.js']);
});

test('withModulePreloads adds one preload per dependency before the first module script and never duplicates', () => {
  const html = '<head><meta charset="utf-8"><script type="module" src="/_astro/page.A1.js"></script></head>';
  const out = withModulePreloads(html, ['/_astro/engine.B1.js', '/_astro/engine.B1.js']);
  assert.equal((out.match(/rel="modulepreload"/g) ?? []).length, 1);
  assert.ok(out.indexOf('modulepreload') < out.indexOf('<script type="module"'));
  assert.equal(withModulePreloads(html, []), html);
});

import { withRenderBlocking } from '../src/integrations/module-preload.ts';

test('withRenderBlocking moves the page script into <head> with blocking="render" and leaves other module scripts alone', () => {
  const html = '<html><head><meta charset="utf-8"></head><body><svg></svg><script type="module" src="/_astro/index.astro_astro_type_script_index_0_lang.A1.js"></script><script type="module" src="/_astro/SearchDialog.astro_astro_type_script_index_0_lang.B2.js"></script></body></html>';
  const out = withRenderBlocking(html, (src) => src.includes('index.astro_astro_type_script'));
  const head = out.slice(0, out.indexOf('</head>'));
  assert.ok(head.includes('<script type="module" blocking="render" src="/_astro/index.astro_astro_type_script_index_0_lang.A1.js"></script>'), '진입 스크립트는 head에서 렌더링을 막는다');
  assert.equal((out.match(/index\.astro_astro_type_script/g) ?? []).length, 1, '본문에서는 사라진다');
  assert.ok(out.indexOf('SearchDialog') > out.indexOf('</head>'), '다른 모듈 스크립트는 그대로 본문에 남는다');
  assert.equal(withRenderBlocking(out, (src) => src.includes('index.astro_astro_type_script')), out, '두 번 적용해도 같다');
  assert.equal(withRenderBlocking(html, () => false), html, '대상이 없으면 그대로');
});
