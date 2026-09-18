#!/usr/bin/env python3
"""문서의 분량과 구조를 재고, 문서가 가리키는 경로가 실제로 있는지 본다.

사용법:
    python3 measure.py AGENTS.md            # 절 크기, 긴 문단, 헤딩, 대시
    python3 measure.py AGENTS.md --names    # 백틱 안 파일 경로의 존재 확인
"""
import argparse
import os
import re
import subprocess
import sys

LONG_PARAGRAPH = 400
DASHES = {'—': 'em dash', '–': 'en dash'}
LIST_ITEM = re.compile(r'^\s*(?:[-*+]|\d+\.)\s')
TABLE_ROW = re.compile(r'^\s*\|')
# 문장 안에서 경로처럼 보이는 백틱 토큰. 와일드카드와 <자리표시자>가 든 것은 실제 경로가 아니다.
PATH_TOKEN = re.compile(r'`([^`\s]+\.(?:ts|tsx|js|mjs|md|json|yml|yaml|css|astro))`')
FENCE = re.compile(r'^\s*(```|````)')


def repo_root(start: str) -> str:
    try:
        out = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=os.path.dirname(start) or '.',
                             capture_output=True, text=True, check=True)
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return os.getcwd()


def lines_outside_fences(lines):
    inside = False
    for number, line in enumerate(lines, 1):
        if FENCE.match(line):
            inside = not inside
            continue
        if not inside:
            yield number, line


def paragraphs(lines):
    """빈 줄로 나뉜 덩어리마다 (시작 줄, 길이, 종류)를 돌려준다.

    한 줄에 한 문단을 쓰는 문서와 줄바꿈해 쓰는 문서를 같은 기준으로 재려면 덩어리로 묶어야 한다.
    목록과 표는 덩어리 전체가 길어도 문제가 아니므로 가장 긴 항목의 길이로 잰다.
    """
    found, block, start = [], [], 0
    def flush():
        if not block:
            return
        items = [line for line in block if LIST_ITEM.match(line) or TABLE_ROW.match(line)]
        if len(items) * 2 >= len(block):
            kind = '표' if any(TABLE_ROW.match(line) for line in items) else '목록'
            found.append((start, max(len(line) for line in items), kind))
        else:
            found.append((start, sum(len(line) for line in block), '문단'))

    for number, line in lines_outside_fences(lines):
        if not line.strip() or line.startswith('#'):
            flush()
            block, start = [], 0
            continue
        if not block:
            start = number
        block.append(line)
    flush()
    return found


def sections(lines):
    """`## `로 나뉜 절마다 (이름, 시작 줄, 글자 수)를 돌려준다."""
    found, current = [], None
    for number, line in lines_outside_fences(lines):
        if line.startswith('## '):
            if current:
                found.append(current)
            current = [line[3:].strip(), number, 0]
        elif current:
            current[2] += len(line)
    if current:
        found.append(current)
    return found


def report_structure(path: str, text: str) -> None:
    lines = text.split('\n')
    print(f'{path}: {len(lines)}줄, {len(text.encode())}바이트')

    found = sections(lines)
    if found:
        total = sum(size for _, _, size in found) or 1
        print('\n절별 크기(글자)')
        for name, start, size in sorted(found, key=lambda s: -s[2]):
            print(f'  {size:6d}  {size / total * 100:4.1f}%  {start:4d}행  {name}')

    long_blocks = [block for block in paragraphs(lines) if block[1] > LONG_PARAGRAPH]
    print(f'\n{LONG_PARAGRAPH}자가 넘는 덩어리: {len(long_blocks)}개 (목록과 표는 가장 긴 항목으로 잰다)')
    for start, size, kind in sorted(long_blocks, key=lambda b: -b[1]):
        print(f'  {size:5d}자  {start:4d}행  {kind}')

    print('\n헤딩')
    for number, line in lines_outside_fences(lines):
        if re.match(r'#{1,4} ', line):
            depth = len(line) - len(line.lstrip('#'))
            print(f'  {number:4d}행  {"  " * (depth - 1)}{line}')

    hits = [(number, name, line.strip()[:60]) for number, line in lines_outside_fences(lines)
            for char, name in DASHES.items() if char in line]
    print(f'\nem/en dash: {len(hits)}개')
    for number, name, preview in hits:
        print(f'  {number:4d}행  {name}  {preview}')


def report_names(path: str, text: str) -> int:
    root = repo_root(os.path.abspath(path))
    here = os.path.dirname(os.path.abspath(path))
    missing = []
    for token in sorted({m.group(1) for m in PATH_TOKEN.finditer(text)}):
        if '*' in token or '<' in token or token.startswith('@'):
            continue
        candidates = [os.path.join(base, token) for base in
                      (root, here, os.path.join(root, 'src'), os.path.join(root, 'src/lib'),
                       os.path.join(root, 'src/graph'), os.path.join(root, 'src/scripts'),
                       os.path.join(root, 'src/pages'), os.path.join(root, 'src/loaders'),
                       os.path.join(root, 'src/components'), os.path.join(root, 'src/integrations'),
                       os.path.join(root, 'scripts'), os.path.join(root, 'tests'))]
        if not any(os.path.exists(c) for c in candidates):
            missing.append(token)
    print(f'\n찾지 못한 경로: {len(missing)}개')
    for token in missing:
        print(f'  {token}')
    if missing:
        print('  (산출물 경로나 다른 저장소의 파일이면 그대로 두어도 된다.)')
    return len(missing)


def main() -> int:
    parser = argparse.ArgumentParser(description='문서의 분량·구조와 경로를 점검한다.')
    parser.add_argument('path', help='점검할 Markdown 문서')
    parser.add_argument('--names', action='store_true', help='백틱 안 파일 경로의 존재를 확인한다')
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(f'파일이 없다: {args.path}', file=sys.stderr)
        return 2
    text = open(args.path, encoding='utf-8').read()
    report_structure(args.path, text)
    if args.names:
        report_names(args.path, text)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
