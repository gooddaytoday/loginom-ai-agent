"""Read-only CLI journal binding; never authenticate a file or infer native PASS.

Pins and the expanded request must come from the caller's independent attempt
record. Original CSV bytes come from the versioned fixture, not the transcript.
Only a direct text-import -> Grouping input 0 is qualified by this adapter.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[5] / "packages/loginom-runtime/tools/loginom-acceptance"
sys.path.insert(0, str(TOOLS))
from grouping_configuration_evidence import verify_grouping_configuration
from grouping_output_evidence import verify_grouping_output
from import_output_evidence import verify_text_import_output


def require(condition, failure):
    if not condition:
        raise ValueError(failure)


def operation(events, request, pins, *, grouping):
    op = request["operation_id"]
    rows = [e for e in events if e.get("operation_id") == op]
    require(bool(rows), "journal_operation_missing")
    require(all(pins.get(k) for k in
            ("session_id", "runtime_revision", "manifest_sha256", "target")), "journal_pins_required")
    require(all(all(e.get(k) == v for k, v in pins.items()) for e in rows), "journal_identity")
    prepared = [e for e in rows if e.get("phase") == "node_apply_prepared"]
    require(len(prepared) == 1 and prepared[0]["request"] == request, "expanded_request_identity")
    require(rows[0] == prepared[0], "request_before_receipts")
    signature = prepared[0].get("signature")
    require(bool(signature), "request_signature_missing")
    names = ["source", "target", "input_mapping", "open", "configure"]
    if any(e.get("receipt", {}).get("phase") == "workflow" for e in rows):
        names.insert(1, "workflow")
    if grouping:
        names.append("node_finish")
    names += ["output_mapping", "finish", "execute", "read"]
    require(request["finish"] == "execute", "executed_request_required")
    completed, pending, values = [], None, {}
    for e in rows:
        phase = e.get("phase")
        if phase in ("node_apply_prepared", "node_phase_prepared", "node_phase_completed", "node_checkpoint"):
            require(e.get("signature") == signature, "phase_signature")
        if phase == "node_phase_prepared":
            require(pending is None, "phase_overlap")
            pending = e["receipt"]
        elif phase == "node_phase_completed":
            receipt = e["receipt"]
            require(pending is not None and receipt.get("phase") == pending.get("phase")
                    and receipt.get("receipt_id") == pending.get("receipt_id")
                    and receipt.get("receipt_id") == op + ":" + receipt["phase"]
                    and receipt.get("status") == "verified", "phase_receipt_pair")
            value = receipt["value"]
            require(value.get("verified") is True and value.get("cleanup_complete") is True, "phase_unverified")
            completed.append(receipt["phase"])
            values[receipt["phase"]] = value
            pending = None
        elif phase == "node_checkpoint":
            require(pending is None and completed == names, "phase_order_or_incomplete")
    require(pending is None and completed == names, "phase_order_or_incomplete")
    checkpoints = [e for e in rows if e.get("phase") == "node_checkpoint"]
    require(len(checkpoints) == 1 and rows.index(checkpoints[0]) > rows.index(prepared[0]), "checkpoint_required")
    result = checkpoints[0]["result"]
    require(result.get("status") == "SUCCEEDED" and result.get("operation_id") == op, "checkpoint_status")
    node = result["node"]
    require(node.get("document_id") == request["document_id"]
            and node.get("workflow_id") == request["workflow_ref"]["workflow_id"]
            and bool(node.get("node_id")) and values["target"]["node"] == node, "target_node_identity")
    if request["target"]["kind"] == "existing":
        require(request["target"]["ref"] == node, "existing_node_identity")
    target = values["target"]["target"]
    require(target.get("status") == "SUCCEEDED" and target["node"]["ref"] == node
            and target["node"]["type"] == request["target"]["type"], "target_type_identity")
    execution = values["execute"]
    execution_id = execution["execution_id"]
    require(execution.get("status") == "completed" and bool(execution_id)
            and values["finish"]["execution_id"] == execution_id
            and result["execution"] == dict(status="completed", execution_id=execution_id), "execution_identity")
    read = values["read"]
    require(read == result["output"] and read.get("execution_id") == execution_id
            and read.get("status") == "complete" and bool(read.get("evidence_ref")), "complete_read_receipt")
    require(request["read"]["ports"] == [0] and len(read["ports"]) == 1, "read_port_identity")
    port = read["ports"][0]
    require(port.get("port") == 0 and port.get("fresh") is True
            and port.get("execution_id") == execution_id and port.get("sample_complete") is True
            and type(port.get("row_count")) is int and port["row_count"] >= 0
            and type(port.get("sample_rows")) is int
            and port.get("sample_rows") == port["row_count"] == len(port["sample"]), "full_fresh_read")
    return dict(node=node, values=values, result=result, checkpoint_index=events.index(checkpoints[0]),
                prepared_index=events.index(prepared[0]))


def verify_bindings(events, request, pins, source_operation_id, source_bytes):
    """Receipt-level check only. Raw/native auditors are mandatory below."""
    failures = []
    try:
        require(request["target"]["type"] == "transform.group_data" and request["mode"] == "aggregate", "grouping_request")
        grouping = operation(events, request, pins, grouping=True)
        starts = [e for e in events if e.get("operation_id") == source_operation_id
                  and e.get("phase") == "node_apply_prepared"]
        require(len(starts) == 1, "source_request_required")
        upstream_request = starts[0]["request"]
        require(upstream_request["target"]["type"] == "imports.text", "direct_text_import_required")
        upstream = operation(events, upstream_request, pins, grouping=False)
        require(upstream["checkpoint_index"] < grouping["prepared_index"], "source_before_grouping")
        inputs = request["inputs"]
        require(inputs == [dict(input=0, source=upstream["node"], output=0)], "input_source_identity")
        edge = dict(source=upstream["node"]["node_id"], output=0, target=grouping["node"]["node_id"], input=0)
        require(grouping["values"]["target"]["target"]["links"] == [edge], "target_input_link")
        graphs = [e["target_state"].get("final_graph", e["target_state"].get("last_graph")) for e in events
                  if e.get("operation_id") == request["operation_id"] and e.get("phase") == "node_target_checkpoint"]
        require(graphs and graphs[-1] and graphs[-1].get("complete") is True
                and edge in graphs[-1]["links"], "raw_target_graph_required")
        graph = graphs[-1]
        require(graph.get("document_id") == request["document_id"]
                and graph.get("workflow_ref") == request["workflow_ref"]
                and [x for x in graph["links"] if x.get("target") == edge["target"]] == [edge], "raw_graph_owner_or_input")
        for owner, kind in [(upstream["node"], "imports.text"), (grouping["node"], "transform.group_data")]:
            found = [n for n in graph["nodes"] if n.get("ref") == owner]
            require(len(found) == 1 and found[0].get("type") == kind, "raw_graph_node")
        source = upstream_request["parameters"]["source"]
        require(source.get("bytes") == len(source_bytes) and source.get("sha256") == hashlib.sha256(source_bytes).hexdigest(), "original_source_bytes")
        require(upstream["values"]["source"]["source"].items() >= source.items(), "source_phase_identity")
        uploads = [e for e in events if e.get("operation_id") == source["upload_operation_id"]]
        verification_ids = {e.get("outcome", {}).get("output", {}).get("server_copy_verification", {}).get("verification_id") for e in uploads}
        transfer = uploads + [e for e in events if e.get("operation_id") in verification_ids - {None}]
        require(all(all(e.get(k) == v for k, v in pins.items()) for e in transfer), "source_transfer_journal_identity")
        def schema(fields):
            return [{k: f[k] for k in ("name", "label", "type")} for f in fields]
        mapping = grouping["values"]["input_mapping"]["native_mapping"]
        require(schema(mapping["source_fields"]) == schema(upstream["values"]["read"]["ports"][0]["schema"]), "input_schema_identity")
        require(schema(mapping["target_fields"]) == schema(grouping["values"]["configure"]["configuration"]["input_fields"]), "configured_input_schema")
        return dict(passed=True, status="BINDING_ONLY", failures=[], upstream_request=upstream_request)
    except (KeyError, IndexError, TypeError, ValueError, AttributeError) as error:
        failures.append(str(error) if isinstance(error, ValueError) else "binding_malformed:" + str(error))
    return dict(passed=False, status="NOT_VERIFIED", failures=failures)


def audit(events, request, pins, source_operation_id, source_bytes, expected, *, evidence_kind):
    require(evidence_kind in ("offline_double", "saved_journal"), "evidence_kind_required")
    binding = verify_bindings(events, request, pins, source_operation_id, source_bytes)
    raw = {}
    if binding["passed"]:
        upstream = binding["upstream_request"]
        columns = expected["columns"]
        rows = [[r[c["name"]] for c in columns] for r in expected["rows"]]
        output = next(e["result"]["output"]["ports"][0] for e in events
                      if e.get("operation_id") == request["operation_id"] and e.get("phase") == "node_checkpoint")
        if [{k: c[k] for k in ("name", "label", "type")} for c in output["schema"]] != columns:
            binding = dict(passed=False, status="NOT_VERIFIED", failures=["complete_output_schema"])
        for name, call in [
            ("source", lambda: verify_text_import_output(events, upstream, source_bytes)),
            ("configuration", lambda: verify_grouping_configuration(events, request)),
            ("output", lambda: verify_grouping_output(events, request, columns, rows))]:
            try:
                raw[name] = call()
            except (KeyError, IndexError, TypeError, ValueError, AttributeError) as error:
                raw[name] = dict(passed=False, failures=["raw_evidence_malformed:" + str(error)])
    failures = list(binding["failures"])
    for name, result in raw.items():
        if result.get("passed") is not True:
            failures += [name + ":" + f for f in result.get("failures", ["raw_not_verified"])]
    passed = binding["passed"] and len(raw) == 3 and all(r.get("passed") is True for r in raw.values()) and not failures
    return dict(passed=passed, status="OFFLINE_VERIFIED" if passed else "NOT_VERIFIED",
                evidence_kind=evidence_kind, binding={k: v for k, v in binding.items() if k != "upstream_request"},
                raw_audits=raw, failures=sorted(set(failures)), native_acceptance="NOT_VERIFIED",
                package_persistence_verified=False, cleanup_verified=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("journal", "request", "pins", "source-operation", "source-csv", "expected"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    events = [json.loads(line) for line in Path(args.journal).read_text().splitlines() if line.strip()]
    result = audit(events, json.loads(Path(args.request).read_text()), json.loads(Path(args.pins).read_text()),
                   args.source_operation, Path(args.source_csv).read_bytes(), json.loads(Path(args.expected).read_text()),
                   evidence_kind="saved_journal")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["passed"] else 1)
