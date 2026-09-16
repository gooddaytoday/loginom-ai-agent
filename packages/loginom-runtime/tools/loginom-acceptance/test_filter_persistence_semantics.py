import copy
import unittest
from filter_persistence_semantics import filter_settings


class FilterPersistenceTests(unittest.TestCase):
    def fixture(self):
        fields = [dict(index=i, name=n, label=n, type='integer',
                       data_kind='Дискретный', source_name=n) for i, n in enumerate(('Id', 'Amount'))]
        return dict(configuration=dict(readback=dict(kind='row_filter', node={}, receipt_ids=[],
            groups=[[dict(field=dict(kind='input_field', name='When'), type='datetime',
                          operator='<=', value='2024-01-02T12:30:01')]],
            input_mapping=dict(port=0, autosync=True, fields=fields),
            output_mappings=[dict(port=p, autosync=False, fields=copy.deepcopy(fields)) for p in (0, 1)])))

    def test_only_input_picker_order_and_equivalent_date_representation_are_ignored(self):
        a=self.fixture(); b=copy.deepcopy(a); rb=b['configuration']['readback']
        rb['groups'][0][0]['value'] += '.000'
        rb['input_mapping']['fields'].reverse()
        for i,f in enumerate(rb['input_mapping']['fields']):f['index']=i
        self.assertEqual(filter_settings(a),filter_settings(b))

    def test_changed_values_bindings_and_output_order_remain_distinct(self):
        a=self.fixture()
        mutations=[
            lambda rb:rb['groups'][0][0].update(value='2024-01-02T12:30:01.001'),
            lambda rb:rb['input_mapping']['fields'][0].update(source_name='Amount'),
            lambda rb:rb['input_mapping']['fields'][0].update(label='Other'),
            lambda rb:rb['input_mapping'].update(autosync=False),
            lambda rb:rb['output_mappings'][1]['fields'].reverse(),
            lambda rb:rb['output_mappings'].reverse(),
            lambda rb:rb['output_mappings'][1].update(autosync=True)]
        for mutate in mutations:
            b=copy.deepcopy(a); mutate(b['configuration']['readback'])
            self.assertNotEqual(filter_settings(a),filter_settings(b))

    def test_duplicate_input_identity_is_not_collapsed(self):
        a=self.fixture(); f=a['configuration']['readback']['input_mapping']['fields']
        f[1]['name']=f[0]['name']
        with self.assertRaises(ValueError):filter_settings(a)
