import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// 브라우저 스크립트를 Node와 같은 타입 제거 방식으로 읽고, vm의 script 문맥에 맞춰 모듈 표식만 뺀다.
const source = stripTypeScriptTypes(await fs.readFile(new URL('../src/scripts/share.ts', import.meta.url), 'utf8')).replace(/^export \{\};\s*/, '');

// vm 문맥에 넣는 가짜 브라우저. 공유 스크립트가 실제로 부르는 것만 갖춘다.
interface FakeNavigator {
  clipboard?: { writeText: (url: string) => Promise<void> };
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
}
function setup({ clipboard, share }: FakeNavigator = {}) {
  const classes = new Set(['visually-hidden']);
  const feedback = {
    textContent: '', style: {},
    classList: { add: (name: string) => classes.add(name), toggle: (name: string, on: boolean) => on ? classes.add(name) : classes.delete(name) },
    getBoundingClientRect: () => ({ left: 40, right: 300 })
  };
  const label = { textContent: '' };
  const control = { hidden: true, querySelector: () => feedback };
  let click: () => unknown | Promise<unknown>;
  const button = { dataset: {} as Record<string, string>, title: '', querySelector: () => label, closest: () => control, hasAttribute: () => true, addEventListener: (_event: string, listener: () => unknown) => { click = listener; } };
  const timers = new Map<number, { fn: () => void; delay: number }>();
  let nextTimer = 0;
  vm.runInNewContext(source, {
    navigator: { clipboard, share },
    document: { title: '공유할 노트', querySelectorAll: () => [button], querySelector: () => ({ content: '공개 요약' }) },
    window: {
      location: { href: 'https://taez224.github.io/map/?node=notes%2Fai-usage#detail' },
      innerWidth: 360, matchMedia: () => ({ matches: true }),
      setTimeout(fn: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id: number) { timers.delete(id); }
    }
  });
  return { click: () => click(), feedback, label, control, button, classes, timers };
}

test('a failed copy shows recovery guidance and clears it after five seconds', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('denied'); } }]) {
    const ui = setup({ clipboard });
    await ui.click();
    assert.equal(ui.control.hidden, false);
    assert.equal(ui.classes.has('visually-hidden'), false);
    assert.match(ui.feedback.textContent, /복사하지 못했습니다/);
    assert.match(ui.feedback.textContent, /주소창에서 링크를 복사/);
    const timer = [...ui.timers.values()][0];
    assert.equal(timer.delay, 5000);
    timer.fn();
    assert.equal(ui.feedback.textContent, '');
    assert.equal(ui.classes.has('visually-hidden'), true);
    assert.equal(ui.label.textContent, '링크 복사');
  }
});

test('a successful retry replaces the failure and preserves the current query and fragment', async () => {
  let fail = true, copied;
  const ui = setup({ clipboard: { writeText: async (url) => { if (fail) throw new Error('denied'); copied = url; } } });
  await ui.click();
  fail = false;
  await ui.click();
  assert.equal(copied, 'https://taez224.github.io/map/?node=notes%2Fai-usage#detail');
  assert.equal(ui.label.textContent, '복사됨');
  assert.equal(ui.button.dataset.state, 'done');
  assert.equal(ui.classes.has('visually-hidden'), true);
  assert.equal(ui.timers.size, 1);
  assert.equal([...ui.timers.values()][0].delay, 2000);
});

test('cancelled sharing is silent while a denied share falls back to copying', async () => {
  let copies = 0;
  const clipboard = { writeText: async () => { copies++; } };
  const cancelled = setup({ clipboard, share: async () => { throw { name: 'AbortError' }; } });
  await cancelled.click();
  assert.equal(copies, 0);
  assert.equal(cancelled.feedback.textContent, '');
  const denied = setup({ clipboard, share: async () => { throw { name: 'NotAllowedError' }; } });
  await denied.click();
  assert.equal(copies, 1);
  assert.equal(denied.label.textContent, '복사됨');
});
