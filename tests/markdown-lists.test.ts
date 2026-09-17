import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './helpers/markdown.ts';

test('task list items render disabled checkboxes and any character other than a space marks them done', () => {
  const html = render('x.md', '- [ ] 할 일\n- [x] 한 일\n- [?] 물음표도 완료\n- 일반 항목');
  assert.match(html, /<li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" disabled \/>할 일<\/li>/);
  assert.match(html, /<li class="task-list-item is-checked"><input class="task-list-item-checkbox" type="checkbox" disabled checked \/>한 일<\/li>/);
  assert.match(html, /<li class="task-list-item is-checked"><input class="task-list-item-checkbox" type="checkbox" disabled checked \/>물음표도 완료<\/li>/);
  assert.match(html, /<li>일반 항목<\/li>/);
});

test('task markers work in ordered, loose and nested lists and keep inline markup', () => {
  assert.match(render('x.md', '1. [ ] 번호'), /<ol>\n<li class="task-list-item"><input[^>]*\/>번호<\/li>/);
  assert.match(render('x.md', '- [ ] 느슨한\n\n- [x] 목록'), /<li class="task-list-item">\n<p><input[^>]*\/>느슨한<\/p>/);
  assert.match(render('x.md', '- [x] 상위\n  - [ ] 하위'), /<li class="task-list-item is-checked"><input[^>]*checked \/>상위\n<ul>\n<li class="task-list-item"><input[^>]*disabled \/>하위<\/li>/);
  assert.match(render('x.md', '- [ ] **굵게** 할 일'), /<input[^>]*\/><strong>굵게<\/strong> 할 일/);
});

test('escaped markers, links, wiki links, code and markers without a following space stay literal', () => {
  for (const source of ['- \\[x\\] 이스케이프', '- [x](https://example.com) 링크', '- [[노트]] 위키', '```md\n- [ ] 코드\n```', '- [x]붙여씀', '[ ] 목록 아님']) {
    assert.doesNotMatch(render('x.md', source), /<input|task-list-item/, source);
  }
});

test('authored input elements can only survive as disabled checkboxes', () => {
  assert.equal(render('x.md', '<input type="text" name="q" value="보내기">').trim(), '<input class="task-list-item-checkbox" type="checkbox" disabled />');
});
