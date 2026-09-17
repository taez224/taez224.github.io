import type { ResolvedNote } from '../../src/lib/markdown.ts';
import { createMarkdownRenderer } from '../../src/lib/markdown.ts';

// 노트나 자산을 해석하지 않는 입력에 쓰는 렌더러다.
export const render = createMarkdownRenderer({ resolveNote: () => null, resolveAsset: () => null });

// 비공개 노트의 해석 결과는 제목·주소를 담지 않는 것이 계약이다(ResolvedNote). 계약을 어긴 값이 들어와도
// 렌더러가 그 값을 출력하지 않는지 보려고, 아래 두 렌더러에서만 계약을 깨뜨린 값을 만든다.
const offContractPrivate = (note: { visibility: 'private'; title: string; url: string }) => note as unknown as ResolvedNote;

export function renderWithVisibility() {
  return createMarkdownRenderer({
    resolveNote: (_source, target) => target.startsWith('hidden/')
      ? offContractPrivate({ visibility: 'private', title: 'NEVER_SHOW_SECRET_TITLE', url: '/NEVER_SHOW_SECRET_URL' })
      : target === 'public.md' ? { title: '공개 제목', url: '/notes/public/' } : null,
    resolveAsset: (_source, target) => target === 'picture.png' ? { url: '/assets/picture.png' } : null
  });
}

export function renderWithArticles() {
  return createMarkdownRenderer({
    resolveNote: (_source, target, fragment) => {
      if (target === 'public.md') return { title: 'Canonical & <title>', url: `/notes/public/${fragment ? `#${fragment}` : ''}` };
      if (target === 'hidden.md') return offContractPrivate({ visibility: 'private', title: 'SECRET TITLE', url: '/secret/' });
      return null;
    },
    resolveAsset: () => null
  });
}
