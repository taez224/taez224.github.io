import type { TestContext } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function makeVault(t: TestContext, files: Record<string, string>): Promise<string> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-vault-'));
  // 파일을 만드는 도중 실패해도 테스트가 끝나면 임시 폴더를 지운다.
  t.after(() => fs.rm(vaultRoot, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(vaultRoot, file)), { recursive: true });
    await fs.writeFile(path.join(vaultRoot, file), content);
  }
  return vaultRoot;
}
