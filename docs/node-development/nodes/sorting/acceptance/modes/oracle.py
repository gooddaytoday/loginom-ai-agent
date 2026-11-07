"""Independent proposal for the declared small collation/type domain.

No system locale, Loginom comparator, handler or recorded result is imported.
This fixture's Russian letters precede Latin; case-sensitive locale uses lower
before upper. These explicit weights are not a general Unicode implementation.
"""
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent.parent / "fixtures"


def expected():
    with (FIXTURES / "modes.csv").open(encoding="utf-8", newline="") as stream:
        rows = [{"RowID": int(r["RowID"]), "Word": None if r["Word"] == "\\N" else r["Word"],
                 "Amount": int(r["Amount"])} for r in csv.DictReader(stream, delimiter=";")]
    assert len(rows) == len({r["RowID"] for r in rows}) == 10
    def word_key(row, locale, case):
        value = row["Word"]
        if value is None:
            return (0, "", 0, row["RowID"])
        if value == "":
            return (1, "", 0, row["RowID"])
        if locale:
            alphabet = {"а": "0", "б": "1", "я": "2", "a": "3"}
            return (2, alphabet[value.lower()], int(value.isupper()) if case else 0, row["RowID"])
        folded = value.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")) if not case else value
        return (2, folded, 0, row["RowID"])
    columns = [{"name": name, "type": kind, "label_any": True}
               for name, kind in [("RowID", "integer"), ("Word", "string"), ("Amount", "integer")]]
    def output(locale=True, case=False):
        return {"output_node_type": "transform.sorting", "output_port": 0, "ordered": True,
                "columns": columns, "rows": sorted(rows, key=lambda r: word_key(r, locale, case))}
    cases = {
        "cache": {"stages": [output(), output()], "settings": [{"cache_all": False}, {"cache_all": True}]},
        "threads": {"stages": [output(), output()], "settings": [{"max_threads": 1}, {"max_threads": 2}]},
        "auto": {"stages": [output(), output()], "settings": [{"max_threads": 2}, {"max_threads": 0}]},
        "locale": {"stages": [output(False), output(True)], "settings": [{"compare_with_locale": False}, {"compare_with_locale": True}]},
        "case": {"stages": [output(case=True), output(case=False)], "settings": [{"case_sensitive": True}, {"case_sensitive": False}]},
    }
    # Supported scalar import + Collapse produces the proposed typed source.
    # All three NULL cells remain separate rows (ignore_empty=false).
    variant_rows = []
    with (FIXTURES / "variant-wide.csv").open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter=";"):
            for name, kind in [("IntValue", "integer"), ("RealValue", "real"), ("TextValue", "string")]:
                raw = row[name]
                value = None if raw == "\\N" else int(raw) if kind == "integer" else float(raw) if kind == "real" else raw
                variant_rows.append({"RowID": int(row["RowID"]), "Names": name,
                                     "Values": None if value is None else {"cell_type": kind, "value": value}})
    def variant_key(row):
        cell = row["Values"]
        if cell is None:
            return (0, 0, row["RowID"], row["Names"])
        return (2 if cell["cell_type"] == "string" else 1, cell["value"], row["RowID"], row["Names"])
    typed_columns = [{"name": name, "type": kind, "label_any": True}
                     for name, kind in [("RowID", "integer"), ("Names", "string"), ("Values", "variant")]]
    typed_output = {"output_node_type": "transform.sorting", "output_port": 0, "ordered": True,
                    "columns": typed_columns, "rows": sorted(variant_rows, key=variant_key)}
    cases["variant"] = {"stages": [typed_output], "settings": [{"compare_with_locale": False}],
                        "source": "../../fixtures/variant-wide.csv",
                        "source_preparation": "scalar import -> Collapse(RowID information, IntValue/RealValue/TextValue transposed, ignore_empty=false); retain RowID, Names, Values via output mapping"}
    for name, case in cases.items():
        case["task"] = "task-" + name + ".md"
    assert [r["RowID"] for r in output(False)["rows"]] == [9, 10, 7, 8, 6, 2, 4, 3, 5, 1]
    assert [r["RowID"] for r in output()["rows"]] == [9, 10, 3, 6, 2, 5, 1, 4, 7, 8]
    assert len(typed_output["rows"]) == 9
    assert sum(r["Values"] is None for r in typed_output["rows"]) == 3
    return {"status": "proposal_requires_owner_approval_not_stock_expected", "package_path": "{{PACKAGE_PATH}}",
            "collation_scope": "declared Russian fixture alphabet only; actual locale identifier must be observed before acceptance",
            "source": "../../fixtures/modes.csv", "cases": cases}


if __name__ == "__main__":
    result = expected()
    if "--check" in sys.argv:
        assert result == json.loads((ROOT / "expected.json").read_text(encoding="utf-8"))
        print("sorting proposal: independent expected matches")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
