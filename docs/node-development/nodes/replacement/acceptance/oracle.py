"""Independent byte-based exact replacement oracle; no runtime imports."""
import csv, hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def rows(name, types):
    source = ROOT / "data" / name
    manifest = json.loads((ROOT / "source-manifest.json").read_text())
    pin = next(p for p in manifest["files"] if p["path"] == "data/" + name)
    assert len(source.read_bytes()) == pin["bytes"]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == pin["sha256"]
    with source.open(newline="") as file:
        data = list(csv.DictReader(file, delimiter=";"))
    return [{k: None if v == "NULL" else int(v) if types[k] == "integer" else float(v) if types[k] == "real" else v for k, v in row.items()} for row in data]

def output(label, names, types, data):
    return {"output_node_type": "transform.replace_columns", "output_node_label": label,
            "columns": [{"name": n, "label": n.replace("_Replace", " Замена") if n.endswith("_Replace") else n.replace("_Replaced", " Заменен") if n.endswith("_Replaced") else n, "type": t} for n, t in zip(names, types)], "rows": data}

def expected():
    types = dict(Id="integer", Category="string", Code="integer", Amount="real", Keep="string")
    main = rows("input.csv", types)
    converted = []
    pairs = {"North": "N", None: "Missing", "": "Empty", "null": "Literal"}
    for row in main:
        result = dict(row)
        result.update(Category_Replace=pairs.get(row["Category"]), Category_Replaced=True,
                      Code_Replace="9223372036854775807" if row["Code"] == 1 else row["Code"], Code_Replaced=row["Code"] == 1,
                      Amount_Replace=9.125 if row["Amount"] == 1.25 else -5.25, Amount_Replaced=True)
        converted.append(result)
    names = ["Id", "Category", "Category_Replace", "Category_Replaced", "Code", "Code_Replace", "Code_Replaced", "Amount", "Amount_Replace", "Amount_Replaced", "Keep"]
    typed = output("Typed", names, ["integer", "string", "string", "boolean", "integer", "integer", "boolean", "real", "real", "boolean", "string"], converted)
    partial = rows("partial-input.csv", {n: "string" for n in ["A", "A_Replace", "B", "C"]})
    for row in partial:
        row.update(B_Replace="New" if row["B"] == "old" else row["B"], B_Replaced=row["B"] == "old", C_Replace="Stayed" if row["C"] == "stay" else row["C"], C_Replaced=row["C"] == "stay")
    names = ["A", "A_Replace", "B", "B_Replace", "B_Replaced", "C", "C_Replace", "C_Replaced"]
    preserved = output("Preserved", names, ["string", "string", "string", "string", "boolean", "string", "string", "boolean"], partial)
    # A_Replace is an original column and retains its original label.
    preserved["columns"][1]["label"] = "A_Replace"
    source_types = {"input.csv": types, "partial-input.csv": {n: "string" for n in ["A", "A_Replace", "B", "C"]}}
    return {"package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "imports.text", "label": "Main"}, {"type": "imports.text", "label": "Partial"}, {"type": "transform.replace_columns", "label": "Typed"}, {"type": "transform.replace_columns", "label": "Preserved"}], "outputs": [typed, preserved], "static_sources": [{"name": n, "bytes": (ROOT / "data" / n).stat().st_size, "sha256": hashlib.sha256((ROOT / "data" / n).read_bytes()).hexdigest(), "columns": [{"name": name, "type": kind} for name, kind in source_types[n].items()]} for n in ["input.csv", "partial-input.csv"]]}

if __name__ == "__main__":
    print(json.dumps(expected(), ensure_ascii=False, indent=2))
