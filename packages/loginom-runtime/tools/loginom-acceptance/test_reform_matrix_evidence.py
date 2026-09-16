import copy
import json
import unittest
from reform_matrix_evidence import GOLDEN, verify_matrix_data


def data():
    expected=json.loads(GOLDEN.read_text())['output']
    result=dict(schema=expected['schema'],row_count=10,sample=expected['rows'],sample_complete=True,
                filter_enabled=False,precision=dict(numbers_verified=True))
    for row in result['sample']:
        for cell in row:
            cell['precision']={'integer':'exact_integer','real':'17_significant_digits','datetime':'millisecond'}.get(cell['type'],'display_text')
            if cell['type']=='datetime':cell['timezone']='unspecified'
    return result


class MatrixEvidenceTest(unittest.TestCase):
    def test_complete_matrix_and_last_cell_tamper(self):
        original=data();self.assertTrue(verify_matrix_data(original)['passed'])
        bad=copy.deepcopy(original);bad['sample'][-1][-1]['value']='2001-01-01T12:34:55.000'
        self.assertIn('matrix_value_9_24',verify_matrix_data(bad)['failures'])
        self.assertEqual(original,data())

    def test_truncation_nulls_schema_and_precision_are_not_inferred(self):
        mutations=[lambda d:d['sample'].pop(),lambda d:d['schema'].reverse(),
                   lambda d:d.update(sample_complete=False),lambda d:d.update(filter_enabled=True),
                   lambda d:d['sample'][0][3].update(value=1),
                   lambda d:d['sample'][0][9].update(timezone='UTC'),
                   lambda d:d['sample'][2][2].update(precision='display_text'),
                   lambda d:d['sample'][5][0].update(value=None,is_null=True),
                   lambda d:d['sample'][6][0].update(value=''),
                   lambda d:d['sample'][2][2].update(value=3.55)]
        for mutate in mutations:
            d=data();mutate(d);self.assertFalse(verify_matrix_data(d)['passed'])


if __name__=='__main__':unittest.main()
