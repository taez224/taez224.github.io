import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isIncluded, validatePublicationConfig } from '../scripts/publication.mjs';

const root = '30_Resources/Development';
const approved = `${root}/Concepts/public.md`;
const config = {
  include: [{ path: `${root}/Concepts`, files: [approved], graph: false }],
  exclude: [], paths: [], seeds: [], depth: 0
};

test('development publication is explicit, even for notes marked published', () => {
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

test('build emits only reviewed development notes and removes old generated assets', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-publication-'));
  const project = path.join(workspace, '20_Projects/obsidian-garden');
  const original = fileURLToPath(new URL('..', import.meta.url));
  try {
    await fs.mkdir(project, { recursive: true });
    for (const name of ['scripts', 'client', 'assets', 'site-template.html']) {
      await fs.cp(path.join(original, name), path.join(project, name), { recursive: true });
    }
    await fs.writeFile(path.join(project, 'package.json'), '{"type":"module"}');
    await fs.symlink(path.join(original, 'node_modules'), path.join(project, 'node_modules'), 'dir');
    const withheld = `${root}/Concepts/withheld.md`;
    const diagram = '_attachments/reviewed.svg';
    await fs.mkdir(path.join(workspace, '_attachments'), { recursive: true });
    await fs.writeFile(path.join(workspace, diagram), '<svg xmlns="http://www.w3.org/2000/svg"><text>PUBLIC_DIAGRAM</text></svg>');
    await fs.writeFile(path.join(workspace, '_attachments/unreviewed.svg'), '<svg>PRIVATE_IMAGE_SENTINEL</svg>');
    await fs.writeFile(path.join(project, 'config.json'), JSON.stringify({ ...config, assets: [diagram], paths: [{ id: 'withheld-path', title: 'Hidden', items: [withheld] }] }));
    for (const [file, content] of [
      [approved, '---\ncreated: 2026-09-06\nsummary: Public summary\n---\n# Public concept\nPublic explanation.\n\n![[reviewed.svg]]'],
      [withheld, '---\nstatus: published\n---\n# WITHHELD_TITLE\nPRIVATE_CONTENT_SENTINEL'],
      [`${root}/DevLog/daily/private.md`, '# PRIVATE_LOG_TITLE\nPRIVATE_LOG_SENTINEL']
    ]) {
      await fs.mkdir(path.dirname(path.join(workspace, file)), { recursive: true });
      await fs.writeFile(path.join(workspace, file), content);
    }
    await fs.mkdir(path.join(project, 'dist/assets'), { recursive: true });
    await fs.writeFile(path.join(project, 'dist/assets/removed.svg'), 'STALE_PRIVATE_ASSET');
    execFileSync(process.execPath, [path.join(project, 'scripts/build.mjs')], { stdio: 'pipe' });
    const html = await fs.readFile(path.join(project, 'dist/index.html'), 'utf8');
    const payload = JSON.parse(html.match(/const DATA = (.+);\nconst viewLabels/)[1]);
    assert.deepEqual(payload.notes.map((note) => note.path), [approved]);
    assert.equal(payload.notes[0].category, 'Concepts');
    assert.equal(payload.development.concepts[0].summary, 'Public summary');
    assert.equal(payload.stats.developmentNotes, 1);
    assert.deepEqual(payload.paths, []);
    assert.match(payload.notes[0].bodyHtml, /assets\/vault\/_attachments\/reviewed.svg/);
    assert.match(await fs.readFile(path.join(project, 'dist/assets/vault', diagram), 'utf8'), /PUBLIC_DIAGRAM/);
    await assert.rejects(fs.access(path.join(project, 'dist/assets/vault/_attachments/unreviewed.svg')));
    assert.doesNotMatch(html, /PRIVATE_CONTENT_SENTINEL|PRIVATE_LOG_SENTINEL|WITHHELD_TITLE|withheld\.md/);
    await assert.rejects(fs.access(path.join(project, 'dist/assets/removed.svg')));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
