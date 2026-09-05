import test from 'node:test';
import assert from 'node:assert/strict';
import { searchShortcut } from '../client/shortcuts.mjs';
test('desktop shortcut hints follow the OS',()=>{
 assert.equal(searchShortcut('MacIntel'),'⌘K');assert.equal(searchShortcut('macOS'),'⌘K');
 assert.equal(searchShortcut('Win32'),'Ctrl+K');assert.equal(searchShortcut('Windows'),'Ctrl+K');assert.equal(searchShortcut('Linux'),'Ctrl+K');
});
test('mobile devices do not advertise a desktop shortcut',()=>{
 assert.equal(searchShortcut('iPhone'),'');assert.equal(searchShortcut('Linux armv8l','Android'), '');assert.equal(searchShortcut('MacIntel','Safari',5),'');
});
