import copy
import json
import unittest
from sorting_configuration_evidence import verify_sorting_configuration


class SortingConfigurationRejectionTests(unittest.TestCase):
    def test_absent_checkpoint_and_malformed_evidence_fail_closed(self):
        request={'operation_id':'s','parameters':{},'target':{'kind':'existing'}}
        for events in ([],[{'operation_id':'s','phase':'node_checkpoint','result':{'status':'SUCCEEDED'}}]):
            self.assertFalse(verify_sorting_configuration(events,request)['passed'])


if __name__=='__main__':unittest.main()
