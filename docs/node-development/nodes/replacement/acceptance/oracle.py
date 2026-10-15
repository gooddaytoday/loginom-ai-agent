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
    for row in converted:
        row.update(Keep_Replace="AA" if row["Keep"] == "A" else row["Keep"], Keep_Replaced=row["Keep"] == "A")
    typed["columns"].extend([
        {"name": "Keep_Replace", "label": "Keep Замена", "type": "string"},
        {"name": "Keep_Replaced", "label": "Keep Заменен", "type": "boolean"},
    ])
    return {"package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "transform.replace_columns", "label": "Typed"}], "outputs": [typed]}

if __name__ == "__main__":
    print(json.dumps(expected(), ensure_ascii=False, indent=2))
