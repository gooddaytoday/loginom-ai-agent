import copy
import unittest
from node_procedure_evidence import bound_wizard_close_confirmation


class OutputCloseEvidenceTests(unittest.TestCase):
    def test_output_close_requires_native_receipt_and_same_breadcrumb_owner(self):
        port = dict(direction='output', port=0, native_index=0, port_guid='out', opening_operation_id='open')
        context = dict(status='observed', kind='output_data', node=dict(ref='node'), port=dict(ref='port'), path=[])
        node = dict(verified=True, surface='wizard', document_id='doc', workflow_id='flow', node_id='node', output_port=port)
        wizard = dict(status='observed', root_ref='wizard', root_tid='WizrdMCF', stage='output_mapping',
                      owner_context=dict(status='unobserved'), port_context=context)
        binding = dict(kind='close', node={k: node[k] for k in ('document_id', 'workflow_id', 'node_id')},
                       owner=dict(output_port=copy.deepcopy(port), port_context=copy.deepcopy(context)),
                       **{k: wizard[k] for k in ('root_ref', 'root_tid', 'stage')})
        state = dict(wizard=wizard, prepared_node_context=node, node_wizard_confirmation=binding,
                     ui=dict(dialogs=[dict(ref='dialog', title='Подтвердить', text='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет')],
                             masks=[dict(ref='wizard', kind='modal_background')],
                             elements=[dict(tid='msgbox;tlb;'+name, label=label, signature=dict(dialog_ref='dialog'), allowed_actions=['click']) for name, label in [('yes','Да'),('no','Нет')]]))
        self.assertTrue(bound_wizard_close_confirmation(state))
        for mutate in [lambda s: s['prepared_node_context']['output_port'].update(port_guid='other'),
                       lambda s: s['prepared_node_context']['output_port'].update(native_index=1),
                       lambda s: s['prepared_node_context']['output_port'].update(opening_operation_id='other'),
                       lambda s: s['wizard']['port_context']['node'].update(ref='foreign'),
                       lambda s: s['wizard']['port_context']['port'].update(ref='foreign'),
                       lambda s: s['wizard'].update(stage='done'),
                       lambda s: s['ui']['elements'].pop()]:
            altered = copy.deepcopy(state)
            mutate(altered)
            self.assertFalse(bound_wizard_close_confirmation(altered))


if __name__ == '__main__':
    unittest.main()
