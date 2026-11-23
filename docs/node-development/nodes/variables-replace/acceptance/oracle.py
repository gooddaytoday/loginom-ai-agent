#!/usr/bin/env python3
"""Independent typed, single-lookup oracle; no Loginom/runtime imports."""
import copy
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def key(kind, value):
    if value is None:
        return (kind, "null", None)
    if kind == "boolean":
        assert type(value) is bool
    elif kind == "integer":
        assert type(value) is int and abs(value) <= 2**53 - 1
    elif kind == "real":
        assert type(value) in (int, Decimal)
    elif kind == "string":
        assert type(value) is str
    else:
        raise ValueError(kind)
    return (kind, "value", value)


def output(variables, rules):
    by_name = {r["name"]: r for r in rules}
    assert len(by_name) == len(rules)
    result = copy.deepcopy(variables)
    for variable in result:
        rule = by_name.get(variable["name"])
        if rule:
            assert variable["type"] == rule["type"]
            pairs = {key(rule["type"], p["from"]): p["to"] for p in rule["pairs"]}
            assert len(pairs) == len(rule["pairs"])
            for pair in rule["pairs"]:
                key(rule["type"], pair["to"])
            variable["value"] = pairs.get(key(variable["type"], variable["value"]), variable["value"])
        if variable["type"] == "real":
            variable["tolerance"] = {"abs": 1e-12, "rel": 1e-12}
    return {"output_node_type": "variables.replace", "port_kind": "variables",
            "output_port": 0, "ordered": True, "variables": result}


def expected():
    variables = json.loads((ROOT / "fixtures/variables.json").read_text(), parse_float=Decimal)
    fixture = json.loads((ROOT / "fixtures/rules.json").read_text(), parse_float=Decimal)
    rules = fixture["initial"]
    initial = output(variables, rules)
    updated_rules = [dict(r, pairs=fixture["update"]["pairs"]) if r["name"] == fixture["update"]["name"] else r for r in rules]
    updated = output(variables, updated_rules)
    source = [dict(v, value=fixture["source_update"]["value"]) if v["name"] == fixture["source_update"]["name"] else v for v in variables]
    return {"status": "proposal_pending_criteria_and_W1", "initial": initial,
            "updated": updated, "source_updated": output(source, updated_rules)}


if __name__ == "__main__":
    print(json.dumps(expected(), ensure_ascii=False, indent=2, default=float))
