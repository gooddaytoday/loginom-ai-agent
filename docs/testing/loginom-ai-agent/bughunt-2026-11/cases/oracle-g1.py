"""Compute the G1 graph and table contracts from the attached fixtures."""

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree
from zipfile import ZipFile


CASES = Path(__file__).resolve().parent
NS = {
    "sheet": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "lookup": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

IMPORT = "imports.text"
EXCEL = "imports.excel"
GROUP = "transform.group_data"
SORT = "transform.sorting"
EXCEL_OUT = "exports.excel"
JOIN = "transform.join_data"
CALC = "transform.calculator"
FILTER = "transform.filter_data"
VARIABLE = "variables.user"
JS = "programming.javascript"
PYTHON = "programming.python"
CSV_OUT = "exports.text"

SALES = {"Регион": "string", "Дата": "datetime", "Выручка": "real", "Канал": "string"}
CLIENTS = {"client_id": "integer", "Клиент": "string", "Город": "string"}
ORDERS = {
    "order_id": "integer",
    "client_id": "integer",
    "Дата заказа": "datetime",
    "Выручка": "real",
    "Себестоимость": "real",
}
PAYMENTS = {"Запись": "string", "Дата": "datetime", "amount": "real", "Тип платежа": "string"}
THRESHOLD_ORDERS = {"Заказ": "integer", "Дата": "datetime", "Сумма": "real", "Канал": "string"}
JS_EVENTS = {"Событие": "string", "Дата": "datetime", "Канал": "string"}
PY_EVENTS = {"Дата": "datetime", "Выручка": "real", "Примечание": "string"}
WEEKDAYS = ("Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье")


def source(case, filename):
    return CASES / f"bh-g{case}" / "data" / filename


def csv_rows(case, filename, schema):
    parsers = {
        "integer": int,
        "real": lambda value: Decimal(value.replace(",", ".")),
        "datetime": lambda value: datetime.strptime(value, "%d.%m.%Y"),
        "string": str,
    }
    with source(case, filename).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, delimiter=";")
        assert reader.fieldnames == list(schema), f"Unexpected header in {filename}"
        return [
            {name: parsers[kind](row[name]) if row[name] else None for name, kind in schema.items()}
            for row in reader
        ]


def workbook_rows(path, sheet_name=None):
    with ZipFile(path) as book:
        def xml(part):
            return ElementTree.fromstring(book.read(part))

        sheets = xml("xl/workbook.xml").findall("sheet:sheets/sheet:sheet", NS)
        sheet = sheets[0] if sheet_name is None else next(s for s in sheets if s.get("name") == sheet_name)
        rel_id = sheet.get(f"{{{NS['lookup']}}}id")
        target = next(
            rel.get("Target")
            for rel in xml("xl/_rels/workbook.xml.rels").findall("rel:Relationship", NS)
            if rel.get("Id") == rel_id
        )
        worksheet = target.lstrip("/") if target.startswith("/") else str(PurePosixPath("xl", target))
        shared = []
        if "xl/sharedStrings.xml" in book.namelist():
            shared = [
                "".join(text.text or "" for text in item.iterfind(".//sheet:t", NS))
                for item in xml("xl/sharedStrings.xml").findall("sheet:si", NS)
            ]
        for row in xml(worksheet).findall("sheet:sheetData/sheet:row", NS):
            cells = {}
            for cell in row.findall("sheet:c", NS):
                address = cell.get("r").rstrip("0123456789")
                value = cell.findtext("sheet:v", namespaces=NS)
                kind = cell.get("t", "n")
                if kind == "s":
                    value = shared[int(value)]
                elif kind == "inlineStr":
                    value = "".join(text.text or "" for text in cell.iterfind(".//sheet:t", NS))
                elif kind == "n" and value is not None:
                    value = Decimal(value)
                cells[address] = value
            if any(value is not None for value in cells.values()):
                yield cells


def json_value(value):
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds")
    if isinstance(value, Decimal):
        return float(value)
    return value


def table(node, schema, rows, *, ordered=False):
    columns = []
    for label, kind in schema.items():
        column = {"name": label, "label": label, "type": kind}
        if not label.isascii():
            column["name_any"] = True
        if kind == "real":
            column["tolerance"] = {"abs": 1e-9}
        columns.append(column)
    return {
        "output_node_type": node,
        "output_port": 0,
        "ordered": ordered,
        "columns": columns,
        "rows": [{name: json_value(row[name]) for name in schema} for row in rows],
    }


def link(source_node, target_node, *, input_port=None, output_port=None, kind=None):
    edge = {"source": {"type": source_node}, "target": {"type": target_node}}
    if input_port is not None:
        edge["input"] = input_port
    if output_port is not None:
        edge["output"] = output_port
    if kind is not None:
        edge["kind"] = kind
    return edge


def contract(nodes, links, *tables, **checks):
    return {
        "nodes": [{"type": node} for node in nodes],
        "outputs": [],
        "graph": {"nodes": [{"type": node} for node in nodes], "links": links},
        **({"tables": list(tables)} if tables else {}),
        **checks,
    }


def sales(turn):
    rows = csv_rows("101-t1", "sales.csv", SALES)
    imported = table(IMPORT, SALES, rows, ordered=True)
    if turn == 1:
        return contract([IMPORT], [], imported)

    totals = defaultdict(Decimal)
    for row in rows:
        if row["Выручка"] is not None:
            totals[row["Регион"]] += row["Выручка"]
    aggregate_schema = {"Регион": "string", "Сумма выручки": "real"}
    totals_rows = [{"Регион": region, "Сумма выручки": total} for region, total in totals.items()]
    nodes = [IMPORT, GROUP]
    links = [link(IMPORT, GROUP)]
    if turn == 2:
        return contract(nodes, links, table(GROUP, aggregate_schema, totals_rows))

    totals_rows.sort(key=lambda row: row["Сумма выручки"], reverse=True)
    nodes.append(SORT)
    links.append(link(GROUP, SORT))
    sorted_sales = table(SORT, aggregate_schema, totals_rows, ordered=True)
    if turn == 3:
        return contract(nodes, links, sorted_sales)

    return contract(
        [*nodes, EXCEL_OUT], [*links, link(SORT, EXCEL_OUT)], sorted_sales,
        excel_file="sales-summary.xlsx",
    )


def client_orders(turn):
    rows = workbook_rows(source("102-t1", "clients.xlsx"), "Клиенты")
    header = next(rows)
    assert list(header.values()) == list(CLIENTS)
    clients = [
        {name: int(row[cell]) if name == "client_id" else row.get(cell) for cell, name in header.items()}
        for row in rows
    ]
    if turn == 1:
        return contract([EXCEL], [], table(EXCEL, CLIENTS, clients, ordered=True))

    orders = csv_rows("102-t2", "orders.csv", ORDERS)
    if turn == 2:
        return contract([EXCEL, IMPORT], [], table(IMPORT, ORDERS, orders, ordered=True))

    order_fields = {k: v for k, v in ORDERS.items() if k != "client_id"}
    by_client = defaultdict(list)
    for order in orders:
        by_client[order["client_id"]].append({name: order[name] for name in order_fields})
    joined = [
        {**client, **order}
        for client in clients
        for order in by_client.get(client["client_id"], [dict.fromkeys(order_fields)])
    ]
    nodes = [EXCEL, IMPORT, JOIN]
    links = [link(EXCEL, JOIN, input_port=0), link(IMPORT, JOIN, input_port=1)]
    joined_schema = {**CLIENTS, **order_fields}
    if turn == 3:
        return contract(nodes, links, table(JOIN, joined_schema, joined))

    for row in joined:
        revenue, cost = row["Выручка"], row["Себестоимость"]
        row["Маржа"] = revenue - cost if revenue is not None and cost is not None else None
    margins = table(CALC, {**joined_schema, "Маржа": "real"}, joined)
    return contract(
        [*nodes, CALC], [*links, link(JOIN, CALC)], margins,
        **({"preview": {"output_node_type": CALC, "limit": 10}} if turn == 5 else {}),
    )


def payments(turn):
    if turn == 1:
        return contract([FILTER], [])

    rows = csv_rows("103-t2", "data.csv", PAYMENTS)
    nodes = [FILTER, IMPORT]
    if turn == 2:
        return contract(nodes, [], table(IMPORT, PAYMENTS, rows, ordered=True))

    filtered = [row for row in rows if row["amount"] is not None and row["amount"] > 1000]
    links = [link(IMPORT, FILTER)]
    if turn == 3:
        return contract(nodes, links, table(FILTER, PAYMENTS, filtered, ordered=True))

    counts = Counter(row["Дата"].strftime("%Y-%m") for row in filtered)
    monthly = [{"Месяц": month, "Количество": count} for month, count in counts.items()]
    return contract(
        [*nodes, CALC, GROUP], [*links, link(FILTER, CALC), link(CALC, GROUP)],
        table(GROUP, {"Месяц": "string", "Количество": "integer"}, monthly),
    )


def threshold(turn):
    rows = csv_rows("104-t1", "orders.csv", THRESHOLD_ORDERS)
    if turn == 1:
        return contract([IMPORT], [], table(IMPORT, THRESHOLD_ORDERS, rows, ordered=True))

    limit = 800 if turn == 4 else 500
    nodes = [IMPORT, VARIABLE]
    variable = {"node": {"type": VARIABLE}, "label": "Порог", "type": "number", "value": limit}
    if turn == 2:
        return contract(nodes, [], variables=[variable])

    filtered = [row for row in rows if row["Сумма"] is not None and row["Сумма"] > limit]
    return contract(
        [*nodes, FILTER], [link(IMPORT, FILTER), link(VARIABLE, FILTER, output_port=4, input_port=0, kind="control")],
        table(FILTER, THRESHOLD_ORDERS, filtered, ordered=True), variables=[variable],
    )


def javascript(turn):
    rows = csv_rows("105-t1", "events.csv", JS_EVENTS)
    if turn == 1:
        return contract([IMPORT], [], table(IMPORT, JS_EVENTS, rows, ordered=True))

    nodes = [IMPORT, JS]
    if turn == 2:
        return contract(nodes, [])

    links = [link(IMPORT, JS)]
    for row in rows:
        row["День недели"] = WEEKDAYS[row["Дата"].weekday()]
    if turn == 3:
        return contract(nodes, links, table(JS, {**JS_EVENTS, "День недели": "string"}, rows, ordered=True))

    counts = Counter(row["День недели"] for row in rows)
    grouped = [{"День недели": weekday, "Количество": count} for weekday, count in counts.items()]
    return contract(
        [*nodes, GROUP], [*links, link(JS, GROUP)],
        table(GROUP, {"День недели": "string", "Количество": "integer"}, grouped),
    )


def python(turn):
    rows = csv_rows("106-t1", "events.csv", PY_EVENTS)
    if turn == 1:
        return contract([IMPORT], [], table(IMPORT, PY_EVENTS, rows, ordered=True))

    nodes = [IMPORT, PYTHON]
    if turn == 2:
        return contract(nodes, [])

    links = [link(IMPORT, PYTHON)]
    rows.sort(key=lambda row: row["Дата"])
    for index, row in enumerate(rows):
        row["Неделя года"] = row["Дата"].isocalendar().week
        row["Скользящее среднее"] = (
            sum(event["Выручка"] for event in rows[index - 2 : index + 1]) / 3 if index >= 2 else None
        )
    schema = {**PY_EVENTS, "Неделя года": "integer", "Скользящее среднее": "real"}
    result = table(PYTHON, schema, rows, ordered=True)
    if turn == 3:
        return contract(nodes, links, result)

    saved = contract([*nodes, CSV_OUT], [*links, link(PYTHON, CSV_OUT)])
    saved["outputs"] = [{
        **result, "output_node_type": "export_input", "export_destination": "weekly-revenue.csv",
    }]
    saved["outputs"][0].pop("output_port")
    return saved


CHAINS = {
    "101": sales, "102": client_orders, "103": payments,
    "104": threshold, "105": javascript, "106": python,
}


def verify_excel(path):
    expected = sales(4)["tables"][0]
    rows = workbook_rows(path)
    headers = next(rows)
    assert set(headers.values()) == {c["label"] for c in expected["columns"]}, "Unexpected Excel header"
    actual = [{name: json_value(row.get(cell)) for cell, name in headers.items()} for row in rows]
    assert len(actual) == len(expected["rows"]), "Unexpected Excel row count"
    for got, want in zip(actual, expected["rows"]):
        assert got["Регион"] == want["Регион"], "Unexpected Excel region or row order"
        assert isinstance(got["Сумма выручки"], float), "Expected an Excel number"
        assert abs(got["Сумма выручки"] - want["Сумма выручки"]) <= 1e-9, "Unexpected Excel total"


def main(case=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--xlsx", type=Path, help="Verify the exported workbook for bh-g101-t4.")
    args = parser.parse_args()

    if args.xlsx:
        if case is not None and case.name != "bh-g101-t4":
            parser.error("--xlsx is for bh-g101-t4")
        verify_excel(args.xlsx)
        print("PASS: Excel headers, numeric totals and descending row order")
        return

    if case is None and not (args.check or args.write):
        parser.error("Choose --check or --write for all G1 cases")
    cases = [case] if case is not None else sorted(CASES.glob("bh-g1??-t?"))
    for directory in cases:
        chain, turn = directory.name.removeprefix("bh-g").split("-t")
        expected = CHAINS[chain](int(turn))
        target = directory / "expected.json"
        if args.check:
            assert json.loads(target.read_text(encoding="utf8")) == expected, f"Oracle mismatch: {directory.name}"
        else:
            rendered = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
            if args.write:
                target.write_text(rendered, encoding="utf8")
            else:
                print(rendered, end="")
    if args.check:
        print(f"PASS: {len(cases)} G1 expectations match the fixture oracle")


if __name__ == "__main__":
    main()
