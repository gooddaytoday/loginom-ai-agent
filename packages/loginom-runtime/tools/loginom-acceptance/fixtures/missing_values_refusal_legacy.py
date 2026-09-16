"""Test-only readers for the immutable node14 refusal fixture, before RC integration.

No production verifier imports this module. The current strict close binding and
native output projection are tested separately; historical bytes stay unchanged.
"""
from copy import deepcopy

# Source: d300239018ef9e0492652aa9d328629d6fcdcc68 tools/loginom-acceptance/node_procedure_evidence.py
# SHA256: f9b04cd55166d64ad7dcb2a3cdda891acc2aa87bc4e7c74ba7b88bf20a9dbd37

def bound_wizard_close_confirmation(state):
    binding = state.get('node_wizard_confirmation', {})
    wizard = state.get('wizard', {})
    node = state.get('prepared_node_context', {})
    ui = state.get('ui', {})
    port_key = 'input_port' if 'input_port' in binding.get('owner', {}) else 'output_port'
    port = binding.get('owner', {}).get(port_key)
    direction = 'input' if port_key == 'input_port' else 'output'
    owner = wizard.get('owner_context')
    if port:
        if (port.get('direction') != direction or type(port.get('port')) is not int or not 0 <= port['port'] < 100
                or type(port.get('native_index')) is not int or port['native_index'] < 0
                or not isinstance(port.get('port_guid'), str) or not port['port_guid']
                or not isinstance(port.get('opening_operation_id'), str) or not port['opening_operation_id'] or wizard.get('stage') != direction + '_mapping'
                or node.get('surface') != 'wizard'):
            return False
        owner = {port_key: node.get(port_key)}
    if (binding.get('kind') != 'close' or wizard.get('status') != 'observed'
            or node.get('verified') is not True
            or any(node.get(k) != binding.get('node', {}).get(k) for k in ('document_id', 'workflow_id', 'node_id'))
            or any(wizard.get(k) != binding.get(k) for k in ('root_ref', 'root_tid', 'stage'))
            or owner != binding.get('owner')):
        return False
    dialogs, masks = ui.get('dialogs'), ui.get('masks')
    if (not isinstance(dialogs, list) or len(dialogs) != 1 or not isinstance(masks, list)
            or any(m.get('kind') != 'modal_background' or m.get('ref') != binding.get('root_ref') for m in masks)):
        return False
    dialog = dialogs[0]
    if (dialog.get('title') != 'Подтвердить'
            or dialog.get('text') != 'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет'):
        return False
    return all(len([e for e in ui.get('elements', []) if e.get('tid') == 'msgbox;tlb;' + name
                    and e.get('label') == label and e.get('signature', {}).get('dialog_ref') == dialog.get('ref')
                    and 'click' in e.get('allowed_actions', [])]) == 1 for name, label in [('yes', 'Да'), ('no', 'Нет')])


# Source: d300239018ef9e0492652aa9d328629d6fcdcc68 tools/loginom-acceptance/user_result_evidence.py
# SHA256: a64116a02960c83a3319d4ab9ac2c1a0a96d8c783116197c701a6a2e84427b38

def pick(obj, keys):
    return {k:deepcopy(obj[k]) for k in keys.split() if k in obj}


def project_node(snapshot):
    outcome=snapshot.get('outcome') or {}; node=outcome.get('output') or {}; data=node.get('output') or {}
    output=pick(data,'status evidence_ref execution_id no_output_requested')
    if 'ports' in data:
        output['ports']=[]
        for port in data['ports']:
            p=pick(port,'port port_guid fresh execution_id schema row_count sample sample_rows sample_complete precision table')
            p['schema']=[pick(c,'index name label type data_kind') for c in port['schema']]
            p['sample']=[]
            for row in port['sample']:
                cells=[]
                for c in row:
                    cell=pick(c,'value display_text precision is_null timezone')
                    if 'value' in cell and cell.get('display_text')==cell['value']:cell.pop('display_text',None)
                    cells.append(cell)
                p['sample'].append(cells)
            p['sample_rows']=len(p['sample']);p['sample_complete']=port.get('sample_complete',False)
            output['ports'].append(p)
    if 'format_restoration' in data:output['format_restoration']=pick(data['format_restoration'],'restored table')
    if 'workflow_return' in data:output['workflow_returned']=data['workflow_return'].get('verified') is True
    if not node:output.update(deepcopy(outcome))
    result={'result_version':'user-v1',**pick(snapshot,'operation_id attempt state cancel_requested server_stop_requested')}
    if snapshot['state']=='running' and 'progress' in snapshot:result['progress']=snapshot['progress']
    result.update(pick(outcome,'status action_key phase effect_possible cleanup_complete'))
    result.update(pick(node,'node execution package_saved configuration'))
    result.update(output=output,error=snapshot.get('error') or outcome.get('error'),limitations=node.get('warnings',[]))
    return result
