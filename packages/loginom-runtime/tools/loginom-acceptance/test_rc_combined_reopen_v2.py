import unittest
from copy import deepcopy
from rc_combined_acceptance_v2 import permute_duplicates_oracle

class PermutationTests(unittest.TestCase):
    def test_permutation_keeps_independent_values_bound_to_field_names(self):
        expected={'columns':[dict(name='Id',label='Id',type='integer'),dict(name='Client',label='Client',type='string')],
                  'rows':[[1,'A'],[2,'B']]}
        actual=permute_duplicates_oracle(expected,list(reversed(expected['columns'])))
        self.assertEqual(actual['rows'],[['A',1],['B',2]])
        self.assertEqual(expected['rows'],[[1,'A'],[2,'B']])
        for change in ('missing','duplicate','name','label','type'):
            schema=deepcopy(expected['columns'])
            if change=='missing':schema.pop()
            elif change=='duplicate':schema[1]=deepcopy(schema[0])
            else:schema[0][change]='different'
            with self.subTest(change=change),self.assertRaises(ValueError):permute_duplicates_oracle(expected,schema)

if __name__=='__main__':unittest.main()
