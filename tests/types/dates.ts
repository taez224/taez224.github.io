import { dateOnly, kstDate, newestFirst, noteDates, type NoteDates } from '../../src/lib/dates.ts';

const context = { path: 'note.md', today: '2026-09-12' };
const meta: Record<string, unknown> = { created: '2026-09-01' };
const dates: NoteDates = noteDates(meta, context);
const day: string = dateOnly(meta.created);
const today: string = kstDate(new Date());
void [dates, day, today];

const notes = [{ title: '노트', date: '2026-09-01', slug: 'note' }];
notes.sort(newestFirst());
notes.sort(newestFirst((note) => note.date));
const rows = [{ day: '2026-09-01', post: { title: '글' } }];
rows.sort(newestFirst((row) => row.day, (row) => row.post.title));

// 검증 전 frontmatter 값은 unknown으로 받되 호출 문맥과 반환값의 타입은 지킨다.
// @ts-expect-error today는 필수 문자열이다.
noteDates(meta, { path: 'note.md' });
// @ts-expect-error kstDate는 Date 객체를 받는다.
kstDate('2026-09-12');
// @ts-expect-error 사용자 지정 정렬에서도 항목에 없는 필드는 허용하지 않는다.
rows.sort(newestFirst((row) => row.missing, (row) => row.post.title));
