#!/usr/bin/env python3
"""Build or verify the six wave 4 chains from deterministic dbseed CSVs."""

import argparse
from collections import Counter, defaultdict
import csv
from decimal import Decimal
import io
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parent.parent
IMPORT = "imports.text"
JOIN = "transform.join_data"
GROUP = "transform.group_data"
SORT = "transform.sorting"
FILTER = "transform.filter_data"
CALC = "transform.calculator"
VARS = "variables.calculator"
JS = "programming.javascript"
PYTHON = "programming.python"
EXCEL = "exports.excel"
SAMPLE = "preprocessing.sampling"


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def csv_text(rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, rows[0].keys(), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def node(key, kind, **selector):
    return dict(id=key, type=kind, **selector)


def link(source, target, *, output=0, input_port=0):
    return dict(source=source, target=target, output=output, input=input_port)


def table(kind, schema, rows, *, ordered=False, port=0, exact_columns=False, label=None):
    converters = {"integer": int, "real": float, "string": str}
    output = dict(
        output_node_type=kind,
        output_port=port,
        columns=[
            dict(name=name, type=field_type, tolerance=dict(abs=1e-8, rel=1e-12))
            if field_type == "real" else dict(name=name, type=field_type)
            for name, field_type in schema
        ],
        rows=[
            {
                name: converters[field_type](row[name]) if row[name] not in ("", None) else None
                for name, field_type in schema
            }
            for row in rows
        ],
        ordered=ordered,
        column_order="exact" if exact_columns else "any",
    )
    if label:
        output["output_node_label"] = label
    return output


def rename(kind, label):
    return dict(kind="rename", node=dict(type=kind), label=label)


class Chain:
    def __init__(self, number, inputs):
        self.prefix = f"bh-w4{number:02d}"
        self.inputs = inputs
        self.files = {}
        self.previous = None
        self.previous_nodes = set()

    def turn(self, task, nodes, links=(), outputs=(), *, manual=None, excel=None):
        number = int(self.previous.rsplit("t", 1)[1]) + 1 if self.previous else 1
        name = f"{self.prefix}-t{number}"
        variables = node("workflow", "variables.user", label="Переменные сценария")
        all_nodes = [variables, *nodes]
        identifiers = {item["id"] for item in all_nodes}
        graph = dict(
            nodes=all_nodes, links=list(links), exact=True,
            retain=[item["id"] for item in all_nodes if item["id"] in self.previous_nodes],
        )
        case = dict(output_mode="ports", budget=dict(max_nodes=len(identifiers - self.previous_nodes - {"workflow"})))
        if self.previous:
            case["base"] = self.previous
        else:
            case["input_files"] = list(self.inputs)
            for filename, rows in self.inputs.items():
                self.files[Path(name, "data", filename)] = csv_text(rows)
        if manual:
            case["manual_edit"] = manual
        expected = dict(graph=graph, outputs=list(outputs))
        if excel:
            expected["excel_artifact"] = excel
        self.files[Path(name, "case.json")] = json_text(case)
        self.files[Path(name, "expected.json")] = json_text(expected)
        self.files[Path(name, "task.md")] = task + "\n"
        self.previous = name
        self.previous_nodes = identifiers


def item_amount(item):
    discount = Decimal(item["discount_pct"] or 0)
    return int(item["quantity"]) * Decimal(item["unit_price"]) * (1 - discount / 100)


def regional_revenue(orders, clients):
    chain = Chain(1, {"orders.csv": orders, "customers.csv": clients})
    orders_label, customers_label = "Заказы", "Клиенты"
    imports = [node("orders", IMPORT, label=orders_label),
               node("customers", IMPORT, label=customers_label)]
    nodes = [imports[0]]
    order_schema = [("order_id", "integer"), ("customer_id", "integer"), ("revenue", "real")]
    client_schema = [("customer_id", "integer"), ("region", "string"), ("email", "string")]
    chain.turn("Импортируй orders.csv в узел «Заказы» с вещественным revenue и проверь импорт запуском.",
               nodes, outputs=[table(IMPORT, order_schema, orders)])
    nodes = imports.copy()
    chain.turn("Импортируй customers.csv в узел «Клиенты» и проверь все строки на выходе.",
               nodes, outputs=[table(IMPORT, client_schema, clients, label=customers_label)])
    nodes.append(node("join", JOIN))
    links = [link("orders", "join"), link("customers", "join", input_port=1)]
    clients_by_id = {client["customer_id"]: client for client in clients}
    joined = [
        dict(order_id=order["order_id"], region=clients_by_id[order["customer_id"]]["region"],
             revenue=order["revenue"])
        for order in orders
    ]
    chain.turn("Добавь внутреннее слияние «Заказы» и «Клиенты» по customer_id, оставь order_id, region и revenue на выходе и выполни его.",
               nodes, links, [table(JOIN, [order_schema[0], client_schema[1], order_schema[2]], joined)])
    nodes.append(node("group", GROUP))
    links.append(link("join", "group"))
    totals = defaultdict(Decimal)
    for row in joined:
        totals[row["region"]] += Decimal(row["revenue"])
    grouped = [dict(region=region, total_revenue=total) for region, total in totals.items()]
    schema = [("region", "string"), ("total_revenue", "real")]
    chain.turn("Добавь после слияния группировку по region с суммой revenue в total_revenue и выполни её.",
               nodes, links, [table(GROUP, schema, grouped)])
    nodes.append(node("sort", SORT))
    links.append(link("group", "sort"))
    sorted_rows = sorted(grouped, key=lambda row: -row["total_revenue"])
    chain.turn("Добавь сортировку итогов по total_revenue по убыванию и выполни её.",
               nodes, links, [table(SORT, schema, sorted_rows, ordered=True)])
    nodes.append(node("excel", EXCEL))
    links.append(link("sort", "excel"))
    chain.turn("Выгрузи отсортированный результат в regional-revenue.xlsx на лист «Регионы», с заголовками region и total_revenue в таком порядке. Приложи книгу и покажи строки исходной сортировки.",
               nodes, links, [table(SORT, schema, sorted_rows, ordered=True, exact_columns=True)],
               excel=dict(filename="regional-revenue.xlsx", sheet_name="Регионы", header="names"))
    return chain


def item_totals(items):
    chain = Chain(2, {"order_items.csv": items})
    schema = [
        ("item_id", "integer"), ("order_id", "integer"), ("product_id", "integer"),
        ("quantity", "integer"), ("unit_price", "real"), ("discount_pct", "integer"),
    ]
    nodes = [node("items", IMPORT)]
    chain.turn("Импортируй order_items.csv, оставь пустые скидки как NULL и проверь импорт запуском.",
               nodes, outputs=[table(IMPORT, schema, items)])
    nodes.append(node("calc", CALC))
    links = [link("items", "calc")]
    calculated = [dict(row, amount=item_amount(row)) for row in items]
    schema += [("amount", "real")]
    chain.turn("Добавь после импорта калькулятор amount = quantity × unit_price × (1 − discount_pct / 100), считая NULL-скидку нулевой, и выполни его.",
               nodes, links, [table(CALC, schema, calculated)])
    nodes.append(node("filter", FILTER))
    links.append(link("calc", "filter"))
    selected = [row for row in calculated if row["amount"] > 5000]
    chain.turn("Добавь после калькулятора фильтр amount > 5000 и выполни его.",
               nodes, links, [table(FILTER, schema, selected)])
    nodes.append(node("group", GROUP))
    links.append(link("filter", "group"))
    totals = defaultdict(Decimal)
    for row in selected:
        totals[int(row["product_id"])] += row["amount"]
    grouped = [dict(product_id=product, total_amount=total) for product, total in totals.items()]
    schema = [("product_id", "integer"), ("total_amount", "real")]
    chain.turn("Добавь на выход подходящих строк группировку по product_id с суммой amount в total_amount и выполни её.",
               nodes, links, [table(GROUP, schema, grouped)])
    nodes.extend([node("sort", SORT), node("sample", SAMPLE)])
    links.extend([link("group", "sort"), link("sort", "sample")])
    ordered = sorted(grouped, key=lambda row: (-row["total_amount"], row["product_id"]))
    assert len(ordered) > 10
    chain.turn("Получи топ-10 товаров: отсортируй по total_amount по убыванию и product_id по возрастанию, отбери первые 10 строк узлом «Сэмплинг» и покажи результат.",
               nodes, links, [table(SAMPLE, schema, ordered[:10], ordered=True)])
    return chain


def product_ranks(products):
    chain = Chain(3, {"products.csv": products})
    nodes = [node("products", IMPORT)]
    schema = [("product_id", "integer"), ("category", "string"),
              ("list_price", "real"), ("quantity", "integer")]
    caption = "Каталог для ранжирования"
    chain.turn("Импортируй products.csv со столбцом list_price вещественного типа и проверь импорт запуском.",
               nodes, outputs=[table(IMPORT, schema, products)],
               manual=rename(IMPORT, caption))
    nodes[0] = node("products", IMPORT, label=caption)
    nodes.append(node("rank", JS))
    links = [link("products", "rank")]
    schema = [("category", "string"), ("product_id", "integer"), ("rank", "integer")]

    def rank(field):
        categories = defaultdict(list)
        for product in products:
            categories[product["category"]].append(product)
        return [
            dict(category=category, product_id=row["product_id"], rank=index)
            for category, rows in categories.items()
            for index, row in enumerate(sorted(rows, key=lambda item: (-Decimal(item[field]), int(item["product_id"]))), 1)
        ]

    by_quantity = rank("quantity")
    by_price = rank("list_price")
    assert by_quantity != by_price
    chain.turn("Добавь узел JavaScript после «Каталог для ранжирования» и посчитай ранг товара внутри category: list_price по убыванию, при равенстве меньший product_id выше. Выведи category, product_id и целочисленный rank с единицы, выполни узел.",
               nodes, links, [table(JS, schema, by_price)])
    chain.turn("Поменяй в том же узле критерий ранга с цены на quantity по убыванию и проверь запуском.",
               nodes, links, [table(JS, schema, by_quantity)])
    chain.turn("Выполни ещё раз узел ранжирования с текущими настройками и покажи все строки.",
               nodes, links, [table(JS, schema, by_quantity)])
    return chain


def monthly_revenue(orders):
    chain = Chain(4, {"monthly-orders.csv": orders})
    nodes = [node("orders", IMPORT)]
    inputs = [("order_id", "integer"), ("order_date", "string"), ("revenue", "real")]
    caption = "Заказы для динамики"
    chain.turn("Импортируй monthly-orders.csv с order_date как текстом в формате ISO и проверь все строки на выходе.",
               nodes, outputs=[table(IMPORT, inputs, orders)],
               manual=rename(IMPORT, caption))
    nodes[0] = node("orders", IMPORT, label=caption)
    nodes.append(node("monthly", PYTHON))
    links = [link("orders", "monthly")]
    schema = [("month", "string"), ("revenue", "real"), ("moving_avg", "real")]
    by_month = defaultdict(Decimal)
    for order in orders:
        by_month[order["order_date"][:7]] += Decimal(order["revenue"])
    months = sorted(by_month)
    totals = [by_month[month] for month in months]

    def rolling(window):
        return [
            dict(month=month, revenue=totals[index],
                 moving_avg=sum(totals[index + 1 - window:index + 1]) / window if index + 1 >= window else None)
            for index, month in enumerate(months)
        ]

    chain.turn("Добавь узел Python после переименованного импорта «Заказы для динамики» и выполни помесячный расчёт: month в формате ГГГГ-ММ по возрастанию, revenue как сумма и moving_avg за текущий и два предыдущих месяца. Пока окно неполное, выдай NULL.",
               nodes, links, [table(PYTHON, schema, rolling(3), ordered=True)])
    chain.turn("Измени в этом же узле окно скользящего среднего на шесть месяцев и выполни его.",
               nodes, links, [table(PYTHON, schema, rolling(6), ordered=True)])
    chain.turn("Выполни ещё раз помесячный расчёт с текущим окном и покажи все строки.",
               nodes, links, [table(PYTHON, schema, rolling(6), ordered=True)])
    return chain


def variable_threshold(prices):
    chain = Chain(5, {"line-prices.csv": prices})
    schema = [("item_id", "integer"), ("unit_price", "real")]
    nodes = [node("prices", IMPORT)]
    chain.turn("Импортируй line-prices.csv, поле unit_price сделай вещественным, и проверь все строки на выходе.",
               nodes, outputs=[table(IMPORT, schema, prices)])
    nodes.append(node("filter", FILTER))
    links = [link("prices", "filter")]

    def exits(threshold):
        passed = [row for row in prices if Decimal(row["unit_price"]) > threshold]
        rejected = [row for row in prices if Decimal(row["unit_price"]) <= threshold]
        return [table(FILTER, schema, passed), table(FILTER, schema, rejected, port=1)]

    assert exits(500) != exits(1000)
    caption = "Ценовой порог"
    chain.turn("Добавь фильтр строк unit_price > 1000 после импорта и проверь оба его выхода.",
               nodes, links, exits(1000), manual=rename(FILTER, caption))
    nodes[1] = node("filter", FILTER, label=caption)
    nodes.append(node("limit", VARS))
    chain.turn("Добавь Калькулятор переменных с одной вещественной переменной MinPrice = 1000 и выполни его.",
               nodes, links)
    links.append(link("limit", "filter"))
    chain.turn("Подключи MinPrice из Калькулятора переменных как порог в фильтре «Ценовой порог» и проверь оба выхода.",
               nodes, links, exits(1000))
    chain.turn("Поменяй MinPrice на 500 в Калькуляторе переменных, пересчитай существующий фильтр и покажи его выходы.",
               nodes, links, exits(500))
    return chain


def edit_workflow(quantities):
    chain = Chain(6, {"line-quantities.csv": quantities})
    nodes = [node("items", IMPORT)]
    schema = [("item_id", "integer"), ("product_id", "integer"), ("quantity", "integer")]
    chain.turn("Импортируй line-quantities.csv и проверь все строки на выходе.", nodes,
               outputs=[table(IMPORT, schema, quantities)])
    nodes.append(node("group", GROUP))
    direct = [link("items", "group")]

    def grouped(rows, average=False):
        groups = defaultdict(list)
        for row in rows:
            groups[row["product_id"]].append(int(row["quantity"]))
        results = [dict(product_id=product, summary=Decimal(sum(values)) / len(values) if average else sum(values))
                   for product, values in groups.items()]
        return [table(GROUP, [("product_id", "integer"), ("summary", "real")], results)]

    chain.turn("Добавь после импорта группировку по product_id с суммой quantity в summary и выполни её.",
               nodes, direct, grouped(quantities))
    nodes.append(node("filter", FILTER))
    via_filter = [link("items", "filter"), link("filter", "group")]
    selected = [row for row in quantities if int(row["quantity"]) >= 5]
    assert 0 < len(selected) < len(quantities)
    assert grouped(selected) != grouped(selected, average=True)
    assert grouped(quantities, average=True) != grouped(selected, average=True)
    caption = "Отбор количества"
    chain.turn("Вставь между импортом и существующей группировкой фильтр quantity ≥ 5, затем выполни группировку.",
               nodes, via_filter, grouped(selected), manual=rename(FILTER, caption))
    nodes[-1] = node("filter", FILTER, label=caption)
    chain.turn("Замени сумму quantity на среднее в той же группировке, сохрани имя summary и выполни узел.",
               nodes, via_filter, grouped(selected, average=True))
    nodes.pop()
    chain.turn("Удали фильтр «Отбор количества», восстанови прямую связь импорта с существующей группировкой и выполни её.",
               nodes, direct, grouped(quantities, average=True))
    return chain


def build_all():
    with TemporaryDirectory(prefix="wave4-dbseed-") as directory:
        seed = Path(directory)
        subprocess.run([sys.executable, str(ROOT / "dbseed/gen.py"), str(seed)],
                       check=True, stdout=subprocess.DEVNULL)
        customers, products, orders, items = (
            read_csv(seed / f"{name}.csv") for name in ("customers", "products", "orders", "order_items")
        )
    order_totals = defaultdict(Decimal)
    product_quantities = Counter()
    for item in items:
        order_totals[item["order_id"]] += item_amount(item)
        product_quantities[item["product_id"]] += int(item["quantity"])
    short_orders = [dict(order_id=row["order_id"], customer_id=row["customer_id"],
                         revenue=format(order_totals[row["order_id"]], ".4f")) for row in orders[:24]]
    ids = {row["customer_id"] for row in short_orders}
    short_customers = [{key: row[key] for key in ("customer_id", "region", "email")}
                       for row in customers if row["customer_id"] in ids]
    short_products = []
    category_count = Counter()
    for row in products:
        category = row["category"]
        if category_count[category] < 4:
            short_products.append(dict(product_id=row["product_id"], category=category,
                                       list_price=row["list_price"], quantity=product_quantities[row["product_id"]]))
            category_count[category] += 1
    monthly_orders = []
    month_count = Counter()
    for row in orders:
        month = row["order_date"][:7]
        if month.startswith("2025-") and month_count[month] < 2:
            monthly_orders.append(dict(order_id=row["order_id"], order_date=row["order_date"],
                                       revenue=format(order_totals[row["order_id"]], ".4f")))
            month_count[month] += 1
    assert len(month_count) == 12 and set(month_count.values()) == {2}
    quantities = []
    item_count = Counter()
    selected_products = {row["product_id"] for row in products[:8]}
    for row in items:
        product = row["product_id"]
        if product in selected_products and item_count[product] < 4:
            quantities.append({key: row[key] for key in ("item_id", "product_id", "quantity")})
            item_count[product] += 1
    return [
        regional_revenue(short_orders, short_customers),
        item_totals(items[:32]),
        product_ranks(short_products),
        monthly_revenue(monthly_orders),
        variable_threshold([{key: row[key] for key in ("item_id", "unit_price")} for row in items[32:72]]),
        edit_workflow(quantities),
    ]


def main():
    case_path = Path(__file__).absolute().parent
    parser = argparse.ArgumentParser(description=__doc__)
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--out", type=Path, help="write the cases directory")
    options.add_argument("--check", type=Path, help="verify existing cases against the oracle")
    args = parser.parse_args()
    files = {path: content for chain in build_all() for path, content in chain.files.items()}
    if not args.out and not args.check:
        print(files[Path(case_path.name, "expected.json")], end="")
        return
    destination = args.out or args.check
    mismatches = []
    for relative, content in files.items():
        path = destination / relative
        if args.out:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        elif not path.is_file() or path.read_text(encoding="utf-8") != content:
            mismatches.append(str(relative))
    for name in sorted({path.parent.name for path in files if path.name == "expected.json"}):
        oracle = destination / name / "oracle.py"
        target = Path("../../wave4/oracle.py")
        if args.out and not oracle.is_symlink():
            oracle.symlink_to(target)
        if args.check and (not oracle.is_symlink() or oracle.readlink() != target or not oracle.is_file()):
            mismatches.append(f"{name}/oracle.py")
    if mismatches:
        raise SystemExit("\n".join(mismatches))
    print(f"{len(files)} файлов данных, заданий и эталонов")


if __name__ == "__main__":
    main()
