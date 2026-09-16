import copy
import unittest
from node_procedure_evidence import bound_filter_dialog


def fixture(kind='range'):
    root = 'MF;TF-1;WizrdMCF'
    dialog = root + ';ModalWindow_' + ('BetweenValuesEditor' if kind == 'range' else 'ValueListEditor')
    owner = dict(verified=True, document_id='doc', workflow_id='wf', node_id='node', surface='wizard', tid=root)
    return dict(wizard=dict(status='observed', stage='row_filter', root_tid=root, root_ref='wizard'),
        prepared_node_context=owner,
        node_filter=dict(verified=True, inventory_complete=True, node_context=copy.deepcopy(owner),
            rows=[dict(kind='condition', record_id='record', operator_code=8 if kind == 'range' else 10)],
            dialogs=[dict(kind=kind, root_tid=dialog, record_id='record')]),
        ui=dict(dialogs=[dict(ref='dialog', identity=dict(anchor_tid=dialog))],
            masks=[dict(kind='modal_background', ref='wizard', target_tid=root)]))


class FilterDialogEvidenceTests(unittest.TestCase):
    def test_exact_range_and_list_owners(self):
        for kind in ['range', 'list']:
            self.assertTrue(bound_filter_dialog(fixture(kind)))

    def test_foreign_mask_dialog_record_operator_and_node_are_rejected(self):
        mutations = [lambda s:s['node_filter']['node_context'].update(node_id='other'),
            lambda s:s['node_filter']['dialogs'][0].update(record_id='missing'),
            lambda s:s['node_filter']['rows'][0].update(kind='or'),
            lambda s:s['node_filter']['rows'][0].update(operator_code=4),
            lambda s:s['ui']['dialogs'][0]['identity'].update(anchor_tid='foreign'),
            lambda s:s['ui']['masks'][0].update(kind='loading'),
            lambda s:s['ui']['masks'][0].update(ref='other'),
            lambda s:s['ui']['dialogs'].append(copy.deepcopy(s['ui']['dialogs'][0])),
            lambda s:s['node_filter'].update(inventory_complete=False)]
        for mutate in mutations:
            state=fixture();mutate(state)
            self.assertFalse(bound_filter_dialog(state))


if __name__ == '__main__':
    unittest.main()
