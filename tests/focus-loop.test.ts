import test from 'node:test';
import assert from 'node:assert/strict';
import { loopTabFocus } from '../src/scripts/focus-loop.ts';

// 가짜 DOM은 loopTabFocus가 실제로 읽는 속성만 갖춘다. 타입 검사에는 이 두 도우미에서만 알린다.
const asElement = (value: unknown) => value as unknown as HTMLElement;
const asKeyboardEvent = (value: unknown) => value as unknown as KeyboardEvent;

function fixture() {
  const doc: { activeElement: unknown } = { activeElement: null };
  const item = (extra = {}) => ({ tabIndex: 0, disabled: false, closest: () => null, getClientRects: () => [1], focus() { doc.activeElement = this; }, ...extra });
  const first = item(), middle = item(), last = item();
  const items = [first, middle, item({ disabled: true }), item({ tabIndex: -1 }), item({ getClientRects: () => [] }), last];
  const container = { ownerDocument: doc, querySelectorAll: () => items };
  const key = (shiftKey = false) => ({ key: 'Tab', shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  return { doc, first, middle, last, items, container, key };
}

test('Tab at the last item and Shift+Tab at the first item loop within the panel', () => {
  const f = fixture();
  f.doc.activeElement = f.last;
  loopTabFocus(asKeyboardEvent(f.key()), asElement(f.container));
  assert.equal(f.doc.activeElement, f.first);
  loopTabFocus(asKeyboardEvent(f.key(true)), asElement(f.container));
  assert.equal(f.doc.activeElement, f.last);
});

test('interior Tab uses browser navigation and the loop reads replaced panel contents', () => {
  const f = fixture();
  f.doc.activeElement = f.middle;
  const event = f.key();
  loopTabFocus(asKeyboardEvent(event), asElement(f.container));
  assert.equal(event.defaultPrevented, false);
  f.items.splice(1);
  loopTabFocus(asKeyboardEvent(f.key()), asElement(f.container));
  assert.equal(f.doc.activeElement, f.first);
});
