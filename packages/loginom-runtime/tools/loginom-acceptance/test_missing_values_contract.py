import copy
import unittest
from missing_values_contract import audit_missing_values


def fixture():
    node=dict(document_id='d', workflow_id='w', node_id='n')
    schema=[dict(name='Amount', label='Amount', type='real', data_kind='Непрерывный')]
    expected=dict(operation_id='op', node=node, source_sha256='a'*64, source_execution_id='input2', previous_execution_ids=['old'],
                  source_node=dict(document_id='d', workflow_id='w', node_id='input'), source_path='/test-4/input.csv', fields={'Amount': dict(method='mean')}, max_nulls_percent=100, schema=schema, rows=[['5']], remaining_nulls=[0])
    rb=dict(kind='missing_values', mode='impute', node=node, ordered=False, max_nulls_percent=100, values_are='observed_ui_values', scope='observed_before_verified_finish',
            fields=[dict(**schema[0], used=True, method='mean')])
    result=dict(status='SUCCEEDED', cleanup_complete=True, operation_id='op', node=node, execution=dict(status='completed', execution_id='new'),
                configuration=dict(status='applied', readback=rb), output=dict(ports=[dict(port=0, fresh=True, port_guid='p', execution_id='new')]))
    table=dict(verified=True, complete=True, node=node, execution_id='new', port_guid='p', schema=copy.deepcopy(schema), row_count=1,
               rows=[[dict(type='real', is_null=False, value=5, decimal='5', precision='17_significant_digits')]])
    source=dict(verified=True, sha256='a'*64, execution_id='input2', node=expected['source_node'], destination=expected['source_path'])
    return expected, result, table, source


class Contract(unittest.TestCase):
    def test_positive_synthetic_contract(self):
        result=audit_missing_values(*fixture())
        self.assertTrue(result['passed']); self.assertFalse(result['persistence_verified'])

    def test_negative_substitutions(self):
        def rb(args): return args[1]['configuration']['readback']
        changes=[lambda a: rb(a).update(max_nulls_percent=99), lambda a: rb(a)['fields'][0].update(method='constant'),
                 lambda a: rb(a)['fields'][0].update(type='integer'), lambda a: rb(a)['fields'][0].update(data_kind='Дискретный'),
                 lambda a: rb(a)['fields'][0].update(label='Foreign'), lambda a: a[2]['schema'][0].update(label='Foreign'),
                 lambda a: a[2]['schema'][0].update(type='integer'),
                 lambda a: rb(a)['fields'][0].update(used=False), lambda a: a[2]['rows'][0][0].update(decimal='4'),
                 lambda a: a[1]['execution'].update(execution_id='old'), lambda a: a[2].update(execution_id='old'),
                 lambda a: a[3].update(sha256='b'*64), lambda a: a[3].update(execution_id='input1'),
                 lambda a: a[3].update(node=dict(document_id='old',workflow_id='w',node_id='input')), lambda a: a[3].update(destination='/test-4/old.csv'), lambda a: a[2].update(complete=False), lambda a: a[2]['rows'][0][0].update(precision='display_rounded'),
                 lambda a: a[2]['rows'][0][0].update(is_null=True, value=None, precision='exact_null')]
        for i, change in enumerate(changes):
            with self.subTest(i=i):
                args=copy.deepcopy(fixture());change(args);self.assertFalse(audit_missing_values(*args)['passed'])



class DependencyProof(unittest.TestCase):
    def test_dependency_reexecution_requires_native_activity_transition_and_target_run(self):
        args=list(fixture());expected,result,table,source=args
        expected['source_dependency_reexecution']=True
        source.update(execution_id=None,integrity_scope='prior_verified_upload',dependency_reexecution={
            'before':dict(node=expected['source_node'],port_guid='input-output',active=False),
            'after':dict(node=expected['source_node'],port_guid='input-output',active=True),
            'target_execution_id':'new'})
        self.assertTrue(audit_missing_values(*args)['passed'])
        for change in [lambda p:p['before'].update(active=True),lambda p:p['after'].update(active=False),
                       lambda p:p['after'].update(port_guid='foreign'),lambda p:p.update(target_execution_id='old'),
                       lambda p:p['after'].update(node=dict(document_id='old',workflow_id='w',node_id='input'))]:
            altered=copy.deepcopy(args);change(altered[3]['dependency_reexecution']);self.assertFalse(audit_missing_values(*altered)['passed'])

if __name__ == '__main__': unittest.main()
