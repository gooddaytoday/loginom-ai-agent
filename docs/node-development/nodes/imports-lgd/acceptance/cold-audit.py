"""Cross-check qualified native cold observations; not a handler or provenance oracle."""
import argparse
import json
from pathlib import Path

from oracle import FIXTURES, audit_bytes, audit_readback, require


def audit(observations, manifest, node_id, port_guid, source, package, account):
    def result(name):
        receipt = observations[name]
        require(receipt.get("ok") is True, name + " failed")
        return receipt["result"]

    initial = result("baseline")
    binding = initial["binding"]["node"]
    require(binding["node_id"] == node_id, "Unexpected native node")
    require(initial["baseline"]["node"] == binding, "Baseline identity differs")
    require(initial["baseline"]["roots"] == [], "Baseline already has execution groups")
    execution = result("execution")
    launch, identified, completed = (execution[k] for k in ("launch", "identified", "completed"))
    require(launch["verified"] is True and launch["launch_gesture_verified"] is True
            and launch["receipt"]["status"] == "SUCCEEDED", "Launch not verified")
    require(identified["node"] == binding, "Execution node differs")
    require(identified["root_id"] == initial["baseline"]["root_id"], "Execution root differs")
    expected_execution = ":".join([binding["document_id"], identified["root_id"], identified["group_id"]])
    require(identified["execution_id"] == completed["execution_id"] == expected_execution,
            "Execution lineage differs")
    require(completed["group_id"] == identified["group_id"] and completed["verified"] is True
            and completed["owner_verified"] is True and completed["status"] == "completed"
            and completed["cleanup_complete"] is True, "Execution not completed for owner")
    values = audit_readback(manifest, "replace.lgd", observations["readback"])
    readback = result("readback")
    require(readback["table"]["port_guid"] == port_guid, "Table port differs")
    properties = result("properties")
    mapping, context = properties["mapping"], properties["context"]
    require(context["verified"] is True and all(context[k] == v for k, v in binding.items()),
            "Property node differs")
    require(mapping["node_context"] == context and mapping["verified"] is True
            and mapping["source_identity_verified"] is True and mapping["inventory_complete"] is True,
            "Property inventory not qualified")
    port = context["output_port"]
    require(port["direction"] == "output" and port["port"] == port["native_index"] == 0
            and port["port_guid"] == port_guid and bool(port["opening_operation_id"]),
            "Property port differs")
    schema = manifest["schema"]
    targets, sources = mapping["target_fields"], mapping["source_fields"]
    require(len(targets) == len(sources) == len(schema), "Property field count differs")
    kinds = {"discrete": "Дискретный", "continuous": "Непрерывный"}
    definitions = properties["wizard"]["output_columns"]
    require(definitions["definition_coverage"]["status"] == "complete_configured_rows"
            and definitions["definition_coverage"]["count"] == len(schema), "Purpose coverage partial")
    require(len(definitions["fields"]) == len(schema), "Purpose count differs")
    for expected, target, source_field, definition in zip(schema, targets, sources, definitions["fields"]):
        for key in ("name", "label", "type"):
            require(target[key] == source_field[key] == definition[key] == expected[key],
                    "Property " + key + " differs")
        require(target["source"] == source_field, "Mapping source differs")
        require(target["data_kind"] == definition["data_kind"] == kinds[expected["data_kind"]],
                "Property kind differs")
        require(target["excluded"] is (not expected["used"]), "Used differs")
        require(definition["usage"] == expected["purpose"], "Purpose differs")
    settings = result("settings")
    opened = settings["opened"]
    require(opened["verified"] is True and opened["node_context"]["verified"] is True
            and all(opened["node_context"][k] == v for k, v in binding.items()), "Settings node differs")
    require(opened["settings_applied"] is False and opened["execution_started"] is False,
            "Viewing settings applied changes")
    require(settings["path"] == source and settings["checksum"]["checked"] is True,
            "Persisted source/checksum differs")
    cleanup = result("cleanup")["cleanup"]
    require(cleanup["document_id"] == binding["document_id"] and cleanup["package_path"] == package
            and cleanup["account"] == account, "Cleanup owner differs")
    require(cleanup["status"] == "SUCCEEDED" and cleanup["package_closed"] is True
            and cleanup["logged_out"] is True and cleanup["unsaved_changes_discarded"] is True
            and cleanup["packages_after"] == 0, "Cleanup incomplete")
    return {"status": "PASS", "scope": "native_cold_semantic_crosscheck", "values": values,
            "node_id": node_id, "port_guid": port_guid, "execution_id": expected_execution,
            "properties": ["name", "label", "type", "data_kind", "purpose", "used"],
            "cleanup": True, "not_verified": ["receipt provenance", "remote byte lineage",
            "BGDATA parsing", "CLI/model acceptance", "handler cold oracle",
            "chronology of UI actions outside supplied observations"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", required=True, type=Path)
    for name in ("node-id", "port-guid", "source", "package", "account"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    manifest = json.loads((FIXTURES / "manifest.json").read_text())
    audit_bytes(manifest)
    observations = json.loads(args.observations.read_text())
    print(json.dumps(audit(observations, manifest, args.node_id, args.port_guid,
                           args.source, args.package, args.account), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
