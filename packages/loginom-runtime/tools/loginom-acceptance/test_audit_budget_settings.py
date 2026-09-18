import unittest
from copy import deepcopy
from audit_budget_settings import verify_grouping, verify_sorting, verify_saved_mapping, verify_numeric_filter, verify_import_columns, verify_collapse


class SavedBudgetSettings(unittest.TestCase):
    def test_collapse_roles_order_and_static_empty_policy(self):
        p=dict(information=[dict(name='id')],transposed=[dict(name='m_2'),dict(name='m_1')],ignore_empty=False)
        s=dict(verified=True,inventory_complete=True,information=p['information'],transposed=p['transposed'],skip_null=dict(value=False,switch_pressed=False))
        verify_collapse(s,p)
        for change in [lambda x:x['transposed'].reverse(),lambda x:x['skip_null'].update(value=True),lambda x:x['skip_null'].update(switch_pressed=True),lambda x:x.update(inventory_complete=False)]:
            bad=deepcopy(s);change(bad)
            with self.assertRaises(ValueError):verify_collapse(bad,p)

    def test_import_binds_unique_fields_by_name_not_request_order(self):
        columns=[dict(name='B',type='real'),dict(source_name='original',name='A',type='integer')]
        definition=dict(definition_complete=True,fields=[dict(name='A',label='A',type='integer',used=True),dict(name='B',label='B',type='real',used=True)])
        verify_import_columns(definition,columns)
        for change in [lambda x:x['fields'][0].update(name='B'),lambda x:x['fields'][0].update(type='real'),lambda x:x['fields'][0].update(used=False),lambda x:x.update(definition_complete=False)]:
            bad=deepcopy(definition);change(bad)
            with self.assertRaises(ValueError):verify_import_columns(bad,columns)

    def test_multiple_functions_and_mean_are_checked(self):
        parameters = dict(group_by=[dict(name='Category')], measures=[
            dict(field=dict(name='Budget'), function='sum'), dict(field=dict(name='Budget'), function='count'),
            dict(field=dict(name='Percent'), function='avg')])
        settings = dict(verified=True, inventory_complete=True, keys=[dict(name='Category')],
                        measures=[dict(name='Budget',functions=3),dict(name='Percent',functions=16)])
        verify_grouping(settings, parameters)
        for change in [lambda s: s['measures'][1].update(functions=1), lambda s: s['keys'][0].update(name='Department'), lambda s: s['measures'].pop()]:
            bad = deepcopy(settings)
            change(bad)
            with self.assertRaises(ValueError):
                verify_grouping(bad, parameters)


class SortingSettings(unittest.TestCase):
    def test_filter_threshold_operator_and_field_are_independently_checked(self):
        p=dict(groups=[[dict(field=dict(kind='input_field',name='risk'),type='real',operator='>=',value=0.7)]])
        s=dict(verified=True,inventory_complete=True,rows=[dict(kind='condition',field=dict(kind='input_field',name='risk'),type='real',operator_code=3,value='0.700')])
        verify_numeric_filter(s,p)
        for change in [lambda x:x['rows'][0].update(operator_code=2),lambda x:x['rows'][0].update(value=0.4),lambda x:x['rows'][0]['field'].update(name='income')]:
            bad=deepcopy(s);change(bad)
            with self.assertRaises(ValueError):verify_numeric_filter(bad,p)

    def test_global_locale_option_is_checked_separately_from_numeric_key(self):
        parameters = dict(compare_with_locale=False, keys=[dict(field=dict(name='variance'), direction='DESC')])
        settings = dict(verified=True, inventory_complete=True, keys=[dict(name='variance', direction='DESC', case_sensitive=True)], options=dict(chkLocaleAware=dict(value=False)))
        verify_sorting(settings, parameters)
        settings['options']['chkLocaleAware']['value'] = True
        with self.assertRaisesRegex(ValueError, 'locale setting'): verify_sorting(settings, parameters)

    def test_saved_mapping_checks_owner_flag_and_complete_definition(self):
        node=dict(document_id='d',workflow_id='w',node_id='n')
        field=dict(name='x',label='X',type='real',data_kind='Непрерывный')
        requested=dict(direction='output',port=0,autosync=True)
        actual=dict(direction='output',port=0,mapping=dict(verified=True,inventory_complete=True,autosync=True,
                    node_context={**node,'output_port':dict(port=0)},target_fields=[field]),
                    definition=dict(definition_complete=True,fields=[field]))
        verify_saved_mapping(requested,actual,node)
        for change in [lambda a:a['mapping'].update(autosync=False),lambda a:a['mapping']['node_context'].update(node_id='other'),lambda a:a['definition'].update(fields=[])]:
            bad=deepcopy(actual);change(bad)
            with self.assertRaises(ValueError):verify_saved_mapping(requested,bad,node)


if __name__ == '__main__':
    unittest.main()
