import test from 'node:test';
import assert from 'node:assert/strict';
import { loopTabFocus } from '../src/scripts/focus-loop.mjs';

function fixture() {
  const doc = { activeElement: null };
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
  loopTabFocus(f.key(), f.container);
  assert.equal(f.doc.activeElement, f.first);
  loopTabFocus(f.key(true), f.container);
  assert.equal(f.doc.activeElement, f.last);
});

test('interior Tab uses browser navigation and the loop reads replaced panel contents', () => {
  const f = fixture();
  f.doc.activeElement = f.middle;
  const event = f.key();
  loopTabFocus(event, f.container);
  assert.equal(event.defaultPrevented, false);
  f.items.splice(1);
  loopTabFocus(f.key(), f.container);
  assert.equal(f.doc.activeElement, f.first);
});
