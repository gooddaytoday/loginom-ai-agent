"""Freeze scalar expectations from source bytes, independently of the runtime."""
import argparse
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from row_filter_oracle import load_rows, partition


def condition(name, kind, operator, **values):
    return dict(field=dict(kind="input_field", name=name), type=kind, operator=operator, **values)


INITIAL = [[condition("Amount", "real", "not_null"), condition("Text", "string", "not_null"),
            condition("Text", "string", "<>", value="", case_sensitive=True)]]
FINAL = [[condition("Amount", "real", ">=", value=1.23456),
          condition("When", "datetime", "<=", value="2024-01-02T12:30:01"),
          condition("Flag", "boolean", "is_true")],
         [condition("Text", "string", "contains", value="Tail", case_sensitive=False)]]
COLUMNS = [dict(name=name, label=name, type=kind) for name, kind in
           [("Id", "integer"), ("Amount", "real"), ("Flag", "boolean"), ("When", "datetime"), ("Text", "string")]]


def serial(value):
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds")
    if isinstance(value, Decimal):
        return float(value)
    return value


def expected(package_path):
    rows = load_rows()
    ports = [[{key: serial(value) for key, value in row.items()} for row in port]
             for port in partition(rows, FINAL)]
    return dict(package_path=package_path,
                nodes=[dict(type="imports.text", label="Данные"), dict(type="transform.filter_data", label="Отбор")],
                output_node_type="transform.filter_data", columns=COLUMNS, rows=ports[0],
                final_groups=FINAL, full_ports=ports, initial_ports=[[{key: serial(value) for key, value in row.items()} for row in port]
                                               for port in partition(rows, INITIAL)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-path", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(expected(args.package_path), ensure_ascii=False, indent=2) + "\n")
