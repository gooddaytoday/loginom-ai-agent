"""Generate proposed invariant contracts from CSV, never from Loginom/actual.

No checker or run-check extension is installed by this stage-0 proposal.
Do not pass this file or its output to the product model.
"""
import argparse
import collections
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def expected(node):
    with (ROOT / "fixtures/modes.csv").open(encoding="utf-8", newline="") as stream:
        rows = [dict(RowID=int(r["RowID"]), Class=r["Class"], Value=int(r["Value"]))
                for r in csv.DictReader(stream)]
    classes = collections.Counter(row["Class"] for row in rows)
    sizes = {"sample": 8} if node == "sampling" else {"train": 8, "test": 4}
    quotas = {}
    for subset, size in sizes.items():
        assert all(size * count % len(rows) == 0 for count in classes.values())
        quotas[subset] = {key: size * count // len(rows) for key, count in classes.items()}
    columns = [{"name": name, "type": kind, "label_any": True}
               for name, kind in [("RowID", "integer"), ("Class", "string"), ("Value", "integer")]]
    return {
        "status": "proposal_requires_owner_approval_not_stock_expected",
        "node_type": "preprocessing." + node,
        "source": {"rows": rows, "row_count": len(rows), "class_counts": dict(classes)},
        "columns": columns,
        "ports": [0] if node == "sampling" else [0, 1, 2],
        "seed": 42,
        "requested_sizes": sizes,
        "common": {
            "unchanged_source_and_settings": True,
            "repeat_executions": 2,
            "repeat_comparison": "exact ordered equality per output port",
            "membership": "complete rows from source, no new or duplicate RowID",
            "values_and_types": "exact; preserve configured column order",
            "cold": "reopen saved package and execute unchanged settings; compare the same ports",
        },
        "random": {
            "proposed_row_counts": sizes,
            "cardinality_status": "sampling size 8 observed twice; partition 8/4 observed on all ports",
            "exact_selected_rows": None,
        },
        "stratified": {
            "fields": ["Class"],
            "proposed_quotas_if_native_method_enforces_them": quotas,
            "quota_status": "sampling 4A/4B and partition train 4A/4B, test 2A/2B observed once each",
            "exact_selected_rows": None,
        },
        "partition_relations": None if node == "sampling" else {
            "train_test_intersection": [],
            "combined": "train rows followed by test rows; observed random/sequential; confirm for other methods",
            "combined_extra_column": {"name": "IsTestSet", "type": "boolean", "position": 0},
            "flags": {"train": False, "test": True},
            "unused": "source minus union(train,test); excluded from combined",
        },
        "random_uniform": {
            "proposed_group_size": 1,
            "status": "native group controls observed; output semantics unconfirmed",
            "exact_selected_rows": None,
        },
        "biased": {
            "status": "exact_oracle_unresolved",
            "reason": "native method exposes category factors and Random seed, not a row offset",
            "exact_selected_rows": None,
            "acceptance": "owner decision required before substituting invariant acceptance",
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--node", choices=["sampling", "data_partition"], default="sampling")
    print(json.dumps(expected(parser.parse_args().node), ensure_ascii=False, indent=2))
