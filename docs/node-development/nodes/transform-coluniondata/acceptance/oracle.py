#!/usr/bin/env python3
"""Proposed positional contract; Python stdlib, no Loginom/runtime imports.

--write freezes all expectations before stage-1 runs; --check detects drift.
Only task.md and selected fixture CSVs may reach the product model.
"""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent / "fixtures"
MAIN = [("RowID", "integer"), ("Code", "string"), ("Amount", "real"),
        ("Flag", "boolean"), ("Day", "datetime")]
ATTACHED = [("BRowID", "integer"), ("Code", "string"), ("Rate", "real")]
SIZES = {"minimum": "Минимум", "maximum": "Максимум",
         "main": "Главная", "attached": "Присоединённая"}
PADDINGS = {"null": "пропуски", "repeat": "повтор набора", "last": "последняя запись"}


def read(name, fields):
    with (FIXTURES / name).open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        assert reader.fieldnames == [name for name, _ in fields]
        rows = []
        for raw in reader:
            row = {}
            for field, kind in fields:
                value = raw[field]
                if value == "?":
                    value = None
                elif kind == "integer":
                    value = int(value)
                elif kind == "real":
                    value = float(value)
                elif kind == "boolean":
                    assert value in ("true", "false")
                    value = value == "true"
                elif kind == "datetime":
                    value += ".000"
                row[field] = value
            rows.append(row)
        return rows


def positional(main, attached, size, fill):
    lengths = [len(main), len(attached)]
    count = {"minimum": min(lengths), "maximum": max(lengths),
             "main": lengths[0], "attached": lengths[1]}[size]

    def at(rows, index, fields):
        if index < len(rows):
            return rows[index]
        if not rows or fill == "null":
            return {name: None for name, _ in fields}
        return rows[index % len(rows)] if fill == "repeat" else rows[-1]

    return [{**at(main, i, MAIN),
             **{("AttachedCode" if name == "Code" else name): value
                for name, value in at(attached, i, ATTACHED).items()}}
            for i in range(count)]


def output(rows, label):
    fields = MAIN + [("AttachedCode" if n == "Code" else n, t) for n, t in ATTACHED]
    columns = [{"name": name, "type": kind, "label_any": True,
                **({"tolerance": {"abs": 0, "rel": 0}} if kind == "real" else {})}
               for name, kind in fields]
    return {"output_node_type": "transform.col_union_data", "output_node_label": label,
            "output_port": 0, "ordered": True, "column_order": "exact",
            "columns": columns, "rows": rows}


def expected(outputs):
    return {"package_path": "{{PACKAGE_PATH}}", "null_marker": "?",
            "nodes": [{"type": "transform.col_union_data"}], "outputs": outputs}


def documents():
    main = read("main.csv", MAIN)
    attached = read("attached.csv", ATTACHED)
    pairs = {"regular": (main, attached), "reverse": (main, read("attached-long.csv", ATTACHED)),
             "empty-main": (read("empty-main.csv", MAIN), attached),
             "empty-attached": (main, read("empty-attached.csv", ATTACHED)),
             "both-empty": (read("empty-main.csv", MAIN), read("empty-attached.csv", ATTACHED))}
    # Final same-node state; intermediate CSV has a separate expectation because
    # cold reexecution can observe only the last saved state of that node.
    result = {"expected.json": expected([output(positional(main, attached, "maximum", "last"), "Соединение")]),
              "expected-repeat.json": expected([output(positional(main, attached, "maximum", "repeat"), "Соединение")])}
    for case, (left, right) in pairs.items():
        result["matrix/" + case + ".json"] = expected([
            output(positional(left, right, size, fill), SIZES[size] + ": " + PADDINGS[fill])
            for size in ("minimum", "maximum", "main", "attached")
            for fill in ("null", "repeat", "last")])
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name, value in documents().items():
        text = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        destination = ROOT / name
        if args.write:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(text, encoding="utf-8")
        elif args.check:
            if destination.read_text(encoding="utf-8") != text:
                raise SystemExit("Stale expectation: " + name)
        elif name == "expected.json":
            print(text, end="")
    if args.check:
        print("OK: 62 proposed outputs, 8 columns each; independent positional oracle")
