"""Synthetic contract fixtures only. These tests do not count as live acceptance."""
import copy
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import audit
import evidence
import run


def fixture():
    run_id = "20260905-120000-1234abcd"
    path = "/user/data/packages/Dock-acceptance-" + run_id + ".lgp"
    request = {"run_id": run_id, "package_path": path, "fault_injection": False, "provider": "openai-codex", "model": "gpt-5.6-luna", "reasoning_effort": "medium",
               "manifest_sha256": "b" * 64, "runtime_source_pin": {"client_revision": "a" * 64},
               "goal_sha256": audit.sha(audit.GOAL.read_bytes())}
    graph = {"nodes": audit.EXPECTED["nodes"], "links": audit.EXPECTED["links"],
             "ports": [{"node_label": label, "tids": [label + ";" + tid for tid in tids]}
                       for label, tids in audit.EXPECTED["ports"].items()]}
    calls = []; tools = []
    def add(name, args, result):
        index = len(calls) * 2 + 1
        common = {"tool_call_id": f"call-{index}", "session_id": "hermes-fixture", "tool": audit.PREFIX + name}
        calls.append({**common, "row": index, "arguments": args})
        tools.append({**common, "row": index + 1, "result": result})
    add("dock_prepare", {}, {"prepared": True, "sessionId": "dock-fixture", "workspace": {"created_draft": True},
        "executor": {"session_manifest": {"actionManifestDigest": "b" * 64}}})
    for component, label in [("imports.text", "Источник"), ("transform.union_data", "Объединение")]:
        add("dock_action_run", {"action_key": "node.add", "parameters": {"component_key": component}},
            {"status": "SUCCEEDED", "action_key": "node.add", "output": {"node_ref": {"node_label": label}}})
    result = {"status": "SUCCEEDED", "action_key": "package.save_as", "cleanup_complete": True,
              "operation_id": "save-fixture", "output": {"package_ref": {"path": path}, "reopened": True},
              "trace": [{"event": "save_requested", "path": path}, {"event": "saved_package_closed"},
                        {"event": "reopened_package_observed", "requested_path": path, "actual_path": path, "graph": graph}]}
    add("dock_action_run", {"action_key": "package.save_as", "parameters": {"path": path}}, result)
    common = {"session_id": "dock-fixture", "runtime_revision": "a" * 64, "manifest_sha256": "b" * 64,
              "operation_id": "save-fixture", "action_key": "package.save_as"}
    data = {"run_id": run_id, "export_complete": True, "runtime_source_unchanged": True, "harness_unchanged": True, "reasoning_effort": "medium",
            "process": {"returncode": 0, "timed_out": False, "usage": {"provider": "openai-codex", "model": "gpt-5.6-luna"}},
            "tools": tools, "calls": calls,
            "events": [{**common, "phase": "prepared", "checkpoint": {"path": path, "graph": copy.deepcopy(graph)}},
                       {**common, "phase": "completed", "outcome": copy.deepcopy(result)}]}
    request['auth_policy'] = audit.AUTH_POLICY
    data['auth_guard'] = {'policy':audit.AUTH_POLICY,'installed':True,'blocked_attempts':0}
    data['auth_connection_unchanged'] = True
    return request, data, audit.GOAL.read_text().replace("__PACKAGE_PATH__", path)


class AuditTest(unittest.TestCase):
    def test_complete_synthetic_evidence_passes(self):
        report = audit.audit(*fixture())
        self.assertTrue(report["all_assertions_passed"], report)

    def test_negative_evidence_is_rejected(self):
        def graph(d):
            return d["tools"][-1]["result"]["trace"][-1]["graph"]
        def reverse_edge(d):
            graph(d)["links"] = ["Объединение|Output_Data[0]|Источник|Input_Var[0]"]
        def wrong_port(d):
            graph(d)["links"] = ["Источник|Output_Data[0]|Объединение|Input_Data[0]"]
        def extra_port(d):
            graph(d)["ports"][1]["tids"].append("Объединение;Input_Data[3]")
        def missing_apply(d):
            d["tools"][-1]["result"]["trace"] = []
        def stale_snapshot(d):
            d["events"][0]["operation_id"] = "another-save"
        def duplicate_node(d):
            graph(d)["nodes"] = ["Источник", "Объединение", "Источник"]
        def wrong_runtime(d):
            d["events"][0]["runtime_revision"] = "c" * 64
        def other_directory(d):
            d["tools"][-1]["result"]["trace"][-1]["actual_path"] = "/other/same-name.lgp"
        def missing_reply(d):
            d["tools"].pop(1)
        def mutated_after_save(d):
            call = copy.deepcopy(d["calls"][1]); call.update(row=100, tool_call_id="late")
            reply = copy.deepcopy(d["tools"][1]); reply.update(row=101, tool_call_id="late")
            d["calls"].append(call); d["tools"].append(reply)
        def repeat_after_lost(d):
            d["tools"][1]["result"].update(status="AMBIGUOUS", operation_id="lost")
        def truncated(d):
            d["export_complete"] = False
        for mutate in [reverse_edge, wrong_port, extra_port, missing_apply, stale_snapshot,
                       duplicate_node, wrong_runtime, other_directory, missing_reply,
                       mutated_after_save, repeat_after_lost, truncated]:
            with self.subTest(case=mutate.__name__):
                request, data, prompt = fixture()
                mutate(data)
                self.assertFalse(audit.audit(request, data, prompt)["all_assertions_passed"])

    def test_success_prose_and_modified_prompt_do_not_prove_goal(self):
        request, data, prompt = fixture()
        data["tools"] = [{"result": "Everything succeeded"}]
        self.assertFalse(audit.audit(request, data, prompt)["all_assertions_passed"])
        request, data, prompt = fixture()
        self.assertFalse(audit.audit(request, data, prompt + " use recovery strategy X")["all_assertions_passed"])

    def test_snapshot_completeness_required(self):
        for flags in ({}, {"nodes": True, "ports": False, "links": False}):
            with self.assertRaises(ValueError):
                audit.snapshot_graph({"nodes": [], "links": [], "ui": {"truncated": flags}})


class EvidenceTest(unittest.TestCase):
    def test_export_never_reads_reasoning_or_system_message_bodies(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            db = sqlite3.connect(home / "state.db")
            db.execute("CREATE TABLE messages (id INTEGER, session_id TEXT, role TEXT, tool_call_id TEXT, tool_name TEXT, content TEXT, tool_calls TEXT)")
            call = [{"id": "call", "function": {"name": "tool_call", "arguments": json.dumps({
                "name": audit.PREFIX + "dock_action_run", "arguments": {"api_key": "secret-fixture"}})}}]
            db.executemany("INSERT INTO messages VALUES (?,?,?,?,?,?,?)", [
                (1, "session", "system", None, None, "SYSTEM_SENTINEL", None),
                (2, "session", "assistant", None, None, "REASONING_SENTINEL", json.dumps(call)),
                (3, "session", "tool", "call", "tool_call", json.dumps({"result": {"status": "FAILED", "password": "secret-fixture", "reasoning": "HIDDEN_SENTINEL"}}), None)])
            db.commit(); db.close()
            exported = json.dumps([evidence.call_evidence(home, ["secret-fixture"]), evidence.tool_evidence(home, ["secret-fixture"])])
            for private in ("SYSTEM_SENTINEL", "REASONING_SENTINEL", "HIDDEN_SENTINEL", "secret-fixture"):
                self.assertNotIn(private, exported)
            self.assertIn(audit.PREFIX + "dock_action_run", exported)

    def test_redacts_credentials_and_keeps_domain_strings(self):
        result = evidence.clean({"url": "https://u:p@example.invalid/x?token=secret-fixture",
                                 "nested": ["Bearer abc"], "Reasoning": "hidden"}, [])
        text = json.dumps(result)
        for secret in ("u:p", "secret-fixture", "Bearer abc", "hidden"):
            self.assertNotIn(secret, text)
        self.assertEqual(evidence.unwrap({"result": {"label": '{"literal":true}'}}), {"label": '{"literal":true}'})

    def test_write_is_private_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "evidence.json"
            run.write(path, {"first": True})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                run.write(path, {"first": False})

    def test_environment_does_not_inherit_alternative_provider_or_personal_config(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "other", "HERMES_HOME": "/personal", "PYTHONPATH": "/injected"}):
            env = run.environment({"XIAOMI_API_KEY": "approved"}, Path("/isolated"), Path("/run"))
        self.assertNotIn("OPENAI_API_KEY", env)
        self.assertNotIn("PYTHONPATH", env)
        self.assertEqual(env["HERMES_HOME"], "/isolated")


if __name__ == "__main__":
    unittest.main()

class ModelProfileTest(unittest.TestCase):
    def test_sol_low_and_historical_luna_require_exact_matching_evidence(self):
        request,data,_=fixture()
        self.assertTrue(audit.approved_model(request,data))
        request.update(model_profile='chatgpt-sol',model='gpt-5.6-sol',reasoning_effort='low')
        data['reasoning_effort']='low';data['process']['usage']['model']='gpt-5.6-sol'
        self.assertTrue(audit.approved_model(request,data))
        for target,key,value in [(request,'model','gpt-5.6-luna'),(request,'reasoning_effort','medium'),
                                 (data,'reasoning_effort','medium'),(data,'auth_connection_unchanged',False)]:
            old=target[key];target[key]=value
            self.assertFalse(audit.approved_model(request,data));target[key]=old

class PrepareGoalAuditTest(unittest.TestCase):
    def test_goal_audit_rejects_mutations_missing_receipts_and_wrong_window(self):
        from test_prepare_binding import PreparationV1Test
        request,data,_=fixture();goal=run.WORK/'goals/prepare-workspace.txt'
        v1=PreparationV1Test().fixture();data.update(v1)
        request.update(goal_id='prepare-workspace',model_profile='chatgpt-sol',model='gpt-5.6-sol',reasoning_effort='low',goal_sha256=audit.sha(goal.read_bytes()))
        data['reasoning_effort']='low';data['process']['usage']['model']='gpt-5.6-sol'
        result=data['tools'][0]['result'];result['executor']={'session_manifest':{'actionManifestDigest':request['manifest_sha256']}}
        state=result['workspace'];state['window']={'width':1000,'outer_width':1000,'available_width':1000,'outer_height':900,'available_height':900}
        state['trace']=[{'condition':'exact_workflow_ready','satisfied':True}]
        event=data['events'][0];event.update(runtime_revision='a'*64,manifest_sha256='b'*64,state=copy.deepcopy(state))
        self.assertTrue(audit.audit(request,data,goal.read_text())['all_assertions_passed'])
        data['events'].append({**event,'event':None,'phase':'observation_completed','operation_id':'observe',
            'outcome':{'action_key':'workspace.observe','effect_possible':False,'cleanup_complete':True}})
        data['events'].append({**event,'event':None,'phase':'verification_delivered','operation_id':'observe',
            'verification':{'action_key':'workspace.observe'}})
        self.assertTrue(audit.audit(request,data,goal.read_text())['all_assertions_passed'])
        mutated=copy.deepcopy(data);mutated['events'][-2]['outcome']['effect_possible']=True
        self.assertFalse(audit.audit(request,mutated,goal.read_text())['all_assertions_passed'])
        for mode in ['mutation','receipt','window','model']:
            bad=copy.deepcopy(data)
            if mode=='mutation':bad['calls'].append({'tool':audit.PREFIX+'dock_action_run','session_id':'agent'})
            if mode=='receipt':bad['events']=[]
            if mode=='window':bad['tools'][0]['result']['workspace']['window']['outer_width']=400
            if mode=='model':bad['reasoning_effort']='medium'
            self.assertFalse(audit.audit(request,bad,goal.read_text())['all_assertions_passed'],mode)
