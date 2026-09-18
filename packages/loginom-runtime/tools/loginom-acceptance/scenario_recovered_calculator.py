"""Audit provenance for a created calculator whose rejected draft was restored.

Only the verified blank Expr1 baseline is supported. No failed computation is
accepted; a later successful, complete patch and saved-package audit are required.
"""
import copy
import hashlib
import json


def recover_created_calculator(args, result, calls, results, events, nodes, links):
    def need(value, message):
        if not value:
            raise ValueError(message)
    node=result['node'];identifier=node['node_id']
    failed=[r for r in results if r.get('status')=='FAILED' and r.get('node')==node
            and r.get('cleanup_complete') is True]
    need(len(failed)==1, 'Unique confirmed failed calculator creation required')
    original=failed[0];requests=calls.get(original['operation_id'],[])
    need(results.index(original)<results.index(result) and result.get('cleanup_complete') is True, 'Confirmed correction must follow the failed creation')
    need(requests and all(r==requests[0] for r in requests), 'Original calculator request differs')
    creation=requests[0]
    need(creation['target']['kind']=='new' and creation['target']['type']==args['target']['type']=='transform.calculator'
         and args['target']['kind']=='existing' and args['target']['ref']==node and not args.get('inputs')
         and len(creation.get('inputs',[]))==1, 'Exact calculator creation/correction required')
    receipts=[e['receipt'] for e in events if e.get('phase')=='node_phase_refused'
              and e.get('operation_id')==original['operation_id']]
    need(len(receipts)==1, 'Unique calculator rollback receipt required')
    receipt=receipts[0];proof=receipt.get('proof',{})
    need(receipt.get('phase')=='configure' and receipt.get('status')=='FAILED'
         and receipt.get('cleanup_complete') is True and receipt.get('settings_unchanged') is True
         and receipt.get('verification')=='calculator_syntax_rejected_draft_restored'
         and receipt.get('before_node')==node and proof.get('node')==node
         and proof.get('settings_readback_verified') is True and proof.get('syntax_failure_verified') is True
         and proof.get('before')==proof.get('after'), 'Calculator rollback is not independently verified')
    baseline=proof.get('after',{}).get('expressions',[])
    need(len(baseline)==1 and baseline[0].get('name')=='Expr1' and baseline[0].get('formula')==''
         and baseline[0].get('type')=='real' and baseline[0].get('replace') is False
         and baseline[0].get('intermediate') is False, 'Only the restored blank default is supported')
    for name in ('first_close','closed'):
        closed=proof.get(name,{})
        need(closed.get('verified') is True and closed.get('cleanup_complete') is True
             and closed.get('settings_applied') is False and closed.get('draft_discarded') is True
             and all(closed.get('node_context',{}).get(k)==v for k,v in node.items()), 'Rollback close identity differs')
    graph=proof.get('graph_after',{})
    need(proof.get('graph_before')==graph and graph.get('document_id')==node['document_id']
         and graph.get('workflow_id')==node['workflow_id'] and graph.get('foreign_links')==[], 'Rollback graph identity differs')
    info=dict(id=identifier,label=creation['target']['label'],type='transform.calculator')
    edge=creation['inputs'][0];extra=(edge['source']['node_id'],edge['output'],identifier,edge['input'])
    need(edge['input']==0 and edge['output']==0
         and all(edge['source'].get(k)==node[k] for k in ('document_id','workflow_id')), 'Calculator source binding differs')
    wanted_nodes={**nodes,identifier:info};wanted_links=set(links)|{extra}
    observed_nodes={n['ref']['node_id']:dict(id=n['ref']['node_id'],label=n['label'],type=n['type']) for n in graph.get('nodes',[])}
    observed_links={(e['source'],e['output'],e['target'],e['input']) for e in graph.get('links',[])}
    need(observed_nodes==wanted_nodes and len(observed_nodes)==len(graph['nodes'])
         and observed_links==wanted_links and len(observed_links)==len(graph['links']), 'Rollback graph differs from recorded creations')
    parameters=copy.deepcopy(args['parameters']);expressions=parameters.get('expressions',[])
    existing=[e for e in expressions if e.get('target',{}).get('kind')=='existing']
    need(len(existing)==1 and existing[0]['target']==dict(kind='existing',name='Expr1')
         and all(set(('name','label','type','formula','replace'))<=e.keys() for e in expressions), 'Complete replacement of blank Expr1 required')
    for expression in expressions:
        need(expression['replace'] is False and expression['target']['kind'] in ('new','existing'), 'Unreviewed recovered replacement')
        expression['target']=dict(kind='new')
    provenance=dict(original_operation_id=original['operation_id'],corrected_operation_id=args['operation_id'],
        node_id=identifier,rollback_receipt_sha256=hashlib.sha256(json.dumps(receipt,sort_keys=True,ensure_ascii=False).encode()).hexdigest(),
        recorded_parameters=args['parameters'],projection='Complete corrected formulas; the verified blank Expr1 is replaced, analytical expressions unchanged.')
    return info,extra,parameters,provenance
