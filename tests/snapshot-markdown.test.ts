import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/snapshot-markdown.ts', import.meta.url));
test('snapshot verification distinguishes matching output, changed inputs and output regressions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-snapshot-'));
  try {
    const vault = path.join(root, 'vault');
    await fs.mkdir(path.join(vault, '01_Slipbox'), { recursive: true });
    const note = path.join(vault, '01_Slipbox/note.md');
    const source = '---\ncreated: 2026-01-01\n---\n# 노트\n본문';
    await fs.writeFile(note, source);
    const config = JSON.stringify({ include: [{ path: '01_Slipbox', mode: 'all' }], exclude: [] });
    await fs.writeFile(path.join(root, 'config.json'), config);
    const snapshot = path.join(root, 'snapshot.json');
    const run = (mode: string) => spawnSync(process.execPath, [script, mode, snapshot], {
      env: { ...process.env, GARDEN_PROJECT_ROOT: root, GARDEN_VAULT_ROOT: vault }, encoding: 'utf8'
    });
    assert.equal(run('write').status, 0);
    assert.equal(run('verify').status, 0);
    await fs.writeFile(note, source + '\n수정');
    const changed = run('verify');
    assert.equal(changed.status, 2);
    assert.doesNotMatch(changed.stdout, /차이 없음/);
    await fs.writeFile(note, source);
    await fs.writeFile(path.join(root, 'config.json'), config + '\n');
    assert.equal(run('verify').status, 2);
    await fs.writeFile(path.join(root, 'config.json'), config);
    const saved = JSON.parse(await fs.readFile(snapshot, 'utf8'));
    saved.notes['01_Slipbox/note.md'].bodyHtml = 'different';
    await fs.writeFile(snapshot, JSON.stringify(saved));
    assert.equal(run('verify').status, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
