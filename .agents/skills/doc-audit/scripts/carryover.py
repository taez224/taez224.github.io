#!/usr/bin/env python3
"""고치기 전 판의 문장이 지금 판에 어떻게 남았는지 셋으로 갈라 보여 준다.

    그대로   글자까지 같은 문장이 남아 있다.
    바뀜     비슷한 문장과 짝지어졌다. 뜻이 뒤집혔을 수 있으니 짝을 눈으로 확인한다.
    사라짐   짝이 없다.

짝짓기는 한 번만 한다. 새 문장 하나가 옛 문장 둘을 대신할 수 없으므로,
"~한다"와 "~하지 않는다"처럼 서로 비슷한 두 문장 가운데 하나를 지우면 사라짐으로 남는다.
이 스크립트는 판정하지 않는다. 나온 목록이 의도한 삭제인지는 사람이 확인한다.

사용법:
    python3 carryover.py AUTHORING.md              # HEAD와 현재 파일을 견준다
    python3 carryover.py AUTHORING.md --ref main   # 다른 커밋과 견준다
    python3 carryover.py --before old.md --after new.md
    python3 carryover.py AUTHORING.md --changed    # 바뀐 문장 짝까지 모두 본다
"""
import argparse
import difflib
import os
import re
import subprocess

SIMILAR = 0.72
SENTENCE_END = re.compile(r'(?<=다\.)\s+')
FENCE = re.compile(r'^\s*(```|````)')


def sentences(text: str) -> list[str]:
    """헤딩·인용·코드 블록을 뺀 본문 문장을 모은다. 표는 줄 단위로 둔다."""
    out, inside = [], False
    for line in text.split('\n'):
        if FENCE.match(line):
            inside = not inside
            continue
        if inside or not line.strip() or line.startswith('#') or line.startswith('>'):
            continue
        for sentence in SENTENCE_END.split(line.strip()):
            sentence = sentence.strip()
            if len(sentence) > 10:
                out.append(sentence)
    return out


def match_once(before: list[str], after: list[str], cutoff: float):
    """옛 문장을 새 문장에 일대일로 짝짓는다. 쓰인 새 문장은 다시 쓰지 않는다."""
    free = list(range(len(after)))
    kept, changed, gone = [], [], []

    by_text: dict[str, list[int]] = {}
    for index, sentence in enumerate(after):
        by_text.setdefault(sentence, []).append(index)

    pending = []
    for sentence in before:
        same = by_text.get(sentence)
        if same:
            index = same.pop(0)
            free.remove(index)
            kept.append(sentence)
        else:
            pending.append(sentence)

    for sentence in pending:
        best, score = None, 0.0
        matcher = difflib.SequenceMatcher()
        matcher.set_seq2(sentence)
        for index in free:
            matcher.set_seq1(after[index])
            if matcher.real_quick_ratio() < cutoff or matcher.quick_ratio() < cutoff:
                continue
            ratio = matcher.ratio()
            if ratio > score:
                best, score = index, ratio
        if best is not None and score >= cutoff:
            free.remove(best)
            changed.append((sentence, after[best], score))
        else:
            gone.append(sentence)

    return kept, changed, gone, [after[i] for i in free]


def git_show(ref: str, path: str) -> str:
    root = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True,
                          check=True).stdout.strip()
    relative = os.path.relpath(os.path.abspath(path), root)
    result = subprocess.run(['git', 'show', f'{ref}:{relative}'], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f'{ref}에서 {relative}를 읽지 못했다: {result.stderr.strip()}')
    return result.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description='옛 판의 문장이 어떻게 남았는지 본다.')
    parser.add_argument('path', nargs='?', help='현재 문서(--before/--after를 쓰면 생략한다)')
    parser.add_argument('--ref', default='HEAD', help='견줄 커밋(기본 HEAD)')
    parser.add_argument('--before', help='옛 판 파일')
    parser.add_argument('--after', help='새 판 파일')
    parser.add_argument('--cutoff', type=float, default=SIMILAR, help=f'같은 문장으로 볼 유사도(기본 {SIMILAR})')
    parser.add_argument('--changed', action='store_true', help='바뀐 문장 짝을 모두 보여 준다')
    args = parser.parse_args()

    if args.before and args.after:
        old = open(args.before, encoding='utf-8').read()
        new = open(args.after, encoding='utf-8').read()
        label = args.before
    elif args.path:
        old, new = git_show(args.ref, args.path), open(args.path, encoding='utf-8').read()
        label = f'{args.ref}:{args.path}'
    else:
        parser.print_help()
        return 2

    before, after = sentences(old), sentences(new)
    kept, changed, gone, added = match_once(before, after, args.cutoff)

    print(f'{label}: 문장 {len(before)}개 → 현재 {len(after)}개')
    print(f'그대로 {len(kept)}개, 바뀜 {len(changed)}개, 사라짐 {len(gone)}개, 새로 쓴 문장 {len(added)}개\n')

    for sentence in gone:
        print(f'  사라짐  {sentence[:110]}')
    if gone:
        print('  → 하나씩 의도한 삭제인지 확인한다.\n')

    shown = changed if args.changed else changed[:10]
    for old_sentence, new_sentence, score in shown:
        print(f'  바뀜({score:.2f})  {old_sentence[:90]}')
        print(f'         →  {new_sentence[:90]}')
    if len(changed) > len(shown):
        print(f'  … 바뀐 문장 {len(changed) - len(shown)}개 더 있다. --changed로 모두 본다.')
    if changed:
        print('  → 뜻이 뒤집히거나 조건이 빠지지 않았는지 짝을 읽는다.\n')

    for sentence in added:
        print(f'  새로  {sentence[:110]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
