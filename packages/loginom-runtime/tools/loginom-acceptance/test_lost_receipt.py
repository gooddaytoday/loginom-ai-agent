"""Synthetic lost-response audit fixtures, never live acceptance evidence."""
import copy
import unittest

import audit
from test_acceptance import fixture


def lost_fixture():
    request, evidence, prompt = fixture()
    request["fault_injection"] = "lost_receipt"
    request["runtime_source_pin"]["inputs"] = {"client/lib/executor.mjs": "a" * 64}
    original = evidence["tools"][1]
    actual = copy.deepcopy(original["result"])
    actual.update(operation_id="source-op", cleanup_complete=True)
    original["result"] = {"status": "AMBIGUOUS", "operation_id": "source-op", "action_key": "node.add"}
    for call in evidence["calls"][2:]:
        call["row"] += 2
    for tool in evidence["tools"][2:]:
        tool["row"] += 2
    common = {"session_id": original["session_id"], "tool_call_id": "inspect-call", "tool": audit.PREFIX + "dock_operation_inspect"}
    evidence["calls"].insert(2, {**common, "row": 5, "arguments": {}})
    evidence["tools"].insert(2, {**common, "row": 6, "result": {"status": "SUCCEEDED", "output": {
        "operation_id": "source-op", "state": "resolved", "cleanup_confirmed": True, "outcome": copy.deepcopy(actual)}}})
    metadata = {"session_id": "dock-fixture", "runtime_revision": "a" * 64, "manifest_sha256": "b" * 64,
                "operation_id": "source-op", "action_key": "node.add"}
    evidence["events"][:0] = [
        {**metadata, "phase": "prepared", "parameters": {"component_key": "imports.text"}},
        {**metadata, "phase": "receipt_recovered", "outcome": copy.deepcopy(actual)}]
    evidence["operator_fault_receipt"] = {"fault": "lost_response_after_completed_browser_receipt", "variant": "lost_receipt",
        "run_id": request["run_id"], "operation_id": "source-op", "actual_browser_reply": actual,
        "injection_reached": True, "receipt_fabricated": False, "original_browser_response_withheld": True,
        "generated_code_modified": False, "source_code_sha256": "c" * 64, "injected_code_sha256": "c" * 64,
        "executor_source_sha256": "a" * 64}
    return request, evidence, prompt


class LostReceiptTest(unittest.TestCase):
    def test_implicit_reconciliation_must_precede_the_next_physical_apply(self):
        request, evidence, prompt = lost_fixture()
        call = evidence["calls"][2]; reply = evidence["tools"][2]
        call["tool"] = reply["tool"] = audit.PREFIX + "dock_workspace_observe"
        reply["result"] = {"status": "SUCCEEDED", "output": {"nodes": [{"node_ref": {"node_label": "Источник"}}]}}
        evidence["tools"][3]["result"]["operation_id"] = "union-op"
        union = {"phase": "prepared", "operation_id": "union-op", "session_id": "dock-fixture",
                 "runtime_revision": "a" * 64, "manifest_sha256": "b" * 64}
        evidence["events"].insert(2, union)
        self.assertTrue(audit.audit(request, evidence, prompt)["all_assertions_passed"])
        evidence["events"].remove(union)
        evidence["events"].insert(0, union)
        self.assertFalse(audit.audit(request, evidence, prompt)["all_assertions_passed"])

    def test_recover_can_reconcile_the_same_receipt_without_performing_repair(self):
        request, evidence, prompt = lost_fixture()
        call = evidence["calls"][2]
        reply = evidence["tools"][2]
        call["tool"] = reply["tool"] = audit.PREFIX + "dock_operation_recover"
        call["arguments"] = {"operation_id": "source-op", "recovery_operation_id": "new-recovery-id", "strategy": "abandon_operation"}
        reply["result"] = {**copy.deepcopy(evidence["operator_fault_receipt"]["actual_browser_reply"]), "recovery_operation_id": "new-recovery-id"}
        self.assertTrue(audit.audit(request, evidence, prompt)["all_assertions_passed"])
        reply["result"]["recovery_operation_id"] = "unbound-id"
        self.assertFalse(audit.audit(request, evidence, prompt)["all_assertions_passed"])

    def test_recovered_exact_page_receipt_and_single_apply_pass(self):
        result = audit.audit(*lost_fixture())
        self.assertTrue(result["all_assertions_passed"], result)

    def test_lost_receipt_negative_proofs_fail(self):
        mutations = [
            lambda e: e["operator_fault_receipt"].update(executor_source_sha256="b" * 64),
            lambda e: e["operator_fault_receipt"].update(injected_code_sha256="d" * 64),
            lambda e: e["operator_fault_receipt"].update(receipt_fabricated=True),
            lambda e: e["tools"][2]["result"]["output"].update(state="pending"),
            lambda e: e["tools"][2]["result"]["output"].update(cleanup_confirmed=False),
            lambda e: e["tools"][2]["result"]["output"]["outcome"].update(operation_id="other"),
            lambda e: e["events"].pop(1),
            lambda e: e["events"].append(copy.deepcopy(e["events"][0])),
            lambda e: e["calls"].append({**copy.deepcopy(e["calls"][1]), "row": 99, "tool_call_id": "retry"}),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(case=index):
                request, evidence, prompt = lost_fixture()
                mutate(evidence)
                self.assertFalse(audit.audit(request, evidence, prompt)["all_assertions_passed"])


if __name__ == "__main__":
    unittest.main()
