import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './helpers/markdown.ts';

test('task list items render disabled checkboxes and any character other than a space marks them done', () => {
  const html = render('x.md', '- [ ] 할 일\n- [x] 한 일\n- [?] 물음표도 완료\n- 일반 항목');
  assert.match(html, /<li class="task-list-item"><label class="task-list-item-label"><input class="task-list-item-checkbox" type="checkbox" disabled \/>할 일<\/label><\/li>/);
  assert.match(html, /<li class="task-list-item is-checked"><label class="task-list-item-label"><input class="task-list-item-checkbox" type="checkbox" disabled checked \/>한 일<\/label><\/li>/);
  assert.match(html, /<li class="task-list-item is-checked"><label class="task-list-item-label"><input[^>]*checked \/>물음표도 완료<\/label><\/li>/);
  assert.match(html, /<li>일반 항목<\/li>/);
});

// 체크박스의 접근 가능한 이름은 label로 묶은 항목 글이다. 완료 표시(CSS)도 label에만 걸리므로 중첩 목록은 label 밖에 있어야 한다.
test('a task label names its checkbox with the item text and closes before any nested list', () => {
  const html = render('x.md', '- [x] 상위 작업\n  - [ ] 아직 남은 작업');
  assert.match(html, /<li class="task-list-item is-checked"><label class="task-list-item-label"><input[^>]*checked \/>상위 작업<\/label>\n<ul>\n<li class="task-list-item"><label class="task-list-item-label"><input[^>]*disabled \/>아직 남은 작업<\/label><\/li>/);
});

test('task markers work in ordered and loose lists and keep inline markup inside the label', () => {
  assert.match(render('x.md', '1. [ ] 번호'), /<ol>\n<li class="task-list-item"><label class="task-list-item-label"><input[^>]*\/>번호<\/label><\/li>/);
  assert.match(render('x.md', '- [ ] 느슨한\n\n- [x] 목록'), /<li class="task-list-item">\n<p><label class="task-list-item-label"><input[^>]*\/>느슨한<\/label><\/p>/);
  assert.match(render('x.md', '- [ ] **굵게** 할 일'), /<input[^>]*\/><strong>굵게<\/strong> 할 일<\/label>/);
});

test('escaped markers, links, wiki links, code and markers without a following space stay literal', () => {
  for (const source of ['- \\[x\\] 이스케이프', '- [x](https://example.com) 링크', '- [[노트]] 위키', '```md\n- [ ] 코드\n```', '- [x]붙여씀', '[ ] 목록 아님']) {
    assert.doesNotMatch(render('x.md', source), /<input|task-list-item/, source);
  }
});

test('authored input elements can only survive as disabled checkboxes', () => {
  assert.equal(render('x.md', '<input type="text" name="q" value="보내기">').trim(), '<input class="task-list-item-checkbox" type="checkbox" disabled />');
});
