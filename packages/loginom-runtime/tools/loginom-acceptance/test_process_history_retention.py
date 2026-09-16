import copy
import unittest
from import_execution_evidence import retained_history_matches

def snapshot(ids):
    return dict(root_id='root',processes=[dict(process_id=str(i),record_id='record-'+str(i),parent_id=None,state='completed',error=False) for i in ids])

class HistoryRetentionTests(unittest.TestCase):
    def test_oldest_completed_evictions_only(self):
        before=snapshot(range(1,21))
        for count in (1,2):self.assertTrue(retained_history_matches(before,snapshot(range(1+count,21+count))))
        changes=[lambda s:s.update(root_id='other'),lambda s:s['processes'][0].update(record_id='changed'),
                 lambda s:s['processes'][-1].update(process_id='30'),lambda s:s['processes'][-1].update(record_id='record-1'),
                 lambda s:s['processes'].pop(1)]
        for change in changes:
            after=snapshot(range(2,22));change(after);self.assertFalse(retained_history_matches(before,after))
        before['processes'][0]['state']='pending_or_failed'
        self.assertFalse(retained_history_matches(before,snapshot(range(2,22))))
    def test_single_old_record_loss_never_counts_as_rolling_retention(self):
        self.assertFalse(retained_history_matches(snapshot([1]),snapshot([2])))
        self.assertTrue(retained_history_matches(snapshot([1]),snapshot([1,2])))

if __name__=='__main__':unittest.main()
