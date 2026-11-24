#!/usr/bin/env python3
"""Supplement the stock subject substring check with bounded refusal evidence.

Usage: refusal-check.py MODEL_STDOUT {bh-a14,bh-a17}
This is a conservative phrase recognizer, not a semantic oracle. Unknown wording
returns REVIEW_REQUIRED (exit 2); inspect the complete answer before acceptance.
Run audit-a.py as well: wording never proves that no conversion was attempted.
"""
import argparse
import json
from pathlib import Path
import re


def check(answer, case):
    subject = bool(re.search(r'\bXML\b' if case == 'bh-a14' else r'\bJSON\b', answer, re.I))
    if case == 'bh-a14':
        # Keep reason and negation in the same sentence, with bounded distance.
        reason = bool(re.search(
            r'(?:XML[^.!?\n]{0,180}(?:нельзя прочитать|не поддерж|недоступ|нет среди)|'
            r'импорт[^.!?\n]{0,100}XML[^.!?\n]{0,100}нет|'
            r'(?:нет|отсутствует|недоступ\w*|не поддерж\w*)\s+(?:(?:нативн\w*|прям\w*|импорт\w*|формат\w*)\s+)*XML)',
            answer, re.I))
    else:
        root_array = re.search(r'(?:корнев\w*|верхн\w* уров\w*)[^.!?\n]{0,70}массив|массив[^.!?\n]{0,70}(?:корн\w*|верхн\w* уров\w*)', answer, re.I)
        limitation = re.search(r'не поддерж|недоступ|требует|ожидает|только[^.!?\n]{0,60}объект|один[^.!?\n]{0,60}объект|нельзя', answer, re.I)
        reason = bool(root_array and limitation)
    return 'PASS' if subject and reason else 'REVIEW_REQUIRED'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('journal', type=Path)
    parser.add_argument('case', choices=['bh-a14', 'bh-a17'])
    args = parser.parse_args()
    answers = []
    for line, raw in enumerate(args.journal.read_text().splitlines(), 1):
        try:
            event = json.loads(raw)
        except ValueError:
            continue
        if event.get('type') == 'text':
            answers.append((line, event.get('part', {}).get('text', '')))
    line, answer = answers[-1] if answers else (None, '')
    status = check(answer, args.case)
    print(json.dumps(dict(status=status, line=line, answer=answer,
                         limitation='Phrase evidence only; audit actions separately.'), ensure_ascii=False, indent=2))
    return 0 if status == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())
