"""Independent calculator expectations computed only from the original CSV."""
import csv, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def expected():
    columns = [("Id","Id","integer"),("Qty","Количество","integer"),("Revenue","Сумма","real"),("Adjusted","Сумма","real"),("UnitPrice","UnitPrice","real"),("Note","Комментарий","string"),("Moment","Дата","datetime"),("Comment","Comment","string")]
    rows = []
    with (ROOT / "data/sales.csv").open(encoding="utf-8", newline="") as stream:
        for source in csv.DictReader(stream, delimiter=";"):
            qty, price = int(source["Quantity"]), float(source["UnitPrice"])
            revenue = qty * price
            comment = None if source["Comment"] == "\\N" else source["Comment"]
            rows.append(dict(zip([c[0] for c in columns], [int(source["Id"]), qty, revenue, revenue + 0.0001, price * 2, "missing" if comment is None else comment + "!", "2024-02-29T00:00:00.000", comment])))
    assert len(rows) == 6
    return {"package_path":"{{PACKAGE_PATH}}", "nodes":[{"type":"imports.text"},{"type":"transform.calculator"}], "output_node_type":"transform.calculator", "columns":[dict(name=n,label=l,type=t) for n,l,t in columns], "rows": rows}

if __name__ == "__main__":
    (ROOT / "expected.json").write_text(json.dumps(expected(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
