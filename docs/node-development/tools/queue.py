#!/usr/bin/env python3
"""Выбирает следующие узлы для обработки из registry.json; ничего не запускает и не изменяет."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "registry.json"

# Предпосылки, которые достаточно выполнить внутри задачи узла.
# Остальные требуют отдельного стенда, подключения или решения владельца.
DEFAULT_SATISFIED = {
    "accepted_base",
    "shared_contract",
    "tabular",
    "multiple_inputs",
    "ordered_fixture",
    "dynamic_schema",
}


# Узлы, которые владелец запускает сам; в автоматическую очередь не попадают.
OWNER_ONLY = {"preprocessing-sampling"}


def load_nodes():
    return json.loads(REGISTRY.read_text(encoding="utf-8"))["nodes"]


def evaluate(node, satisfied, excluded):
    """Возвращает список причин, по которым узел нельзя брать; пустой список — узел готов к очереди."""
    reasons = []
    if node["queue_class"] != "backlog":
        reasons.append(f"класс {node['queue_class']}")
    if node.get("plan_status") == "discovery_required":
        reasons.append("нужно исследование")
    if node["slug"] in excluded:
        reasons.append("исключён вручную")
    if (ROOT / "nodes" / node["slug"] / "acceptance" / "expected.json").is_file():
        reasons.append("приёмка уже описана")
    missing = [p for p in node["prerequisites"] if p not in satisfied]
    if missing:
        reasons.append("нет предпосылок: " + ", ".join(missing))
    return reasons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("next", "list"):
        p = sub.add_parser(name)
        p.add_argument("--allow", default="", help="дополнительные предпосылки через запятую, считающиеся выполненными")
        p.add_argument("--exclude", default="", help="slug через запятую, которые не брать")
        p.add_argument("--json", action="store_true")
        if name == "next":
            p.add_argument("--count", type=int, default=1)
    args = parser.parse_args()

    satisfied = DEFAULT_SATISFIED | {x for x in args.allow.split(",") if x}
    excluded = OWNER_ONLY | {x for x in args.exclude.split(",") if x}
    rows = [(n, evaluate(n, satisfied, excluded)) for n in load_nodes()]
    ready = sorted((n for n, r in rows if not r), key=lambda n: (len(n["prerequisites"]), n["slug"]))

    if args.command == "next":
        picked = ready[: max(args.count, 0)]
        if args.json:
            json.dump([{"slug": n["slug"], "name": n["name"], "component_id": n["component_id"]} for n in picked],
                      sys.stdout, ensure_ascii=False, indent=2)
            print()
        else:
            for n in picked:
                print(f"{n['slug']}\t{n['name']}\t{n['component_id']}")
        if len(picked) < args.count:
            print(f"# доступно только {len(picked)} из {args.count}", file=sys.stderr)
        return 0

    for n, reasons in rows:
        if n["queue_class"] != "backlog":
            continue
        print(f"{'ГОТОВ' if not reasons else 'нельзя':7} {n['slug']:32} {'; '.join(reasons)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
