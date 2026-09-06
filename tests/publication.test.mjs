import test from 'node:test';
import assert from 'node:assert/strict';
import { isIncluded, validatePublicationConfig } from '../src/lib/publication.mjs';

const root = '30_Resources/Development';
const approved = `${root}/Concepts/public.md`;
const config = {
  include: [{ path: `${root}/Concepts`, files: [approved], graph: false }],
  exclude: [], paths: [], seeds: [], depth: 0
};

test('development file-list mode still requires explicit selection', () => {
  validatePublicationConfig(config);
  assert.equal(isIncluded(config, approved), true);
  assert.equal(isIncluded(config, `${root}/Concepts/draft.md`, { status: 'published', type: 'series' }), false);
  assert.equal(isIncluded(config, `${root}/DevLog/daily/private.md`), false);
  assert.equal(isIncluded(config, `${root}/Concepts/_index.md`), false);
  for (const rule of [
    { path: root, mode: 'all' },
    { path: `${root}/Concepts`, mode: 'all', files: [] },
    { path: `${root}/Concepts`, statuses: ['published'], files: [] },
    { path: `${root}/Concepts`, files: [`${root}/Concepts/../DevLog/private.md`] }
  ]) assert.throws(() => validatePublicationConfig({ include: [rule] }));
});

test('development folder mode includes ordinary Markdown and honors exclusions', () => {
  const folders = {
    include: ['Concepts', 'Troubleshooting', 'Tools'].map((category) => ({ path: `${root}/${category}`, mode: 'all' })),
    exclude: [`${root}/Concepts/withheld.md`]
  };
  validatePublicationConfig(folders);
  for (const category of ['Concepts', 'Troubleshooting', 'Tools']) {
    assert.equal(isIncluded(folders, `${root}/${category}/new.md`), true);
    assert.equal(isIncluded(folders, `${root}/${category}/nested/new.md`), true);
    for (const suffix of ['_index.md', '.hidden.md', '_local/private.md', '.local/private.md', '../DevLog/private.md', 'qmd-eval.json']) {
      assert.equal(isIncluded(folders, `${root}/${category}/${suffix}`), false, suffix);
    }
  }
  assert.equal(isIncluded(folders, `${root}/Concepts/withheld.md`), false);
  assert.equal(isIncluded(folders, `${root}/DevLog/private.md`), false);
});

test('private areas stay excluded even if a broad future include would match', () => {
  const broad = { include: [{ path: '20_Projects', mode: 'all' }, { path: root, mode: 'all' }], exclude: [] };
  assert.equal(isIncluded(broad, '20_Projects/job-search-2026/private.md'), false);
  assert.equal(isIncluded(broad, `${root}/DevLog/daily/private.md`), false);
  assert.equal(isIncluded(broad, `${root}/Concepts/draft.md`), false);
});

test('reviewed image assets cannot select private notes or escape the vault', () => {
  validatePublicationConfig({ ...config, assets: ['_attachments/diagram.svg'] });
  for (const asset of ['../outside.svg', '/tmp/outside.svg', `${root}/DevLog/private.svg`, '_workspace/private.svg', '_attachments/private.md']) {
    assert.throws(() => validatePublicationConfig({ ...config, assets: [asset] }));
  }
});
