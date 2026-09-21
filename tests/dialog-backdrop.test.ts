import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeOnBackdrop } from '../src/scripts/dialog-backdrop.ts';

// 가짜 대화상자는 closeOnBackdrop이 실제로 읽는 것만 갖춘다. 상자는 (100, 100)에서 (300, 300)까지다.
function fixture() {
  const listeners: Record<string, (event: unknown) => void> = {};
  let closed = 0;
  const dialog = {
    addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; },
    getBoundingClientRect: () => ({ left: 100, right: 300, top: 100, bottom: 300 }),
    close: () => { closed += 1; }
  };
  closeOnBackdrop(dialog as unknown as HTMLDialogElement);
  // 배경을 누르면 대상이 대화상자 자신이고, 상자 안의 내용을 누르면 그 자식이다.
  const content = {};
  const at = (x: number, y: number, target: unknown = dialog) => ({ target, clientX: x, clientY: y });
  const press = (down: object, up: object) => { listeners.pointerdown!(down); listeners.click!(up); };
  return { press, at, content, closed: () => closed };
}

test('a press and release on the backdrop closes the dialog', () => {
  const f = fixture();
  f.press(f.at(20, 20), f.at(20, 20));
  assert.equal(f.closed(), 1);
});

test('a press inside that is released on the backdrop keeps the dialog open', () => {
  // 글자를 끌어 고르거나 도표를 끌다가 배경에서 손을 뗀 경우다. 브라우저는 이때 click을 대화상자 자신에게 보낸다.
  const f = fixture();
  f.press(f.at(150, 150, f.content), f.at(20, 20));
  assert.equal(f.closed(), 0);
});

test('a click on the dialog content keeps it open', () => {
  const f = fixture();
  f.press(f.at(150, 150, f.content), f.at(150, 150, f.content));
  assert.equal(f.closed(), 0);
});

// 검색과 도표 크게 보기가 같은 판정을 따로 적어 두었더니 한쪽에만 끌기 보호가 들어갔다.
test('every dialog that closes on its backdrop uses the shared helper', () => {
  for (const path of ['src/scripts/search.ts', 'src/scripts/mermaid-viewer.ts']) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /closeOnBackdrop\(/, `${path}가 공용 판정을 쓴다`);
    assert.doesNotMatch(source, /clientX < /, `${path}에 좌표 판정이 따로 남아 있지 않다`);
  }
});
