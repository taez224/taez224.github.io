#!/usr/bin/env python3
"""작업 트리와 무관하게 같은 캐릭터 제작 폴더를 찾는다. 파일은 변경하지 않는다."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', default='.', help='작업 중인 Git 체크아웃 경로')
args = parser.parse_args()
override = os.environ.get('GARDEN_CHARACTER_ROOT')
if override:
    root = Path(override).expanduser().resolve()
else:
    result = subprocess.run(
        ['git', '-C', args.repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
        capture_output=True, text=True,
    )
    if result.returncode:
        sys.exit('Git 체크아웃을 찾지 못했다. --repo 또는 GARDEN_CHARACTER_ROOT를 지정한다.')
    root = Path(result.stdout.strip()).parent / 'docs' / 'character'

required = ['README.md', 'CURRENT-DECISIONS.md', 'PROMPT.md']
missing = [name for name in required if not (root / name).is_file()]
if missing:
    sys.exit(f'캐릭터 제작 자료가 불완전하다: {root}\n없는 파일: {", ".join(missing)}\n동기화한 정본 폴더를 GARDEN_CHARACTER_ROOT로 지정한다.')
print(root)
