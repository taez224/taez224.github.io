import { KINDS, kindFor, type NoteKind } from '../../src/lib/kinds.ts';
import { slugFor, noteUrl, assertUniqueSlugs } from '../../src/lib/slug.ts';
import { recentByKind } from '../../src/lib/home.ts';
import { groupDevelopment, selectDevelopmentRecords, type DevelopmentCategory } from '../../src/lib/development.ts';

const kind: NoteKind = kindFor('01_Slipbox/노트.md');
const slug = slugFor({ slug: null }, '노트');
const url: string = noteUrl('', kind, slug);
const label: '노트' = KINDS.slipbox.label;
void [url, label];
assertUniqueSlugs([{ kind: 'book', slug: 'book', path: 'book.md' }]);

const notes = [{ kind: 'slipbox' as const, path: 'note.md', title: '노트', date: '2026-09-01', type: 'permanent', extra: 42 }];
const selected = recentByKind(notes, { kinds: ['slipbox'], exclude: [undefined] });
const extra: number = selected[0]!.extra;
void extra;

const category: DevelopmentCategory = 'Concepts';
const records = [{ category, title: '개념', date: '2026-09-01', tags: ['개발/Java'], url: '/dev/example/' }];
const grouped = groupDevelopment(records);
const selectedUrl: string = grouped.concepts[0]!.url;
selectDevelopmentRecords(records, 'Concepts', 'Java');
void selectedUrl;

// @ts-expect-error 공개 노트의 종류에는 book이 없다.
noteUrl('', 'book', 'example');
// @ts-expect-error 분류 철자 오류를 허용하지 않는다.
selectDevelopmentRecords(records, 'Concept');
// @ts-expect-error 최근 목록 종류는 공개 노트 종류만 받는다.
recentByKind(notes, { kinds: ['unknown'] });
// @ts-expect-error 제네릭 반환값도 입력에 없는 필드는 허용하지 않는다.
selected[0]!.missing;
