import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleGarden } from './garden.mjs';

// npm dev/build/test는 프로젝트 루트에서 실행한다. 번들 경로 깊이에 의존하지 않는다.
const projectRoot = path.resolve(process.env.GARDEN_PROJECT_ROOT ?? process.cwd());
const vaultRoot = path.resolve(projectRoot, '../..');
let pending = null;

export function invalidateGarden() { pending = null; }

export function projectPaths() {
  return { projectRoot, vaultRoot };
}

export function getGarden() {
  pending ??= (async () => {
    const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'config.json'), 'utf8'));
    const garden = await assembleGarden({ vaultRoot, config, basePath: config.basePath ?? '' });
    return { config, ...garden };
  })().catch((error) => { pending = null; throw error; });
  return pending;
}
