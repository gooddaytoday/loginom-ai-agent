#!/usr/bin/env python3
"""Quiet, detached live acceptance runner. Python 3 standard library only."""
import argparse
import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation
import fcntl
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]
# Stand builds embed the knowledge service key like release builds do.
KNOWLEDGE_KEY = Path.home() / '.config/loginom-ai-agent/mcp-api-key'
DATA = REPO / 'docs/testing/loginom-ai-agent'
SCENARIOS = {
    'C1': dict(model_timeout=2700),
    '5-REST': dict(model_timeout=2700),
}
D76_STATUS = 'PASS с ограничением платформы D76'
D87 = {
    'upload_only': dict(attachment='path', generator=['--min-bytes', '67108864'], heavy=False, upload_only=True),
    'E1': dict(attachment='path', generator=['--min-bytes', '1000000000'], heavy=False),
    'E2': dict(attachment='file', generator=['--min-bytes', '1000000000'], heavy=False),
    'E3': dict(attachment='path', generator=['--boundary', '32'], heavy=True),
    'X1': dict(attachment='path', generator=['--format', 'xlsx', '--rows', '500000'], heavy=True,
               pending='ожидает LAB-413: XLSX-переключение'),
}


def stand_knowledge_key():
    # Passed only through the build environment; never argv, reports or case files.
    key = os.environ.get('LOGINOM_MCP_API_KEY') or (KNOWLEDGE_KEY.read_text().strip() if KNOWLEDGE_KEY.is_file() else '')
    if not key: raise RuntimeError(f'LOGINOM_MCP_API_KEY or {KNOWLEDGE_KEY} is required to build the CLI')
    return key


def pair_login(config, source):
    directory = config.get('package_directory') or config.get('personal_folder')
    login = config.get('loginom', config)
    if not isinstance(directory, str) or not directory.startswith('/') or not isinstance(login, dict) or not login.get('username'):
        raise ValueError(f'{source}: expected loginom.username and package_directory or personal_folder; keys: ' + ', '.join(sorted(config)))
    return dict(login, package_directory=directory)


def scenario_names(value, case_root=None):
    names = [case for name in value.split(',') for case in (['E1', 'E2'] if name == 'D87' and not case_root else [name])]
    if len(names) != len(set(names)): raise ValueError('Duplicate scenario')
    for name in names:
        if not case_root and D87.get(name, {}).get('pending'): raise ValueError(D87[name]['pending'])
    return names


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def git(*args, cwd=REPO):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def restore_source_modes(source):
    # Bun marks workspace bin targets executable. Repair modes only; Git must
    # still reject edited, staged, deleted and untracked source contents.
    for entry in git('ls-files', '--stage', '-z', cwd=source).split('\0'):
        if not entry: continue
        info, name = entry.split('\t', 1)
        mode, _, stage = info.split()
        path = source / name
        if mode in ['100644', '100755'] and stage == '0' and path.is_file() and not path.is_symlink():
            os.chmod(path, int(mode, 8) & 0o777)


def scenario(name, case_root=None, *, cases=None):
    if name == 'graph-large-execute':
        src = REPO / 'docs/node-development/nodes/grouping/acceptance/graph-large-execute'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    source_package=src / 'source.lgp', input_files=['customers.csv'], expected_name='expected.json')
    if name in ['row-filter-variables', 'row-filter-list', 'row-filter-scalar', 'row-filter-empty', 'row-filter-none']:
        variant = {'row-filter-variables': 'mixed', 'row-filter-list': 'list', 'row-filter-scalar': 'scalar', 'row-filter-empty': 'empty', 'row-filter-none': 'none'}[name]
        node = REPO / 'docs/node-development/nodes/row-filter'
        return dict(source=node / 'acceptance', prompt=node / 'acceptance' / ('task-variable-' + variant + '.md'),
                    data=node / 'fixtures', base=None,
                    input_files=['variables-empty.csv' if variant == 'empty' else 'variables.csv'],
                    export_count=2 if variant == 'empty' else 4,
                    expected_name='expected.json' if variant == 'mixed' else 'expected-mixed-none.json' if variant == 'none' else 'expected-' + variant + ('-final.json' if variant != 'empty' else '.json'),
                    filter_initial=None if variant == 'empty' else 'expected-' + ('mixed' if variant == 'none' else variant) + '-initial.json')
    if name in ['enrich-data-left', 'enrich-data-composite']:
        src = REPO / 'docs/node-development/nodes/transform-enrichdata/acceptance'
        composite = name == 'enrich-data-composite'
        return dict(source=src, prompt=src / ('composite/task.md' if composite else 'task.md'),
                    data=src / ('composite/data' if composite else 'data'), base=None,
                    expected_name='composite/expected.json' if composite else 'expected.json',
                    input_files=['composite-main.csv', 'composite-ref.csv'] if composite else
                    ['main.csv', 'ref-b.csv', 'ref-c.csv', 'ref-b-duplicates.csv'])
    if name == 'variables-rows':
        src = REPO / 'docs/node-development/nodes/variables-vartodata/acceptance'
        return dict(source=src, prompt=src / 'task-rows.md', data=src / 'data', base=None,
                    source_package=src.parent / 'fixtures/source.lgp', input_files=[], expected_name='expected-rows.json')
    if name == 'variables-columns':
        src = REPO / 'docs/node-development/nodes/variables-vartodata/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    input_files=[], expected_name='expected.json')
    if name in ['quality-default', 'quality-spikes']:
        src = REPO / 'docs/node-development/nodes/research-quality/acceptance'
        case = src / 'probe' if name == 'quality-spikes' else src
        prefix = 'probe/' if name == 'quality-spikes' else ''
        return dict(source=src, prompt=case / 'task.md', data=case / 'data', base=None,
                    export_count=5, expected_name=prefix + 'expected-update.json',
                    quality_initial_name=prefix + 'expected.json')
    if name == 'lgd-import-empty-variant':
        node = REPO / 'docs/node-development/nodes/imports-lgd'
        return dict(source=node / 'acceptance/empty-variant', prompt=node / 'acceptance/empty-variant/task.md',
                    data=node / 'fixtures/empty-variant', input_files=['empty.lgd', 'variant.lgd'],
                    expected_name='expected.json', base=None, lgd='empty_variant',
                    oracle=node / 'acceptance/oracle.py')
    if name == 'lgd-import-compression':
        node = REPO / 'docs/node-development/nodes/imports-lgd'
        return dict(source=node / 'acceptance/compression', prompt=node / 'acceptance/compression/task.md',
                    data=node / 'fixtures/64bit', input_files=['compression-none.lgd', 'compression-lzo.lgd', 'compression-lz4.lgd'],
                    expected_name='expected.json', base=None, lgd='compression',
                    oracle=node / 'acceptance/oracle.py')
    if name == 'lgd-import-checksum':
        node = REPO / 'docs/node-development/nodes/imports-lgd'
        return dict(source=node / 'acceptance/checksum', prompt=node / 'acceptance/checksum/task.md',
                    data=node / 'fixtures/64bit', input_files=['checksum-none.lgd', 'checksum-compressed.lgd', 'checksum-both.lgd'],
                    expected_name='expected.json', base=None, lgd='checksum',
                    oracle=node / 'acceptance/oracle.py')
    if name == 'lgd-import-variable':
        node = REPO / 'docs/node-development/nodes/imports-lgd'
        return dict(source=node / 'acceptance/variable', prompt=node / 'acceptance/variable/task.md',
                    data=node / 'fixtures/variable', input_files=['variable-a.lgd', 'variable-b.lgd'],
                    expected_name='expected.json', lgd_initial='expected-initial.json', base=None, lgd='variable',
                    oracle=node / 'acceptance/oracle.py')
    if name in ['lgd-import', 'lgd-properties', 'lgd-export', 'lgd-corrupt', 'lgd-export-overwrite', 'lgd-export-variable', 'lgd-export-compression', 'lgd-export-empty-variant']:
        export = name.startswith('lgd-export')
        export_case = name.removeprefix('lgd-export-') if name.startswith('lgd-export-') else None
        edges = name == 'lgd-export-empty-variant'
        node = REPO / 'docs/node-development/nodes' / ('exports-lgd' if export else 'imports-lgd')
        variant = {'lgd-import': 'standalone', 'lgd-properties': 'properties', 'lgd-export': 'roundtrip', 'lgd-corrupt': 'corrupt', 'lgd-export-overwrite': 'roundtrip', 'lgd-export-variable': 'roundtrip', 'lgd-export-compression': 'compression', 'lgd-export-empty-variant': 'edges'}[name]
        return dict(source=node / 'acceptance', prompt=node / 'acceptance' / ('task-' + export_case + '.md' if export_case else 'task.md' if name in ['lgd-import', 'lgd-export'] else 'task-' + variant + '.md'),
                    data=node / 'fixtures', input_files=['typed.csv', 'schema.json'] + (['typed-update.csv'] if export_case == 'overwrite' else []) if export else [{'standalone': 'source.lgd', 'properties': 'properties-stage0.lgd', 'corrupt': 'corrupt-block.lgd'}[variant]],
                    expected_name='expected-' + (export_case or variant) + '-run.json', base=None, lgd=variant, lgd_case=None if edges or name == 'lgd-export-compression' else export_case, lgd_empty_variant=edges, export_count=2 if edges else 1, lgd_export_compression=name == 'lgd-export-compression',
                    oracle=REPO / 'docs/node-development/nodes/imports-lgd/acceptance/oracle.py')
    if name in ['clustering-scale-minus-one-one', 'clustering-scale-zero-one', 'clustering-scale-absolute']:
        src = REPO / 'docs/node-development/nodes/datamining-clustering/acceptance/scaling'
        kind = name.removeprefix('clustering-scale-')
        return dict(source=src, prompt=src / ('task-' + kind + '.md'), data=src / 'data', base=None,
                    input_files=['scaling.csv'], export_count=2, expected_name='expected-' + kind + '.json')
    if name in ['factor-pca', 'factor-retrain']:
        src = REPO / 'docs/node-development/nodes/research-factoranalysis/acceptance'
        update = name == 'factor-retrain'
        return dict(source=src, prompt=src / ('task-update.md' if update else 'task.md'), data=src / 'data', base=None,
                    input_files=['matrix.csv', 'update.csv'] if update else ['matrix.csv'], export_count=2,
                    expected_name='expected-update.json' if update else 'expected.json')
    if name == 'clustering-normalized':
        src = REPO / 'docs/node-development/nodes/datamining-clustering/acceptance/normalized'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    input_files=['normalized.csv'], export_count=2)
    # Operator fixtures (including private large-file oracles) stay outside Git.
    # They use this runner's unchanged model/CSV/Save/cold/cleanup checks.
    if cases and (name in SCENARIOS or re.fullmatch(r'[A-Za-z][A-Za-z0-9-]{0,79}', name)):
        src = Path(cases).resolve() / name
        if (src / 'task.md').is_file():
            assert src.resolve().parent == Path(cases).resolve(), 'Case must stay in its assigned directory'
            return dict(SCENARIOS.get(name, {}), source=src, prompt=src / 'task.md', data=src / 'data', base=None, external=True)
    if case_root is not None:
        if name not in SCENARIOS and not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}', name):
            raise ValueError('Invalid external case name')
        src = Path(case_root).resolve() / name
        config = read(src / 'case.json')
        if set(config) - {'source_path', 'attachment', 'upload_only'} or not {'source_path', 'attachment'} <= set(config) or config['attachment'] not in ['path', 'file'] or type(config.get('upload_only', False)) is not bool:
            raise ValueError('External case requires source_path and attachment path/file')
        source = Path(config['source_path'])
        if not source.is_absolute() and source.suffix.lower() == '.xlsx':
            source = (src / source).resolve()
            if not source.is_relative_to(src): raise ValueError('XLSX source must remain inside its case')
        if not source.is_absolute() or not source.is_file():
            raise ValueError('External source must be an existing absolute file')
        return dict(SCENARIOS.get(name, {}), source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    local_file=source, attachment=config['attachment'], upload_only=config.get('upload_only', False))
    if name in ['excel-import-sheet', 'excel-import-wide', 'excel-import-single', 'excel-import-columns', 'excel-import-headers', 'excel-import-boolean']:
        src = REPO / 'docs/node-development/nodes/imports-excel/acceptance' / ('stage1' if name == 'excel-import-single' else name)
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None, external=name != 'excel-import-single')

    if name == 'grouping-unique':
        src = REPO / 'docs/node-development/nodes/grouping/acceptance/unique'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name in ['calculator-viewport', 'linreg-short', 'throw1', 'js-declared-empty']:
        slug, filename = {
            'calculator-viewport': ('transform-calculator', 'sales.csv'),
            'linreg-short': ('datamining-linregression', 'train.csv'),
            'throw1': ('programming-javascript', 'orders.csv'),
            'js-declared-empty': ('programming-javascript', 'orders.csv'),
        }[name]
        src = REPO / 'docs/node-development/nodes' / slug / 'acceptance' / name
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    input_files=[filename], external=True)
    if name in ['missing-zero', 'missing-zero-threshold', 'missing-zero-empty', 'missing-mean']:
        src = REPO / 'docs/node-development/nodes/missing-values/acceptance/zero'
        kind = {'missing-zero': 'core', 'missing-zero-threshold': 'threshold',
                'missing-zero-empty': 'empty', 'missing-mean': 'mean'}[name]
        return dict(source=src, prompt=src / ('task.md' if kind == 'core' else 'task-' + kind + '.md'),
                    data=src / 'data', input_files=[('core' if kind == 'mean' else kind) + '.csv'], base=None,
                    expected_name='expected.json' if kind == 'core' else 'expected-' + kind + '.json')

    if name == 'text-export-cp1251':
        src = REPO / 'docs/node-development/nodes/text-export/acceptance/cp1251'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    export_count=2, csv_header='labels', text_export_encodings=['cp1251', 'utf-8'])
    if name in ['excel-export-xls', 'excel-export-numeric', 'excel-export-replace']:
        src = REPO / 'docs/node-development/nodes/exports-excel/acceptance'
        mode = name.removeprefix('excel-export-')
        return dict(source=src, prompt=src / {'xls':'task-xls.md', 'numeric':'task-numeric-cells.md', 'replace':'task-replace-workbook.md'}[mode],
                    data=src.parent / 'fixtures', input_files=['modes.csv'], base=None, excel_mode=mode)
    if name == 'exports-excel':
        src = REPO / 'docs/node-development/nodes/exports-excel/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src.parent / 'fixtures', input_files=['cells.csv'], base=None, xlsx=True)
    if name == 'crosstable-real-keys':
        src = REPO / 'docs/node-development/nodes/transform-crosstable/acceptance/continuous-real'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data',
                    input_files=['keys.csv'], base=None, expected_name='expected.json')
    if name in ['tree-parent-child', 'tree-parent-roots', 'tree-parent-cycle', 'tree-parent-orphan']:
        node = REPO / 'docs/node-development/nodes/trees-datatotree'
        kind = {'tree-parent-child': 'org', 'tree-parent-roots': 'multiple-roots',
                'tree-parent-cycle': 'cycle', 'tree-parent-orphan': 'orphan'}[name]
        src = node / 'acceptance/parent-child'
        return dict(source=src, prompt=node / 'acceptance/task-parent-child.md' if kind == 'org' else src / ('task-' + kind + '.md'),
                    data=node / 'fixtures/parent-child', input_files=[kind + '.csv'], base=None,
                    expected_name='expected-' + kind + '-run.json')
    if name in ['table-tree-json', 'json-tree-json']:
        slug = 'trees-datatotree' if name == 'table-tree-json' else 'trees-treetojson'
        src = REPO / 'docs/node-development/nodes' / slug / 'acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src.parent / 'fixtures',
                    input_files=['orders.csv' if name == 'table-tree-json' else 'documents.csv'], base=None, external=True, tree_conversion=True)
    if name in ['tree-repeat', 'tree-no-repeat']:
        nodes = REPO / 'docs/node-development/nodes'
        src = nodes / 'trees-jsontotree/acceptance'
        return dict(source=src, prompt=(src / 'task.md' if name == 'tree-repeat' else nodes / 'trees-treetodata/acceptance/task.md'),
                    data=nodes / 'trees-jsontotree/fixtures', base=None, external=True,
                    expected_name='expected.json' if name == 'tree-repeat' else 'expected-no-repeat.json')

    if name in ['coarse-classes-train', 'coarse-classes-apply']:
        src = REPO / 'docs/node-development/nodes/preprocessing-coarseclasses/acceptance'
        applying = name == 'coarse-classes-apply'
        return dict(source=src, prompt=src / ('task-apply.md' if applying else 'task.md'),
                    data=src / 'data', base=None, export_count=3,
                    input_files=['train.csv', 'holdout.csv'] if applying else ['train.csv'],
                    expected_name='expected-apply.json' if applying else 'expected.json')
    if name in ['binning-count', 'binning-width', 'binning-real', 'binning-integer',
                'binning-frequency', 'binning-frequency-ties', 'binning-apply', 'binning-retrain', 'binning-holdout']:
        src = REPO / 'docs/node-development/nodes/preprocessing-binning/acceptance'
        kind = name.removeprefix('binning-')
        data = {'count': ['values.csv'], 'width': ['real.csv'], 'real': ['real.csv'],
                'integer': ['values.csv'], 'frequency': ['frequency.csv'], 'frequency-ties': ['frequency-ties.csv'],
                'apply': ['frequency.csv', 'update.csv'], 'retrain': ['frequency.csv', 'update.csv'],
                'holdout': ['real.csv', 'holdout.csv']}[kind]
        return dict(source=src, prompt=src / ('task.md' if kind == 'count' else 'task-' + kind + '.md'),
                    data=src / 'data', base=None, export_count=2, input_files=data,
                    expected_name='expected.json' if kind == 'count' else 'expected-' + kind + '.json')
    if name in ['ungroup-shares', 'ungroup-null', 'ungroup-empty', 'ungroup-rounding']:
        node = REPO / 'docs/node-development/nodes/transform-ungroupdata'
        task, expected, inputs, count = {
            'ungroup-shares': ('task.md', 'expected.json', ['totals.csv', 'shares.csv'], 1),
            'ungroup-null': ('task-null.md', 'expected-null.json', ['null-totals.csv', 'edge-shares.csv'], 1),
            'ungroup-empty': ('task-empty.md', 'expected-empty.json', ['empty-totals.csv', 'edge-shares.csv'], 1),
            'ungroup-rounding': ('rounding/task.md', 'rounding/expected.json', ['balance-totals.csv', 'balance-shares.csv', 'round-totals.csv', 'round-shares.csv'], 5),
        }[name]
        return dict(source=node / 'acceptance', prompt=node / 'acceptance' / task,
                    data=node / 'fixtures', base=None, expected_name=expected,
                    input_files=inputs, export_count=count)
    if name in ['corr-pairs', 'corr-null', 'corr-age']:
        src = REPO / 'docs/node-development/nodes/research-corranalysis/acceptance'
        task, expected, data = {'corr-pairs': ('task.md', 'expected.json', 'pairs.csv'),
                                'corr-null': ('task-null.md', 'expected-null.json', 'null.csv'),
                                'corr-age': ('age-pressure-task.md', 'expected-age-pressure.json', 'age-pressure.csv')}[name]
        return dict(source=src, prompt=src / task, data=src / 'data', base=None,
                    expected_name=expected, input_files=[data])
    if name in ['acf-series', 'acf-update', 'acf-one', 'acf-eight']:
        src = REPO / 'docs/node-development/nodes/research-autocorrelation/acceptance'
        task, expected, inputs = {
            'acf-series': ('task-series.md', 'expected-series-4.json', ['series.csv']),
            'acf-update': ('task.md', 'expected.json', ['series.csv', 'update.csv']),
            'acf-one': ('task-one.md', 'expected-series-1.json', ['series.csv']),
            'acf-eight': ('task-eight.md', 'expected-series-8.json', ['series.csv']),
        }[name]
        return dict(source=src, prompt=src / task, data=src / 'data', base=None,
                    expected_name=expected, input_files=inputs)
    if name in ['outlier-sd', 'outlier-iqr']:
        src = REPO / 'docs/node-development/nodes/preprocessing-elimoutlier/acceptance'
        if name == 'outlier-iqr': src = src / 'iqr'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None, export_count=3)
    if name in D87:
        return dict(D87[name], base=None, generated=True)
    colunion_part = re.fullmatch(r'colunion-matrix-(regular|reverse)-(a|b|c)|colunion-matrix-(empty-main|empty-attached|both-empty)-(minimum|maximum|main|attached)', name)
    if colunion_part or name in ['colunion-edit', 'colunion-repeat', 'colunion-matrix-regular', 'colunion-matrix-reverse',
                'colunion-matrix-empty-main', 'colunion-matrix-empty-attached', 'colunion-matrix-both-empty']:
        src = REPO / 'docs/node-development/nodes/transform-coluniondata/acceptance'
        variant = name.removeprefix('colunion-')
        matrix = variant.startswith('matrix-')
        kind = variant.removeprefix('matrix-')
        indices = None
        if colunion_part:
            kind = colunion_part[1] or colunion_part[3]
            part = colunion_part[2] or colunion_part[4]
            width = 4 if colunion_part[1] else 3
            start = (['a', 'b', 'c'] if width == 4 else ['minimum', 'maximum', 'main', 'attached']).index(part) * width
            indices = list(range(start, start + width))
        inputs = {'empty-main': ['empty-main.csv', 'attached.csv'],
                  'empty-attached': ['main.csv', 'empty-attached.csv'],
                  'both-empty': ['empty-main.csv', 'empty-attached.csv'],
                  'reverse': ['main.csv', 'attached-long.csv']}.get(kind, ['main.csv', 'attached.csv'])
        return dict(source=src, prompt=src / ('task.md' if variant == 'edit' else 'task-' + variant + '.md'),
                    data=src.parent / 'fixtures', input_files=inputs, base=None,
                    expected_name=('matrix/' + kind + '.json') if matrix else 'expected-repeat.json' if variant == 'repeat' else 'expected.json',
                    export_count=len(indices) if indices is not None else 12 if matrix else 1,
                    colunion_output_indices=indices)
    if name == 'union-auto-match':
        src = REPO / 'docs/node-development/nodes/union/acceptance/union-auto-match'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name == 'smoothing-hp':
        src = REPO / 'docs/node-development/nodes/preprocessing-smoothing/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name in ['linreg-forward-f', 'linreg-forward-r2', 'linreg-forward-r2-cutoffs', 'linreg-backward-f']:
        node = REPO / 'docs/node-development/nodes/datamining-linregression'
        variant = 'forward-r2' if name == 'linreg-forward-r2-cutoffs' else name.removeprefix('linreg-')
        return dict(source=node / 'acceptance/modes',
                    prompt=node / ('acceptance/modes/task-forward-r2-cutoffs.md' if name == 'linreg-forward-r2-cutoffs' else 'acceptance/modes/task-forward-r2.md' if variant == 'forward-r2' else 'acceptance/modes/task-backward.md' if variant == 'backward-f' else 'acceptance/modes/task-forward.md'),
                    data=node / 'fixtures/modes', input_files=['selection.csv'], base=None,
                    expected_name='expected/' + ('forward-f' if variant == 'backward-f' else variant) + '.json', oracle=node / 'acceptance/modes/oracle.py', linreg_forward=True)
    if name in ['logreg-selection-forward', 'logreg-selection-backward', 'logreg-selection-stepwise',
                'logreg-stepwise-aic', 'logreg-stepwise-aicc', 'logreg-stepwise-bic', 'logreg-stepwise-hqic',
                'logreg-stepwise-strict', 'logreg-stepwise-permissive']:
        acceptance = REPO / 'docs/node-development/nodes/datamining-logregression/acceptance'
        variant = name.removeprefix('logreg-')
        source = acceptance / 'selection'
        if variant in ['stepwise-strict', 'stepwise-permissive']: source = source / variant
        return dict(source=source, prompt=acceptance / ('task-' + variant + '.md'),
                    data=source / 'data' if variant == 'stepwise-strict' else acceptance / 'selection/data', base=None, expected_name='expected.json')
    if name in ['logreg-forward', 'logreg-backward', 'logreg-stepwise']:
        acceptance = REPO / 'docs/node-development/nodes/datamining-logregression/acceptance'
        variant = name.removeprefix('logreg-')
        source = acceptance / 'selection'
        return dict(source=source, prompt=acceptance / ('task-' + variant + '.md'),
                    data=acceptance / 'selection/data', base=None, expected_name='expected.json')
    if name == 'assnrules-retrain':
        src = REPO / 'docs/node-development/nodes/datamining-assnrules/acceptance'
        return dict(source=src, prompt=src / 'task-retrain.md',
                    data=src.parent / 'fixtures', input_files=['transactions.csv', 'length.csv'],
                    base=None, expected_name='length/expected.json', export_count=2)
    if name in ['assnrules-basic', 'assnrules-length']:
        src = REPO / 'docs/node-development/nodes/datamining-assnrules/acceptance'
        variant = src / 'length' if name == 'assnrules-length' else src
        return dict(source=src, prompt=variant / 'task.md', data=variant / 'data', base=None,
                    expected_name='length/expected.json' if name == 'assnrules-length' else 'expected.json',
                    input_files=['length.csv' if name == 'assnrules-length' else 'transactions.csv'], export_count=2)
    if name == 'logreg-coefficients':
        src = REPO / 'docs/node-development/nodes/datamining-logregression/acceptance/modes/coefficients'
        return dict(source=src, prompt=src / 'task-coefficients.md', data=src / 'data', base=None,
                    input_files=['train.csv'], expected_name='expected.json',
                    oracle=src.parent / 'oracle.py')
    if name == 'logreg-apply':
        src = REPO / 'docs/node-development/nodes/datamining-logregression/acceptance/modes/apply'
        return dict(source=src, prompt=src / 'task-apply.md', data=src / 'data', base=None,
                    input_files=['train.csv', 'holdout.csv'], expected_name='expected.json',
                    oracle=src.parent / 'oracle.py')
    if name == 'logreg-enter':
        src = REPO / 'docs/node-development/nodes/datamining-logregression/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name == 'variables-replace-exact':
        src = REPO / 'docs/node-development/nodes/variables-replace/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src.parent / 'fixtures', base=None, expected_name='expected-run.json',
                    input_files=['variables.json', 'rules.json'], variable_only=True, variable_audit='variables-replace', variable_initial='expected-initial-run.json',
                    oracle=REPO / 'scripts/node-acceptance/variables-replace.mjs')
    if name == 'variables-column-union':
        src = REPO / 'docs/node-development/nodes/variables-coluniondatavar/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src.parent / 'fixtures', input_files=['inputs.json'], base=None, expected_name='expected-updated-run.json',
                    source_package=src.parent / 'fixtures/source.lgp', variable_only=True, variable_audit='variables-column-union', variable_initial='expected-initial-run.json',
                    oracle=REPO / 'scripts/node-acceptance/variables-column-union.mjs')
    if name in ['variables-datatovar', 'variables-datatovar-null', 'variables-datatovar-empty']:
        src = REPO / 'docs/node-development/nodes/variables-datatovar/acceptance'
        variant = name.removeprefix('variables-datatovar').lstrip('-')
        expected = 'expected-' + variant + '-run.json' if variant else 'expected-run.json'
        return dict(source=src, prompt=src / ('task-' + variant + '.md' if variant else 'task.md'), data=src.parent / 'fixtures',
                    input_files=['null.csv'] if variant == 'null' else ['values.csv'] if variant == 'empty' else ['values.csv', 'replace.csv'], base=None,
                    expected_name=expected, variable_initial_name=expected if variant else 'expected-initial-run.json',
                    variable_only=True, variable_audit='variables-datatovar', variable_read_path='port', oracle=REPO / 'scripts/node-acceptance/variables-datatovar.mjs')
    if name == 'variables-calculator':
        src = REPO / 'docs/node-development/nodes/variables-calculator/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src.parent / 'fixtures', base=None, expected_name='expected-run.json',
                    variable_only=True, variable_audit='variables-calculator', variable_initial='expected-initial-run.json',
                    oracle=REPO / 'scripts/node-acceptance/variables-calculator.mjs')
    if name == 'variables-user-real-date':
        src = REPO / 'docs/node-development/nodes/variables-user/acceptance'
        # mas3 R2: 1803s minus 26s upload recovery still exceeds 1500s.
        # setup 180 + model 2400 + cold 1800 = 4380s, within the 85-minute batch.
        return dict(source=src, prompt=src / 'task-real-datetime.md', data=src.parent / 'fixtures', input_files=['transactions.csv'], base=None,
                    expected_name='expected-updated-run.json', variables_real_date=True, export_count=2, model_timeout=2400)
    if name == 'variables-user':
        src = REPO / 'docs/node-development/variables/acceptance'
        return dict(source=src, prompt=src / 'task-user.md', data=src.parent / 'fixtures', base=None, expected_name='expected-user.json',
                    variable_only=True, oracle=REPO / 'scripts/node-acceptance/expected-outputs.mjs')
    if name in ['calculator-vars', 'calculator-vars-update']:
        src = REPO / 'docs/node-development/nodes/calculator/acceptance'
        update = name == 'calculator-vars-update'
        return dict(source=src, prompt=src / ('task-variables-update.md' if update else 'task-variables.md'),
                    data=src.parent / 'fixtures', input_files=['variables.csv'], base=None,
                    expected_name='expected.json' if update else 'expected-initial.json', oracle=src / 'oracle-variables.py')
    if name == 'rest-get-plain':
        src = REPO / 'docs/node-development/nodes/integration-restrequest/acceptance/plain'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name == 'replace-exact':
        src = REPO / 'docs/node-development/nodes/replacement/acceptance/nearest'
        return dict(source=src, prompt=src / 'task-exact.md', data=src / 'data', base=None, expected_name='expected-exact.json')
    if name == 'replace-nearest':
        src = REPO / 'docs/node-development/nodes/replacement/acceptance/nearest'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name == 'replace-convert':
        src = REPO / 'docs/node-development/nodes/replacement/acceptance/convert'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name in ['regex-add', 'regex-replace']:
        node = REPO / 'docs/node-development/nodes/replacement'
        return dict(source=node / 'acceptance/regex',
                    prompt=node / 'acceptance' / ('task-regex.md' if name == 'regex-add' else 'task-regex-replace.md'),
                    data=node / 'fixtures/regex', base=None,
                    expected_name='expected.json' if name == 'regex-add' else 'expected-replace.json')
    if name == 'date-time-minsec':
        src = REPO / 'docs/node-development/nodes/date-time/acceptance/minsec'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    input_files=['minsec.csv'])
    if name in ['date-time-iso', 'date-time-iso-empty']:
        node = REPO / 'docs/node-development/nodes/date-time'
        empty = name.endswith('-empty')
        return dict(source=node / 'acceptance',
                    prompt=node / 'acceptance' / ('task-iso-weeks-empty.md' if empty else 'task-iso-weeks.md'),
                    data=node / 'fixtures', base=None,
                    expected_name='expected-iso-weeks-empty.json' if empty else 'expected.json',
                    input_files=['iso-weeks-empty.csv' if empty else 'iso-weeks.csv'])
    if name == 'n21':
        src = REPO / 'docs/node-development/nodes/transform-slidingwindow/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name in ['sampling-random', 'sampling-stratified', 'sampling-biased', 'partition-random', 'partition-stratified', 'partition-biased']:
        slug = 'preprocessing-sampling' if name.startswith('sampling') else 'preprocessing-datapartition'
        mode = name.rsplit('-', 1)[1]
        root = REPO / 'docs/node-development/nodes' / slug
        return dict(source=root / 'acceptance', prompt=root / 'acceptance' / ('task-' + mode + '.md'),
                    data=root / 'fixtures', input_files=['modes.csv'], base=None,
                    sampling_mode=mode)
    if name in ['sampling-modes-smoke', 'partition-modes-smoke']:
        slug = 'preprocessing-sampling' if name.startswith('sampling') else 'preprocessing-datapartition'
        root = REPO / 'docs/node-development/nodes' / slug / 'acceptance'
        return dict(source=root / 'modes-smoke', prompt=root / 'task-modes-smoke.md',
                    data=root / 'modes-smoke/data', base=None, expected_name='expected.json')
    if name in ['sampling', 'data-partition', 'sampling-null', 'sampling-empty', 'data-partition-null', 'data-partition-empty']:
        slug = 'preprocessing-sampling' if name.startswith('sampling') else 'preprocessing-datapartition'
        variant = next((v for v in ['null', 'empty'] if name.endswith('-' + v)), None)
        src = REPO / 'docs/node-development/nodes' / slug / 'acceptance'
        return dict(source=src, prompt=src / ('task-' + variant + '.md' if variant else 'task.md'),
                    data=src / ('data-' + variant if variant else 'data'), base=None,
                    expected_name='expected-' + variant + '.json' if variant else 'expected.json')
    if name in ['join-right', 'join-full', 'join-difference']:
        src = REPO / 'docs/node-development/nodes/join/acceptance' / name.removeprefix('join-')
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    stability = DATA / 'stability-2026-10-20'
    base = None
    if re.fullmatch(r'(?:n(?:[1-9]|1[0-9]|20)|p(?:[1-9]|1[0-9]|2[0-5]))', name):
        src = stability / name
        base = 's1' if name in ['p23', 'p24'] else None
    elif re.fullmatch(r'[qr][1-6]|q(?:[7-9]|10)', name):
        src = stability / 'followups' / name
        if name.startswith('r'):
            node = ('datamining-clustering' if name in ['r1', 'r2'] else
                    'datamining-linregression' if name in ['r3', 'r4'] else 'integration-restrequest')
            base = REPO / 'docs/node-development/nodes' / node / 'acceptance'
        else:
            base = {'q1':'s1','q2':'s1','q3':'s3','q4':'s3','q5':'s4','q6':'s4','q7':'s5','q8':'s5','q9':'s6','q10':'s6'}[name]
    elif re.fullmatch(r's[1-8]|v[1-3]s[1-6]', name):
        src = next((DATA / 'demo-2026-10-22').glob((name[-2:] if name.startswith('v') else name) + '-*'))
        base = 's1' if name in ['s7', 's8'] else None
    else:
        raise ValueError('Unknown scenario: ' + name)
    prompt = (stability / src.name / ('prompt-' + name[:2] + '.md') if name.startswith('v') else
              src / ('prompt-demo.md' if (src / 'prompt-demo.md').exists() else 'prompt.md'))
    data = (base / 'data' if isinstance(base, Path) else
            scenario(base)['data'] if base and not (src / 'data').is_dir() else src / 'data')
    # These business requests prescribe CSV display labels; native names remain
    # independent (in particular s8 binds its export by export_destination).
    return dict(source=src, prompt=prompt, data=data, base=base,
                csv_header='labels' if name in ['s8', 'q6', 'p24'] else 'names')


def expected_for(case, package):
    src = case['source']
    if case.get('excel_mode'):
        approved = read(src / 'modes/expected.json')
        formats = ['xls'] if case['excel_mode'] == 'xls' else approved['formats']
        stems = {'xls':'legacy', 'numeric':'numeric', 'replace':'existing'}
        books = [dict(output_node_type='exports.excel', output_port=None, format=ext, filename=stems[case['excel_mode']]+'.'+ext,
            sheet_name='Данные', header='names', number_format=1 if case['excel_mode']=='numeric' else 0, decimal_count=2, divide_thousands=case['excel_mode']=='numeric',
            columns=[dict(c,label_any=True) for c in approved['input_columns']], rows=approved['input_rows']) for ext in formats]
        return dict(package_path=package, nodes=[dict(type='imports.text',label_any=True), *approved['nodes']], outputs=books, excel_books=books,
                    excel_case={'xls':'new', 'numeric':'numeric', 'replace':'replace-workbook'}[case['excel_mode']])
    # The owner-approved sampling envelope is separate from stock exact rows.
    if case.get('sampling_mode'):
        return json.loads(subprocess.check_output(['node', str(REPO / 'scripts/node-acceptance/sampling-modes.mjs'),
            'expected', str(src / 'modes/expected.json'), case['sampling_mode'], package]))
    # CSV-checking oracles do not generate JSON. Their cold fixtures are separate.
    if case.get('expected_name'):
        expected = read(src / case['expected_name'])
        if case['expected_name'] == 'expected-age-pressure.json':
            expected['outputs'].reverse()  # One final CSV; cold still checks both tables.
    elif re.fullmatch(r'n(?:1[3-9]|20)', src.name) or case['prompt'].name == 'task.md' or src.name == 'p24':
        expected = read(src / ('expected-demo.json' if (src / 'expected-demo.json').exists() else 'expected.json'))
    else:
        expected = json.loads(subprocess.check_output([sys.executable, '-B', str(src / 'oracle.py'), package]))
    if 'outputs' not in expected:
        expected = dict(package_path=expected['package_path'], nodes=expected['nodes'],
                        outputs=[{k: v for k, v in expected.items() if k not in ['package_path', 'nodes']}])
    if case.get('colunion_output_indices') is not None:
        expected['outputs'] = [expected['outputs'][i] for i in case['colunion_output_indices']]
    if case.get('linreg_forward'):
        # C1's mathematical oracle omits presentation labels. Bind the three
        # intrinsic labels from linregression-output.mjs; keep all numeric
        # types, names, IDs, rows and tolerances exactly as approved.
        labels = {'Y_rergession': 'Y|Регрессия', 'Name': 'Имена входных полей', 'Y_coefficients': 'Y|Коэффициенты'}
        for output in expected['outputs']:
            for column in output['columns']:
                if column['name'] in labels: column['label'] = labels[column['name']]
    expected['package_path'] = package
    return expected


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    start = commands.add_parser('start')
    start.add_argument('--head', required=True)
    start.add_argument('--scenarios', required=True)
    start.add_argument('--pair', type=Path, required=True)
    start.add_argument('--build', type=Path)
    start.add_argument('--prepare-only', action='store_true', help='Prepare/verify the build without starting Loginom or the model')
    start.add_argument('--cases', type=Path, help='Private external task/expected/oracle/data case directory')
    start.add_argument('--cold', action='store_true')
    start.add_argument('--case-root', type=Path, help='Private external task.md/expected.json/case.json fixtures; oracle is never sent')
    start.add_argument('--host-load-max', type=float, default=8)
    start.add_argument('--spacing', type=float, default=60)
    start.add_argument('--out', type=Path)
    wait = commands.add_parser('wait')
    wait.add_argument('directory', type=Path)
    wait.add_argument('--timeout', type=float, required=True)
    worker = commands.add_parser('_worker', help=argparse.SUPPRESS)
    worker.add_argument('directory', type=Path)
    args = parser.parse_args(argv)
    for key in ['host_load_max', 'spacing', 'timeout']:
        value = getattr(args, key, 0)
        if not math.isfinite(value) or value < 0:
            parser.error(key.replace('_', '-') + ' must be finite and nonnegative')
    return args


def load_ready(load, maximum):
    return all(math.isfinite(v) and v <= maximum for v in load[:2])


def summary(report):
    rows = ['SHA: ' + report['head'] + '; tree: ' + report['tree'] + '; sourceDirty=' + str(report.get('metadata', {}).get('sourceDirty', 'unverified')).lower(),
            '| сценарий | итог | CSV | Save | cold | cleanup | port-read | путь | load на старте |',
            '|---|---|---|---|---|---|---|---|---|']
    for r in report['runs']:
        load = r.get('start_load', [])
        outcome = ('подготовка' if r.get('status') == 'NOT_RUN' and r.get('reason') == 'PREPARE_ONLY' else
                   'не запущен (бюджет пакета)' if r.get('status') == 'NOT_RUN' else r.get('status', 'RUNNING'))
        rows.append('| ' + ' | '.join([r['scenario'], outcome,
                    *[r.get(k, '—') for k in ['csv', 'save', 'cold', 'cleanup', 'port-read', 'read-path']],
                    '/'.join(f'{v:.2f}' for v in load[:2]) or '—']) + ' |')
    for r in report['runs']:
        if r.get('d76'):
            rows.append(f"\nD76 {r['scenario']}: negative_zero={r['d76']['negative_zero']}; "
                        f"midnight_date={r['d76']['midnight_date']}")
        if r.get('dataset-cleanup'):
            rows.append('\nD87 ' + r['scenario'] + ': ' + r['dataset-cleanup'])
        if r.get('status') == 'FAIL':
            rows.append(f"\nFAIL {r['scenario']}: {r.get('failure_class')}; {r.get('detail')}; "
                        f"журнал: {r.get('location')}; load при отказе: {r.get('failure_load')}; "
                        f"профиль: {r.get('profile')}")
    timings = report.get('phase_timings', [])
    if timings:
        rows += ['\n| сценарий | фаза | queue, с | выполнение, с |', '|---|---|---|---|']
        now = time.time()
        for t in timings:
            end = t.get('finished', now)
            queue = t.get('queue_seconds', (t['started'] if t['started'] is not None else end) - t['queued'])
            duration = t.get('duration_seconds', end - t['started'] if t['started'] is not None else 0)
            rows.append(f"| {t['scenario'] or '—'} | {t['name']} | {queue:.1f} | {duration:.1f} |")
    return '\n'.join(rows) + '\n'


def csv_delimiter(path):
    text = path.read_text(encoding='utf-8-sig')
    try:
        return csv.Sniffer().sniff(text[:8192], delimiters=',;\t').delimiter
    except csv.Error:
        # A single-column CSV has no delimiter to infer.
        if not any(char in text for char in ',;\t'): return ','
        raise


def check_text_export_encodings(replies, destinations):
    exports = []
    for destination, encoding in zip(destinations, [1251, 65001]):
        matches = []
        for line, reply in replies:
            if reply.get('action_key') == 'operation.inspect':
                reply = reply.get('output', {}).get('outcome', {})
            configuration = reply.get('configuration', {})
            readback = configuration.get('readback', {})
            if (reply.get('status') == 'SUCCEEDED' and configuration.get('status') == 'applied'
                    and readback.get('kind') == 'text_export' and readback.get('destination') == destination
                    and readback.get('settings', {}).get('encoding') == encoding
                    and any(f.get('destination') == destination for f in reply.get('output', {}).get('file_artifacts', []))):
                matches.append((line, readback))
        assert matches, 'TEXT_EXPORT_ENCODING_READBACK_MISSING'
        exports.append(matches[0])
    assert len(destinations) == len(exports) == 2, 'TEXT_EXPORT_ENCODING_COUNT'
    assert exports[0][0] < exports[1][0], 'TEXT_EXPORT_ENCODING_ORDER'
    assert exports[0][1]['node'] == exports[1][1]['node'], 'TEXT_EXPORT_ENCODING_NODE_CHANGED'


def export_null_marker(events, destination):
    # Requests identify the exact export file. Existing-node patches can retain
    # omitted settings, so only their correlated final UI readback is authoritative.
    readbacks = {}
    def collect(value):
        if isinstance(value, dict):
            configuration = value.get('configuration', {})
            if (value.get('status') == 'SUCCEEDED' and configuration.get('status') == 'applied'
                    and configuration.get('readback', {}).get('kind') == 'text_export'):
                readbacks[value.get('operation_id')] = configuration['readback']
            for item in value.values(): collect(item)
        if isinstance(value, list):
            for item in value: collect(item)
    for _, event in events:
        state = event.get('part', {}).get('state', {})
        if event.get('type') != 'tool_use' or state.get('status') != 'completed': continue
        try: collect(json.JSONDecoder().raw_decode(state.get('output', ''))[0])
        except (ValueError, TypeError): continue
    found, marker, node = False, None, None
    for _, event in events:
        part = event.get('part', {})
        state = part.get('state', {})
        request = state.get('input', {})
        if (event.get('type') != 'tool_use' or part.get('tool') != 'loginom_dock_node_apply'
                or state.get('status') != 'completed' or request.get('target', {}).get('type') != 'exports.text'
                or request.get('finish') == 'close'): continue
        parameters = request.get('parameters', {})
        readback = readbacks.get(request.get('operation_id'), {})
        if request.get('target', {}).get('kind') == 'new':
            if parameters.get('destination') != destination: continue
            found, marker = 'null_marker' in parameters, parameters.get('null_marker')
            node = readback.get('node')
        elif ((readback.get('destination') or parameters.get('destination')) == destination
              or node is not None and request.get('target', {}).get('ref') == node):
            if readback.get('destination') not in [None, destination]:
                # A verified move to another file does not rewrite the earlier
                # file's marker. Stop following that node for this destination.
                node = None
                continue
            settings = readback.get('settings', {})
            found = readback.get('destination') == destination and 'null_marker' in settings
            marker, node = settings.get('null_marker'), readback.get('node', node)
    assert found, 'CSV_NULL_MARKER_MISSING: explicit export marker or correlated patch readback required for ' + str(destination)
    assert isinstance(marker, str) and marker in ['', '?', 'null', 'NULL'], 'CSV_NULL_MARKER_UNSUPPORTED'
    return marker


def json_ast(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result: raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    def reject(value): raise ValueError('Nonfinite JSON')
    def typed(value):
        if value is None: return ('null',)
        if isinstance(value, bool): return ('boolean', value)
        if isinstance(value, (int, Decimal)): return ('number', Decimal(value))
        if isinstance(value, str): return ('string', value)
        if isinstance(value, list): return ('array', tuple(typed(v) for v in value))
        return ('object', tuple((k, typed(v)) for k, v in sorted(value.items())))
    return typed(json.loads(text, parse_float=Decimal, object_pairs_hook=pairs, parse_constant=reject))


def check_csv(path, expected, header='names', *, column_order=None, null_marker='', scenario_name=None, d76=None,
              export_events=(), destination=None):
    delimiter = csv_delimiter(path)
    rows = list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig')), delimiter=delimiter))
    columns = expected['columns']
    infer_marker = null_marker is None and any(row[col['name']] is None for row in expected['rows'] for col in columns)
    if infer_marker:
        null_marker = export_null_marker(export_events, destination)
        assert not any(row[col['name']] is not None and str(row[col['name']].get('value') if col['type'] == 'variant' and isinstance(row[col['name']], dict) else row[col['name']]) == null_marker
                       for row in expected['rows'] for col in columns), 'CSV_NULL_MARKER_COLLISION'
    elif null_marker is None:
        null_marker = ''
    has_header = expected.get('header', True)
    assert isinstance(has_header, bool), 'INVALID_CSV_HEADER'
    if has_header:
        assert rows and len(rows[0]) == len(set(rows[0])) == len(columns), 'CSV_COLUMN_ORDER'
    data_rows = rows[1:] if has_header else rows
    assert all(len(row) == len(columns) for row in data_rows), 'CSV_ROW_WIDTH'
    assert len(data_rows) == len(expected['rows']), 'CSV_ROW_COUNT'

    def limitation(value, col, target):
        # Owner-approved D76 forms are code-owned and only apply to types300.
        if scenario_name != 'types300': return None
        if (col['type'] == 'real' and isinstance(target, (int, float)) and target == 0
                and math.copysign(1, target) < 0 and value == '0'):
            return 'negative_zero'
        if col['type'] == 'datetime' and isinstance(target, str):
            goal = datetime.fromisoformat(target)
            if (goal.hour == goal.minute == goal.second == 0 and goal.microsecond != 0
                    and value == goal.date().isoformat()):
                return 'midnight_date'
        return None

    def equal(value, col, target):
        if target is None: return value == null_marker
        if infer_marker and value == null_marker: return False
        if col.get('comparison') == 'json_ast':
            try: return json_ast(value) == json_ast(target)
            except (ValueError, TypeError): return False
        if limitation(value, col, target): return True
        if scenario_name == 'types300' and target is not None and col['type'] in ['integer', 'real']:
            try:
                if col['type'] == 'integer':
                    number = Decimal(value)
                    return number.is_finite() and number == Decimal(str(target))
                number, goal = float(value), float(target)
                return (math.isfinite(number) and math.isfinite(goal) and number == goal
                        and (goal != 0 or math.copysign(1, number) == math.copysign(1, goal)))
            except (ValueError, InvalidOperation, OverflowError): return False
        if col['type'] == 'variant':
            return isinstance(target, dict) and set(target) == {'cell_type', 'value'} and equal(value, dict(col, type=target['cell_type']), target['value'])
        if col.get('category_labels_any'): return bool(value.strip())
        if col['type'] in ['integer', 'real']:
            try:
                number = float(value.replace(',', '.'))
                goal = float(target)
                if not math.isfinite(number) or not math.isfinite(goal): return False
                tolerance = col.get('tolerance', {})
                absolute, relative = tolerance.get('abs', 0), tolerance.get('rel', 0)
                difference = abs(number - goal)
                return (difference <= max(absolute, relative * abs(goal)) if math.isfinite(difference)
                        else abs(number / 2 - goal / 2) <= max(absolute / 2, relative * (abs(goal) / 2)))
            except (ValueError, OverflowError):
                return False
        if col['type'] == 'datetime':
            try: return datetime.fromisoformat(value) == datetime.fromisoformat(target)
            except ValueError: return False
        if isinstance(target, bool): return value.lower() == str(target).lower()
        return value == str(target)

    def matching(options, unique=False):
        # Same augmenting-path and ambiguity policy as expected-outputs.mjs.
        def run(blocked=None):
            owners = {}
            def assign(want, seen):
                for actual in options[want]:
                    if actual in seen or (want, actual) == blocked: continue
                    seen.add(actual)
                    if actual not in owners or assign(owners[actual], seen):
                        owners[actual] = want
                        return True
                return False
            if not all(assign(want, set()) for want in range(len(options))): return None
            return [next(actual for actual, owner in owners.items() if owner == want) for want in range(len(options))]
        result = run()
        if result is None or unique and any(run((want, actual)) is not None for want, actual in enumerate(result)): return None
        return result

    def fits(name, col):
        return (col.get('label_any') if header == 'labels' else col.get('name_any')) or name == (col.get('label', col['name']) if header == 'labels' else col['name'])

    if not has_header:
        # Without names/labels, expected columns declare CSV positions.
        indices = list(range(len(columns)))
    elif (column_order or expected.get('column_order')) == 'exact':
        assert all(fits(name, col) for name, col in zip(rows[0], columns)), 'CSV_COLUMN_ORDER'
        indices = list(range(len(columns)))
    else:
        flexible = any(c.get('label_any') if header == 'labels' else c.get('name_any') for c in columns)
        indices = matching([[i for i, name in enumerate(rows[0]) if fits(name, col)
                             and (not flexible or matching([[j for j, row in enumerate(data_rows)
                                  if equal(row[i], col, want[col['name']])] for want in expected['rows']]) is not None)]
                            for col in columns], unique=flexible)
        assert indices is not None, 'CSV_COLUMN_ORDER'
    options = [[j for j, row in enumerate(data_rows) if all(equal(row[indices[i]], col, want[col['name']])
                for i, col in enumerate(columns))] for want in expected['rows']]
    categories = [i for i, col in enumerate(columns) if col.get('category_labels_any')]
    pairs = matching(options, unique=bool(categories)) if not expected.get('ordered') else (
        list(range(len(options))) if all(i in choices for i, choices in enumerate(options)) else None)
    assert pairs is not None, 'CSV_VALUES_OR_ORDER'
    for i in categories:
        forward, reverse = {}, {}
        for want, actual in enumerate(pairs):
            key, value = expected['rows'][want][columns[i]['name']], data_rows[actual][indices[i]]
            assert forward.get(key, value) == value and reverse.get(value, key) == key, 'CSV_VALUES_OR_ORDER'
            forward[key], reverse[value] = value, key
    if scenario_name == 'types300' and d76 is not None:
        counts = dict(negative_zero=0, midnight_date=0)
        for want, actual in enumerate(pairs):
            for i, col in enumerate(columns):
                kind = limitation(data_rows[actual][indices[i]], col, expected['rows'][want][col['name']])
                if kind: counts[kind] += 1
        d76.update(counts)
    return delimiter


def records(path):
    for n, line in enumerate(path.read_text(errors='replace').splitlines(), 1):
        try: yield n, json.loads(line)
        except ValueError: continue


def ports(value, receipt=None):
    if isinstance(value, dict):
        # inspect may wrap an action and its read receipt. Keep each port with
        # the receipt that owns output.ports, never the outer inspect cleanup.
        if isinstance(value.get('output'), dict) and 'ports' in value['output']:
            receipt = value
        if 'port' in value and ('schema' in value and 'sample' in value or value.get('port_kind') == 'tree' and 'tree' in value): yield receipt or {}, value
        for item in value.values(): yield from ports(item, receipt)
    if isinstance(value, list):
        for item in value: yield from ports(item, receipt)


def port_path(reply, port):
    if reply.get('cleanup_complete') is not True:
        return None
    if port.get('freshness_basis') == 'completed_execution_port_source':
        return 'port'
    # Native full closes its owned Preview before publishing workflow_returned.
    # Its public binding is emitted only after the native reader verifies it.
    binding = port.get('binding') or {}
    execution = reply.get('execution') or {}
    if (reply.get('output', {}).get('workflow_returned') is True
            and port.get('fresh') is True
            and port.get('cell_precision', {}).get('cells') == 'exact_native'
            and port.get('exact_table', {}).get('complete') is True
            and port.get('read_coverage', {}).get('table_complete') is True
            and binding.get('read_id')
            and all(binding.get(k) and binding[k] == reply.get('node', {}).get(k)
                    for k in ['document_id', 'workflow_id', 'node_id'])
            and binding.get('port_guid') and binding['port_guid'] == port.get('port_guid')
            and execution.get('status') == 'completed' and execution.get('execution_id')
            and binding.get('execution') == execution
            and port.get('execution_id') == execution['execution_id']):
        return 'native'
    return None


def port_failure(replies, journal):
    delivered = [(n, owner, p) for n, o in replies for owner, p in ports(o)]
    invalid = [n for n, o, p in delivered if port_path(o, p) is None]
    return str(journal) + ':' + str(invalid[0] if invalid else 1) if not delivered or invalid else None


def check_lgd_import_result(replies, row_count):
    assert any(o.get('status') == 'SUCCEEDED'
               and o.get('configuration', {}).get('readback', {}).get('kind') == 'lgd_import'
               and o.get('execution', {}).get('status') == 'completed'
               and any(p.get('port') == 0 and p.get('sample_complete') is True
                       and p.get('row_count') == row_count and port_path(owner, p) is not None
                       for owner, p in ports(o)) for _, o in replies), 'LGD_IMPORT_FULL_RESULT_MISSING'


def check_lgd_variable_switch(replies, switch):
    reads, seen = [], set()
    for _, reply in replies:
        for owner, port in ports(reply):
            readback = owner.get('configuration', {}).get('readback', {})
            source = readback.get('source', {})
            execution = owner.get('execution', {}).get('execution_id')
            if (owner.get('status') == 'SUCCEEDED' and owner.get('cleanup_complete') is True
                    and readback.get('kind') == 'lgd_import' and owner.get('execution', {}).get('status') == 'completed'
                    and source.get('source_variable') == switch['variable'] and execution and execution not in seen
                    and port.get('port') == 0 and port.get('sample_complete') is True and port_path(owner, port) == 'port'):
                reads.append((owner, source))
                seen.add(execution)
    first = next((r for r in reads if r[1].get('source_path', '').endswith('-' + switch['before'])), None)
    second = next((r for r in reads[reads.index(first) + 1:] if r[0].get('node') == first[0].get('node')
                   and r[1].get('source_path', '').endswith('-' + switch['after'])), None) if first else None
    assert first and second and first[1]['source_path'] != second[1]['source_path'], 'LGD_VARIABLE_SWITCH_SAME_NODE_MISSING'


def check_lgd_export_case(replies, case, destination, initial_destination):
    successful = [(n, o, o.get('configuration', {}).get('readback', {})) for n, o in replies
                  if o.get('status') == 'SUCCEEDED' and o.get('execution', {}).get('status') == 'completed'
                  and o.get('configuration', {}).get('readback', {}).get('kind') == 'lgd_export']
    def files(o, path):
        return [f for f in o.get('output', {}).get('file_artifacts', [])
                if f.get('destination') == path and f.get('bytes', 0) > 0 and len(f.get('sha256', '')) == 64]
    final = [(n, o, r) for n, o, r in successful if r.get('destination') == destination and files(o, destination)]
    assert final, 'LGD_FINAL_EXPORT_MISSING'
    if case == 'overwrite':
        rejected = [n for n, o in replies if o.get('status') == 'FAILED' and o.get('cleanup_complete') is True
                    and 'LGD destination exists; reject policy preserved it' in o.get('error', {}).get('message', '')]
        assert rejected, 'LGD_DEFAULT_REJECT_MISSING'
        first = [(n, o, r) for n, o, r in final if r.get('destination_check', {}).get('existed') is False]
        replaced = [(n, o, r) for n, o, r in final if r.get('destination_check', {}).get('existed') is True
                    and r['destination_check'].get('decision') == 'replace' and r['destination_check'].get('overwrite') == 'replace']
        assert any(a < reject < b and ra.get('node') == rb.get('node')
                   and files(oa, destination)[0]['sha256'] != files(ob, destination)[0]['sha256']
                   for a, oa, ra in first for b, ob, rb in replaced for reject in rejected), 'LGD_REPLACE_CHAIN_MISSING'
    elif case == 'variable':
        first = [(n, o, r) for n, o, r in successful if r.get('destination') == initial_destination and files(o, initial_destination)]
        binding = {'destination': {'variable': 'LgdPath'}}
        assert any(a < b and ra.get('node') == rb.get('node') and ra.get('bindings') == rb.get('bindings') == binding
                   and ra.get('destination_check', {}).get('existed') is False and rb.get('destination_check', {}).get('existed') is False
                   for a, _, ra in first for b, _, rb in final), 'LGD_VARIABLE_REEVALUATION_MISSING'
    else:
        raise AssertionError('LGD_EXPORT_CASE_UNKNOWN')


def check_lgd_checksum_switch(replies, filename):
    reads, seen = [], set()
    for _, reply in replies:
        for owner, port in ports(reply):
            readback = owner.get('configuration', {}).get('readback', {})
            source = readback.get('source', {})
            execution = owner.get('execution', {}).get('execution_id')
            if (owner.get('status') == 'SUCCEEDED' and owner.get('cleanup_complete') is True
                    and readback.get('kind') == 'lgd_import' and source.get('source_path', '').endswith('-' + filename)
                    and owner.get('execution', {}).get('status') == 'completed' and execution and execution not in seen
                    and port.get('port') == 0 and port.get('sample_complete') is True and port_path(owner, port) == 'port'):
                reads.append((owner, port, source))
                seen.add(execution)
    first = next((r for r in reads if r[2].get('checksum') is True), None)
    second = next((r for r in reads[reads.index(first) + 1:] if r[2].get('checksum') is False
                   and r[0].get('node') == first[0].get('node')), None) if first else None
    assert first and second, 'LGD_CHECKSUM_SWITCH_SAME_NODE_MISSING'
    assert first[1]['sample'] == second[1]['sample'] and first[1]['schema'] == second[1]['schema'], 'LGD_CHECKSUM_SWITCH_VALUES_CHANGED'


def check_tree(port, expected):
    tree = port.get('tree', {})
    assert port.get('port_kind') == 'tree' and port.get('sample_complete') is True and tree.get('complete') is True, 'TREE_INCOMPLETE'
    schema, instances = tree.get('schema', []), tree.get('instances', [])
    assert len(instances) == tree.get('node_count') and len(instances) <= 256 and tree.get('max_depth', 17) <= 16, 'TREE_LIMITS'
    assert schema and schema[0]['path'] == '' and schema[0]['is_container'] and not schema[0]['is_array'], 'TREE_ROOT'
    assert [schema[i]['name'] for i in schema[0]['children']] == expected['schema_field_order'], 'TREE_SCHEMA_ORDER'
    branch = next(n for n in schema if n['path'] == '/items')
    assert branch['is_array'] and [schema[i]['name'] for i in branch['children']] == expected['item_field_order'], 'TREE_ITEM_ORDER'
    for path, kind in expected['schema_types'].items():
        actual = [n for n in schema if n['path'] == path]
        assert len(actual) == 1 and ('object_array' if actual[0]['is_array'] else actual[0]['type']) == kind, 'TREE_SCHEMA_TYPE'
    for path, order in expected.get('nested_field_order', {}).items():
        parent = next(n for n in schema if n['path'] == path)
        assert [schema[i]['name'] for i in parent['children']] == order, 'TREE_NESTED_ORDER'
    if 'declared_schema' in expected:
        assert len(schema) == expected['schema_node_count'], 'TREE_SCHEMA_COUNT'
        for actual, want in zip(schema, expected['declared_schema']):
            assert all(actual.get(k) == v for k, v in want.items()), 'TREE_DECLARED_SCHEMA'
    wanted = []
    def walk(node, parent=None, schema_path=''):
        index = len(wanted)
        item = dict(node=node, parent=parent, schema_path=schema_path, children=[])
        wanted.append(item)
        for child in node.get('children', []):
            path = schema_path if node['type'] == 'array' else schema_path + '/' + child['path'].rsplit('/', 1)[-1]
            item['children'].append(walk(child, index, path))
        return index
    walk(expected['document'])
    assert len(instances) == len(wanted), 'TREE_INSTANCE_COUNT'
    for index, (actual, binding) in enumerate(zip(instances, wanted)):
        want = binding['node']
        kind = 'null' if actual.get('is_null') is True else actual['type']
        assert actual['index'] == index and actual['path'] == want['path'] and kind == want['type'], 'TREE_INSTANCE_ORDER_OR_TYPE'
        assert (actual['parent'] == binding['parent'] and 0 <= actual['schema_index'] < len(schema)
                and schema[actual['schema_index']]['path'] == binding['schema_path']), 'TREE_SCHEMA_BINDING'
        if 'children' in want:
            assert actual['children'] == binding['children'], 'TREE_CHILDREN'
        elif kind == 'integer':
            assert actual.get('is_null') is False and actual.get('precision') == 'exact_integer' and actual.get('value') == want['value'], 'TREE_INT64'
        elif kind == 'real':
            assert (actual.get('is_null') is False and actual.get('precision') == '17_significant_digits'
                    and type(actual.get('value')) in (int, float) and Decimal(str(actual.get('value'))) == Decimal(want['value'])), 'TREE_REAL'
        else:
            assert actual.get('value') == want['value'] and (kind != 'boolean' or type(actual.get('value')) is bool), 'TREE_SCALAR'
            assert actual.get('is_null') is (kind == 'null') and (kind != 'null' or actual.get('precision') == 'exact_null'), 'TREE_NULL'


def downloaded_csv(profile, destination):
    files = [p for p in profile.rglob(Path(destination).name) if 'artifacts/input/' not in str(p)]
    assert len(files) == 1, 'DOWNLOAD_MISSING_OR_AMBIGUOUS'
    return files[0]


class Runner:
    def __init__(self, directory):
        self.out = directory
        self.report = read(directory / 'results.json')
        self.options = read(directory / 'request.json')
        self.deadline = self.report['started'] + 85 * 60
        self.last_start = 0
        self.current = None
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(('MULTICA_', 'CODEX_'))}
        self.env.update(LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS='false', HTTP_PROXY='http://127.0.0.1:2080', HTTPS_PROXY='http://127.0.0.1:2080', NO_PROXY='localhost,127.0.0.1,::1,app.loginom.ai,mcp.loginom.ai,mas.kartamyshev.dev')

    def memory(self, pid):
        # Observe only descendants of the exact command we launched. Never keep
        # argv (setup or prompt arguments can be private) in the memory journal.
        pending, seen, totals = [pid], set(), dict(agent=0, host=0, runtime=0)
        while pending:
            current = pending.pop()
            if current in seen: continue
            seen.add(current)
            try:
                proc = Path('/proc') / str(current)
                pending.extend(map(int, (proc / 'task' / str(current) / 'children').read_text().split()))
                args = (proc / 'cmdline').read_bytes().split(b'\0')
                role = ('agent' if current == pid else
                        'host' if any(arg.endswith(b'/node-host.mjs') for arg in args) else
                        'runtime' if any(arg.endswith(b'/managed-entry.mjs') for arg in args) else None)
                if role:
                    match = re.search(r'^VmRSS:\s+(\d+) kB$', (proc / 'status').read_text(), re.M)
                    if match: totals[role] += int(match[1]) * 1024
            except (OSError, ValueError): pass  # A child may exit between /proc reads.
        return totals

    def save(self):
        write(self.out / 'results.json', self.report)
        (self.out / 'summary.md').write_text(summary(self.report))

    def failure(self, result, error, folder):
        result.update(status='UNKNOWN' if isinstance(error, TimeoutError) else 'FAIL', failure_class=str(error).split(':')[0] or type(error).__name__, detail=str(error), failure_load=list(os.getloadavg()), failed_phase=self.report['phase'], failed_at=time.time())
        journal = folder / (result['scenario'] + '-checks.jsonl')
        result['location'] = str(journal) + ':1'
        journal.write_text(json.dumps(result, ensure_ascii=False) + '\n')

    def phase(self, name, command, folder, timeout=1800, stdin=None, env=None, cwd=None):
        timing = dict(name=name, scenario=self.current['scenario'] if self.current else None,
                      queued=time.time(), started=None)
        self.report.setdefault('phase_timings', []).append(timing)
        self.report['phase'] = 'gate:' + name
        self.report['phase_folder'] = str(folder)
        self.save()
        try:
            while True:
                if time.time() >= self.deadline: raise TimeoutError('load/spacing budget')
                if load_ready(os.getloadavg(), self.options['host_load_max']) and time.time() - self.last_start >= self.options['spacing']: break
                time.sleep(1)
            self.last_start = timing['started'] = time.time()
            self.report['phase'] = name
            if self.current is not None:
                self.current.setdefault('started', timing['started'])
                self.current.setdefault('start_load', list(os.getloadavg()))
            self.save()
            with (folder / (name + '.stdout')).open('wb') as stdout, (folder / (name + '.stderr')).open('wb') as stderr, (folder / 'loads.jsonl').open('a') as loads:
                child = subprocess.Popen(list(map(str, command)), cwd=cwd or folder, env=env or self.env, stdin=subprocess.PIPE if stdin else subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
                self.report['child_pid'] = child.pid
                self.save()
                if stdin:
                    child.stdin.write(stdin.encode())
                    child.stdin.close()
                end = min(self.deadline, time.time() + timeout)
                while child.poll() is None:
                    loads.write(json.dumps({'at': time.time(), 'phase': name, 'load': os.getloadavg(), 'rss_bytes': self.memory(child.pid)}) + '\n')
                    loads.flush()
                    if time.time() >= end:
                        daemon = json.loads(subprocess.check_output(['multica', 'daemon', 'status', '--output', 'json']))
                        assert child.pid != daemon['pid'], 'Cannot terminate daemon'
                        # The CLI owns runtime close/ACK. Let it close children
                        # before interrupting the whole process group.
                        child.send_signal(signal.SIGINT)
                        # Host teardown already allows up to 90 seconds.
                        try: child.wait(timeout=100)
                        except subprocess.TimeoutExpired:
                            os.killpg(child.pid, signal.SIGINT)
                            try: child.wait(timeout=40)
                            except subprocess.TimeoutExpired:
                                os.killpg(child.pid, signal.SIGKILL)
                                child.wait()
                        raise TimeoutError(name + ' deadline')
                    try: child.wait(timeout=1)
                    except subprocess.TimeoutExpired: pass
                assert child.returncode == 0, f'{name} exit={child.returncode}: {folder / (name + ".stderr")}:1'
        finally:
            timing['finished'] = time.time()
            timing['queue_seconds'] = (timing['started'] if timing['started'] is not None else timing['finished']) - timing['queued']
            timing['duration_seconds'] = timing['finished'] - timing['started'] if timing['started'] is not None else 0
            self.save()

    def build(self):
        cache = Path.home() / '.cache/loginom-run-check' / socket.gethostname() / self.report['head']
        build = Path(self.options['build']) if self.options['build'] else cache / 'cli'
        cache.mkdir(parents=True, exist_ok=True)
        # Same-SHA runs share both source/node_modules and the final artifact.
        # Lock before checking either, and let the OS release it on worker exit.
        with (cache / 'prepare.lock').open('a') as lock:
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.time() >= self.deadline: raise TimeoutError('build preparation lock deadline')
                    time.sleep(1)
            if not (build / 'cli-manifest.json').exists():
                assert not self.options['build'], 'Provided build has no manifest'
                source = cache / 'source'
                if not source.exists(): git('worktree', 'add', '--detach', str(source), self.report['head'])
                restore_source_modes(source)
                assert git('rev-parse', 'HEAD', cwd=source) == self.report['head'] and not git('status', '--porcelain', cwd=source), 'Dirty build source'
                bun = Path.home() / '.cache/loginom-bootstrap/bun-linux-x64/bun'
                env = dict(self.env, LOGINOM_AI_AGENT_NODE_SOURCE=os.environ.get('LOGINOM_AI_AGENT_NODE_SOURCE') or str(next((Path.home() / '.cache/loginom-bootstrap/node').glob('*/bin/node'))), LOGINOM_AI_AGENT_BROWSER_SOURCE=os.environ.get('LOGINOM_AI_AGENT_BROWSER_SOURCE', str(Path.home() / '.cache/loginom-wave2-browsers')), LOGINOM_AI_AGENT_BROWSER_RECOVERY='1', LOGINOM_MCP_API_KEY=stand_knowledge_key())
                # Keep Bun's shared warm cache; serialize installations across
                # SHAs on this host, releasing the lock before compilation.
                with (cache.parent / 'bun-install.lock').open('a') as install_lock:
                    while True:
                        try:
                            fcntl.flock(install_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            break
                        except BlockingIOError:
                            if time.time() >= self.deadline: raise TimeoutError('bun install lock deadline')
                            time.sleep(1)
                    self.phase('dependencies', ['nice', '-n', '19', bun, 'install', '--frozen-lockfile', '--ignore-scripts', '--linker', 'hoisted'], cache, env=env, cwd=source)
                restore_source_modes(source)
                assert not git('status', '--porcelain', cwd=source), 'Dependencies modified tracked source'
                self.phase('build', ['nice', '-n', '19', bun, '--no-install', 'run', 'script/build-cli.ts', build, '--no-archive', *(['--baseline'] if socket.gethostname().split('.')[0] == 'mas2' else [])], cache, env=env, cwd=source / 'packages/loginom-host')
            meta = read(build / 'cli-manifest.json')['metadata']
        assert meta['sourceCommit'] == self.report['head'] and meta['sourceDirty'] is False, 'Build SHA/cleanliness mismatch'
        assert (build / 'resources/loginom/knowledge-key').is_file(), 'Build has no built-in knowledge key'
        self.report.update(build=str(build), metadata=meta)
        self.save()
        return build

    def prepare_d87(self, name, folder):
        spec = scenario(name)
        fixtures = folder / 'fixtures'
        fixtures.mkdir()
        (fixtures / 'data').mkdir()
        source = fixtures / ('d87-' + str(time.time_ns()) + '-' + name + ('.xlsx' if name == 'X1' else '.csv'))
        # Register ownership before generation, so interrupted generation is cleaned too.
        self.current['dataset'] = str(source)
        self.phase('generate', ['nice', '-n', '19', sys.executable, '-B',
                   REPO / 'scripts/node-acceptance/large-dataset-gen.py', '--output', source,
                   '--manifest', fixtures / 'manifest.json', *spec['generator']], folder)
        manifest = read(fixtures / 'manifest.json')
        if spec.get('upload_only'):
            write(fixtures / 'expected.json', {'nodes': [], 'outputs': []})
            (fixtures / 'task.md').write_text('Загрузи ' + str(source) + ' в Loginom.\n')
            return dict(spec, source=fixtures, prompt=fixtures / 'task.md', data=fixtures / 'data', local_file=source)
        write(fixtures / 'expected.json', {
            'nodes': [], 'outputs': [{'output_node_type': 'export_input', 'ordered': False,
            'columns': [{'name': 'region', 'label_any': True, 'type': 'string'},
                        {'name': 'amount_sum', 'name_any': True, 'label_any': True, 'type': 'real', 'tolerance': {'abs': .01}},
                        {'name': 'row_count', 'name_any': True, 'label_any': True, 'type': 'integer'}],
            'rows': [{'region': region, 'amount_sum': total / 100,
                      'row_count': manifest['records_by_region'][region]}
                     for region, total in manifest['sums_minor_by_region'].items()]}]})
        prompt = ('В файле ' + str(source) + ' продажи по регионам. '
                  'Загрузи исходный файл в свою личную папку без переименования. '
                  'Построй группировку по region: сумма amount и количество всех строк (считай непустой region). '
                  'В итоге нужны ровно три поля: region, сумма и количество; имена двух мер свободные. '
                  'Не заменяй исходные данные агрегатами и не обрабатывай их внешним кодом. ')
        if name == 'X1':
            prompt += 'Excel XLSX, лист Sales, одна строка заголовка; типы: region строка, amount вещественный, date дата/время, note строка. '
        else:
            prompt += ('CSV UTF-8, разделитель точка с запятой, десятичный разделитель запятая, '
                       'кавычка двойная, маркер пропуска NULL, первая строка заголовок. '
                       'Типы: region строка, amount вещественный, note строка. ')
        (fixtures / 'task.md').write_text(prompt + 'Выгрузи и скачай результат в result.csv.\n')
        return dict(spec, source=fixtures, prompt=fixtures / 'task.md', data=fixtures / 'data', local_file=source)

    def cleanup_d87(self, folder, login, build):
        source = Path(self.current['dataset'])
        try:
            names = {source.name}
            manifest = folder / 'fixtures/manifest.json'
            size = read(manifest)['bytes'] if manifest.exists() else None
            def destinations(value):
                if isinstance(value, dict):
                    upload = value.get('upload')
                    destination = value.get('destination') or (upload.get('destination') if isinstance(upload, dict) else None)
                    if value.get('bytes') == size and isinstance(destination, str):
                        path = Path(destination)
                        if str(path.parent) != login['package_directory'].rstrip('/') or not re.fullmatch(r'(?:[a-f0-9]{64}-(?:[0-9]+-)?)?' + re.escape(source.name), path.name):
                            raise ValueError('D87 receipt destination is outside the owned source naming/directory')
                        names.add(path.name)
                    for item in value.values(): destinations(item)
                if isinstance(value, list):
                    for item in value: destinations(item)
            for journal in folder.glob('*/model.stdout'):
                for _, event in records(journal):
                    part = event.get('part', {})
                    state = part.get('state', {})
                    if event.get('type') != 'tool_use' or state.get('status') != 'completed' or not part.get('tool', '').startswith('loginom_'): continue
                    try: reply = json.JSONDecoder().raw_decode(state.get('output', ''))[0]
                    except (ValueError, TypeError): continue
                    destinations(reply)
            config = folder / 'dataset-cleanup-config.json'
            write(config, dict(login=login, names=sorted(names)))
            self.phase('dataset-cleanup', [build / 'resources/loginom/bin/node',
                       REPO / 'scripts/node-acceptance/d87-cleanup.mjs', build / 'resources/loginom',
                       config, folder / 'dataset-cleanup'], folder, timeout=180)
            self.current['dataset-cleanup'] = 'storage PASS'
        finally:
            # Only files owned by this run; preserve private manifest and fail logs.
            for file in folder.rglob('*'):
                if file.is_file() and not file.is_symlink() and (file == source or file.stat().st_size >= 1000000000):
                    file.unlink()
            self.current['dataset-cleanup'] = self.current.get('dataset-cleanup', 'storage FAIL') + '; disk PASS'

    def model(self, case, folder, profile, workspace, package, login, build, session=None):
        spec = (self.prepared_case if isinstance(case, str) and case in D87 and not getattr(self, 'options', {}).get('case_root') else
                dict(source=case, prompt=case / 'task.md', data=case / 'data')
                if isinstance(case, Path) else scenario(case, getattr(self, 'options', {}).get('case_root'),
                    cases=getattr(self, 'options', {}).get('cases')))
        src = spec['source']
        prompt = spec['prompt'].read_text().replace('{{PACKAGE_PATH}}', package)
        if spec.get('lgd') == 'roundtrip':
            lgd_destination = login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + folder.parent.name + '-roundtrip.lgd'
            prompt = prompt.replace('{{EXPORT_DIRECTORY}}/roundtrip.lgd', lgd_destination)
            lgd_initial_destination = str(Path(lgd_destination).with_name(Path(lgd_destination).stem + '-first.lgd'))
            prompt = prompt.replace('{{LGD_INITIAL_DESTINATION}}', lgd_initial_destination)
        if spec.get('local_file') and spec['attachment'] == 'path':
            prompt = prompt.replace('{{SOURCE_PATH}}', str(spec['local_file']))
            if spec.get('upload_only') and str(spec['local_file']) not in prompt:
                # Seed identity comes from case.json, never a copied task's old host path.
                prompt = 'Загрузи ' + str(spec['local_file']) + ' в Loginom.\n'
        expected = expected_for(spec, package)
        if spec.get('lgd_empty_variant') or spec.get('lgd_export_compression'):
            for fmt in expected['lgd']['formats']:
                fmt['destination'] = login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + folder.parent.name + '-' + fmt['name'] + '.lgd'
                prompt = prompt.replace('{{EXPORT_DIRECTORY}}/' + fmt['name'] + '.lgd', fmt['destination'])
        if spec.get('tree_conversion'):
            labels = [n['label'] for n in expected['nodes'] if n.get('label')]
            prompt += '\nНазови узел дерева «' + labels[0] + '», узел JSON «' + labels[1] + '».'
        rejection = expected.get('rejection')
        refusal = expected.get('refusal')
        execution_error = expected.get('execution_error')
        lgd_corrupt = spec.get('lgd') == 'corrupt'
        if refusal is not None:
            assert (isinstance(refusal, dict) and set(refusal) == {'text'}
                    and isinstance(refusal['text'], str) and refusal['text'].strip()
                    and expected['outputs'] == [] and not rejection and not execution_error
                    and not spec.get('upload_only') and not lgd_corrupt
                    and all(n['type'].startswith('imports.') for n in expected['nodes'])), 'INVALID_REFUSAL_ORACLE'
        if execution_error is not None:
            assert (set(execution_error) == {'text'} and isinstance(execution_error['text'], str)
                    and execution_error['text'].strip() and expected['outputs'] == []
                    and not rejection and not spec.get('upload_only')), 'INVALID_EXECUTION_ERROR_ORACLE'
        if rejection is not None:
            assert rejection == dict(code='LOGINOM_FILE_CHANGED', node_type='transform.group_data') and expected['outputs'] == [], 'INVALID_REJECTION_ORACLE'
        filenames = re.findall(r'[\w-]+\.(?:csv|xlsx)', prompt)
        exports = ([Path(output['export_destination']).name for output in expected['outputs']]
                   if spec.get('external') else
                   list(dict.fromkeys(name for name in filenames if not (spec['data'] / name).exists()
                                        and name != (spec.get('local_file').name if spec.get('local_file') else None))))
        if spec.get('excel_mode'): exports = [b['filename'] for b in expected['excel_books']]
        if spec.get('external'):
            assert all(re.fullmatch(r'[\w-]+\.csv', name) for name in exports), 'Invalid CSV export filename'
            if exports and not any(name in prompt for name in exports):
                prompt += '\nВыгрузи и скачай итоговые таблицы в файлы ' + ', '.join(exports) + '.'
        if spec.get('variable_only') or spec.get('upload_only') or rejection or refusal or execution_error or lgd_corrupt: exports = []
        if not exports and not spec.get('variable_only') and not spec.get('upload_only') and not rejection and not refusal and not execution_error and not lgd_corrupt:
            count = spec.get('export_count', 2 if src.parent.name == 'datamining-clustering' else 1)
            exports = [f'{src.parent.name}-{i + 1}.csv' for i in range(count)]
            prompt += '\nВыгрузи и скачай таблицы в файлы ' + ', '.join(exports) + '.'
            if spec.get('filter_initial'): prompt += ' Порядок CSV: первоначальные подходящие, первоначальные остальные, обновлённые подходящие, обновлённые остальные.'
            if spec.get('export_count') == 5: prompt += ' Порядок файлов: выходной набор (порт 0), выбросы (порт 1), экстремальные значения (порт 2), пропуски (порт 3), итоговая таблица (порт 4).'
            if spec.get('export_count') == 3: prompt += ' Порядок файлов: обработанные данные, выбросы, экстремальные значения.'
        destinations = [login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + folder.parent.name + '-' + name for name in exports]
        if exports:
            routes = dict(zip(exports, destinations))
            names = '|'.join(map(re.escape, sorted(exports, key=len, reverse=True)))
            prompt = re.sub(r'(?<![\w-])(?:' + names + r')(?![\w-])', lambda match: routes[match.group()], prompt)
        if not spec.get('upload_only'):
            prompt += f'\nСохрани пакет как {package}.'
            if not spec.get('variable_only') and not rejection and not refusal and not execution_error and not lgd_corrupt: prompt += ' Выгрузи и скачай полную итоговую книгу XLSX.' if spec.get('xlsx') else ' Доставь все итоговые книги Excel.' if spec.get('excel_mode') else ' Выгрузи и скачай полный итоговый CSV.'
        (folder / 'task.md').write_text(prompt)
        for index, output in enumerate(expected['outputs']):
            if spec.get('excel_mode'): output['export_destination'] = destinations[index]
            elif output['output_node_type'] == 'export_input' or spec.get('xlsx'): output['export_destination'] = destinations[-1]
            elif spec.get('external'): output.pop('export_destination', None)  # Consumed routing hint, not a native output contract.
        if spec.get('lgd') == 'roundtrip': expected['lgd']['destination'] = lgd_destination
        if spec.get('lgd_case') == 'variable':
            expected['lgd']['initial_destination'] = lgd_initial_destination
            expected['variable_inventory']['outputs'][0]['variables'][0]['value'] = lgd_destination
        if spec.get('excel_mode') == 'replace':
            write(folder / 'seed-config.json', dict(login=login, books=[dict(fixture=str(spec['data'] / ('existing.'+b['format'])), destination=b['export_destination']) for b in expected['excel_books']]))
            self.phase('excel-seeds', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/exports-excel-modes.mjs', build / 'resources/loginom', folder / 'seed-config.json', folder / 'seeds'], folder, timeout=300)
        write(folder / 'expected.json', expected)
        command = [build / 'bin/loginom-ai-agent-cli', 'run', '--headless', '--format', 'json', '--dir', workspace, '--model', 'openai/gpt-6.1-sol', '--variant', 'medium', '--dangerously-skip-permissions']
        if session: command += ['--session', session]
        # Initial requests need their inputs even when the prose omits names.
        # Continuations only admit new, explicitly requested files (r3/r4).
        files = ([spec['data'] / name for name in dict.fromkeys(filenames)] if session else
                 sorted(p for p in spec['data'].iterdir() if p.suffix in ['.csv', '.xlsx']))
        # README exceptions: p14 tests Excel, and the regression base uses only
        # train.csv; its other fixtures belong to later operator scenarios.
        if case == 'p14': files = [spec['data'] / 'exhibits.xlsx']
        if spec.get('input_files'): files = [spec['data'] / name for name in spec['input_files']]
        if isinstance(case, Path) and src.parent.name == 'datamining-linregression':
            files = [spec['data'] / 'train.csv']
        if spec.get('local_file'):
            if spec['attachment'] == 'file': command += ['--file', spec['local_file']]
            files = []  # No multi-GiB workspace copy, and no --file for the path case.
        for file in files:
            if not file.is_file(): continue
            target = workspace / file.name
            if target.exists(): continue
            shutil.copyfile(file, target)
            if spec.get('lgd') and target.suffix.lower() == '.lgd':
                # Native binary input uses the existing local-path admission flow.
                prompt += f'\nИсходный файл LGD: {target}.'
            else:
                command += ['--file', target]
        (folder / 'task.md').write_text(prompt)
        env = dict(self.env, LOGINOM_AI_AGENT_CLI_PROFILE=str(profile), LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG='1', LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE='1', LOGINOM_AI_AGENT_PURE='1')
        self.phase('model', command + ['--', prompt], folder, timeout=spec.get('model_timeout', 1800), env=env, cwd=workspace)
        events = list(records(folder / 'model.stdout'))
        session = next(e['sessionID'] for _, e in events if e.get('sessionID'))
        replies = []
        for n, event in events:
            state = event.get('part', {}).get('state', {})
            if event.get('type') != 'tool_use' or state.get('status') != 'completed': continue
            try: reply = json.JSONDecoder().raw_decode(state.get('output', ''))[0]
            except (ValueError, TypeError): continue
            if isinstance(reply, dict): replies.append((n, reply))
        if spec.get('lgd_case'):
            for n, event in events:
                state = event.get('part', {}).get('state', {})
                if event.get('type') != 'tool_use' or state.get('status') != 'error': continue
                try: value = json.JSONDecoder().raw_decode(state.get('error', ''))[0]
                except (ValueError, TypeError): continue
                if isinstance(value, dict): replies.append((n, value))
            replies.sort(key=lambda item: item[0])
        if case in ['quality-default', 'quality-spikes']:
            evidence = [event for log in profile.rglob('execution-events.jsonl') for _, event in records(log)]
            evidence.sort(key=lambda event: event.get('recorded_at', ''))
            write(folder / 'quality-events.json', evidence)
            self.phase('quality-oracle', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/quality.mjs', src / spec['quality_initial_name'], src / spec['expected_name'], folder / 'quality-events.json'], folder, timeout=60)
        if spec.get('variables_real_date'):
            evidence = [event for log in profile.rglob('execution-events.jsonl') for _, event in records(log)]
            evidence.sort(key=lambda event: event.get('recorded_at', ''))
            write(folder / 'variable-events.json', evidence)
            self.phase('user-real-date-oracle', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/variables-user-real-date.mjs',
                src / 'expected-initial-run.json', folder / 'expected.json', folder / 'variable-events.json'], folder, timeout=60)
        if spec.get('upload_only'):
            calls = [event.get('part', {}) for _, event in records(folder / 'model.stdout')
                     if event.get('type') == 'tool_use']
            assert not any(c.get('tool') == 'loginom_dock_action_run'
                and c.get('state', {}).get('input', {}).get('action_key') in ['package.save_checkpoint', 'package.save_as']
                for c in calls) and not any(o.get('action_key') in ['package.save_checkpoint', 'package.save_as'] for _, o in replies), 'UNEXPECTED_SAVE'
            assert not any(c.get('tool') == 'loginom_dock_node_apply' for c in calls), 'UNEXPECTED_NODE'
            uploads = []
            for call in calls:
                if call.get('tool') != 'loginom_dock_artifact_deliver': continue
                state = call.get('state', {})
                # Validation failures with no possible effect never reach the browser.
                try: rejected = json.JSONDecoder().raw_decode(state.get('error', ''))[0]
                except (ValueError, TypeError): rejected = None
                if (state.get('status') == 'error' and isinstance(rejected, dict)
                        and rejected.get('request_rejected') is True and rejected.get('effect_possible') is False
                        and rejected.get('status') == 'NOT_APPLIED' and rejected.get('state') == 'settled'
                        and rejected.get('action_key') == 'request.validate'):
                    continue
                uploads.append(call)
            assert len(uploads) == 1, 'UPLOAD_COUNT'
            assert any(o.get('upload_status', 'ready') == 'ready' and o.get('status') == 'SUCCEEDED'
                       and o.get('state') == 'settled' and o.get('cleanup_complete') is True
                       and o.get('output', {}).get('bytes') == spec['local_file'].stat().st_size
                       and o.get('output', {}).get('upload_completion_verified') is True for _, o in replies), 'UPLOAD_NOT_READY'
            cleanups = [read(p) for p in profile.rglob('saved-package-cleanup.json')]
            acks = [read(p) for p in profile.rglob('runtime-close-*.json')]
            assert cleanups and all(c.get('package_closed') is True and c.get('logged_out') is True
                and c.get('package_path') is None and c.get('save_operation_id') is None
                and not c.get('unsaved_changes_discarded') for c in cleanups), 'MAIN_CLEANUP_UNCONFIRMED'
            assert acks and all(a.get('closed_ack') is True for a in acks), 'RUNTIME_CLOSE_ACK_MISSING'
            self.current.update(save='0', cleanup='main PASS', upload='ready', cold='—', csv='—')
            return session, expected, None, None
        assert any(o.get('status') == 'SUCCEEDED' and o.get('action_key') in ['package.save_checkpoint', 'package.save_as'] and o.get('output', {}).get('save_completed') is True for _, o in replies), 'SAVE_NOT_CONFIRMED'
        self.current['save'] = 'PASS'
        if refusal:
            allowed = {n['type'] for n in expected['nodes']}
            for _, event in events:
                part = event.get('part', {})
                if event.get('type') != 'tool_use': continue
                request = part.get('state', {}).get('input', {})
                if part.get('tool') == 'loginom_dock_node_apply':
                    assert request.get('target', {}).get('type') in allowed, 'UNEXPECTED_NODE'
                if part.get('tool') == 'loginom_dock_action_run' and request.get('action_key') == 'node.add':
                    assert request.get('parameters', {}).get('component_key') in allowed, 'UNEXPECTED_NODE'
            answer = next(((n, event.get('part', {}).get('text', '')) for n, event in reversed(events)
                           if event.get('type') == 'text'), (None, ''))
            assert refusal['text'] in answer[1], 'REFUSAL_NOT_REPORTED'
            inputs = {p.name: hashlib.sha256(p.read_bytes()).digest() for p in files if p.is_file()}
            assert not any(p.is_file() and not any(
                re.fullmatch(r'[0-9a-f]{64}-\d+-' + re.escape(name), p.name)
                and hashlib.sha256(p.read_bytes()).digest() == digest
                for name, digest in inputs.items()) for p in profile.rglob('*.csv')), 'UNEXPECTED_CSV'
            self.current.update(refusal='PASS', refusal_location=str(folder / 'model.stdout') + ':' + str(answer[0]))
        if lgd_corrupt:
            for _, event in events:
                part = event.get('part', {})
                if event.get('type') == 'tool_use' and part.get('tool') == 'loginom_dock_node_apply':
                    assert part.get('state', {}).get('input', {}).get('target', {}).get('type') == 'imports.lgd', 'LGD_CORRUPT_SUBSTITUTE_NODE'
            errors, refusals = [], []
            for _, event in events:
                part = event.get('part', {})
                state = part.get('state', {})
                if event.get('type') != 'tool_use' or state.get('status') not in ['completed', 'error']: continue
                try: value = json.JSONDecoder().raw_decode(state.get('output' if state['status'] == 'completed' else 'error', ''))[0]
                except (ValueError, TypeError): continue
                pending = [value]
                while pending:
                    value = pending.pop()
                    if isinstance(value, dict):
                        if value.get('status') == 'SUCCEEDED' and value.get('configuration', {}).get('readback', {}).get('kind') == 'lgd_import':
                            raise AssertionError('LGD_CORRUPT_SUCCESS_FORBIDDEN')
                        error = value.get('error', {})
                        if isinstance(error, dict):
                            errors.append(error.get('message', ''))
                            if value.get('status') == 'FAILED': refusals.append(value)
                        pending.extend(value.values())
                    elif isinstance(value, list): pending.extend(value)
            pattern = r'контрольн[^\n]*сумм|checksum'
            assert any(re.search(pattern, error, re.I) for error in errors), 'LGD_CHECKSUM_REFUSAL_MISSING'
            assert any(o.get('status') == 'FAILED' and o.get('cleanup_complete') is True
                       and o.get('execution', {}).get('status') == 'not_requested'
                       and o.get('output', {}).get('ports') == []
                       and re.search(pattern, o.get('error', {}).get('message', ''), re.I)
                       for o in refusals), 'LGD_CHECKSUM_REFUSAL_UNSETTLED'
            answer = '\n'.join(event.get('part', {}).get('text', '') for _, event in events if event.get('type') == 'text')
            assert re.search(pattern, answer, re.I), 'LGD_CHECKSUM_REFUSAL_NOT_REPORTED'
        if execution_error:
            # Only tool results are evidence: request inputs contain the intentional
            # exception too, and must never establish an observed Loginom failure.
            observed = []
            for n, event in events:
                part = event.get('part', {})
                state = part.get('state', {})
                if event.get('type') != 'tool_use': continue
                request = state.get('input', {})
                assert not (part.get('tool') == 'loginom_dock_node_apply'
                            and request.get('target', {}).get('type') in ['exports.text', 'exports.excel']), 'UNEXPECTED_EXPORT'
                if state.get('status') in ['completed', 'error']:
                    result = state.get('output' if state['status'] == 'completed' else 'error', '')
                    try: receipt = json.JSONDecoder().raw_decode(result)[0]
                    except (ValueError, TypeError): receipt = None
                    pending = [receipt]
                    while pending:
                        value = pending.pop()
                        if isinstance(value, dict):
                            error = value.get('error')
                            if isinstance(error, dict) and execution_error['text'] in error.get('message', ''):
                                observed.append(n)
                            pending.extend(value.values())
                        elif isinstance(value, list): pending.extend(value)
                    if (part.get('tool') == 'loginom_browser_snapshot' and 'Ошибка' in result
                            and execution_error['text'] in result): observed.append(n)
            assert observed, 'EXPECTED_EXECUTION_ERROR_MISSING'
            answer = next((event.get('part', {}).get('text', '') for _, event in reversed(events)
                           if event.get('type') == 'text'), '')
            assert execution_error['text'] in answer, 'EXECUTION_ERROR_NOT_REPORTED'
            # Admission stores a hash-prefixed copy next to downloaded outputs.
            # Exclude only this case's exact input identities, not arbitrary CSVs.
            inputs = {p.name: hashlib.sha256(p.read_bytes()).digest() for p in files if p.is_file()}
            assert not any(p.is_file() and not any(
                re.fullmatch(r'[0-9a-f]{64}-\d+-' + re.escape(name), p.name)
                and hashlib.sha256(p.read_bytes()).digest() == digest
                for name, digest in inputs.items()) for p in profile.rglob('*.csv')), 'UNEXPECTED_CSV'
            assert any(n > observed[0] and o.get('status') == 'SUCCEEDED'
                       and o.get('action_key') in ['package.save_checkpoint', 'package.save_as']
                       and o.get('output', {}).get('save_completed') is True for n, o in replies), 'SAVE_AFTER_ERROR_MISSING'
            self.current.update({'execution-error': 'PASS',
                                 'error_location': str(folder / 'model.stdout') + ':' + str(observed[0])})
        if rejection:
            overwritten, guarded = False, None
            requests = {}
            for n, event in events:
                part = event.get('part', {})
                state = part.get('state', {})
                if event.get('type') != 'tool_use' or state.get('status') not in ['completed', 'error']: continue
                request = state.get('input', {})
                if part.get('tool') == 'loginom_dock_node_apply' and request.get('operation_id'):
                    requests[request['operation_id']] = request
                try: reply = json.JSONDecoder().raw_decode(state.get('output' if state['status'] == 'completed' else 'error', ''))[0]
                except (ValueError, TypeError): continue
                if not isinstance(reply, dict): continue
                if reply.get('action_key') == 'operation.inspect':
                    reply = reply.get('output', {}).get('outcome', {})
                if reply.get('state') == 'running': continue
                request = requests.get(reply.get('operation_id'), request)
                if (request.get('target', {}).get('type') == 'exports.text'
                        and request.get('parameters', {}).get('overwrite') == 'replace'
                        and request.get('finish') == 'execute' and reply.get('status') == 'SUCCEEDED'):
                    overwritten = True
                if overwritten and request.get('target', {}).get('type') == rejection['node_type']:
                    result = reply['output'] if 'execution' in reply.get('output', {}) else reply
                    assert (request.get('finish') == 'execute' and reply.get('status') == 'NOT_APPLIED'
                            and reply.get('error', {}).get('code') == rejection['code']
                            and reply.get('effect_possible') is False and reply.get('cleanup_complete') is True
                            and result.get('execution', {}).get('status') == 'not_requested'
                            and result.get('output', {}).get('status') == 'not_refreshed'
                            and result.get('output', {}).get('ports') == []), 'TAMPER_REJECTION_INVALID'
                    guarded = n
                if guarded:
                    # A later successful read must never turn stale rows into PASS.
                    assert not any(ports(reply)), 'TAMPER_STALE_ROWS'
            assert guarded is not None, 'TAMPER_REJECTION_MISSING'
            assert any(n > guarded and o.get('status') == 'SUCCEEDED'
                       and o.get('action_key') in ['package.save_checkpoint', 'package.save_as']
                       and o.get('output', {}).get('save_completed') is True for n, o in replies), 'SAVE_AFTER_REJECTION_MISSING'
            self.current['rejection'] = 'PASS'
            self.current['rejection_location'] = str(folder / 'model.stdout') + ':' + str(guarded)
        paths = {port_path(owner, p) for _, o in replies for owner, p in ports(o)} - {None}
        self.current['read-path'] = '/'.join(sorted((set(self.current.get('read-path', '').split('/')) | paths) - {''}))
        delivered = any(ports([o for _, o in replies]))
        assert not (lgd_corrupt and delivered), 'LGD_CORRUPT_PORTS_FORBIDDEN'
        invalid = (port_failure(replies, folder / 'model.stdout')
                   if not spec.get('variable_only') and (not (rejection or refusal or execution_error or lgd_corrupt) or delivered) else None)
        if invalid:
            self.current.update(failure_class='PORT_READ_INVALID', detail='Port source or native binding/exactness/Preview cleanup absent or invalid', location=invalid, failure_load=list(os.getloadavg()))
            self.current['port-read'] = 'FAIL'
        self.current.setdefault('port-read', '— (expected execution error)' if execution_error and not delivered else 'PASS')
        if expected.get('proposed_tree_output'):
            trees = [(owner, port) for _, reply in replies for owner, port in ports(reply) if port.get('port_kind') == 'tree']
            assert trees, 'TREE_READ_MISSING'
            matched_trees = 0
            for owner, port in trees:
                assert port_path(owner, port) == 'port', 'TREE_READ_OWNERSHIP'
                contract = expected['proposed_tree_output']
                if contract.get('output_node_type'):
                    kind = {'trees.from_table': 'table_to_tree', 'trees.from_json': 'json_to_tree'}[contract['output_node_type']]
                    identities = {o.get('node', {}).get('node_id') for _, reply in replies for o, _ in ports(reply) if o.get('configuration', {}).get('readback', {}).get('kind') == kind}
                    assert len(identities) == 1, 'TREE_SELECTED_NODE_AMBIGUOUS'
                    if owner.get('node', {}).get('node_id') not in identities: continue
                    assert port.get('port') == contract.get('output_port', 0), 'TREE_OUTPUT_PORT'
                check_tree(port, contract)
                matched_trees += 1
            assert matched_trees, 'TREE_SELECTED_READ_MISSING'
            self.current['tree-read'] = 'PASS'
        cleanups = [read(p) for p in profile.rglob('saved-package-cleanup.json')]
        acks = [read(p) for p in profile.rglob('runtime-close-*.json')]
        assert cleanups and all(c.get('package_closed') is True and c.get('logged_out') is True and not c.get('unsaved_changes_discarded') for c in cleanups), 'MAIN_CLEANUP_UNCONFIRMED'
        assert acks and all(a.get('closed_ack') is True for a in acks), 'RUNTIME_CLOSE_ACK_MISSING'
        self.current['cleanup'] = 'main PASS'
        if spec.get('variable_only'):
            evidence = [event for log in profile.rglob('execution-events.jsonl') for _, event in records(log)]
            evidence.sort(key=lambda event: event.get('recorded_at', ''))
            write(folder / 'variable-events.json', evidence)
            self.phase('variable-oracle', [build / 'resources/loginom/bin/node', spec['oracle'], spec.get('variable_audit', 'variables-user'),
                src / spec.get('variable_initial', spec.get('variable_initial_name', 'expected-user-initial.json')), folder / 'expected.json', folder / 'variable-events.json'], folder, timeout=60)
            self.current.update(csv='— (variables)', **{'port-read': 'PASS', 'read-path': spec.get('variable_read_path', 'execution' if spec.get('variable_audit') in ['variables-calculator', 'variables-replace', 'variables-column-union'] else 'snapshot')})
            return session, expected, None, None
        if refusal:
            self.current.update(csv='— (expected refusal)', cold='— (expected refusal)')
            return session, expected, None, None
        if lgd_corrupt:
            self.current.update(csv='— (checksum refusal)', cold='— (negative case)')
            return session, expected, None, None
        if spec.get('lgd'):
            check_lgd_import_result(replies, len(expected['outputs'][0]['rows']))
        if expected.get('lgd', {}).get('checksum_switch_filename'):
            check_lgd_checksum_switch(replies, expected['lgd']['checksum_switch_filename'])
        if expected.get('lgd', {}).get('source_switch'):
            check_lgd_variable_switch(replies, expected['lgd']['source_switch'])
        if execution_error:
            self.current.update(csv='— (expected execution error)', cold='— (expected execution error)')
            return session, expected, None, None
        if rejection:
            self.current.update(csv='— (expected rejection)', cold='— (expected rejection)')
            return session, expected, None, None
        if spec.get('lgd') == 'roundtrip':
            if spec.get('lgd_case'): check_lgd_export_case(replies, spec['lgd_case'], lgd_destination, lgd_initial_destination)
            assert any(o.get('status') == 'SUCCEEDED' and o.get('configuration', {}).get('readback', {}).get('kind') == 'lgd_export'
                       and o.get('configuration', {}).get('readback', {}).get('destination') == lgd_destination
                       and o.get('configuration', {}).get('readback', {}).get('settings', {}).get('compression') == 2
                       and o.get('configuration', {}).get('readback', {}).get('settings', {}).get('checksum') == 1
                       and not o.get('output', {}).get('ports')
                       and any(f.get('destination') == lgd_destination and f.get('bytes', 0) > 0 for f in o.get('output', {}).get('file_artifacts', []))
                       for _, o in replies), 'LGD_SINK_FILE_EVIDENCE_MISSING'
            lgd_file = downloaded_csv(profile, lgd_destination)
            binary = lgd_file.read_bytes()
            assert len(binary) > 20 and binary[:6] == b'BGDATA' and binary[16:20] == bytes.fromhex('04224d18'), 'LGD_LZ4_HEADER'
            shutil.copyfile(lgd_file, folder / 'roundtrip.lgd')
        if spec.get('lgd_empty_variant') or spec.get('lgd_export_compression'):
            for fmt in expected['lgd']['formats']:
                destination = fmt['destination']
                assert any(o.get('status') == 'SUCCEEDED' and o.get('configuration', {}).get('readback', {}).get('kind') == 'lgd_export'
                           and o['configuration']['readback'].get('destination') == destination
                           and o['configuration']['readback'].get('settings', {}).get('compression') == fmt['native_compression']
                           and o['configuration']['readback'].get('settings', {}).get('checksum') == fmt['native_checksum']
                           and any(f.get('destination') == destination and f.get('bytes', 0) > 0 for f in o.get('output', {}).get('file_artifacts', []))
                           for _, o in replies), 'LGD_COMPRESSION_SINK_EVIDENCE:' + fmt['name']
                assert any(o.get('status') == 'SUCCEEDED' and o.get('configuration', {}).get('readback', {}).get('kind') == 'lgd_import'
                           and o['configuration']['readback'].get('source', {}).get('source_path') == destination
                           and o['configuration']['readback']['source'].get('compression') == fmt['compression_display']
                           and o['configuration']['readback']['source'].get('written_checksum') == fmt['checksum_display']
                           for _, o in replies), 'LGD_COMPRESSION_IMPORT_METADATA:' + fmt['name']
                lgd_file = downloaded_csv(profile, destination)
                binary = lgd_file.read_bytes()
                assert len(binary) > 20 and binary[:6] == b'BGDATA', 'LGD_COMPRESSION_HEADER:' + fmt['name']
                if spec.get('lgd_empty_variant'):
                    assert binary[16:20] == bytes.fromhex('04224d18'), 'LGD_EDGE_HEADER:' + fmt['name']
                shutil.copyfile(lgd_file, folder / (fmt['name'] + '.lgd'))
        if spec.get('excel_mode'):
            manifest = []
            for book in expected['excel_books']:
                destination = book['export_destination']
                assert any(o.get('status')=='SUCCEEDED' and o.get('configuration',{}).get('readback',{}).get('kind')=='excel_export'
                    and o['configuration']['readback'].get('destination')==destination
                    and any(f.get('destination')==destination and f.get('bytes',0)>0 for f in o.get('output',{}).get('file_artifacts',[])) for _,o in replies), 'EXCEL_SINK_FILE_EVIDENCE_MISSING'
                actual = folder / Path(destination).name
                shutil.copyfile(downloaded_csv(profile,destination),actual)
                self.phase('oracle', [sys.executable, '-B', src / 'modes/oracle.py', '--case', expected['excel_case'], '--file', actual], folder, timeout=60)
                manifest.append(dict(file=str(actual), case=expected['excel_case']))
            actual = folder / 'excel-books.json'
            write(actual,manifest)
            self.current['csv'] = 'PASS (Excel)'
            return session, expected, actual, ','
        if spec.get('xlsx'):
            assert len(destinations) == 1, 'XLSX_SINGLE_SINK'
            actual = folder / Path(destinations[0]).name
            shutil.copyfile(downloaded_csv(profile, destinations[0]), actual)
            sink = dict(expected['outputs'][0], filename=actual.name)
            write(folder / 'xlsx-expected.json', sink)
            self.phase('oracle', [sys.executable, '-B', src / 'oracle.py', '--xlsx', actual, '--expected', folder / 'xlsx-expected.json'], folder, timeout=60)
            self.current['csv'] = 'PASS (XLSX)'
            return session, expected, actual, ','
        if expected.get('factor_signs'):
            rounds = {}
            for _, reply in replies:
                for owner, port in ports(reply):
                    if owner.get('configuration', {}).get('readback', {}).get('kind') != 'factor_analysis': continue
                    key = owner.get('execution', {}).get('execution_id')
                    rounds.setdefault(key, {})[port['port']] = dict(node=owner['node'], type='research.factor_analysis',
                        output_port=port['port'], execution=owner['execution'], data=port)
            complete = [list(group.values()) for group in rounds.values() if set(group) == {0, 1}]
            assert complete, 'FACTOR_BOTH_TYPED_OUTPUTS_MISSING'
            write(folder / 'factor-actual.json', complete[-1])
            self.phase('factor-signs', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/expected-outputs.mjs',
                'factor-signs', folder / 'expected.json', folder / 'factor-actual.json', folder / 'factor-aligned.json'], folder, timeout=60)
            expected = read(folder / 'factor-aligned.json')
        header = spec.get('csv_header', 'names')
        if spec.get('text_export_encodings'):
            check_text_export_encodings(replies, destinations)
        sampling_csvs = []
        for index, destination in enumerate(destinations):
            actual = folder / ('actual.csv' if len(destinations) == 1 else f'actual-{index + 1}.csv')
            shutil.copyfile(downloaded_csv(profile, destination), actual)
            if spec.get('text_export_encodings'):
                self.phase('oracle-' + str(index + 1), [sys.executable, '-B', src / 'oracle.py',
                    '--csv', actual, '--encoding', spec['text_export_encodings'][index]], folder, timeout=60)
                delimiter = ';'
                continue
            if expected.get('sampling_modes'):
                delimiter = csv_delimiter(actual)
                sampling_csvs.append(list(csv.reader(io.StringIO(actual.read_text(encoding='utf-8-sig')), delimiter=delimiter)))
                continue
            if (re.fullmatch(r'n(?:1[3-9]|20)', src.name) or src.parent.name == 'datamining-logregression'
                    or case in ['logreg-forward', 'logreg-backward', 'logreg-stepwise', 'logreg-selection-forward', 'logreg-selection-backward', 'logreg-selection-stepwise', 'logreg-stepwise-aic', 'logreg-stepwise-aicc', 'logreg-stepwise-bic', 'logreg-stepwise-hqic', 'logreg-stepwise-strict', 'logreg-stepwise-permissive']):
                self.phase('oracle', [sys.executable, '-B', src / 'oracle.py', actual], folder, timeout=60)
                # The CSV oracle owns its documented value/order freedoms.
                delimiter = csv_delimiter(actual)
                continue
            # Node-base fixtures describe native port order, not CSV export order.
            # Their task.md leaves export order free; continuation fixtures do not.
            counts = {}
            csv_expected = (read(src / spec['lgd_initial'])['outputs'][0] if spec.get('lgd_initial') and index == 0
                            else expected['outputs'][0] if spec.get('lgd_initial')
                            else read(src / spec['filter_initial'])['outputs'][index] if spec.get('filter_initial') and index < 2
                            else expected['outputs'][index % 2] if spec.get('filter_initial') else expected['outputs'][index])
            delimiter = check_csv(actual, csv_expected, header,
                                  column_order='any' if isinstance(case, Path) else None,
                                  null_marker=expected.get('null_marker'), scenario_name=case, d76=counts,
                                  export_events=events, destination=destination)
            if counts: self.current['d76'] = counts
        if expected.get('sampling_modes'):
            write(folder / 'sampling-replies.json', [o for _, o in replies])
            write(folder / 'sampling-csvs.json', sampling_csvs)
            self.phase('sampling-oracle', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/sampling-modes.mjs',
                'main', folder / 'expected.json', folder / 'sampling-replies.json', folder / 'sampling-csvs.json', folder / 'sampling-baseline.json'], folder, timeout=60)
        if expected.get('clustering_normalized'):
            write(folder / 'clustering-replies.json', [o for _, o in replies])
            self.phase('clustering-oracle', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/clustering-normalized.mjs',
                folder / 'expected.json', folder / 'clustering-replies.json', folder / 'clustering-baseline.json'], folder, timeout=60)
        self.current['csv'] = D76_STATUS if any(self.current.get('d76', {}).values()) else 'PASS'
        return session, expected, actual, delimiter

    def run(self):
        try:
            build = self.build()
            if self.options.get('prepare_only'):
                for result in self.report['runs']:
                    result.update(status='NOT_RUN', reason='PREPARE_ONLY', preparation_only=True)
                return
            account = read(Path(self.options['pair']) / 'worker.json')
            login = pair_login(account, 'worker.json')
            for r in self.report['runs']:
                self.current = r
                if time.time() >= self.deadline:
                    r.update(status='NOT_RUN', reason='BATCH_BUDGET_EXHAUSTED')
                    self.save()
                    continue
                folder = self.out / r['scenario']
                folder.mkdir()
                profile, workspace = folder / 'profile', folder / 'workspace'
                workspace.mkdir()
                r.update(profile=str(profile), package=login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + r['scenario'] + '.lgp')
                env = dict(self.env, LOGINOM_AI_AGENT_CLI_PROFILE=str(profile))
                try:
                    if r['scenario'] in D87 and not self.options.get('case_root'):
                        self.prepared_case = self.prepare_d87(r['scenario'], folder)
                    self.phase('setup', [build / 'bin/loginom-ai-agent-cli', 'loginom', 'setup', '--headless', '--stdin-json', '--format', 'json'], folder, timeout=180, env=env, stdin=json.dumps(dict(url=login['url'], username=login['username'], password=login['password'])))
                    assert read(folder / 'setup.stdout').get('browser', {}).get('state') == 'verified', 'SETUP_NOT_VERIFIED'
                    (profile / 'data/auth.json').symlink_to(Path.home() / '.local/state/loginom-cli-oauth/shared-oauth-v1/auth.json')
                    write(profile / 'config/loginom-ai-agent.json', {'provider': {'openai': {'models': {'gpt-6.1-sol': {'name': 'GPT-6.1 Sol', 'reasoning': True, 'tool_call': True, 'limit': {'context': 400000, 'output': 128000}, 'variants': {'medium': {'reasoningEffort': 'medium'}}}}}}})
                    case = r['scenario']
                    spec = scenario(case, self.options.get('case_root'), cases=self.options.get('cases'))
                    if spec.get('source_package'):
                        write(folder / 'source-config.json', dict(login=login, package=r['package']))
                        self.phase('source-package', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/variables-column-union.mjs', 'prepare', build / 'resources/loginom', folder / 'source-config.json', spec['source_package'], folder / 'source'], folder, timeout=300)
                    base = spec['base']
                    session = None
                    for step in ([base, case] if base else [case]):
                        r.update(csv='—', save='—', cleanup='—')
                        stage = folder / (step.parent.name if isinstance(step, Path) else step)
                        stage.mkdir()
                        session, expected, actual, delimiter = self.model(step, stage, profile, workspace, r['package'], login, build, session)
                    assert case != 'types300' or (self.options['cold'] and not spec.get('upload_only') and not expected.get('rejection')), 'TYPES300_COLD_REQUIRED'
                    if self.options['cold'] and not spec.get('upload_only') and not expected.get('rejection') and not expected.get('refusal') and not expected.get('execution_error') and spec.get('lgd') != 'corrupt':
                        r['cold'] = 'FAIL'
                        write(folder / 'cold-config.json', {'loginom_url': login['url'], 'workflow_profile': {'loginom_user': login['username'], 'password': login['password'], 'passwordless_login': login.get('passwordless_login', False)}})
                        self.phase('cold', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/cold-check.mjs', '--config', folder / 'cold-config.json', '--resources', build / 'resources/loginom', '--saved', r['package'], '--expected', stage / 'expected.json', '--output', folder / 'cold', *(['--xlsx', actual, '--xlsx-expected', stage / 'xlsx-expected.json'] if spec.get('xlsx') else ['--excel-books', actual] if spec.get('excel_mode') else [] if spec.get('variable_only') else ['--csv', actual, '--csv-delimiter', delimiter, '--csv-header', spec.get('csv_header', 'names')]), *(['--exact-port-windows'] if case == 'types300' else []), *(['--sampling-baseline', stage / 'sampling-baseline.json'] if expected.get('sampling_modes') else [])], folder)
                        cold = read(folder / 'cold/result.json')
                        assert cold['status'] == 'PASS' and cold.get('settingsReapplied') is False, 'COLD_FAILED'
                        assert all(cold['cleanup'].get(k) is True for k in ['package_closed', 'logged_out']), 'COLD_CLEANUP_UNCONFIRMED'
                        r.update(cold='PASS', cleanup='both PASS')
                    r['status'] = 'FAIL' if r.get('failure_class') else (D76_STATUS if r.get('csv') == D76_STATUS else 'PASS')
                except Exception as error:
                    if isinstance(error, TimeoutError) and not r.get('started') and self.report['phase'].startswith('gate:'):
                        r.update(status='NOT_RUN', reason='BATCH_BUDGET_EXHAUSTED')
                    else:
                        self.failure(r, error, folder)
                finally:
                    if r.get('dataset'):
                        try: self.cleanup_d87(folder, login, build)
                        except Exception as error:
                            # Retain the original model failure if cleanup also fails.
                            r['dataset_cleanup_error'] = str(error)
                            if r.get('status') != 'FAIL': self.failure(r, error, folder)
                self.save()
        except Exception as error:
            for r in self.report['runs']:
                if r['status'] == 'PENDING': self.failure(r, error, self.out)
        finally:
            self.report.update(finished=time.time(), phase='complete')
            self.save()


def main():
    os.umask(0o077)
    args = arguments()
    if args.command == '_worker': return Runner(args.directory.resolve()).run()
    if args.command == 'wait':
        end = time.monotonic() + args.timeout
        while True:
            report = read(args.directory / 'results.json')
            if report.get('finished'):
                print(summary(report), end='')
                return 0 if all(r['status'] in ['PASS', D76_STATUS] or (r['status'] == 'NOT_RUN' and r.get('reason') == 'PREPARE_ONLY' and r.get('preparation_only') is True) for r in report['runs']) else 1
            if time.monotonic() >= end:
                ready = sum(r['status'] in ['PASS', D76_STATUS, 'FAIL', 'UNKNOWN', 'NOT_RUN'] for r in report['runs'])
                current = next((r['scenario'] for r in report['runs'] if r['status'] == 'PENDING'), report['phase'])
                print(f"{ready}/{len(report['runs'])} готово, идёт {current}")
                return 2
            time.sleep(min(1, max(0, end - time.monotonic())))
    head = git('rev-parse', '--verify', args.head + '^{commit}')
    names = scenario_names(args.scenarios, args.case_root)
    assert 'types300' not in names or args.cold, 'TYPES300_COLD_REQUIRED'
    for name in names:
        spec = scenario(name, args.case_root, cases=args.cases)
        if spec.get('generated'): continue
        assert spec['prompt'].is_file(), 'Scenario prompt missing'
        assert args.case_root or spec.get('oracle', spec['source'] / 'oracle.py').is_file(), 'Scenario oracle missing'
        expected_for(spec, '/preflight/package.lgp')
    pair = args.pair.expanduser().resolve()
    for role in ['worker', 'reviewer']:
        pair_login(read(pair / (role + '.json')), role + '.json')
    build = args.build.expanduser().resolve() if args.build else None
    if build:
        meta = read(build / 'cli-manifest.json')['metadata']
        assert meta['sourceCommit'] == head and meta['sourceDirty'] is False, 'Build SHA/cleanliness mismatch'
    # Chromium also puts its Unix singleton socket under TMPDIR. Keep the
    # default short enough even when the checkout is in a deep task directory.
    out = (args.out or Path.home() / '.cache/loginom-runs' / str(time.time_ns())).expanduser().resolve()
    if not args.case_root and any(name in D87 for name in names) and (out == REPO or REPO in out.parents):
        raise ValueError('D87 result directory and generated data must be outside Git checkout')
    out.mkdir(parents=True)
    temporary = out / 'tmp'
    temporary.mkdir()
    # Detached workers outlive the task that owns the inherited temp directory.
    # Set this before spawning so direct children (including oracles) inherit it.
    env = {k: v for k, v in os.environ.items() if not k.startswith('CODEX_')}
    env.update(TMPDIR=str(temporary), TMP=str(temporary), TEMP=str(temporary))
    request = vars(args) | {'pair': str(pair), 'build': str(build) if build else None, 'out': str(out),
                            'cases': str(args.cases.expanduser().resolve()) if args.cases else None,
                            'case_root': str(args.case_root.expanduser().resolve()) if args.case_root else None}
    write(out / 'request.json', request)
    write(out / 'results.json', {'head': head, 'tree': git('rev-parse', head + '^{tree}'), 'started': time.time(), 'phase': 'build', 'runs': [{'scenario': n, 'status': 'PENDING'} for n in names]})
    with (out / 'worker.log').open('wb') as log:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '_worker', str(out)], env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    write(out / 'worker.json', {'pid': child.pid})
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
