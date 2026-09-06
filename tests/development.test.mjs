import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../client/site.js', import.meta.url), 'utf8');
const fn = (name) => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
const names = ['escapeHtml', 'safeUrl', 'developmentCategoryLabel', 'displayDevelopmentTags', 'selectDevelopmentRecords', 'renderDevelopmentRecord', 'renderDevelopment'];
const record = (category, title, tag) => ({ category, title, fileTitle: title, path: `${title}.md`, url: `?note=${title}`, date: '2026-09-06', summary: `<${title}> summary`, tags: [`개발/${tag}`] });

test('development view filters all three categories, resets technology and keeps keyboard focus', () => {
  const app = { innerHTML: '' };
  let focused = '';
  const controls = new Map();
  const document = { querySelectorAll(selector) {
    const attr = selector.slice(1, -1);
    const key = attr === 'data-development-category' ? 'developmentCategory' : 'developmentTag';
    return [...app.innerHTML.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((match) => {
      const id = `${key}:${match[1]}`;
      const control = { dataset: { [key]: match[1] }, addEventListener: (_, callback) => controls.set(id, callback), focus: () => { focused = id; } };
      return control;
    });
  } };
  const context = vm.createContext({
    app, document, bindInternalNoteLinks() {},
    state: { developmentCategory: 'all', developmentTag: 'all' },
    DATA: { development: {
      concepts: [record('Concepts', 'Concept', 'DB')],
      troubleshooting: [record('Troubleshooting', 'Problem', 'Java')],
      tools: [record('Tools', 'Tool', 'DB')]
    } }
  });
  vm.runInContext(names.map(fn).join('\n'), context);
  context.renderDevelopment();
  assert.match(app.innerHTML, /개발 노트/);
  assert.match(app.innerHTML, /&lt;Concept&gt; summary/);
  assert.equal((app.innerHTML.match(/data-development-path=/g) || []).length, 3);
  controls.get('developmentTag:Java')();
  assert.equal((app.innerHTML.match(/data-development-path=/g) || []).length, 1);
  controls.get('developmentCategory:Concepts')();
  assert.equal(context.state.developmentTag, 'all');
  assert.equal(focused, 'developmentCategory:Concepts');
  assert.match(app.innerHTML, /data-development-path="Concept.md"/);
  assert.doesNotMatch(app.innerHTML, /data-development-path="Problem.md"/);
  context.DATA.development.troubleshooting = [];
  controls.get('developmentCategory:Troubleshooting')();
  assert.match(app.innerHTML, /공개된 노트가 아직 없습니다/);
});
