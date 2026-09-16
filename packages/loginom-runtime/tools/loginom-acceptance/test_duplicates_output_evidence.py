import unittest
from duplicates_output_evidence import verify_duplicates_output


class DuplicatesOutputEvidenceTest(unittest.TestCase):
    def test_missing_journal_cannot_establish_output(self):
        self.assertFalse(verify_duplicates_output([], dict(operation_id='op'), [], [], [], source_columns=[])['passed'])

    def test_projected_empty_success_needs_raw_execution_and_table_evidence(self):
        request = dict(operation_id='op', finish='execute', read=dict(ports=[0]))
        port = dict(port=0, sample_complete=True, row_count=0, sample=[], schema=[])
        result = dict(status='SUCCEEDED', output=dict(status='complete', ports=[port]))
        events = [dict(operation_id='op', phase='node_checkpoint', result=result)]
        self.assertFalse(verify_duplicates_output(events, request, [], [], [], source_columns=[])['passed'])
        result['output']['status'] = 'partial'
        self.assertIn('duplicates_complete_execution_required', verify_duplicates_output(events, request, [], [], [], source_columns=[])['failures'])

class DuplicatesSchemaOracleTest(unittest.TestCase):
    """Keep configuration correct while the reported/native empty table changes."""
    def setUp(self):
        import copy
        self.copy = copy.deepcopy
        self.source = [dict(name='Id', label='Id', type='integer', data_kind='Непрерывный'),
                       dict(name='Key', label='Key', type='string', data_kind='Дискретный')]
        self.expected = [dict(name=n,label=l,type=t,data_kind='Дискретный') for n,l,t in [
            ('Duplicate','Дубликат','boolean'),('DuplicateGroup','Группа дубликата','integer'),
            ('Contradiction','Противоречие','boolean'),('ContradictionGroup','Группа противоречия','integer')]] + self.source
        self.request = dict(operation_id='op', finish='execute', read=dict(ports=[0]))
        self.readback = dict(fields=self.copy(self.source), output_mapping=dict(fields=[
            dict(name=c['name'],label=c['label'],type=c['type'],source_name=c['name']) for c in self.expected]))

    def check(self, columns, readback=None, source=None):
        from unittest.mock import patch
        port = dict(port=0, sample_complete=True, row_count=0, sample=[], schema=columns)
        events = [dict(operation_id='op',phase='node_checkpoint',result=dict(status='SUCCEEDED',
            output=dict(status='complete',ports=[port]),configuration=dict(readback=readback or self.readback)))]
        # Those lower verifiers are tested against real journals separately.
        # Assume even a consistent native table: schema content must reject it.
        with patch('duplicates_output_evidence.verify_duplicates_configuration',return_value=dict(passed=True,failures=[])), \
             patch('duplicates_output_evidence.verify_calculator_output',return_value=dict(passed=True,failures=[],execution_id='fresh')) as raw:
            result = verify_duplicates_output(events,self.request,[],[],[],source_columns=self.source if source is None else source)
            return result,raw.call_args

    def test_correct_empty_schema_and_existing_permutation_pass(self):
        for columns in [self.expected,list(reversed(self.expected))]:
            rb=self.copy(self.readback);rb['output_mapping']['fields']=[dict(name=c['name'],label=c['label'],type=c['type'],source_name=c['name']) for c in columns]
            result,call=self.check(self.copy(columns),rb)
            self.assertTrue(result['passed'],result)
            self.assertEqual(call.args[2],columns)
            self.assertEqual(call.args[3],[])

    def test_consistent_wrong_empty_table_is_rejected_by_content(self):
        renamed=self.copy(self.expected);renamed[4]['name']='WrongId'
        missing=self.copy(self.expected);missing.pop(1)
        wrong_type=self.copy(self.expected);wrong_type[4]['type']='string'
        wrong_kind=self.copy(self.expected);wrong_kind[4]['data_kind']='Дискретный'
        for columns in [renamed,missing,wrong_type,wrong_kind]:
            result,call=self.check(columns)
            self.assertEqual(result['failures'],['duplicates_expected_schema'])
            self.assertIsNone(call)  # Not rejected by digest/native consistency.

    def test_missing_independent_schema_and_configuration_mismatch_refuse(self):
        self.assertEqual(self.check(self.expected,source=[])[0]['failures'],['duplicates_source_schema_required'])
        rb=self.copy(self.readback);rb['fields'][0]['name']='WrongId'
        self.assertEqual(self.check(self.expected,rb)[0]['failures'],['duplicates_input_schema'])
        rb=self.copy(self.readback);rb['output_mapping']['fields'].reverse()
        self.assertEqual(self.check(self.expected,rb)[0]['failures'],['duplicates_output_mapping_schema'])


if __name__ == '__main__':
    unittest.main()
