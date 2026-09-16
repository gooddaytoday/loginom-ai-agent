import unittest
from sorting_output_evidence import verify_row_multiset, verify_sorting_output


class SortingEvidenceTests(unittest.TestCase):
    def test_duplicate_multiplicity_and_null_are_not_lost(self):
        columns=[{'name':'x','type':'integer'}]
        cell=lambda x: {'type':'integer','is_null':x is None,'value':None if x is None else str(x)}
        verify_row_multiset(columns,[[1],[None],[1]],[[cell(None)],[cell(1)],[cell(1)]])
        for sample in ([[cell(None)],[cell(1)]],[[cell(None)],[cell(1)],[cell(2)]],[[cell(0)],[cell(1)],[cell(1)]]):
            with self.assertRaises(ValueError): verify_row_multiset(columns,[[1],[None],[1]],sample)

    def test_dates_match_semantically_without_dropping_time(self):
        columns=[{'name':'d','type':'datetime'}]
        cell=lambda v:{'type':'datetime','is_null':False,'value':v}
        verify_row_multiset(columns,[['2024-02-29 00:00:00.000']],[[cell('2024-02-29T00:00:00.000')]])
        with self.assertRaises(ValueError): verify_row_multiset(columns,[['2024-02-29 00:00:00.000']],[[cell('2024-02-29T00:00:00.001')]])

    def test_partial_sample_and_absent_checkpoint_are_rejected(self):
        request={'operation_id':'s'}
        self.assertFalse(verify_sorting_output([],request,[],[],[])['passed'])
        events=[{'operation_id':'s','phase':'node_checkpoint','result':{'output':{'ports':[{'row_count':100,'sample_complete':False,'sample':[]}]}}}]
        self.assertFalse(verify_sorting_output(events,request,[],[],[])['passed'])


if __name__=='__main__': unittest.main()
