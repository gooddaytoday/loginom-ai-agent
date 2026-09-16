import copy
import unittest
from import_done_evidence import cancelled_new_node_source_matches
from node_procedure_evidence import bound_wizard_close_confirmation


class ImportCloseEvidenceTests(unittest.TestCase):
    def test_cancelled_new_node_requires_initialized_unchanged_source_and_same_native_node(self):
        node = dict(verified=True, document_id='doc', workflow_id='flow', node_id='node')
        fields = {k: dict(status='observed', value=v) for k, v in
                  dict(source_path='', connection='Локальное', encoding='UTF-8 (65001)', rows_to_skip='0', first_line_as_title=True).items()}
        before = dict(prepared_node_context=node, wizard=dict(import_source=dict(fields=fields)))
        request = dict(target=dict(kind='new'))
        self.assertTrue(cancelled_new_node_source_matches(before, copy.deepcopy(before), request))
        for change in [lambda s: s['prepared_node_context'].update(node_id='other'),
                       lambda s: s['wizard']['import_source']['fields']['source_path'].update(value='/test/import.csv'),
                       lambda s: s['wizard']['import_source']['fields']['encoding'].update(value=''),
                       lambda s: s['wizard']['import_source']['fields']['first_line_as_title'].update(value=False),
                       lambda s: s['wizard']['import_source']['fields']['encoding'].update(truncated=True)]:
            after = copy.deepcopy(before)
            change(after)
            self.assertFalse(cancelled_new_node_source_matches(before, after, request))
        self.assertFalse(cancelled_new_node_source_matches(before, before, dict(target=dict(kind='existing'))))

    def test_confirmation_does_not_waive_another_question_or_loading_mask(self):
        node = dict(verified=True, document_id='doc', workflow_id='flow', node_id='node')
        wizard = dict(status='observed', root_ref='wizard', root_tid='WizrdMCF', stage='done', owner_context=dict(node='owner'))
        binding = dict(kind='close', node=node, owner=wizard['owner_context'], **{k: wizard[k] for k in ('root_ref', 'root_tid', 'stage')})
        state = dict(wizard=wizard, prepared_node_context=node, node_wizard_confirmation=binding,
                     ui=dict(dialogs=[dict(ref='dialog', title='Подтвердить', text='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет')],
                             masks=[dict(ref='wizard', kind='modal_background')],
                             elements=[dict(tid='msgbox;tlb;'+name, label=label, signature=dict(dialog_ref='dialog'), allowed_actions=['click']) for name, label in [('yes','Да'),('no','Нет')]]))
        self.assertTrue(bound_wizard_close_confirmation(state))
        for change in [lambda s: s['ui']['dialogs'][0].update(text='Удалить пакет?'),
                       lambda s: s['ui']['masks'][0].update(kind='busy'),
                       lambda s: s['ui']['masks'][0].update(ref='other'),
                       lambda s: s['prepared_node_context'].update(node_id='other'),
                       lambda s: s['ui']['elements'].pop()]:
            altered = copy.deepcopy(state)
            # Keep the expected binding independent of the mutated observation.
            altered['node_wizard_confirmation'] = copy.deepcopy(binding)
            change(altered)
            self.assertFalse(bound_wizard_close_confirmation(altered))


if __name__ == '__main__':
    unittest.main()
