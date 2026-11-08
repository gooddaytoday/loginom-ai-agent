"""Independent stage-0 expectations; only fixture bytes and Python stdlib."""
import argparse
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parents[1] / "fixtures" / "extended"


def external_rules(name):
    """A replacement dictionary requires unique typed keys; it is not a join."""
    result = {}
    with (FIXTURES / name).open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter=";"):
            key = None if row["Value"] == "?" else row["Value"]
            if key in result:
                raise ValueError("Duplicate external replacement key")
            result[key] = tuple(None if row[name] == "?" else row[name]
                                for name in ("Replacement", "Info"))
    return result


def expected(case):
    with (FIXTURES / "input.csv").open(encoding="utf-8", newline="") as stream:
        source = [{key: None if value == "?" else int(value) if key == "Id" else value
                   for key, value in row.items()} for row in csv.DictReader(stream, delimiter=";")]
    rows = []
    field = "Status" if case in ("boolean", "result-keep") else "Code"
    kind = {"boolean": "boolean", "result-keep": "variant", "regex-type": "integer",
            "mixed": "string", "groups": "string", "external": "string", "rules-file": "string"}[case]
    dictionary = {"yes": True, "no": False} if case == "boolean" else {"yes": True}
    external = external_rules("rules-unique.csv") if case == "external" else {}
    for row in source:
        old = row[field]
        information = None
        if case == "boolean":
            value, replaced = dictionary.get(old), True
        elif case == "result-keep":
            value, replaced = dictionary.get(old, old), old in dictionary
            if value is not None:
                value = dict(cell_type="boolean" if replaced else "string", value=value)
        elif case == "regex-type":
            value = 9 if old is not None and re.search(r"AB-([0-9]{2})", old) else None
            replaced = True  # Remaining NULL applies even to an original NULL.
        elif case == "mixed":
            # Exact group wins before regex, even if a regex would also match.
            match = old is not None and re.search(r"AB-([0-9]{2})", old)
            value = "EXACT-FIRST" if old == "AB-12" else "REGEX" if match else old
            replaced = old == "AB-12" or bool(match)
        elif case == "groups":
            # Literal prefix/suffix outside an unanchored match are retained.
            value, count = re.subn(r"AB-([0-9]{2})", r"SKU-\1", old) if old is not None else (None, 0)
            replaced = count > 0
        elif case == "external":
            value, replaced = old, old in external
            if replaced:
                value, information = external[old]
        else:
            with (FIXTURES / "rules.tsv").open(encoding="utf-8", newline="") as stream:
                pairs = list(csv.reader(stream, delimiter="\t"))
            value, replaced = old, False
            for pair in pairs:
                key, replacement = pair[:2]
                if old == (None if key == "?" else key):
                    value, replaced = None if replacement == "?" else replacement, True
                    break
        result = dict(row)
        result[field] = value
        result[field + "_Replaced"] = replaced
        if case == "external":
            result["CodeInfo"] = information
        rows.append(result)
    fields = [("Id", "integer"), ("Code", "string"), ("Status", "string"), ("Keep", "string")]
    at = next(i for i, (name, _) in enumerate(fields) if name == field)
    fields[at:at + 1] = [(field, kind), (field + "_Replaced", "boolean")]
    if case == "external":
        fields.insert(at + 2, ("CodeInfo", "string"))
    columns = [dict(name=name, type=type_, label_any=True) for name, type_ in fields]
    assert len(rows) == 8 and len({r["Id"] for r in rows}) == 8
    if case == "boolean":
        assert rows[1]["Status"] is False and rows[2]["Status"] is None
    if case == "result-keep":
        assert rows[0]["Status"]["cell_type"] == "boolean" and rows[1]["Status"]["cell_type"] == "string"
    if case == "external":
        assert len(fields) == 6 and sum(row["Code_Replaced"] for row in rows) == 3
        assert rows[1]["CodeInfo"] is None and rows[4]["Code"] == ""
        assert rows[5]["Code"] == "MISSING" and rows[5]["CodeInfo"] == "null-key"
    return dict(package_path="{{PACKAGE_PATH}}", null_marker="?",
                nodes=[dict(type="imports.text"), dict(type="transform.replace_columns")],
                outputs=[dict(output_node_type="transform.replace_columns", output_port=0,
                              ordered=False, column_order="exact", columns=columns, rows=rows)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        external_rules("rules.csv")
    except ValueError as error:
        assert str(error) == "Duplicate external replacement key"
    else:
        raise AssertionError("Duplicate fixture must not produce a successful output")
    for case in ["boolean", "result-keep", "regex-type", "mixed", "groups", "external", "rules-file"]:
        value = expected(case)
        path = ROOT / ("expected.json" if case == "boolean" else "expected-" + case + ".json")
        if args.write:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            assert json.loads(path.read_text(encoding="utf-8")) == value, case
    print("PASS: seven independent replacement proposals, typed schema, NULL and flags")
