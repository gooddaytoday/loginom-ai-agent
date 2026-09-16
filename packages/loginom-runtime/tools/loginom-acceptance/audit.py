#!/usr/bin/env python3
"""Independent basic-graph audit of sanitized evidence; no SQLite/model/browser."""
import argparse
import hashlib
import json
import re
import copy
from datetime import datetime
import auto_link_delete
import manual_reopen
import rename_effect
import checked_state
import upload_probe
import upload_verify
import data_pipeline
from destinations import storage_segments, render_goal
from pathlib import Path

GOAL = Path(__file__).parent / "goals/basic-graph.txt"
from evidence import PREFIX, LOCAL_TOOLS, KNOWLEDGE_TOOLS
from hermes_auth_guard import POLICY as AUTH_POLICY
from hermes_runtime_guard import POLICY as MODEL_POLICY
TOOLS = LOCAL_TOOLS | KNOWLEDGE_TOOLS
MUTATIONS = {PREFIX + name for name in ("dock_action_run", "dock_ui_action", "dock_operation_recover", "dock_artifact_upload", "dock_artifact_verify")}
EXPECTED = {
    "nodes": ["Источник", "Объединение"],
    "ports": {"Источник": ["Input_Connection[0]", "Input_Var[0]", "Output_Data[0]"],
              "Объединение": ["Input_Add", "Input_Data[0]", "Input_Data[1]", "Input_Data[2]", "Output_Data[0]"]},
    "links": ["Источник|Output_Data[0]|Объединение|Input_Data[2]"],
}


def approved_model(request,evidence):
    profile=request.get('model_profile','chatgpt-luna')
    # Legacy profiles remain readable for historical evidence only.
    reasoning = 'low' if profile == 'chatgpt-sol' else 'medium'
    if profile in ('chatgpt-sol', 'chatgpt-luna'):
        expected=('openai-codex','gpt-5.6-sol' if profile == 'chatgpt-sol' else 'gpt-5.6-luna')
        if (request.get('auth_policy') != AUTH_POLICY
                or evidence.get('auth_guard') != {'policy':AUTH_POLICY,'installed':True,'blocked_attempts':0}
                or evidence.get('auth_connection_unchanged') is not True):return False
    elif profile=='xiaomi-mimo' and request.get('goal_id')=='data-pipeline':expected=('xiaomi','mimo-v2.5')
    else:return False
    process=evidence.get('process',{});usage=process.get('usage',{})
    if 'effective_model_policy' in request:
        policy=evidence.get('effective_model_policy',{})
        expected_policy={'provider':expected[0],'model':expected[1],'reasoning_effort':reasoning,
                         'max_turns':request.get('budget',{}).get('max_turns')}
        if (request['effective_model_policy']!=MODEL_POLICY or policy.get('policy')!=MODEL_POLICY
                or policy.get('expected')!=expected_policy or policy.get('constructor_verified') is not True
                or policy.get('blocked') is not False or not isinstance(policy.get('wire_requests_verified'),int)
                or policy['wire_requests_verified']<1):return False
    return (process.get('returncode')==0 and process.get('timed_out') is False and (request.get('provider'),request.get('model'))==expected
            and (usage.get('provider'),usage.get('model'))==expected
            and request.get('reasoning_effort')==evidence.get('reasoning_effort')==reasoning)


def sha(data):
    return hashlib.sha256(data).hexdigest()


SOURCE_ROOTS = ("viking://resources/loginom-dock/sources/e2e-tests",
                "viking://resources/loginom-dock/sources/loginom-help")
READ_ROOTS = SOURCE_ROOTS + ("viking://resources/loginom-dock/sources/ai-skills",
                            "viking://agent/skills/loginom-automation")


def scoped_uri(uri, root):
    return (isinstance(uri, str) and (uri == root or uri.startswith(root + "/"))
            and not any(x in uri for x in ("%", "?", "#", "\\"))
            and not any(x in (".", "..", "") for x in uri[len("viking://"):].split("/")))


def knowledge_uris(call):
    args = call.get("arguments", {})
    if not isinstance(args, dict):
        return []
    name = call["tool"].removeprefix(PREFIX)
    value = args.get("uris") if name == "read" else args.get("target_uri") if name in ("find", "search") else args.get("uri")
    return [value] if isinstance(value, str) else value if isinstance(value, list) else []


def knowledge_scope(call):
    uris = knowledge_uris(call)
    return bool(uris) and all(any(scoped_uri(uri, root) for root in READ_ROOTS) for uri in uris)


def readable_source(value):
    # MCP read returns raw text, or a text envelope; error strings are not evidence.
    if not isinstance(value, str):
        return False
    return (len(value.strip()) >= 80 and not re.search(
        r"(?im)^(?:Error\b|\[?(?:NOT_FOUND|PERMISSION_DENIED|UNAUTHENTICATED)\b|Cannot read\b|Traceback\b)", value))


def source_body(result, uris, uri):
    if not isinstance(result, str):
        return None
    if len(uris) == 1:
        return result
    sections = re.split(r"(?m)^=== (viking://[^\n]+) ===\n", result)
    matched = [sections[i + 1] for i in range(1, len(sections) - 1, 2) if sections[i] == uri]
    return matched[0] if len(matched) == 1 else None


def knowledge_recovery_proof(evidence, pairs, check):
    tools = evidence["tools"]
    failures = [t for t in tools if t["tool"] in MUTATIONS and isinstance(t["result"], dict)
                and t["result"].get("status") in ("FAILED", "AMBIGUOUS")]
    check("knowledge_recovery_has_observed_problem", bool(failures))
    problem_row = min((t["row"] for t in failures), default=float("inf"))
    read_rows = []
    for root in SOURCE_ROOTS:
        found = []
        for t in tools:
            if t["tool"] != PREFIX + "read" or t["row"] <= problem_row:
                continue
            call = pairs[t["session_id"], t["tool_call_id"]]
            if call["row"] <= problem_row:
                continue
            uris = knowledge_uris(call)
            for uri in uris:
                if not readable_source(source_body(t["result"], uris, uri)):
                    continue
                if not scoped_uri(uri, root) or uri == root or uri.rsplit("/", 1)[-1].startswith("."):
                    continue
                # The source must first occur in a scoped discovery reply, not
                # merely in model text or an action's provenance references.
                for discovery in tools:
                    if discovery["tool"] not in KNOWLEDGE_TOOLS - {PREFIX + "read"}:
                        continue
                    lookup = pairs[discovery["session_id"], discovery["tool_call_id"]]
                    if not (problem_row < lookup["row"] < discovery["row"] < call["row"]):
                        continue
                    if not any(scoped_uri(u, root) for u in knowledge_uris(lookup)):
                        continue
                    result = discovery["result"]
                    if isinstance(result, dict) and result.get("isError"):
                        continue
                    if uri in re.findall(r"viking://[^\s\"'<>\]}) ,]+", json.dumps(result, ensure_ascii=False)):
                        found.append(t["row"])
        check("recovery_searched_and_read_" + root.rsplit("/", 1)[-1], bool(found))
        if found:
            read_rows.append(min(found))
    last_read = max(read_rows) if len(read_rows) == len(SOURCE_ROOTS) else float("inf")
    check("successful_continuation_after_source_reads", any(
        t["tool"] in MUTATIONS and isinstance(t["result"], dict)
        and t["result"].get("status") == "SUCCEEDED"
        and pairs[t["session_id"], t["tool_call_id"]]["row"] > last_read for t in tools))


def verification_proof(evidence, check):
    rows=[t for t in evidence['tools'] if isinstance(t.get('result'),dict)
          and t['result'].get('action_key') and t['result'].get('status')
          and not t['result'].get('request_rejected')]
    valid=bool(rows)
    for row in rows:
        out=row['result']; proofs=row.get('verifications',[])
        if len(proofs)!=1:
            valid=False; continue
        proof=proofs[0]; events=[e.get('event') for e in out.get('trace',[])]
        valid=valid and proof.get('kind')=='dock_outcome_verification' and proof.get('schema_version')==1
        valid=valid and proof.get('operation_id')==out.get('operation_id') and proof.get('action_key')==out.get('action_key')
        valid=valid and bool(re.fullmatch(r'[a-f0-9]{64}',proof.get('receipt_sha256','')))
        valid=valid and any(e.get('phase')=='verification_delivered' and e.get('operation_id')==out.get('operation_id')
                           and e.get('verification')==proof for e in evidence['events'])
        valid=valid and proof.get('goal')=={'state':'not_verified','obligations':[]}
        valid=valid and proof.get('settings')=={'state':'not_checked'} and proof.get('data')=={'state':'not_checked'}
        expected_kind={'node.add':'create','link.create':'create','package.save_as':'save'}.get(out['action_key'])
        state='unverified'
        if expected_kind and out.get('cleanup_complete') is True:
            if out['status']=='NOT_APPLIED':state='not_applied'
            elif out['status']=='SUCCEEDED' and 'postcondition_verified' in events:
                if expected_kind!='save' or (out['output'].get('reopened') is True and 'reopened_package_observed' in events):state='verified'
        valid=valid and proof.get('domain_effect')=={'state':state,'kind':expected_kind}
        valid=valid and proof.get('gesture')=={'state':'performed' if 'ui_gesture_applied' in events else 'not_proven'}
        ui=out.get('output',{}).get('ui'); truncated=bool(ui and any(v is True for v in ui.get('truncated',{}).values()))
        valid=valid and proof.get('observation')=={'state':'bounded' if ui else 'not_provided',
            'completeness':'truncated' if truncated else 'not_proven',
            'limitations':['visible_DOM_only','no_dataset_revision','no_full_graph_proof'] if ui else []}
    check('verification_claims_delivered_and_journal_bound',valid)


def delivered_context_proof(evidence, pairs, check):
    bundles=[]
    for t in evidence['tools']:
        if t['tool'] not in MUTATIONS or not isinstance(t['result'],dict) or t['result'].get('status') not in ('FAILED','AMBIGUOUS'):
            continue
        for context in t.get('recovery_contexts',[]):
            operation=t['result'].get('operation_id')
            if (context.get('operation_id') != operation or context.get('delivery') != 'client_automatic'
                or context.get('status') != 'complete' or context.get('version') != 1):
                continue
            sources=context.get('sources',[])
            if len(sources)!=2 or {s.get('source') for s in sources}!={'e2e','help'}:
                continue
            valid=True
            for source in sources:
                root=SOURCE_ROOTS[0 if source['source']=='e2e' else 1]
                valid=valid and scoped_uri(source.get('uri'),root) and readable_source(source.get('excerpt'))
                valid=valid and sha(source['excerpt'].encode())==source.get('excerpt_sha256')
                valid=valid and bool(re.fullmatch(r'[a-f0-9]{64}',source.get('source_sha256','')))
                if source['source']=='e2e':
                    definitions=[r['result'].get('action',{}) for r in evidence['tools'] if r['tool']==PREFIX+'dock_action_describe'
                                 and r['row']<t['row'] and isinstance(r['result'],dict)]
                    valid=valid and any(d.get('action_key')==context.get('action_key') and any(
                        source['uri']==root+'/.source/'+ref.get('path','') and source['source_sha256']==ref.get('sha256')
                        and source.get('commit')==ref.get('commit') for ref in d.get('evidence',[])) for d in definitions)
                else:
                    valid=valid and source.get('target_uri')==root and source.get('discovery') in ('scoped_find','scoped_grep')
            valid=valid and any(e.get('phase')=='knowledge_context_delivered' and e.get('operation_id')==operation
                                and e.get('context')==context for e in evidence['events'])
            if valid: bundles.append(t)
    check('failure_delivered_verified_e2e_and_help_with_journal',bool(bundles))
    check('successful_continuation_after_automatic_context',any(
        pairs[t['session_id'],t['tool_call_id']]['row']>bundle['row'] and t['tool'] in MUTATIONS
        and isinstance(t['result'],dict) and t['result'].get('status')=='SUCCEEDED'
        for bundle in bundles for t in evidence['tools']))


def receipt_before_apply(events, operation, next_operation):
    recovered = [i for i, e in enumerate(events) if e.get("phase") == "receipt_recovered"
                 and e.get("operation_id") == operation and e.get("outcome", {}).get("status") == "SUCCEEDED"
                 and e["outcome"].get("cleanup_complete") is True]
    prepared = [i for i, e in enumerate(events) if e.get("phase") == "prepared" and e.get("operation_id") == next_operation]
    return len(recovered) == len(prepared) == 1 and recovered[0] < prepared[0]


def lost_receipt_proof(request, evidence, pairs, check):
    fault = evidence["operator_fault_receipt"]
    operation = fault["operation_id"]
    actual = fault["actual_browser_reply"]
    check("lost_reply_is_real_completed_receipt", fault["fault"] == "lost_response_after_completed_browser_receipt"
          and fault["variant"] == "lost_receipt" and fault["run_id"] == request["run_id"]
          and fault["injection_reached"] is True and fault["receipt_fabricated"] is False
          and fault["original_browser_response_withheld"] is True and fault["generated_code_modified"] is False
          and bool(re.fullmatch(r"[a-f0-9]{64}", fault["source_code_sha256"]))
          and fault["source_code_sha256"] == fault["injected_code_sha256"]
          and fault["executor_source_sha256"] == request["runtime_source_pin"]["inputs"]["client/lib/executor.mjs"]
          and actual["status"] == "SUCCEEDED" and actual["cleanup_complete"] is True
          and actual["operation_id"] == operation and actual["action_key"] == "node.add")
    replies = [t for t in evidence["tools"] if t["tool"] == PREFIX + "dock_action_run"
               and t["result"].get("operation_id") == operation and t["result"].get("status") == "AMBIGUOUS"]
    check("agent_received_lost_response_ambiguity", len(replies) == 1)
    original = replies[0]
    resolved = [t for t in evidence["tools"] if t["row"] > original["row"] and t["tool"] == PREFIX + "dock_operation_inspect"
                and t["result"].get("status") == "SUCCEEDED" and t["result"].get("output", {}).get("operation_id") == operation
                and t["result"]["output"].get("state") == "resolved" and t["result"]["output"].get("cleanup_confirmed") is True
                and t["result"]["output"].get("outcome") == actual]
    recovered_replies = []
    for t in evidence["tools"]:
        if t["row"] <= original["row"] or t["tool"] != PREFIX + "dock_operation_recover":
            continue
        call = pairs[t["session_id"], t["tool_call_id"]]
        result = t["result"]
        # recover first reconciles the pending receipt. If that resolves the
        # operation, the returned original receipt adds only the caller's new
        # recovery ID; the requested repair itself was not performed.
        without_request_id = {k: v for k, v in result.items() if k != "recovery_operation_id"}
        if (call["arguments"].get("operation_id") == operation
            and result.get("recovery_operation_id") == call["arguments"].get("recovery_operation_id")
            and result.get("recovery_operation_id") not in [None, "", operation]
            and without_request_id == actual):
            recovered_replies.append(t)
    automatic = []
    for t in evidence["tools"]:
        if t["row"] <= original["row"] or t["tool"] not in MUTATIONS:
            continue
        call = pairs[t["session_id"], t["tool_call_id"]]
        observed = [o for o in evidence["tools"] if original["row"] < o["row"] < call["row"]
                    and o["tool"] == PREFIX + "dock_workspace_observe" and o["result"].get("status") == "SUCCEEDED"
                    and any(n.get("node_ref", {}).get("node_label") == actual["output"]["node_ref"]["node_label"]
                            for n in o["result"].get("output", {}).get("nodes", []))]
        if observed and receipt_before_apply(evidence["events"], operation, t["result"].get("operation_id")):
            automatic.append(t)
    check("completed_receipt_reconciled_before_continuation", bool(resolved or recovered_replies or automatic))
    recovered = [e for e in evidence["events"] if e.get("phase") == "receipt_recovered" and e.get("operation_id") == operation]
    check("journal_confirms_exact_recovered_receipt", len(recovered) == 1 and recovered[0]["outcome"] == actual)
    applies = [e for e in evidence["events"] if e.get("phase") == "prepared" and e.get("action_key") == "node.add"
               and e.get("parameters", {}).get("component_key") == "imports.text"]
    check("one_real_source_apply_despite_lost_response", len(applies) == 1 and applies[0]["operation_id"] == operation)
    source_calls = [c for c in evidence["calls"] if c["tool"] == PREFIX + "dock_action_run"
                    and c.get("arguments", {}).get("action_key") == "node.add"
                    and c["arguments"].get("parameters", {}).get("component_key") == "imports.text"]
    check("source_was_not_requested_again", len(source_calls) == 1)
    call = pairs[original["session_id"], original["tool_call_id"]]
    return call["arguments"]["parameters"]["component_key"], actual["output"]["node_ref"]["node_label"]


def partial_link_proof(request, evidence, pairs, check):
    fault=evidence['operator_fault_receipt']; actual=fault['actual_browser_reply']; operation=fault['operation_id']
    check('partial_link_real_fault_identity', fault['variant']=='partial_link'
          and fault['fault']=='remove_only_new_link_keep_added_port' and fault['run_id']==request['run_id']
          and fault['injection_reached'] is True and fault['receipt_fabricated'] is False
          and actual['status']=='AMBIGUOUS' and actual['cleanup_complete'] is True
          and actual['operation_id']==operation and actual['action_key']=='link.create'
          and fault['executor_source_sha256']==request['runtime_source_pin']['inputs']['client/lib/executor.mjs']
          and all(re.fullmatch(r'[a-f0-9]{64}',fault[k]) for k in ('source_code_sha256','injected_code_sha256'))
          and fault['source_code_sha256']!=fault['injected_code_sha256'])
    before=[t for t in actual['trace'] if t.get('event')=='operator_fault_before']
    after=[t for t in actual['trace'] if t.get('event')=='operator_fault_injected']
    check('partial_link_unique_fault_snapshots',len(before)==len(after)==1)
    before,after=before[0],after[0]
    retained=after['retained_added_port_tid']; removed=after['removed_link_tid']
    check('partial_link_only_link_removed_port_retained',before['nodes']==after['nodes'] and before['ports']==after['ports']
          and set(before['links'])-set(after['links'])=={removed}
          and set(after['links'])==set(before['baseline']['links'])
          and set(after['ports'])-set(before['baseline']['ports'])=={retained}
          and after['delta']=={'added_ports':[retained],'added_links':[]})
    originals=[t for t in evidence['tools'] if t['tool']==PREFIX+'dock_action_run' and t['result']==actual]
    check('partial_link_actual_failure_delivered',len(originals)==1 and any(
        e.get('phase')=='completed' and e.get('operation_id')==operation and e.get('outcome')==actual for e in evidence['events']))
    add_calls=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_action_run'
               and c['arguments'].get('action_key')=='link.create' and c['arguments'].get('parameters',{}).get('target_port',{}).get('kind')=='add']
    check('partial_link_no_second_input_add_request',len(add_calls)==1)
    repairs=[]
    for t in evidence['tools']:
        if t['tool']!=PREFIX+'dock_operation_recover':continue
        args=pairs[t['session_id'],t['tool_call_id']]['arguments']; outcome=t['result']
        if args.get('strategy')!='complete_link' or args.get('operation_id')!=operation:continue
        receipt={k:v for k,v in outcome.items() if k!='recovery_operation_id'}
        valid=(outcome.get('status')=='SUCCEEDED' and outcome.get('cleanup_complete') is True
               and outcome.get('recovery_operation_id')==args.get('recovery_operation_id')
               and outcome.get('operation_id')==operation
               and any(x.get('event')=='partial_link_recovery' and x.get('target_port_tid')==retained
                       and x.get('creates_port') is False for x in outcome.get('trace',[]))
               and outcome.get('output',{}).get('link_ref',{}).get('tid')==removed
               and any(e.get('phase')=='recovery_completed' and e.get('operation_id')==args.get('recovery_operation_id')
                       and e.get('outcome')==receipt for e in evidence['events']))
        if valid:repairs.append(t)
    check('partial_link_repaired_existing_port_with_journal',bool(repairs))


def position_proof(request, evidence, pairs, check):
    fault=evidence['operator_fault_receipt']; actual=fault['actual_browser_reply']; operation=fault['operation_id']
    check('position_real_fault_identity',fault['variant']=='position' and fault['fault']=='shifted_node_drop_position'
          and fault['run_id']==request['run_id'] and fault['injection_reached'] is True
          and fault['receipt_fabricated'] is False and actual['status']=='AMBIGUOUS'
          and actual['cleanup_complete'] is True and actual['operation_id']==operation
          and actual['action_key']=='node.add' and 'Created node position differs' in actual.get('error',{}).get('message','')
          and fault['executor_source_sha256']==request['runtime_source_pin']['inputs']['client/lib/executor.mjs']
          and all(re.fullmatch(r'[a-f0-9]{64}',fault[k]) for k in ('source_code_sha256','injected_code_sha256'))
          and fault['source_code_sha256']!=fault['injected_code_sha256'])
    before=[t for t in actual['trace'] if t.get('event')=='operator_fault_before']
    shifted=[t for t in actual['trace'] if t.get('event')=='operator_fault_injected']
    applies=[e for e in evidence['events'] if e.get('phase')=='prepared' and e.get('operation_id')==operation]
    check('position_unique_injection_and_apply',len(before)==len(shifted)==len(applies)==1)
    before,shifted,checkpoint=before[0],shifted[0],applies[0]['checkpoint']
    expected=shifted['expected_geometry']['svg']; observed=shifted['actual_svg']
    check('position_exact_shift_preserved_checkpoint',before['expected_geometry']==checkpoint['geometry']
          and shifted['expected_geometry']==checkpoint['geometry'] and before['graph']==checkpoint['graph']
          and before['actual_drop_point']['x']-before['expected_point']['x']==24
          and before['actual_drop_point']['y']==before['expected_point']['y']
          and observed['x']-expected['x']==24 and observed['y']==expected['y'])
    original=[t for t in evidence['tools'] if t['tool']==PREFIX+'dock_action_run' and t['result']==actual]
    check('position_actual_failure_delivered',len(original)==1 and any(e.get('phase')=='completed'
          and e.get('operation_id')==operation and e.get('outcome')==actual for e in evidence['events']))
    calls=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_action_run'
           and c['arguments'].get('action_key')=='node.add'
           and c['arguments'].get('parameters',{}).get('component_key')=='imports.text']
    check('position_source_not_created_again',len(calls)==1 and
          [n.get('label') for n in shifted['graph']['nodes']]==['Источник'] and shifted['graph']['links']==[])
    abandoned=[t for t in evidence['tools'] if t['row']>original[0]['row'] and t['tool']==PREFIX+'dock_operation_recover'
               and t['result'].get('operation_id')==operation
               and pairs[t['session_id'],t['tool_call_id']]['arguments'].get('strategy')=='abandon_operation'
               and observed_resolution(t,pairs,evidence['tools'],evidence['events'])]
    resolved=[t for t in evidence['tools'] if t['row']>original[0]['row'] and t['tool']==PREFIX+'dock_operation_inspect'
              and t['result'].get('output',{}).get('operation_id')==operation
              and t['result']['output'].get('state')=='resolved'
              and t['result']['output'].get('outcome',{}).get('status')=='SUCCEEDED'
              and any(e.get('phase')=='reconciled' and e.get('operation_id')==operation
                      and e.get('outcome')==t['result']['output']['outcome'] for e in evidence['events'])]
    check('position_explicit_resolution_before_continuation',bool(abandoned or resolved))
    call=pairs[original[0]['session_id'],original[0]['tool_call_id']]
    return call['arguments']['parameters']['component_key'],call['arguments']['parameters']['expected_label']


def observed_resolution(tool, calls, tools, events):
    """A decision receipt resolves control, never the original domain outcome."""
    if tool['tool'] != PREFIX+'dock_operation_recover':
        return False
    call=calls[tool['session_id'],tool['tool_call_id']]
    args=call.get('arguments',{}); result=tool['result']
    strategy=args.get('strategy')
    resolutions={'abandon_operation':('abandoned_after_observation','operation_abandoned'),
                 'accept_observed_state':('accepted_observed_state','observed_state_accepted')}
    if strategy not in resolutions or result.get('status')!='SUCCEEDED' or result.get('action_key')!='operation.recover':
        return False
    resolution,phase=resolutions[strategy]
    original=result.get('output',{}).get('original_outcome',{})
    operation=args.get('operation_id'); recovery=args.get('recovery_operation_id'); observation=args.get('observation_id')
    if (not operation or not recovery or recovery==operation or not observation
        or result.get('operation_id')!=operation or result.get('recovery_operation_id')!=recovery
        or result.get('output',{}).get('resolution')!=resolution or result['output'].get('goal_verified') is not False
        or original.get('operation_id')!=operation or original.get('status')!='AMBIGUOUS'
        or original.get('cleanup_complete') is not True or original.get('goal_verified') is not False
        or original.get('resolution')!=resolution or original.get('recovery_operation_id')!=recovery
        or original.get('observation_id')!=observation):
        return False
    if strategy=='accept_observed_state' and original.get('action_key')!='ui.act':
        return False
    observations=[t for t in tools if t['tool'] in (PREFIX+'dock_workspace_observe',PREFIX+'dock_ui_action')
                  and t['session_id']==tool['session_id'] and t['row']<call['row']
                  and isinstance(t['result'],dict) and t['result'].get('status')=='SUCCEEDED'
                  and t['result'].get('output',{}).get('observation_id')==observation]
    records=[e for e in events if e.get('phase')==phase and e.get('operation_id')==operation
             and e.get('outcome')==original]
    return bool(observations) and len(records)==1


def rename_proof(request, evidence, pairs, check):
    fault = evidence["operator_fault_receipt"]
    actual = fault["actual_browser_reply"]
    operation = fault["operation_id"]
    trace = [t.get("event") for t in actual["trace"]]
    check("rename_fault_after_real_drop_and_cleanup", fault["variant"] == "rename"
          and fault["fault"] == "rename_interrupted_after_real_node_drag"
          and fault["run_id"] == request["run_id"] and fault["injection_reached"] is True
          and fault["receipt_fabricated"] is False and actual["cleanup_complete"] is True
          and actual["status"] == "AMBIGUOUS" and actual["operation_id"] == operation
          and actual["action_key"] == "node.add"
          and trace.index("mouse_released") < trace.index("operator_fault_injected")
          and trace.index("component_dragged") < trace.index("operator_fault_injected")
          and fault["executor_source_sha256"] == request["runtime_source_pin"]["inputs"]["client/lib/executor.mjs"]
          and all(re.fullmatch(r"[a-f0-9]{64}", fault[k]) for k in ("source_code_sha256", "injected_code_sha256"))
          and fault["source_code_sha256"] != fault["injected_code_sha256"])
    original = [t for t in evidence["tools"] if t["tool"] == PREFIX + "dock_action_run" and t["result"] == actual]
    completed = [e for e in evidence["events"] if e.get("phase") == "completed" and e.get("operation_id") == operation]
    check("agent_and_journal_received_actual_rename_failure", len(original) == len(completed) == 1
          and completed[0]["outcome"] == actual)
    original = original[0]
    applies = [e for e in evidence["events"] if e.get("phase") == "prepared" and e.get("action_key") == "node.add"
               and e.get("parameters", {}).get("component_key") == "imports.text"]
    source_calls = [c for c in evidence["calls"] if c["tool"] == PREFIX + "dock_action_run"
                    and c["arguments"].get("action_key") == "node.add"
                    and c["arguments"].get("parameters", {}).get("component_key") == "imports.text"]
    check("rename_source_created_once", len(applies) == len(source_calls) == 1 and applies[0]["operation_id"] == operation)
    resolved = [t for t in evidence["tools"] if t["tool"] == PREFIX + "dock_operation_inspect" and t["row"] > original["row"]
                and t["result"].get("output", {}).get("operation_id") == operation
                and t["result"]["output"].get("state") == "resolved" and t["result"]["output"].get("cleanup_confirmed") is True
                and t["result"]["output"].get("outcome", {}).get("status") == "SUCCEEDED"]
    # A bound UI repair returns the same journal-backed reconciliation in its
    # recovery block; a redundant inspect call is not necessary evidence.
    for t in evidence['tools']:
        if t['tool']!=PREFIX+'dock_ui_action' or t['row']<=original['row']:continue
        recovery=t['result'].get('output',{}).get('recovery',{})
        if (t['result'].get('status')=='SUCCEEDED' and recovery.get('operation_id')==operation
            and recovery.get('state')=='resolved' and recovery.get('cleanup_confirmed') is True
            and recovery.get('outcome',{}).get('status')=='SUCCEEDED'
            and pairs[t['session_id'],t['tool_call_id']]['arguments'].get('recovery_operation_id')==operation):
            resolved.append({**t,'result':{'output':recovery}})
    abandoned=[t for t in evidence['tools'] if t['row']>original['row']
               and t['tool']==PREFIX+'dock_operation_recover'
               and pairs[t['session_id'],t['tool_call_id']]['arguments'].get('strategy')=='abandon_operation'
               and t['result'].get('operation_id')==operation
               and observed_resolution(t,pairs,evidence['tools'],evidence['events'])]
    renamed=[proof for decision in abandoned
             if (proof:=rename_effect.prove(evidence['tools'],evidence['calls'],evidence['events'],decision['row'],'Источник'))]
    check("rename_result_verified_after_ui_repair", bool(resolved or renamed))
    if not resolved:
        # Retain a failed recovery proof, but still audit the saved goal.
        call = pairs[original["session_id"], original["tool_call_id"]]
        return call["arguments"]["parameters"]["component_key"], call["arguments"]["parameters"].get("expected_label", "")
    outcome = resolved[0]["result"]["output"]["outcome"]
    repairs = [t for t in evidence["tools"] if t["tool"] == PREFIX + "dock_ui_action"
               and original["row"] < t["row"] < resolved[0]["row"] and t["result"].get("status") == "SUCCEEDED"
               and pairs[t["session_id"], t["tool_call_id"]]["arguments"].get("recovery_operation_id") == operation]
    check("bound_ui_repair_and_exact_reconciliation_receipt", bool(repairs) and any(
        e.get("phase") == "reconciled" and e.get("operation_id") == operation and e.get("outcome") == outcome for e in evidence["events"]))
    call = pairs[original["session_id"], original["tool_call_id"]]
    return call["arguments"]["parameters"]["component_key"], outcome["output"]["node_ref"]["node_label"]


def canonical(value):
    nodes = value["nodes"]
    ports = {}
    if len(set(nodes)) != len(nodes):
        raise ValueError("duplicate nodes")
    for node in value["ports"]:
        label = node["node_label"]
        if label in ports or any(not tid.startswith(label + ";") for tid in node["tids"]):
            raise ValueError("duplicate or mismatched ports")
        ports[label] = sorted(tid.split(";", 1)[1] for tid in node["tids"])
        if len(ports[label]) != len(set(ports[label])):
            raise ValueError("duplicate ports")
    if set(nodes) != set(ports) or len(set(value["links"])) != len(value["links"]):
        raise ValueError("incomplete graph")
    for link in value["links"]:
        source, output, target, inp = link.split("|")
        if output not in ports[source] or inp not in ports[target]:
            raise ValueError("missing endpoint")
    return {"nodes": sorted(nodes), "ports": ports, "links": sorted(value["links"])}


def snapshot_graph(snapshot):
    truncated = snapshot.get("ui", {}).get("truncated", {})
    if any(truncated.get(key) is not False for key in ("nodes", "ports", "links")):
        raise ValueError("graph completeness is unknown")
    nodes = []; ports = []; mappings = {}
    for node in snapshot["nodes"]:
        label = node["node_ref"]["node_label"]
        nodes.append(label); groups = {}; mapping = {}
        for port in node["ports"]:
            raw = port["tid"].split(";")[-1]
            match = re.fullmatch(r"(.+)-(\d+)", raw)
            if match:
                groups.setdefault(match[1], []).append((int(match[2]), raw))
            else:
                mapping[raw] = raw
        for kind, values in groups.items():
            if len(values) != len(set(values)):
                raise ValueError("duplicate raw ports")
            for ordinal, (_, raw) in enumerate(sorted(values)):
                mapping[raw] = f"{kind}[{ordinal}]"
        if len(mapping) != len(node["ports"]):
            raise ValueError("duplicate raw ports")
        mappings[label] = mapping
        ports.append({"node_label": label, "tids": [label + ";" + v for v in mapping.values()]})
    links = []
    for tid in snapshot["links"]:
        source, out, target, inp = tid.split(";Graph;")[-1].split("|")
        links.append("|".join([source, mappings[source][out], target, mappings[target][inp]]))
    return canonical({"nodes": nodes, "ports": ports, "links": links})


def auto_link_proof(goal, evidence, check):
    tools,calls,events=evidence['tools'],evidence['calls'],evidence['events']
    adds=[t for t in tools if t['tool']==PREFIX+'dock_action_run' and isinstance(t['result'],dict)
          and t['result'].get('action_key')=='node.add' and t['result'].get('output',{}).get('auto_created_links')]
    check('one_real_automatic_link_reported',len(adds)==1)
    added=adds[0]; result=added['result']; links=result['output']['auto_created_links']
    check('automatic_link_to_first_input_and_not_goal_claim',result['status']=='SUCCEEDED'
          and result['output'].get('goal_verified') is False and len(links)==1
          and links[0].split(';Graph;')[-1]=='Источник|Output_Data-0|Объединение|Input_Data-0'
          and any(e.get('phase')=='completed' and e.get('operation_id')==result.get('operation_id')
                  and e.get('outcome')==result for e in events))
    if goal=='auto-link-retain':
        changes=[c for c in calls if c['row']>added['row'] and c['tool'] in MUTATIONS
                 and not (c['tool']==PREFIX+'dock_action_run' and c['arguments'].get('action_key')=='package.save_as')]
        check('automatic_link_not_recreated_or_repaired',not changes)
        observations=[snapshot_graph(t['result']['output']) for t in tools if t['row']>added['row']
                      and t['tool']==PREFIX+'dock_workspace_observe']
        edge='Источник|Output_Data[0]|Объединение|Input_Data[0]'
        check('automatic_link_retained_in_observations',bool(observations) and all(g['links']==[edge] for g in observations))
    else:
        def graph(snapshot):
            value=copy.deepcopy(snapshot)
            # The legacy adapter reconstructs only journal checkpoints without UI.
            # Tool observations retain their actual completeness flags.
            if 'ui' not in value:
                value['ui']={'truncated':{'nodes':False,'ports':False,'links':False}}
            return snapshot_graph(value)
        proof=auto_link_delete.prove(tools,calls,events,added['row'],
            'Источник|Output_Data[0]|Объединение|Input_Data[0]',graph,canonical)
        check('automatic_link_removed_by_bound_ui_preserving_nodes_ports',proof is not None)


def bootstrap_proof(evidence, check):
    calls=evidence['calls'];tools=evidence['tools']
    prepare_rows=[c['row'] for c in calls if c['tool']==PREFIX+'dock_prepare']
    first_prepare=min(prepare_rows,default=-1)
    reads=[t for t in tools if t['tool']==PREFIX+'dock_workspace_observe'
           and isinstance(t.get('result'),dict) and t['result'].get('output',{}).get('bootstrap') is True
           and t['row']<first_prepare]
    valid=[]
    for t in reads:
        r=t['result'];o=r['output']
        bound=any(c.get('tool_call_id')==t.get('tool_call_id') and c['tool']==t['tool']
                  and c.get('arguments')=={'scope':'bootstrap'} and c['row']<t['row'] for c in calls)
        if (bound and r.get('status')=='SUCCEEDED' and r.get('effect_possible') is False
            and r.get('cleanup_complete') is True and o.get('observation_only') is True
            and o.get('target_state') in ('not_open','incompatible_or_loading','indeterminate','login_required','blocked','ready_for_prepare')
            and not any(k in o for k in ('ui','nodes','links','observation_id'))):valid.append(t)
    check('bootstrap_read_before_prepare',bool(valid))
    diagnostics=[t for t in tools if t['tool']==PREFIX+'dock_diagnostics' and isinstance(t.get('result'),dict)
                 and any(b['row']<t['row']<first_prepare for b in valid)]
    check('bootstrap_did_not_activate_workspace_or_archive',bool(diagnostics) and all(
        t['result'].get('archiveActive') is False and t['result'].get('workspaceReady') is not True
        and t['result'].get('archive') is None for t in diagnostics)
        and not any(c['tool'] in MUTATIONS and c['row']<first_prepare for c in calls))


def scroll_receipt_bound(call, target, evidence):
    action=call.get('arguments',{}).get('action',{});before=target.get('scroll',{})
    delta=action.get('delta_y')
    if type(delta) is not int or not 0<abs(delta)<=1000 or 'scroll' not in target.get('allowed_actions',[]):return False
    if any(type(before.get(k)) not in (int,float) for k in ('top','max_top')):return False
    expected=max(0,min(before['max_top'],before['top']+delta))
    if expected==before['top']:return False
    replies=[t for t in evidence['tools'] if t.get('tool_call_id')==call.get('tool_call_id') and t['row']>call['row']]
    if len(replies)!=1:return False
    result=replies[0].get('result',{})
    if result.get('status')!='SUCCEEDED' or result.get('cleanup_complete') is not True:return False
    if not any(t.get('event')=='ui_scroll_applied' and t.get('owner_ref')==before.get('ref')
               and t.get('from')==before['top'] and t.get('to')==expected for t in result.get('trace',[])):return False
    return any(e.get('phase')=='completed' and e.get('operation_id')==result.get('operation_id')
               and rename_effect.journal_equal(e.get('outcome',{}),result) for e in evidence.get('events',[]))


def _idle_request_refusal(r):
    if not isinstance(r,dict) or not isinstance(r.get('output'),dict) or not isinstance(r['output'].get('operation'),dict):return False
    operation=r['output']['operation']
    return (r.get('request_rejected') is True and r.get('effect_possible') is False
            and r.get('status')=='FAILED' and r.get('phase')=='request_rejected' and r.get('action_key')=='request.validate'
            and r.get('operation_id') is None and r.get('trace')==[] and isinstance(r.get('error'),dict)
            and r['error'].get('code')=='REQUEST_REJECTED' and operation.get('operation_id') is None
            and operation.get('state')=='idle' and operation.get('cleanup_confirmed') is True
            and operation.get('effect_state')=='none')


def _later_upload_journal(call, rejected_reply, evidence, operation_id, records):
    """A rejected ID can be used later; prove a fresh idle boundary first.

    This narrow exception covers one actual upload after ordered pre-dispatch
    refusals. Unknown, earlier or duplicate operation effects remain rejected.
    """
    if call.get('tool') != PREFIX+'dock_artifact_upload':return False
    peers=[c for c in evidence.get('calls',[]) if c.get('tool')==call['tool']
           and c.get('arguments',{}).get('operation_id')==operation_id]
    if len(peers)<2 or sum(c==call for c in peers)!=1:return False
    if any(c.get('session_id')!=call.get('session_id') or type(c.get('row')) is not int for c in peers):return False
    peers=sorted(peers,key=lambda c:c['row'])
    if len({c.get('tool_call_id') for c in peers})!=len(peers):return False
    previous_reply=-1;bound=[]
    for peer in peers:
        replies=[t for t in evidence['tools'] if (t.get('session_id'),t.get('tool_call_id'))
                 ==(peer.get('session_id'),peer.get('tool_call_id'))]
        if (len(replies)!=1 or replies[0].get('tool')!=peer['tool'] or type(replies[0].get('row')) is not int
                or not previous_reply<peer['row']<replies[0]['row']):return False
        bound.append(replies[0]);previous_reply=replies[0]['row']
    if any(not _idle_request_refusal(reply.get('result')) for reply in bound[:-1]):return False
    # Every attempted request before the sole effect is independently refused.
    # The common idle boundary must follow the final refusal, not just this one.
    later=peers[-1];outcome=bound[-1].get('result',{})
    last_refusal_row=bound[-2]['row']
    if call==later or later['row']<=rejected_reply['row']:return False
    completed=[e for e in records if e.get('phase')=='completed']
    if (not isinstance(outcome,dict) or outcome.get('operation_id')!=operation_id
            or outcome.get('action_key')!='artifact.upload' or outcome.get('request_rejected')
            or len(completed)!=1 or not rename_effect.journal_equal(completed[0].get('outcome',{}),outcome)):
        return False
    from settings_evidence import bound_receipts
    for receipt in bound_receipts(evidence,PREFIX):
        boundary=receipt['call']
        if (boundary.get('tool')!=PREFIX+'dock_workspace_observe' or boundary.get('session_id')!=call.get('session_id')
                or not last_refusal_row<boundary['row']<receipt['reply_row']<later['row']):continue
        state=receipt['delivered'].get('output',{}).get('operation',{})
        if (state.get('state')!='idle' or state.get('operation_id') is not None
                or state.get('cleanup_confirmed') is not True or state.get('effect_state')!='none'):continue
        anchors=[e for e in evidence.get('events',[]) if e.get('phase')=='observation_completed'
                 and e.get('operation_id')==receipt['outcome'].get('operation_id')]
        if len(anchors)!=1 or not anchors[0].get('session_id'):continue
        try:
            stamp=datetime.fromisoformat(anchors[0]['recorded_at'])
            if stamp.tzinfo is None:continue
            if all(e.get('session_id')==anchors[0]['session_id']
                   and datetime.fromisoformat(e['recorded_at'])>stamp for e in records):return True
        except (KeyError,TypeError,ValueError):continue
    return False


def rejected_before_browser(call, evidence):
    operation_id=call.get('arguments',{}).get('operation_id')
    if not isinstance(operation_id,str) or not operation_id:return False
    replies=[t for t in evidence['tools'] if (t.get('session_id'),t.get('tool_call_id'))
             ==(call.get('session_id'),call.get('tool_call_id'))]
    if len(replies)!=1 or replies[0].get('row',-1)<=call.get('row',-1) or replies[0].get('tool')!=call.get('tool'):return False
    if not _idle_request_refusal(replies[0].get('result')):return False
    records=[e for e in evidence.get('events',[]) if e.get('operation_id')==operation_id]
    return not records or _later_upload_journal(call,replies[0],evidence,operation_id,records)


def palette_inventory(evidence, checks, require_scroll=False):
    def check(name, passed):checks.append({'name':name,'passed':bool(passed)})
    snapshots=[(t['row'],t['result']['output']) for t in evidence['tools']
               if isinstance(t.get('result'),dict) and isinstance(t['result'].get('output'),dict)
               and isinstance(t['result']['output'].get('ui'),dict)]
    check('palette_has_observation',bool(snapshots))
    mutations=[c for c in evidence['calls'] if c['tool'] in MUTATIONS and not rejected_before_browser(c,evidence)]
    graph_reads=[row for row,s in snapshots if s.get('nodes')==[] and s.get('links')==[]
                 and all(s.get('ui',{}).get('truncated',{}).get(k) is False for k in ('nodes','ports','links'))
                 and s.get('page',{}).get('scope','all') in ('all','graph')]
    check('draft_graph_remained_empty',bool(graph_reads)
          and all(s.get('nodes')==[] and s.get('links')==[] for _,s in snapshots)
          and (not mutations or min(graph_reads)<min(c['row'] for c in mutations)
               and max(graph_reads)>max(c['row'] for c in mutations)))
    revisions={}; consistent=True
    for _,s in snapshots:
        if 'page' not in s:continue
        identity=s.get('observation_id'); rev=s.get('observation_revision')
        consistent=consistent and isinstance(rev,str) and bool(re.fullmatch(r'[a-f0-9]{64}',rev))
        if identity in revisions:consistent=consistent and revisions[identity]==rev
        revisions[identity]=rev
    check('observation_pages_have_consistent_revision',consistent)
    groups={}; components={}; valid=True; verified_scrolls=[]
    pattern=r'^MF;TF(?:-\d+)?;ModelForm;colVendors_Компоненты>([^;]+);(TreeText|TreeExpander)$'
    for row,snapshot in snapshots:
        for item in snapshot['ui'].get('elements',[]):
            match=re.fullmatch(pattern,item.get('tid') or '')
            if not match:continue
            path=match[1].split('>')
            if len(path)==1:groups[path[0]]=item.get('label') or path[0]
            elif match[2]=='TreeText':components[match[1]]={'group_id':path[0],'component_id':'>'.join(path[1:]),
                'label':item.get('label'),'tid':item['tid'],'observed_at_row':row}
    for call in mutations:
        args=call.get('arguments',{});action=args.get('action',{})
        previous_mutation=max((c['row'] for c in mutations if c['row']<call['row']),default=-1)
        targets=[e for row,s in snapshots if previous_mutation<row<call['row']
                 and s.get('observation_id')==args.get('observation_id')
                 for e in s['ui'].get('elements',[]) if e.get('ref')==action.get('ref')]
        target=targets[0] if targets and all(e==targets[0] for e in targets) else None
        match=re.fullmatch(pattern,target.get('tid') or '') if target else None
        scrolling=action.get('verb')=='scroll'
        valid=valid and call['tool']==PREFIX+'dock_ui_action' and action.get('verb') in ('click','double_click','scroll')
        valid=valid and bool(match) and (scrolling or '>' not in match[1])
        if scrolling:
            proved=bool(target) and scroll_receipt_bound(call,target,evidence)
            valid=valid and proved
            if proved:verified_scrolls.append(call)
    check('only_observed_palette_groups_interacted_with',valid)
    if require_scroll:check('palette_scroll_down_and_up_bound_to_browser_receipts',
                            any(c['arguments']['action']['delta_y']>0 for c in verified_scrolls)
                            and any(c['arguments']['action']['delta_y']<0 for c in verified_scrolls))
    check('component_names_observed',bool(components) and all(c['label'] for c in components.values()))
    return {'schema_version':1,'kind':'independent_palette_observation_audit','assertions':checks,
            'all_assertions_passed':bool(checks) and all(c['passed'] for c in checks),
            'inventory':{'groups':groups,'components':list(components.values()),'complete':False},
            'limitations':['Observed palette entries only; hidden, virtualized or unexpanded entries may be absent.',
                           'This proves constrained collection, not complete component/mode coverage or licensing.']}


def file_storage_inspect(evidence, checks, destination):
    """Narrow live destination evidence, never upload/no-overwrite acceptance."""
    def check(name, passed):
        checks.append({'name':name,'passed':bool(passed)})
    path_names=storage_segments(destination)
    path_tids={re.sub(r'\s','_',name).replace(',','') for name in path_names}
    calls=evidence['calls'];tools=evidence['tools'];events=evidence['events']
    def reply_for(call):
        found=[t for t in tools if t['session_id']==call['session_id'] and t['tool_call_id']==call['tool_call_id']
               and t['tool']==call['tool'] and t['row']>call['row']]
        return found[0] if len(found)==1 else None
    def bound(reply):
        matching=[c for c in calls if c['session_id']==reply['session_id'] and c['tool_call_id']==reply['tool_call_id'] and c['tool']==reply['tool'] and c['row']<reply['row']]
        if len(matching)!=1:return False
        result=reply['result']
        is_read=reply['tool']==PREFIX+'dock_workspace_observe'
        phase='observation_completed' if is_read else 'completed'
        records=[e for e in events if e.get('phase')==phase and e.get('operation_id')==result.get('operation_id')]
        comparable=copy.deepcopy(result)
        if is_read:
            operation=comparable.get('output',{}).pop('operation',None)
            idle={'operation_id':None,'state':'idle','cleanup_confirmed':True,'effect_state':'none','recovery_options':[],
                  'next_steps':[{'tool':'dock_workspace_observe','arguments':{},'required_fields':[],
                                 'requires':[],'provides':['observation_id','fresh_ui_refs']}],'outcome_summary':None}
            if operation!=idle:return False
        return bool(result.get('operation_id')) and len(records)==1 and rename_effect.journal_equal(records[0].get('outcome',{}),comparable)
    navigation=[]
    for call in calls:
        if call['tool'] not in MUTATIONS:continue
        reply=reply_for(call)
        if reply and rejected_before_browser(call,evidence):continue
        args=call.get('arguments',{});action=args.get('action',{})
        observations=[t for t in tools if t['session_id']==call['session_id'] and t['row']<call['row']
                      and isinstance(t['result'],dict) and t['result'].get('output',{}).get('observation_id')==args.get('observation_id')]
        targets=[item for t in observations for item in t['result'].get('output',{}).get('ui',{}).get('elements',[])
                 if item.get('ref')==action.get('ref')]
        tids={item.get('tid') for item in targets}
        tid=next(iter(tids)) if len(tids)==1 else ''
        allowed=(action.get('verb')=='click' and tid=='MF;cntMain;tlbMainToolbar;btnFilestorage'
                 or action.get('verb')=='double_click' and bool(re.fullmatch(r'MF;TF(?:-\d+)?;FileStorageForm;colName_.+',tid or ''))
                 and tid.split(';FileStorageForm;colName_',1)[1] in path_tids
                 and any(item.get('label') in path_names for item in targets))
        result=reply['result'] if reply else {}
        if action.get('verb')=='click' and not allowed and len(targets)==1:
            # A selection is not a directory transition. Require both bound
            # observations, the same folder incarnation and an unchanged path.
            target=targets[0]
            pre_pages=[t for t in observations if target in t['result'].get('output',{}).get('ui',{}).get('elements',[])]
            pre=pre_pages[0]['result'].get('output',{}) if len(pre_pages)==1 else {}
            post=result.get('output',{})
            before=pre.get('file_storage',{})
            after=post.get('file_storage',{})
            matched=[t for t in post.get('ui',{}).get('elements',[]) if t.get('ref')==target.get('ref')]
            entry=target.get('storage_entry',{})
            directory=before.get('directory')
            folder_path=directory.rstrip('/')+'/'+str(target.get('label','')) if isinstance(directory,str) else ''
            allowed=(len(pre_pages)==1 and bound(pre_pages[0])
                     and bool(re.fullmatch(r'MF;TF(?:-\d+)?;FileStorageForm;colName_.+',tid or ''))
                     and tid.split(';FileStorageForm;colName_',1)[1] in path_tids
                     and target.get('label') in path_names
                     and bool(folder_path) and (destination==folder_path or destination.startswith(folder_path+'/'))
                     and before.get('status')=='observed' and before.get('source')=='visible_breadcrumbs'
                     and bool(before.get('navigation_identity')) and before==after
                     and all(pre.get(k) is not None and pre.get(k)==post.get(k)
                             for k in ('origin','loginom_build','workflow_ref','active_tab_ref'))
                     and entry.get('kind')=='folder' and bool(entry.get('row_ref'))
                     and len(matched)==1 and matched[0].get('identity')==target.get('identity')
                     and matched[0].get('tid')==tid and matched[0].get('label')==target.get('label')
                     and matched[0].get('storage_entry')=={**entry,'selected':True})
        trace=result.get('trace',[])
        epoch_refusal=(result.get('status')=='NOT_APPLIED' and result.get('phase')=='preconditions'
                       and result.get('effect_possible') is False and result.get('cleanup_complete') is True
                       and (result.get('error') or {}).get('code')=='UI_EPOCH_CHANGED'
                       and any(t.get('event')=='ui_action_failed' and t.get('code')=='UI_EPOCH_CHANGED' for t in trace)
                       and all(t.get('event') in ('ui_observation_started','ui_preconditions_verified','ui_action_failed') for t in trace))
        navigation.append(call['tool']==PREFIX+'dock_ui_action' and (allowed or epoch_refusal) and reply is not None
                          and (result.get('status')=='SUCCEEDED' or epoch_refusal) and bound(reply))
    check('only_observed_file_storage_navigation',bool(navigation) and all(navigation))
    reads=[t for t in tools if t['tool']==PREFIX+'dock_workspace_observe' and t['result'].get('status')=='SUCCEEDED'
           and t['result'].get('output',{}).get('file_storage',{}).get('status')=='observed']
    last=max(reads,key=lambda t:t['row']) if reads else None
    directory=last['result']['output']['file_storage'] if last else {}
    check('delivered_directory_matches_destination',directory.get('directory')==destination
          and directory.get('source')=='visible_breadcrumbs' and bool(directory.get('navigation_identity'))
          and directory.get('listing_complete') is False)
    check('directory_has_immutable_browser_receipt',last is not None and bound(last))
    check('no_actions_after_directory_read',last is not None and not any(c['tool'] in MUTATIONS and c['row']>last['row'] for c in calls))
    return {'all_assertions_passed':all(c['passed'] for c in checks),'assertions':checks,
            'goal':'file-storage-inspect','directory':directory,
            'limitations':['Destination UI observation only; no upload, server byte proof or filename absence proof.']}


def audit(request, evidence, prompt):
    checks = []
    def check(name, passed):
        checks.append({"name": name, "passed": bool(passed)})
    try:
        run_id = request["run_id"]
        # Schema 1 is the historical fixed fixture; new schema 2 runs require
        # an explicit destination and never infer it from Loginom/OS usernames.
        destination=request.get('storage_directory') if request.get('schema_version')==2 else '/user/data'
        storage_segments(destination)
        path = destination + "/packages/Dock-acceptance-" + run_id + ".lgp"
        check("run_identity_and_owned_package", bool(re.fullmatch(r"\d{8}-\d{6}-[a-f0-9]{8}", run_id))
              and evidence["run_id"] == run_id and request["package_path"] == path)
        goal_id=request.get('goal_id','basic-graph')
        if goal_id not in ('prepare-workspace','basic-graph','auto-link-retain','auto-link-remove','palette-inventory','checkbox-roundtrip','context-menu-checkbox','root-checkbox','file-storage-inspect','file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip'):
            raise ValueError('Unsupported goal')
        goal=GOAL.with_name(goal_id+'.txt')
        expected=copy.deepcopy(EXPECTED)
        if goal_id=='auto-link-retain':
            expected['ports']['Объединение'].remove('Input_Data[2]')
            expected['links']=['Источник|Output_Data[0]|Объединение|Input_Data[0]']
        expected_prompt=upload_probe.prompt(goal.read_text(),path,destination,run_id) if goal_id in ('file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip') else render_goal(goal.read_text(),path,destination)
        if goal_id=='data-pipeline':
            expected_prompt=data_pipeline.prompt(goal.read_text(),path,destination,run_id)
        check("original_goal_only_prompt", prompt == expected_prompt
              and request["goal_sha256"] == sha(goal.read_bytes()))
        check("approved_model_completed", approved_model(request,evidence))
        check("source_unchanged", evidence["runtime_source_unchanged"] is True)
        check("harness_unchanged", evidence["harness_unchanged"] is True)
        if goal_id == 'prepare-workspace':
            from prepare_binding import verified_prepare_v1
            sessions = {c.get('session_id') for c in evidence['calls']}
            prepared = verified_prepare_v1(evidence,PREFIX,next(iter(sessions)) if len(sessions)==1 else None,10**12)
            check('exact_owned_draft_receipt', prepared is not None)
            check('no_unrequested_mutations', all(c.get('tool') in {PREFIX+'dock_prepare', PREFIX+'dock_workspace_observe',
                  PREFIX+'dock_action_describe', PREFIX+'dock_diagnostics', *KNOWLEDGE_TOOLS} for c in evidence['calls']))
            observed = {e.get('operation_id') for e in evidence['events'] if e.get('phase')=='observation_completed'
                        and e.get('outcome',{}).get('action_key')=='workspace.observe'
                        and e.get('outcome',{}).get('effect_possible') is False
                        and e.get('outcome',{}).get('cleanup_complete') is True}
            check('no_execution_operations', all(e.get('event') == 'workspace_prepared'
                  or e.get('phase')=='observation_completed' and e.get('operation_id') in observed
                  or e.get('phase')=='verification_delivered' and e.get('operation_id') in observed
                     and e.get('verification',{}).get('action_key')=='workspace.observe' for e in evidence['events']))
            check('no_fault_injection', request.get('fault_injection') is False)
            check('sol_low_profile',request.get('model_profile')=='chatgpt-sol')
            if prepared:
                state=prepared['workspace'];window=state.get('window',{})
                check('actual_catalog_pin', prepared['executor']['session_manifest']['actionManifestDigest']==request['manifest_sha256'])
                check('actual_journal_pins',all(e.get('runtime_revision')==request['runtime_source_pin']['client_revision']
                      and e.get('session_id')==prepared['sessionId'] and e.get('manifest_sha256')==request['manifest_sha256'] for e in evidence['events']))
                check('maximized_visible_window',abs(window.get('outer_width',0)-window.get('available_width',10000))<=8
                      and abs(window.get('outer_height',0)-window.get('available_height',10000))<=8 and window.get('width',0)>800)
                check('named_workspace_wait',any(t.get('condition')=='exact_workflow_ready' and t.get('satisfied') is True for t in state.get('trace',[])))
            return {'all_assertions_passed':all(c['passed'] for c in checks),'assertions':checks,'goal':goal_id}
        variant = request["fault_injection"]
        check("supported_predeclared_variant", variant is False or variant in ("lost_receipt", "rename", "partial_link", "position", "save_reopen"))
        if variant=='save_reopen':
            fault=evidence['operator_fault_receipt'];actual=fault['actual_browser_reply']
            check('save_reopen_fault_is_real_closed_package',request.get('allow_manual_reopen') is True
                  and fault['variant']=='save_reopen' and fault['run_id']==request['run_id']
                  and fault['injection_reached'] is True and fault['receipt_fabricated'] is False
                  and fault['executor_source_sha256']==request['runtime_source_pin']['inputs']['client/lib/executor.mjs']
                  and actual['status']=='AMBIGUOUS' and actual['cleanup_complete'] is True
                  and actual['action_key']=='package.save_as' and actual['operation_id']==fault['operation_id']
                  and any(t.get('event')=='saved_package_closed' for t in actual['trace'])
                  and any(t.get('event')=='operator_reopen_interrupted' for t in actual['trace'])
                  and all(re.fullmatch(r'[a-f0-9]{64}',fault[k]) for k in ('source_code_sha256','injected_code_sha256'))
                  and fault['source_code_sha256']!=fault['injected_code_sha256']
                  and any(t['result']==actual for t in evidence['tools'] if t['tool']==PREFIX+'dock_action_run'))
        check("goal_fault_combination_supported", goal_id=="basic-graph" or variant is False)
        if variant is False:
            check("no_fault_in_basic_goal", evidence.get("operator_fault_receipt") is None)
        tools = evidence["tools"]; calls = evidence["calls"]; events = evidence["events"]
        check('upload_only_in_declared_probe',goal_id in ('file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip') or not any(c['tool'] in (PREFIX+'dock_artifact_upload',PREFIX+'dock_artifact_verify') for c in calls))
        check("nonempty_complete_export", tools and calls and events and evidence["export_complete"] is True)
        check("only_supported_dock_tools", all(c["tool"] in TOOLS | {"tool_search", "tool_describe"} for c in calls)
              and all(t["tool"] in TOOLS for t in tools))
        check("one_hermes_session", len({t["session_id"] for t in tools} | {c["session_id"] for c in calls}) == 1)
        pairs = {(c["session_id"], c["tool_call_id"]): c for c in calls}
        replies = {(t["session_id"], t["tool_call_id"]): t for t in tools}
        check("every_dock_call_has_one_matching_reply", len(pairs) == len(calls) and len(replies) == len(tools)
              and all((c["session_id"], c["tool_call_id"]) in replies for c in calls if c["tool"] in TOOLS)
              and all((t["session_id"], t["tool_call_id"]) in pairs
                      and pairs[t["session_id"], t["tool_call_id"]]["row"] < t["row"]
                      and pairs[t["session_id"], t["tool_call_id"]]["tool"] == t["tool"] for t in tools))
        check("knowledge_access_is_scoped", all(knowledge_scope(c) for c in calls if c["tool"] in KNOWLEDGE_TOOLS))
        if request.get("native_skill"):
            check("pinned_native_skill_unchanged", evidence.get("native_skill_unchanged") is True
                  and request["native_skill"]["sha256"] == request["runtime_source_pin"]["inputs"].get(request["native_skill"]["source"]))
        if request.get("require_verification"):
            verification_proof(evidence, check)
        if request.get("require_delivered_context"):
            delivered_context_proof(evidence, pairs, check)
        if request.get("require_knowledge_recovery"):
            knowledge_recovery_proof(evidence, pairs, check)
        prepared = [t for t in tools if t["tool"] == PREFIX + "dock_prepare" and t["result"].get("prepared") is True]
        check("one_clean_dock_session", len(prepared) == 1 and prepared[0]["result"]["workspace"]["created_draft"] is True)
        prepared = prepared[0]["result"]
        check("actual_catalog_pin", prepared["executor"]["session_manifest"]["actionManifestDigest"] == request["manifest_sha256"])
        revision = request["runtime_source_pin"]["client_revision"]
        check("actual_journal_pins", bool(re.fullmatch(r"[a-f0-9]{64}", revision)) and all(
            e["runtime_revision"] == revision and e["manifest_sha256"] == request["manifest_sha256"]
            and e["session_id"] == prepared["sessionId"] for e in events))
        if goal_id in ('data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip'):
            return data_pipeline.audit(evidence,checks,request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
        if goal_id=='file-upload-verify':
            return upload_verify.audit(evidence,checks,request,PREFIX,MUTATIONS,file_storage_inspect)
        if goal_id=='file-upload-probe':
            return upload_probe.audit(evidence,checks,request,PREFIX,MUTATIONS,file_storage_inspect)
        if goal_id=='file-storage-inspect':
            return file_storage_inspect(evidence, checks, destination)
        if goal_id=='palette-inventory':
            bootstrap_proof(evidence, check)
            return palette_inventory(evidence, checks, require_scroll=True)
        if goal_id in ('checkbox-roundtrip','context-menu-checkbox','root-checkbox'):
            return checked_state.audit_goal(evidence, checks, PREFIX, MUTATIONS, require_menu=goal_id=='context-menu-checkbox', require_root=goal_id=='root-checkbox',
                                            rejected_before_browser=rejected_before_browser)
        successful_adds = [t for t in tools if t["tool"] == PREFIX + "dock_action_run"
                           and t["result"].get("action_key") == "node.add" and t["result"].get("status") == "SUCCEEDED"]
        components = []
        for t in successful_adds:
            args = pairs[t["session_id"], t["tool_call_id"]]["arguments"]["parameters"]
            components.append((args["component_key"], t["result"]["output"]["node_ref"]["node_label"]))
        if variant == "lost_receipt":
            components.append(lost_receipt_proof(request, evidence, pairs, check))
        elif variant == "rename":
            components.append(rename_proof(request, evidence, pairs, check))
        elif variant == "position":
            components.append(position_proof(request, evidence, pairs, check))
        elif variant == "partial_link":
            partial_link_proof(request, evidence, pairs, check)
        check("actual_requested_components", sorted(components) == sorted([
            ("imports.text", "Источник"), ("transform.union_data", "Объединение")]))
        saves = [t for t in tools if t["tool"] == PREFIX + "dock_action_run" and t["result"].get("action_key") == "package.save_as"
                 and t["result"].get("status") == "SUCCEEDED" and t["result"].get("cleanup_complete") is True]
        manual = None
        if not saves and request.get('allow_manual_reopen'):
            manual=manual_reopen.prove(tools,calls,events,path,snapshot_graph)
        if manual:
            save=next(t for t in tools if t['row']==manual['save_row'])
            outcome=save['result']
            decision=next(t for t in tools if t['tool']==PREFIX+'dock_operation_recover'
                          and pairs[t['session_id'],t['tool_call_id']]['row']==manual['abandon_call_row'])
            check('manual_reopen_bound_abandon', observed_resolution(decision,pairs,tools,events))
            args=pairs[save['session_id'],save['tool_call_id']]['arguments']['parameters']
            check('manual_reopen_original_path',args['path']==path)
            before=canonical(manual['checkpoint_graph']);after=snapshot_graph(manual['final_snapshot'])
            check('exact_goal_graph_before_and_after',before==after==expected)
            check('manual_reopen_original_remains_ambiguous',outcome['status']=='AMBIGUOUS' and outcome['cleanup_complete'] is True)
            proof_row=manual['final_observation_row']
        else:
            check("successful_save_receipt_present", len(saves) == 1)
            save = saves[0]; outcome = save["result"]; trace = outcome["trace"]
            args = pairs[save["session_id"], save["tool_call_id"]]["arguments"]["parameters"]
            check("exact_saved_path", args["path"] == path and outcome["output"]["package_ref"]["path"] == path
                  and outcome["output"]["reopened"] is True)
            requested = [i for i, e in enumerate(trace) if e.get("event") == "save_requested" and e.get("path") == path]
            closed = [i for i, e in enumerate(trace) if e.get("event") == "saved_package_closed"]
            reopened = [(i, e) for i, e in enumerate(trace) if e.get("event") == "reopened_package_observed"]
            check("actual_save_close_reopen_order", len(requested) == len(closed) == len(reopened) == 1
                  and requested[0] < closed[0] < reopened[0][0])
            reopened = reopened[0][1]
            check("actual_reopened_path", reopened["requested_path"] == reopened["actual_path"] == path)
            checkpoint = [e for e in events if e.get("phase") == "prepared" and e.get("action_key") == "package.save_as"
                          and e.get("operation_id") == outcome["operation_id"]]
            check("exact_save_preflight_present", len(checkpoint) == 1)
            checkpoint = checkpoint[0]["checkpoint"]
            before = canonical(checkpoint["graph"]); after = canonical(reopened["graph"])
            check("exact_goal_graph_before_and_after", checkpoint["path"] == path and before == after == expected)
            proof_row=save['row']
        if goal_id != "basic-graph":
            auto_link_proof(goal_id,evidence,check)
        complete = [e for e in events if e.get("phase") == "completed" and e.get("operation_id") == outcome["operation_id"]]
        check("save_reply_matches_journal", len(complete) == 1 and complete[0]["outcome"] == outcome)
        check("no_mutation_after_saved_proof", not any(c["row"] > proof_row and c["tool"] in MUTATIONS for c in calls))
        # An optional later graph may corroborate, but may never replace the
        # actual save preflight/reopen proof or contradict it.
        for t in tools:
            if t["row"] > proof_row and t["tool"] == PREFIX + "dock_workspace_observe":
                snapshot = t["result"]["output"]
                check("later_observation_matches_saved_goal", snapshot["package_identity"]["path"] == path
                      and snapshot_graph(snapshot) == after)
        # Unknown effects must not be retried under a new ID. A resolved receipt
        # or explicit recovery is required before another independent action.
        pending = None
        for t in sorted(tools, key=lambda t: t["row"]):
            if t["tool"] not in LOCAL_TOOLS:
                continue
            result = t["result"]
            call = pairs[t["session_id"], t["tool_call_id"]]
            if pending and receipt_before_apply(events, pending, result.get("operation_id")):
                pending = None
            if pending and t['tool']==PREFIX+'dock_ui_action' and result.get('status')=='SUCCEEDED':
                recovery=result.get('output',{}).get('recovery',{})
                receipt=recovery.get('outcome',{})
                if (call['arguments'].get('recovery_operation_id')==pending
                    and recovery.get('operation_id')==pending and recovery.get('state')=='resolved'
                    and recovery.get('cleanup_confirmed') is True and receipt.get('status')=='SUCCEEDED'
                    and receipt.get('cleanup_complete') is True
                    and any(e.get('phase')=='reconciled' and e.get('operation_id')==pending and e.get('outcome')==receipt for e in events)):
                    pending=None
            if pending and t["tool"] == PREFIX + "dock_action_run" and not result.get("request_rejected"):
                check("no_apply_after_unknown_effect", False)
            if t["tool"] in {PREFIX + "dock_operation_inspect", PREFIX + "dock_operation_recover"}:
                inspected = (t["tool"] == PREFIX + "dock_operation_inspect" and result.get("output", {}).get("state") == "resolved"
                             and result["output"].get("cleanup_confirmed") is True)
                recovered = t["tool"] == PREFIX + "dock_operation_recover" and (result.get("cleanup_complete") is True
                    or observed_resolution(t, pairs, tools, events))
                bound = call["arguments"].get("operation_id") == pending or (
                    inspected and "operation_id" not in call["arguments"] and result["output"].get("operation_id") == pending)
                if result.get("status") == "SUCCEEDED" and (inspected or recovered) and bound:
                    pending = None
            elif t["tool"] in MUTATIONS and result.get("status") == "AMBIGUOUS" and not result.get("request_rejected"):
                pending = result.get("operation_id") or "unknown"
        check("no_unresolved_effect_at_finish", pending is None)
    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
        check("evidence_structure_and_required_proofs", False)
    return {"schema_version": 1, "kind": "independent_basic_graph_audit", "assertions": checks,
            "all_assertions_passed": bool(checks) and all(c["passed"] for c in checks),
            "limitations": ["Source runtime only; no bundle/native admission.",
                            "Only the fixed two-node graph goal is supported; data/execution were not requested.",
                            "Only no-fault, lost_receipt, rename, partial_link, position and save_reopen variants; manual UI reopen requires an explicit predeclared contract.",
                            "Export hashes prove integrity, not authenticity against an untrusted operator."]}


def audit_directory(run):
    request_bytes = (run / "request.json").read_bytes()
    evidence_bytes = (run / "evidence.json").read_bytes()
    prompt_bytes = (run / "scenario.txt").read_bytes()
    request = json.loads(request_bytes)
    if request.get('goal_id') == 'node-apply-complete':
        from node_apply_acceptance import audit_directory as audit_node_directory
        result = audit_node_directory(run)
        return {**result, 'all_assertions_passed': result['passed'],
                'assertions': [dict(name=name, passed=check['passed']) for name, check in result['checks'].items()],
                'inputs': {'request.json': sha(request_bytes), 'evidence.json': sha(evidence_bytes), 'scenario.txt': sha(prompt_bytes)},
                'auditor_sha256': sha(Path(__file__).with_name('node_apply_acceptance.py').read_bytes())}
    report = audit(request, json.loads(evidence_bytes), prompt_bytes.decode())
    report["inputs"] = {"request.json": sha(request_bytes), "evidence.json": sha(evidence_bytes), "scenario.txt": sha(prompt_bytes)}
    report["auditor_sha256"] = sha(Path(__file__).read_bytes())
    frozen = (request.get("harness_inputs", {}).get("audit.py") == report["auditor_sha256"]
              and request.get("harness_inputs", {}).get("evidence.py") == sha(Path(__file__).with_name("evidence.py").read_bytes())
              and (request.get("fault_injection")!="rename" or request.get("harness_inputs",{}).get("rename_effect.py")==sha(Path(rename_effect.__file__).read_bytes()))
              and (not request.get("allow_manual_reopen") or request.get("harness_inputs",{}).get("manual_reopen.py")==sha(Path(manual_reopen.__file__).read_bytes()))
              and (request.get("goal_id", "basic-graph") in ("basic-graph","palette-inventory") or request.get("harness_inputs", {}).get("auto_link_delete.py")==sha(Path(auto_link_delete.__file__).read_bytes())))
    report["assertions"].append({"name": "auditor_matches_predeclared_contract", "passed": frozen})
    if request.get('goal_id') in ('checkbox-roundtrip','context-menu-checkbox','root-checkbox','file-storage-inspect','file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip'):
        frozen = frozen and all(request.get('harness_inputs', {}).get(name) == sha(Path(__file__).with_name(name).read_bytes())
                                for name in ('checked_state.py', 'rename_effect.py'))
        report['assertions'].append({'name': 'checkbox_auditor_dependencies_frozen', 'passed': frozen})
    if request.get('goal_id')=='prepare-workspace':
        frozen = frozen and request.get('harness_inputs',{}).get('prepare_binding.py') == sha(Path(__file__).with_name('prepare_binding.py').read_bytes())
        report['assertions'].append({'name':'preparation_auditor_frozen','passed':frozen})
    if request.get('schema_version')==2:
        frozen = frozen and request.get('harness_inputs',{}).get('destinations.py') == sha(Path(__file__).with_name('destinations.py').read_bytes())
        report['assertions'].append({'name':'destination_contract_frozen','passed':frozen})
    if request.get('goal_id') in ('file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip'):
        frozen=frozen and request.get('harness_inputs',{}).get('upload_probe.py')==sha(Path(upload_probe.__file__).read_bytes())
        frozen=frozen and request.get('harness_inputs',{}).get('prepare_binding.py')==sha(Path(__file__).with_name('prepare_binding.py').read_bytes())
        frozen=frozen and request.get('harness_inputs',{}).get(upload_probe.FIXTURE)==sha(Path(__file__).with_name('fixtures').joinpath('data-pipeline/sales.csv').read_bytes())
        report['assertions'].append({'name':'upload_probe_dependencies_frozen','passed':frozen})
    if request.get('goal_id') in ('file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip'):
        frozen=frozen and request.get('harness_inputs',{}).get('upload_verify.py')==sha(Path(upload_verify.__file__).read_bytes())
        report['assertions'].append({'name':'upload_verify_auditor_frozen','passed':frozen})
    if request.get('goal_id') in ('data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip'):
        frozen=frozen and all(request.get('harness_inputs',{}).get(name)==sha(Path(__file__).parent.joinpath(name).read_bytes()) for name in ('data_pipeline.py','rendered_results.py','settings_evidence.py','import_settings_evidence.py','import_roundtrip_evidence.py','calculator_evidence.py','calculator_receipts.py','node_procedure_evidence.py',*data_pipeline.FIXTURES))
        report['assertions'].append({'name':'pipeline_fixture_and_auditor_frozen','passed':frozen})
    report["all_assertions_passed"] = report["all_assertions_passed"] and frozen
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = audit_directory(args.run)
    with args.output.open("x") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": sum(c["passed"] for c in report["assertions"]), "total": len(report["assertions"]),
                      "all_assertions_passed": report["all_assertions_passed"], "sha256": sha(args.output.read_bytes())}))
    raise SystemExit(0 if report["all_assertions_passed"] else 1)


if __name__ == "__main__":
    main()
