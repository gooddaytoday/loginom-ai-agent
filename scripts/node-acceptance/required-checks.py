#!/usr/bin/env python3
"""List path-based acceptance obligations; verify report text without running checks."""
import argparse
from fnmatch import fnmatchcase
from pathlib import Path
import re
import subprocess
import sys

C = 'packages/loginom-runtime/client/lib/'
# The only path-rule table: glob(s), stable check IDs, suggested run-check cases.
RULES = (
    (('packages/loginom-runtime/src/**',), ('host-unit',), ()),
    (('packages/loginom-runtime/client/**',), ('client-full',), ()),
    (('scripts/node-acceptance/**',), ('acceptance-tests',), ()),
    (('packages/agent/**', 'packages/protocol/**', 'packages/schema/**',
      'packages/loginom-host/src/host-port.ts', 'packages/loginom-runtime/executor/schemas/**',
      'packages/client/src/generated*/**', C + 'node-contracts.*', C + 'effect-contracts.mjs',
      C + 'node-read-contract.mjs', C + 'node-result-schema.mjs'), ('main-chat-approval',), ()),
    ((C + '*read*.mjs', C + '*output*.mjs', C + '*context*.mjs', C + 'node-*.mjs',
      C + 'workspace*.mjs', C + 'ui*.mjs', C + 'observ*.mjs', C + 'native*.mjs',
      C + 'bridge.mjs', 'packages/loginom-runtime/src/connection-check.mjs'), ('live-ui',), ()),
    ((C + 'text-export*.mjs', C + 'browser-downloads.mjs'), ('live-ui', 'cold-export'), ('s1', 's8')),
    ((C + 'calculator-*.mjs', C + 'grouping-*.mjs', C + 'sorting-*.mjs', C + 'filter-*.mjs'), ('live-ui',), ('s1',)),
    ((C + 'duplicates-*.mjs', C + 'missing-values-*.mjs'), ('live-ui',), ('s2',)),
    ((C + 'join-*.mjs', C + 'replacement-*.mjs', C + 'reform-*.mjs'), ('live-ui',), ('s3',)),
    ((C + 'union-*.mjs',), ('live-ui',), ('s4',)),
    ((C + 'crosstable-*.mjs',), ('live-ui',), ('s5', 'n13')),
    ((C + 'javascript-*.mjs',), ('live-ui',), ('n18',)),
    ((C + 'clustering-*.mjs',), ('live-ui',), ('n19', 'r1', 'r2')),
    ((C + 'linregression-*.mjs',), ('live-ui',), ('n20', 'r3', 'r4')),
    ((C + 'rest-*.mjs',), ('live-ui',), ('n11', 'r5', 'r6')),
    ((C + 'date-time-*.mjs',), ('live-ui',), ('n17',)),
    ((C + 'text-import-*.mjs', C + 'imports-excel-*.mjs', C + 'collapse-*.mjs'), ('live-ui',), ('s1', 's4')),
)
UNITS = {
    'host-unit': ('(cd packages/loginom-host && bun test)', '#447: runtime/src требует полный host bun test'),
    'client-full': ('(cd packages/loginom-runtime/client && LOGINOM_DOCK_TEST_BROWSER="${LOGINOM_AI_AGENT_BROWSER_SOURCE:-$HOME/.cache/loginom-wave2-browsers}/chromium-1246/chrome-linux64/chrome" nice -n 19 node --test test/*.test.mjs)', 'полный client с закреплённым Chromium 1246 (кеш run-check)'),
    'acceptance-tests': ('node --test scripts/node-acceptance/tests/*.test.mjs', 'регрессия оснастки из корня'),
}


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.PIPE).decode('utf-8')


def changed(start, end):
    # Disable rename detection to retain BOTH old and new path obligations.
    return set(git('diff', '--no-renames', '--name-only', '-z', start + '..' + end, '--').split('\0')) - {''}


def select(paths):
    checks, cases = {}, set()
    for patterns, ids, scenarios in RULES:
        matches = sorted(p for p in paths if any(fnmatchcase(p, pattern) for pattern in patterns))
        if matches:
            cases.update(scenarios)
            for check in ids:
                checks.setdefault(check, set()).update(matches)
    return checks, sorted(cases) or ['s1', 's3', 's5', 'n18', 'n19', 'n20']


def obligations(base, head):
    base = git('rev-parse', '--verify', '--end-of-options', base + '^{commit}').strip()
    head = git('rev-parse', '--verify', '--end-of-options', head + '^{commit}').strip()
    ancestor = git('merge-base', base, head).strip()
    paths = changed(ancestor, head)
    checks, cases = select(paths)
    # start alone only detaches: the required command includes foreground wait.
    live = ('result=$(python3 scripts/node-acceptance/run-check.py start --head ' + head
            + ' --scenarios ' + ','.join(cases) + ' --pair "$PAIR" --cold)'
            + ' && python3 scripts/node-acceptance/run-check.py wait "$result" --timeout 5400')
    specs = dict(UNITS, **{
        'live-ui': (live, 'D79: живые сценарии обязательны; офлайн-replay не заменяет; сценарии по типу узла из run-check.md'),
        'cold-export': (live, 'cold Export только с --csv <скачанный CSV>; уже покрыто run-check --cold, тот же запуск'),
        'main-chat-approval': (None, 'стоп: нужно разрешение основного чата; agent / публичный контракт'),
    })
    overlap = paths & changed(ancestor, base)
    if overlap:
        affected, _ = select(overlap)
        commands = [UNITS[key][0] for key in UNITS if key in affected]
        tests = ' && '.join(commands) or 'sh -c "${HEAD_RETEST_COMMAND:?set tests for overlapping files}"'
        specs['head-retest'] = ('(cd "${MERGED_HEAD_REPO:?set checkout of combined head}" && ' + tests + ')',
                               '#193×#195: base продвинулся и изменил те же файлы; повторить тесты на объединённой голове ' + head + ' + ' + base)
        checks['head-retest'] = overlap
    return head, base, ancestor, [(key, *specs[key], sorted(checks[key])) for key in sorted(checks)]


def verify(checks, report):
    missing = []
    for key, command, _, _ in checks:
        valid = False
        for line in report.splitlines():
            fields = [field.strip() for field in line.strip().strip('|').split('|')]
            # One Markdown table row per ID, command, reason and result.
            if len(fields) != 4 or fields[0] != '`' + key + '`':
                continue
            if fields[1] != ('`' + command + '`' if command else '—'):
                continue
            outcome = fields[3]
            failed = re.fullmatch(r'FAIL; журнал: \S+:[1-9][0-9]*', outcome) is not None
            valid = valid or failed or (command is not None and outcome == 'exit 0')
        if not valid:
            missing.append(key)
    return missing


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for name in ['list', 'verify']:
        p = sub.add_parser(name)
        p.add_argument('--base', required=True)
        p.add_argument('--head', default='HEAD')
        if name == 'verify':
            p.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    try:
        head, base, ancestor, checks = obligations(args.base, args.head)
        if args.action == 'verify':
            missing = verify(checks, args.report.read_text(encoding='utf-8'))
            print('Недостающие / неполные ID: ' + ', '.join(missing) if missing
                  else 'Все ID отражены (только сверка текста; FAIL не означает приёмку).')
            return 1 if missing else 0
        print(f'head: {head}; base: {base}; merge-base: {ancestor}\n')
        print('Команды из корня репозитория. $PAIR — каталог тестовой пары. Проверки здесь не запускаются.\n')
        print('| ID | Команда | Почему / пути |\n|---|---|---|')
        for key, command, why, paths in checks:
            # Escape path delimiters/newlines so Git filenames cannot break report rows.
            names = ', '.join(p.replace('|', '&#124;').replace('\n', '&#10;').replace('\r', '&#13;') for p in paths)
            print(f'| `{key}` | ' + ('`' + command + '`' if command else '—') + f' | {why}; пути: {names} |')
        if not checks:
            print('\nНет обязательных проверок по таблице путей.')
        return 0
    except (OSError, UnicodeError, subprocess.CalledProcessError) as exc:
        detail = exc.stderr.decode('utf-8', errors='replace').strip() if isinstance(exc, subprocess.CalledProcessError) else str(exc)
        print('required-checks: ' + detail, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
