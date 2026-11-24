#!/usr/bin/env python3
"""Copy bug-hunt cases into a run directory and generate their large inputs.

Usage: python3 prepare.py --out DIR [bh-a01 bh-b02 ...]
Every case may own `gen.py`; it is run as `gen.py --out DIR/<case>/data`
(after copying) and must write deterministic inputs there. The result DIR is
what `run-check.py start --cases DIR` receives. Standard library only.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

CASES = Path(__file__).resolve().parent / 'cases'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('names', nargs='*')
    args = parser.parse_args()
    names = args.names or sorted(p.name for p in CASES.iterdir() if (p / 'task.md').is_file())
    args.out.mkdir(parents=True, exist_ok=True)
    for name in names:
        src, dst = CASES / name, args.out.resolve() / name
        if not (src / 'task.md').is_file(): sys.exit(f'unknown case {name}')
        if dst.exists(): shutil.rmtree(dst)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns('gen.py', '__pycache__'))
        (dst / 'data').mkdir(exist_ok=True)
        if (src / 'gen.py').is_file():
            subprocess.run([sys.executable, '-I', str(src / 'gen.py'), '--out', str(dst / 'data')], check=True)
        print(dst)


if __name__ == '__main__':
    main()
