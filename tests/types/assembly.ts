import { assembleGarden, type GardenConfig } from '../../src/lib/garden.ts';
import { parseFrontmatter } from '../../src/lib/vault-files.ts';
import { resolveTarget } from '../../src/lib/links.ts';
import { createRefreshCoordinator } from '../../src/loaders/refresh-coordinator.ts';
import { vaultLoader } from '../../src/loaders/vault.ts';
import type { Loader } from 'astro/loaders';

declare const garden: Awaited<ReturnType<typeof assembleGarden>>;
const config: GardenConfig = { include: [{ path: '01_Slipbox', mode: 'all' }], exclude: [] };
const text: string = garden.notes[0]!.bodyHtml;
const bookRate: number = garden.books[0]!.rate;
const source: string = garden.edges[0]!.source;
const loader: Loader = vaultLoader();
void [config, text, bookRate, source, loader];

const parsed = parseFrontmatter('---\ncreated: 2026-01-01\n---\n본문');
// @ts-expect-error frontmatter 값은 문자열 외에 빈 값과 목록도 가능하다.
parsed.meta.created.toUpperCase();
// @ts-expect-error 공개 노트와 책 레코드의 필드는 구분한다.
garden.notes[0]!.rate;
// @ts-expect-error 링크 색인은 파일명마다 후보 경로 목록을 보관한다.
resolveTarget('a.md', 'b', new Set<string>(), new Map<string, number>());

const coordinator = createRefreshCoordinator({ invalidate() {}, async load() { return { generation: 1 }; } });
coordinator.register('notes', async (value) => () => { void value.generation; });
// @ts-expect-error 준비 단계는 스토어 교체 함수를 반환해야 한다.
coordinator.register('books', async () => {});
