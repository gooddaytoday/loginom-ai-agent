import copy
from contextlib import redirect_stdout
import csv
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('run_check', Path(__file__).resolve().parents[1] / 'run-check.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunCheckTests(unittest.TestCase):
    def test_regex_catalog_keeps_oracles_out_of_model_inputs(self):
        for name, expected, width in [('regex-add', 'expected.json', 5), ('regex-replace', 'expected-replace.json', 4)]:
            case = runner.scenario(name)
            self.assertEqual(case['expected_name'], expected)
            self.assertTrue(case['prompt'].is_file())
            self.assertEqual([p.name for p in case['data'].glob('*.csv')], ['input.csv'])
            result = runner.expected_for(case, '/test/regex.lgp')
            self.assertEqual(result['package_path'], '/test/regex.lgp')
            self.assertEqual(len(result['outputs'][0]['columns']), width)
            self.assertEqual(len(result['outputs'][0]['rows']), 8)
            self.assertIn('transform.replace_columns', [n['type'] for n in result['nodes']])

    def test_join_modes_resolve_approved_tasks_inputs_and_cold_expectations(self):
        for mode, columns, rows in [('right', 6, 7), ('full', 6, 9), ('difference', 3, 2)]:
            with self.subTest(mode=mode):
                case = runner.scenario('join-' + mode)
                self.assertIsNone(case['base'])
                self.assertEqual(case['prompt'].resolve(), (runner.REPO / 'docs/node-development/nodes/join/acceptance' / ('task-' + mode + '.md')).resolve())
                self.assertEqual(sorted(p.name for p in case['data'].iterdir()), ['left.csv', 'manifest.json', 'right.csv'])
                expected = runner.expected_for(case, '/test/join.lgp')
                self.assertEqual(expected['package_path'], '/test/join.lgp')
                self.assertEqual(expected['null_marker'], 'NULL')
                output = expected['outputs'][0]
                self.assertEqual(len(output['columns']), columns)
                self.assertEqual(len(output['rows']), rows)
                self.assertEqual(output['export_destination'], '/' + mode + '-result.csv')
