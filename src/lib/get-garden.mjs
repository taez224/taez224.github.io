import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleGarden } from './garden.mjs';

// npm dev/build/test는 프로젝트 루트에서 실행한다. 번들 경로 깊이에 의존하지 않는다.
const projectRoot = path.resolve(process.env.GARDEN_PROJECT_ROOT ?? process.cwd());
const vaultRoot = path.resolve(projectRoot, '../..');
let pending = null;
let assembledAt = 0;
// 개발 모드에서 한 페이지가 여러 컴포넌트에서 불러도 조립은 한 번이다. 이 시간이 지나면 다음 호출이 vault를 다시 읽는다.
const DEV_REUSE_MS = 2000;

export function invalidateGarden() { pending = null; assembledAt = 0; }

export function projectPaths() {
  return { projectRoot, vaultRoot };
}

export function getGarden() {
  // 개발 페이지의 SSR 모듈 캐시는 Content Layer 로더의 캐시와 별개다.
  // 로더가 갱신돼도 페이지에 옛 링크 목록이 남지 않도록 개발에서는 잠깐만 재사용하고 다시 읽는다.
  // 정적 빌드와 로더의 Node 실행에서는 기존 캐시를 유지한다.
  if (import.meta.env?.DEV && Date.now() - assembledAt > DEV_REUSE_MS) pending = null;
  if (!pending) {
    assembledAt = Date.now();
    pending = (async () => {
      const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'config.json'), 'utf8'));
      const garden = await assembleGarden({ vaultRoot, config, basePath: config.basePath ?? '' });
      return { config, ...garden };
    })().catch((error) => { pending = null; throw error; });
  }
  return pending;
}
