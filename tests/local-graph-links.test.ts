import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// 로컬 그래프 스크립트를 Node와 같은 타입 제거 방식으로 읽는다. share.test.ts와 같은 방식이다.
const source = stripTypeScriptTypes(await fs.readFile(new URL('../src/scripts/local-graph.ts', import.meta.url), 'utf8')).replace(/^export \{\};\s*/, '');

class FakeElement {
  href: string; classes = new Set<string>(); listeners = new Map<string, () => void>();
  constructor(href: string) { this.href = href; }
  getAttribute(name: string) { return name === 'href' ? this.href : null; }
  get classList() { return { toggle: (name: string, on: boolean) => { if (on) this.classes.add(name); else this.classes.delete(name); } }; }
  addEventListener(event: string, listener: () => void) { this.listeners.set(event, listener); }
  fire(event: string) { this.listeners.get(event)?.(); }
  get linked() { return this.classes.has('is-linked'); }
}

// 그래프 이웃 둘과 사이드바 목록 줄 셋. taste는 참조 목록과 연재 목록 양쪽에 있고, other는 그래프에 없다.
function sidebar({ canHover = true } = {}) {
  const nodes = [new FakeElement('/notes/taste/'), new FakeElement('/notes/judgment/')];
  const rows = [new FakeElement('/notes/taste/'), new FakeElement('/notes/judgment/'), new FakeElement('/notes/taste/'), new FakeElement('/notes/other/')];
  const graph = { querySelectorAll: () => nodes };
  vm.runInNewContext(source, {
    document: { querySelector: () => graph, querySelectorAll: () => rows },
    matchMedia: () => ({ matches: canHover })
  });
  return { nodes, rows };
}

test('hovering a graph node highlights the same note in the sidebar lists', () => {
  const { nodes, rows } = sidebar();
  nodes[0].fire('mouseenter');
  assert.deepEqual([nodes[0], ...rows].map((el) => el.linked), [true, true, false, true, false]);
  nodes[0].fire('mouseleave');
  assert.ok([nodes[0], ...rows].every((el) => !el.linked));
});

test('hovering or focusing a list row highlights its node in the graph', () => {
  const { nodes, rows } = sidebar();
  rows[1].fire('mouseenter');
  assert.ok(nodes[1].linked && rows[1].linked);
  assert.ok(!nodes[0].linked);
  rows[1].fire('mouseleave');
  rows[1].fire('focus');
  assert.ok(nodes[1].linked, '키보드 포커스도 같은 짝을 강조한다');
  rows[1].fire('blur');
  assert.ok(!nodes[1].linked);
});

test('touch devices keep only focus highlighting so a tap does not leave a highlight behind', () => {
  // 터치 기기는 탭한 요소에 mouseenter가 오고 mouseleave가 오지 않아 강조가 남는다(DESIGN.md 호버 한정 규칙).
  const { nodes, rows } = sidebar({ canHover: false });
  nodes[0].fire('mouseenter');
  assert.ok(!rows[0].linked);
  nodes[0].fire('focus');
  assert.ok(rows[0].linked);
});
