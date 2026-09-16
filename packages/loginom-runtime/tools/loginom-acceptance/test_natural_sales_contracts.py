import copy
import unittest
from natural_sales_acceptance import described_save_contracts
from evidence import PREFIX


class SaveContractDescriptionTests(unittest.TestCase):
    def test_single_batch_and_repeated_same_contract_have_one_identity(self):
        action=dict(action_key='package.save_as',revision='2',effect=dict(allowed_roots=['/user/dock-p3']))
        manifest=dict(actionManifestDigest='pinned')
        single=dict(tool=PREFIX+'dock_action_describe',result=dict(action=action,session_manifest=manifest))
        batch=dict(tool=PREFIX+'dock_action_describe',result=dict(actions=[dict(action_key='package.save_checkpoint'),action],node_types=[],session_manifest=manifest))
        expected=[dict(action=action,session_manifest=manifest)]
        self.assertEqual(described_save_contracts([single]),expected)
        self.assertEqual(described_save_contracts([batch]),expected)
        self.assertEqual(described_save_contracts([single,batch,copy.deepcopy(batch)]),expected)
        changed=copy.deepcopy(batch);changed['result']['session_manifest']['actionManifestDigest']='foreign'
        self.assertEqual(len(described_save_contracts([single,changed])),2)

    def test_missing_or_ambiguous_action_shapes_are_not_a_contract(self):
        self.assertEqual(described_save_contracts([dict(tool=PREFIX+'dock_action_describe',result=dict(actions=[],node_types=['imports.text']))]),[])
        for result in (dict(actions='not-an-array'),dict(action={},actions=[])):
            with self.assertRaises(ValueError):described_save_contracts([dict(tool=PREFIX+'dock_action_describe',result=result)])


if __name__=='__main__':unittest.main()
