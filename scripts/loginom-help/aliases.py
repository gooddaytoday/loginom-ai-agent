"""Check the build-time search synonyms (aliases.jsonl) against the shipped Loginom Help.

Usage:
  python3 -I scripts/loginom-help/aliases.py check [--help-dir packages/product/help]
  python3 -I scripts/loginom-help/aliases.py missing [--help-dir packages/product/help]

check   exits 1 when a Calculator function has no synonyms or an entry points to a page that no
        longer exists.
missing prints one JSON line per function or page without synonyms, with the text an agent needs
        to write them (see aliases-prompt.md).
"""
import argparse
import json
import re
import sys
from pathlib import Path

FUNCTION_PAGES = 'data/processors/func/calc-func/'
HEADING = re.compile(r'^#{2,4}\s+([A-Z][A-Za-z0-9]+)\s*$', re.M)


def load(help_dir):
    manifest = json.loads((help_dir / 'help-manifest.json').read_text(encoding='utf-8'))
    pages = {item['path']: (help_dir / 'loginom-help' / item['path']).read_text(encoding='utf-8') for item in manifest['files']}
    lines = (help_dir / 'aliases.jsonl').read_text(encoding='utf-8').splitlines() if (help_dir / 'aliases.jsonl').exists() else []
    return pages, [json.loads(line) for line in lines if line.strip()]


def functions(pages):
    return {(path, name) for path, text in pages.items() if path.startswith(FUNCTION_PAGES) for name in HEADING.findall(text)}


def problems(pages, aliases):
    covered = {(item['path'], item['fn']) for item in aliases if item.get('fn')}
    missing = sorted(functions(pages) - covered)
    # Outside the Calculator pages a name without its own heading (JS API members, aggregation items)
    # serves as a page-level synonym; a Calculator function must keep its heading.
    dangling = [item for item in aliases if item['path'] not in pages or not item.get('aliases')
                or (item.get('fn') and item['path'].startswith(FUNCTION_PAGES) and (item['path'], item['fn']) not in functions(pages))]
    return missing, dangling


def section(text, name):
    match = re.search(rf'^#{{2,4}}\s+{re.escape(name)}\s*$(.*?)(?=^#{{1,4}}\s|\Z)', text, re.M | re.S)
    return re.sub(r'\s+', ' ', match.group(1)).strip()[:600] if match else ''


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['check', 'missing'])
    parser.add_argument('--help-dir', type=Path, default=Path(__file__).resolve().parents[2] / 'packages/product/help')
    options = parser.parse_args()
    pages, aliases = load(options.help_dir)
    missing, dangling = problems(pages, aliases)
    if options.command == 'missing':
        covered_pages = {item['path'] for item in aliases if not item.get('fn')}
        for path, name in missing:
            print(json.dumps({'path': path, 'fn': name, 'text': section(pages[path], name)}, ensure_ascii=False))
        for path in sorted(set(pages) - covered_pages - {path for path in pages if path.startswith(FUNCTION_PAGES)}):
            title = next(iter(re.findall(r'^#\s+(.+)$', pages[path], re.M)), path)
            print(json.dumps({'path': path, 'title': title, 'text': re.sub(r'\s+', ' ', pages[path])[:400]}, ensure_ascii=False))
        return 0
    for path, name in missing:
        print(f'no synonyms: {name} ({path})')
    for item in dangling:
        print(f'stale entry: {json.dumps(item, ensure_ascii=False)[:200]}')
    print(f'{len(functions(pages))} functions, {len(aliases)} entries, {len(missing)} missing, {len(dangling)} stale')
    return 1 if missing or dangling else 0


if __name__ == '__main__':
    sys.exit(main())
