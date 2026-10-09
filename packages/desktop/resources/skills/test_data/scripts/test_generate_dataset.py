#!/usr/bin/env python3
"""Проверки генератора тестовых данных без сети.

Запуск: python3 packages/desktop/resources/skills/test_data/scripts/test_generate_dataset.py
"""

from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
from io import StringIO
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_dataset import main


ORDERS = {
    "name": "orders",
    "rows": 1000,
    "seed": 42,
    "csv": {"delimiter": ";", "decimal_separator": ".", "null_marker": ""},
    "columns": [
        {"name": "order_id", "label": "ID заказа", "type": "integer", "generator": {"kind": "sequence", "start": 100001}},
        {"name": "order_date", "label": "Дата", "type": "datetime", "generator": {"kind": "date_range", "from": "2026-01-01", "to": "2026-09-30"}},
        {"name": "amount", "label": "Сумма", "type": "real", "generator": {"kind": "number", "min": 100, "max": 50000, "distribution": "lognormal", "decimals": 2}},
        {"name": "status", "label": "Статус", "type": "string", "generator": {"kind": "choice", "values": ["Новый", "Оплачен", "Отправлен", "Доставлен", "Отменён"], "weights": [10, 25, 20, 40, 5]}},
    ],
    "anomalies": [
        {"column": "amount", "kind": "negative", "share": 0.05},
        {"column": "status", "kind": "null", "share": 0.02},
    ],
    "overlap": "disjoint",
}


def run_spec(spec: dict, output_dir: Path, overwrite: bool = False):
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "spec.json"
    path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    stdout, stderr = StringIO(), StringIO()
    argv = [str(path), "--output-dir", str(output_dir)]
    if overwrite:
        argv.append("--overwrite")
    with redirect_stdout(stdout), redirect_stderr(stderr):
        code = main(argv)
    return code, stdout.getvalue(), stderr.getvalue()


def read_table(path: Path):
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle, delimiter=";"))
    return rows[0], rows[1:]


class GenerateDatasetTest(unittest.TestCase):
    def test_orders_example_has_exact_anomaly_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code, stdout, stderr = run_spec(ORDERS, root)
            self.assertEqual(code, 0, stderr)
            summary = json.loads(stdout)
            self.assertEqual(summary["rows"], 1000)
            self.assertEqual(summary["seed"], 42)
            self.assertEqual(summary["anomalies"][0]["actual"], 50)
            self.assertEqual(summary["anomalies"][1]["actual"], 20)
            header, rows = read_table(Path(summary["csv"]))
            self.assertEqual(header, ["order_id", "order_date", "amount", "status"])
            self.assertEqual(len(rows), 1000)
            negatives = [row for row in rows if row[2].startswith("-")]
            empty_status = [row for row in rows if row[3] == ""]
            self.assertEqual(len(negatives), 50)
            self.assertEqual(len(empty_status), 20)
            manifest = json.loads(Path(summary["manifest"]).read_text(encoding="utf-8"))
            amount_rows = set(manifest["anomalies"][0]["rows"])
            status_rows = set(manifest["anomalies"][1]["rows"])
            self.assertEqual(len(amount_rows), 50)
            self.assertTrue(amount_rows.isdisjoint(status_rows))
            names = [column["name"] for column in manifest["loginom_import"]["columns"]]
            self.assertEqual(names, header)

    def test_same_seed_is_byte_identical_and_other_seed_differs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "a"
            second = root / "b"
            third = root / "c"
            self.assertEqual(run_spec(ORDERS, first)[0], 0)
            self.assertEqual(run_spec(ORDERS, second)[0], 0)
            changed = dict(ORDERS)
            changed["seed"] = 43
            self.assertEqual(run_spec(changed, third)[0], 0)
            self.assertEqual((first / "orders.csv").read_bytes(), (second / "orders.csv").read_bytes())
            self.assertNotEqual((first / "orders.csv").read_bytes(), (third / "orders.csv").read_bytes())

    def test_spec_errors_exit_2_without_a_file(self):
        cases = [
            {**ORDERS, "columns": [{**ORDERS["columns"][3], "name": "сумма"}], "anomalies": []},
            {**ORDERS, "rows": 1_000_001, "anomalies": []},
            {**ORDERS, "anomalies": [{"column": "status", "kind": "negative", "count": 1}]},
            {**ORDERS, "rows": 10, "anomalies": [{"column": "amount", "kind": "negative", "share": 0.6}, {"column": "status", "kind": "null", "share": 0.6}]},
            {**ORDERS, "anomalies": [{"column": "status", "kind": "empty", "count": 1}]},
        ]
        for spec in cases:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                code, _stdout, stderr = run_spec(spec, root)
                self.assertEqual(code, 2, stderr)
                self.assertTrue(stderr.strip())
                self.assertEqual(list(root.glob("*.csv")), [])

    def test_overwrite_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code, _stdout, stderr = run_spec(ORDERS, root)
            self.assertEqual(code, 0, stderr)
            original = (root / "orders.csv").read_bytes()
            code, _stdout, stderr = run_spec(ORDERS, root)
            self.assertEqual(code, 2, stderr)
            self.assertIn("overwrite", stderr)
            self.assertEqual((root / "orders.csv").read_bytes(), original)

    def test_date_offset_is_not_earlier_than_base(self):
        spec = {
            "name": "dates",
            "rows": 30,
            "seed": 1,
            "columns": [
                {"name": "order_date", "label": "Дата заказа", "type": "datetime", "generator": {"kind": "date_range", "from": "2026-01-01", "to": "2026-06-01"}},
                {"name": "ship_date", "label": "Дата отгрузки", "type": "datetime", "generator": {"kind": "date_offset", "base": "order_date", "min_days": 0, "max_days": 14}},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            code, stdout, stderr = run_spec(spec, Path(directory))
            self.assertEqual(code, 0, stderr)
            _header, rows = read_table(Path(json.loads(stdout)["csv"]))
            for row in rows:
                order = datetime.strptime(row[0], "%Y-%m-%d")
                ship = datetime.strptime(row[1], "%Y-%m-%d")
                self.assertGreaterEqual(ship, order)

    def test_boundary_values_are_exact_endpoints(self):
        spec = {
            "name": "bounds",
            "rows": 20,
            "seed": 3,
            "columns": [
                {"name": "qty", "label": "Количество", "type": "integer", "generator": {"kind": "number", "min": 10, "max": 20}},
            ],
            "anomalies": [{"column": "qty", "kind": "boundary", "count": 6}],
        }
        with tempfile.TemporaryDirectory() as directory:
            code, stdout, stderr = run_spec(spec, Path(directory))
            self.assertEqual(code, 0, stderr)
            summary = json.loads(stdout)
            manifest = json.loads(Path(summary["manifest"]).read_text(encoding="utf-8"))
            _header, rows = read_table(Path(summary["csv"]))
            picked = [rows[index - 1][0] for index in manifest["anomalies"][0]["rows"]]
            self.assertEqual(picked.count("10") + picked.count("20"), 6)
            self.assertTrue(set(picked) <= {"10", "20"})
            outside = [row[0] for index, row in enumerate(rows, start=1) if index not in manifest["anomalies"][0]["rows"]]
            self.assertTrue(set(outside).isdisjoint({"10", "20"}))

    def test_every_anomaly_kind_matches_reread_counts(self):
        spec = {
            "name": "edges",
            "rows": 40,
            "seed": 7,
            "csv": {"null_marker": "NULL"},
            "columns": [
                {"name": "id", "label": "ID", "type": "integer", "generator": {"kind": "sequence", "start": 1}},
                {"name": "qty", "label": "Количество", "type": "integer", "generator": {"kind": "number", "min": 10, "max": 100}},
                {"name": "price", "label": "Цена", "type": "real", "generator": {"kind": "number", "min": 5, "max": 50, "decimals": 2}},
                {"name": "status", "label": "Статус", "type": "string", "generator": {"kind": "choice", "values": ["Новый", "Оплачен", "Отменён"]}},
                {"name": "sku", "label": "Артикул", "type": "string", "generator": {"kind": "pattern", "template": "SKU-#####"}},
                {"name": "order_date", "label": "Дата", "type": "datetime", "generator": {"kind": "date_range", "from": "2026-01-01", "to": "2026-06-01"}},
                {"name": "ship_date", "label": "Отгрузка", "type": "datetime", "generator": {"kind": "date_offset", "base": "order_date", "min_days": 1, "max_days": 10}},
                {"name": "flag", "label": "Флаг", "type": "boolean", "generator": {"kind": "boolean"}},
                {"name": "token", "label": "Токен", "type": "string", "generator": {"kind": "uuid"}},
            ],
            "anomalies": [
                {"column": "sku", "kind": "null", "count": 1},
                {"column": "token", "kind": "empty", "count": 1},
                {"column": "price", "kind": "negative", "count": 1},
                {"column": "qty", "kind": "zero", "count": 1},
                {"column": "price", "kind": "outlier", "count": 1},
                {"column": "qty", "kind": "out_of_range", "count": 1},
                {"column": "qty", "kind": "boundary", "count": 2},
                {"column": "order_date", "kind": "future_date", "count": 1},
                {"column": "order_date", "kind": "bad_format", "count": 1},
                {"column": "status", "kind": "unknown_category", "count": 1},
                {"column": "status", "kind": "whitespace", "count": 1},
                {"column": "status", "kind": "case_variant", "count": 1},
                {"column": "sku", "kind": "long_text", "count": 1},
                {"column": "id", "kind": "duplicate_key", "count": 1},
                {"kind": "duplicate_row", "count": 1},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            code, stdout, stderr = run_spec(spec, Path(directory))
            self.assertEqual(code, 0, stderr)
            summary = json.loads(stdout)
            self.assertTrue(all(item["requested"] == item["actual"] for item in summary["anomalies"]))
            manifest = json.loads(Path(summary["manifest"]).read_text(encoding="utf-8"))
            self.assertEqual(manifest["loginom_import"]["format"]["null_marker"], "NULL")
            self.assertEqual(manifest["clean_rows"], 40 - 16)


if __name__ == "__main__":
    unittest.main()
