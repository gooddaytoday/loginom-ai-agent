#!/usr/bin/env python3
"""List path-based acceptance obligations; verify report text without running checks."""
import argparse
from fnmatch import fnmatchcase
from pathlib import Path
import re
import subprocess
import sys

C = 'packages/loginom-runtime/client/lib/'
CONTRACTS = (C + 'node-contracts.*', C + 'effect-contracts.mjs',
             C + 'node-read-contract.mjs', C + 'node-result-schema.mjs')
# The only path-rule table: glob(s), stable check IDs, suggested run-check cases.
RULES = (
    (('packages/loginom-runtime/src/**',), ('host-unit',), ()),
    (('packages/loginom-runtime/client/**',), ('client-full',), ()),
    (('scripts/node-acceptance/**',), ('acceptance-tests',), ()),
    (('packages/opencode/**', 'packages/protocol/**', 'packages/schema/**',
      'packages/loginom-host/src/host-port.ts', 'packages/loginom-runtime/executor/schemas/**',
      'packages/client/src/generated*/**', C + 'node-contracts.*', C + 'effect-contracts.mjs',
      C + 'node-read-contract.mjs', C + 'node-result-schema.mjs'), ('main-chat-approval',), ()),
    ((C + '*read*.mjs', C + '*output*.mjs', C + '*context*.mjs', C + 'node-*.mjs',
      C + 'workspace*.mjs', C + 'ui*.mjs', C + 'observ*.mjs', C + 'native*.mjs',
      C + 'bridge.mjs', 'packages/loginom-runtime/src/connection-check.mjs'), ('live-ui',), ()),
    ((C + 'text-export*.mjs', C + 'browser-downloads.mjs'), ('live-ui', 'cold-export'), ('s1', 's8')),
    ((C + 'calculator-*.mjs', C + 'grouping-*.mjs', C + 'sorting-*.mjs', C + 'filter-*.mjs'), ('live-ui',), ('s1',)),
    ((C + 'duplicates-*.mjs', C + 'missing-values-*.mjs'), ('live-ui',), ('s2',)),
    ((C + 'join-*.mjs',), ('live-ui',), ('join-right', 'join-full', 'join-difference')),
    ((C + 'reform-*.mjs',), ('live-ui',), ('s3',)),
    ((C + 'replacement-*.mjs',), ('live-ui',), ('regex-add', 'regex-replace', 's3')),
    ((C + 'union-*.mjs',), ('live-ui',), ('s4',)),
    ((C + 'crosstable-*.mjs',), ('live-ui',), ('s5', 'n13')),
    ((C + 'javascript-*.mjs',), ('live-ui',), ('n18',)),
    ((C + 'auto-correlation-*.mjs',), ('live-ui',), ('acf-one', 'acf-series', 'acf-eight', 'acf-update')),
    ((C + 'corr-analysis-*.mjs',), ('live-ui',), ('corr-pairs', 'corr-null', 'corr-age')),
    ((C + 'elim-outlier-*.mjs',), ('live-ui',), ('outlier-sd', 'outlier-iqr')),
    ((C + 'clustering-*.mjs',), ('live-ui',), ('n19', 'r1', 'r2')),
    ((C + 'binning-*.mjs',), ('live-ui',), ('binning-count', 'binning-width', 'binning-frequency', 'binning-apply')),
    ((C + 'log-regression-*.mjs',), ('live-ui',), ('logreg-enter', 'logreg-forward', 'logreg-backward', 'logreg-stepwise')),
    ((C + 'linregression-*.mjs',), ('live-ui',), ('n20', 'r3', 'r4')),
    ((C + 'rest-*.mjs',), ('live-ui',), ('n11', 'r5', 'r6')),
    (('docs/node-development/nodes/integration-restrequest/acceptance/plain/**',), ('live-ui',), ('rest-get-plain',)),
    ((C + 'sampling-*.mjs', C + 'data-partition-*.mjs'), ('live-ui',), ('sampling', 'data-partition')),
    (('scripts/node-acceptance/sampling-modes.mjs',), ('live-ui',), ('sampling-random', 'partition-random')),
    ((C + 'date-time-*.mjs',), ('live-ui',), ('n17', 'date-time-iso', 'date-time-iso-empty')),
    ((C + 'smoothing-*.mjs',), ('live-ui',), ('smoothing-hp',)),
    ((C + 'sliding-window-*.mjs',), ('live-ui',), ('n21',)),
    ((C + 'tree-*.mjs', 'docs/node-development/nodes/trees-*/acceptance/**'), ('live-ui',), ('tree-repeat', 'tree-no-repeat')),
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


def entries(text):
    """Split a declarative list, never evaluate JavaScript from the diff."""
    tokens = re.findall(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|[A-Za-z_$][\w$]*|\s+|.", text, re.S)
    parts, part, stack = [], '', []
    for token in tokens:
        if token in '([{': stack.append(token)
        if token in ')]}':
            if not stack or stack.pop() != {')': '(', ']': '[', '}': '{'}[token]:
                raise ValueError('Unbalanced declaration')
        if token == ',' and not stack:
            if part.strip(): parts.append(part.strip())
            part = ''
        else: part += token
    if stack: raise ValueError('Unbalanced declaration')
    if part.strip(): parts.append(part.strip())
    return parts


def declarative_value(value):
    code = re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"", '""', value)
    if re.search(r'[=;`]|\+\+|--|\b(?:new|function|await|import|delete)\b', code): return False
    return all(call in ['object', 'array', 'nullable', 'values', 'Object.freeze']
               for call in re.findall(r'([\w.]+)\s*\(', code))


def added_entries(before, after, key):
    old, new = entries(before), entries(after)
    keys = [key(item) for item in new]
    if any(k in [None, '__proto__', 'constructor', 'prototype'] for k in keys) or len(keys) != len(set(keys)): return False
    old_keys = {key(v) for v in old}
    return (len(new) > len(old) and [item for item in new if key(item) in old_keys] == old
            and all(declarative_value(item) for item in new if key(item) not in old_keys))


def additive_contract(before, after):
    # Only known declarative registration points may grow. Everything outside
    # them, including validators, old schema fields and helper code, stays exact.
    declaration = re.compile(r'(?m)^(?:export )?const ([A-Za-z_$][\w$]*)\s*=.*?;(?=\s*(?:\n|$))', re.S)
    old = {m[1]: m[0] for m in declaration.finditer(before)}
    new = {m[1]: m[0] for m in declaration.finditer(after)}
    if len(old) != len(list(declaration.finditer(before))) or len(new) != len(list(declaration.finditer(after))): return False
    added = set(new) - set(old)
    if not set(old) <= set(new): return False
    changed = False
    for name, value in new.items():
        previous = old.get(name)
        if previous == value: continue
        changed = True
        body = value.split('=', 1)[1].strip().removesuffix(';').strip()
        if previous is None:
            if not re.search(r'(?:Schema|Readback)$', name): return False
            if not body.startswith(('object(', '{', 'Object.freeze(')): return False
            # Data/schema constructors only, no executable handlers or mutation.
            if not declarative_value(body): return False
            entries(body)
            continue
        previous_body = previous.split('=', 1)[1].strip().removesuffix(';').strip()
        if name == 'definitions' and body.startswith('[') and body.endswith(']') and previous_body.startswith('[') and previous_body.endswith(']'):
            key = lambda item: (m[1] if (m := re.match(r"\[\s*['\"]([^'\"]+)['\"]\s*,", item)) else None)
            if added_entries(previous_body[1:-1], body[1:-1], key): continue
        if name in ['NODE_TYPES', 'EFFECT_CONTRACTS']:
            pattern = r'(?:Object\.freeze\()?\{(.*)\}\)?'
            a, b = re.fullmatch(pattern, previous_body, re.S), re.fullmatch(pattern, body, re.S)
            key = lambda item: (m[1] if (m := re.match(r"['\"]?([\w.]+)['\"]?\s*:", item)) else None)
            if a and b and added_entries(a[1], b[1], key): continue
        if name == 'configurationReadback':
            a = re.fullmatch(r'\{anyOf:\[(.*)\]\}', previous_body, re.S)
            b = re.fullmatch(r'\{anyOf:\[(.*)\]\}', body, re.S)
            if a and b and added_entries(a[1], b[1], lambda item: item if re.fullmatch(r'\w+', item) else None):
                if set(entries(b[1])) - set(entries(a[1])) <= added: continue
        return False
    # Strip only accepted declarations; source between them must be identical.
    before_rest = declaration.sub(lambda m: '@' + m[1] + '@', before)
    after_rest = declaration.sub(lambda m: '' if m[1] in added else '@' + m[1] + '@', after)
    # A new TS interface is a new schema; edits to old interfaces stay in rest.
    for match in reversed(list(re.finditer(r'(?m)^export interface (\w+)[^{\n]*\{', after_rest))):
        if re.search(r'\b(?:interface|type|const)\s+' + re.escape(match[1]) + r'\b', before): continue
        depth, end = 1, None
        for token in re.finditer(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|[{}]", after_rest[match.end():]):
            if token[0] == '{': depth += 1
            if token[0] == '}': depth -= 1
            if depth == 0:
                end = match.end() + token.end()
                break
        if end is None: return False
        after_rest = after_rest[:match.start()] + after_rest[end:]
        changed = True
    # NodeType is the one existing TypeScript union whose members are node keys.
    union = re.compile(r"export type NodeType\s*=\s*([^;]+);")
    a, b = union.search(before_rest), union.search(after_rest)
    if a and b and a[0] != b[0]:
        values = lambda s: [v.strip() for v in s.split('|')]
        aa, bb = values(a[1]), values(b[1])
        if not all(re.fullmatch(r"'[^']+'", v) for v in bb) or len(set(bb)) != len(bb): return False
        if [v for v in bb if v in aa] != aa or len(bb) <= len(aa): return False
        before_rest, after_rest = union.sub('@NodeType@', before_rest), union.sub('@NodeType@', after_rest)
        changed = True
    return changed and [v for v in before_rest.splitlines() if v.strip()] == [v for v in after_rest.splitlines() if v.strip()]


def additive_paths(paths, base, head):
    result = set()
    for path in paths:
        if not any(fnmatchcase(path, pattern) for pattern in CONTRACTS): continue
        try:
            before, after = git('show', base + ':' + path), git('show', head + ':' + path)
            if additive_contract(before, after): result.add(path)
        except (subprocess.CalledProcessError, ValueError): pass  # Unknown/deleted syntax keeps the stop.
    return result


def obligations(base, head):
    base = git('rev-parse', '--verify', '--end-of-options', base + '^{commit}').strip()
    head = git('rev-parse', '--verify', '--end-of-options', head + '^{commit}').strip()
    ancestor = git('merge-base', base, head).strip()
    paths = changed(ancestor, head)
    checks, cases = select(paths)
    additions = additive_paths(paths, ancestor, head)
    if additions:
        checks.get('main-chat-approval', set()).difference_update(additions)
        if not checks.get('main-chat-approval'): checks.pop('main-chat-approval', None)
        for key in ['client-full', 'acceptance-tests', 'live-ui']:
            checks.setdefault(key, set()).update(additions)
    # start alone only detaches: the required command includes foreground wait.
    live = ('result=$(python3 scripts/node-acceptance/run-check.py start --head ' + head
            + ' --scenarios ' + ('"${NODE_SCENARIOS:?set run-check scenarios for the new node}"' if additions else ','.join(cases)) + ' --pair "$PAIR" --cold)'
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
