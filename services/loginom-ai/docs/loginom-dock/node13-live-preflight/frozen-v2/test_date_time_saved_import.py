"""Protocol boundary tests; these do not substitute for saved-package UI proof."""
import copy
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class SavedImportProtocol(unittest.TestCase):
    def test_expectation_v2_changes_only_excluded_label(self):
        old = ROOT/'docs/loginom-dock/node13-live-preflight/frozen-v1'
        new = ROOT/'tools/loginom-acceptance/fixtures/date-time'
        expected = json.loads((old/'expected.json').read_text())
        expected['excluded'][0]['label'] = 'Дата'
        self.assertEqual(expected, json.loads((new/'expected.json').read_text()))
        self.assertEqual((old/'sales.csv').read_bytes(), (new/'sales.csv').read_bytes())
        self.assertEqual((old/'date-time-sales.txt').read_text().replace('его служебную метку DateB', 'его служебную метку «Дата»'),
                         (ROOT/'tools/loginom-acceptance/goals/date-time-sales.txt').read_text())

    def test_diagnostic_guard_rejects_settings_edits_before_dispatch(self):
        script = """import assert from 'node:assert/strict';
        import {assertReadOnlyWizardAction as guard} from './tools/loginom-acceptance/date-time-reopen-policy.mjs';
        const state=tid=>({wizard:{status:'observed',root_tid:'W'},ui:{elements:[{ref:'r',tid}]}});
        let dispatched=0;
        for(const [verb,tid] of [['fill','W;source'],['set_checked','W;used'],['set_wizard_field','W;format'],
          ['select_wizard_option','W;type'],['click','W;btnAutoSyncThroughColumns'],['click','W;btnCreateMapping'],
          ['double_click','W;colName_Id'],['execute_wizard','W;btnExecute'],['finish_wizard','W;btnDone']]){
          assert.throws(()=>{guard(state(tid),{verb,ref:'r'});dispatched++;});
        }
        assert.equal(dispatched,0);
        for(const [verb,tid] of [['wizard_step','W;btnNext'],['wizard_step','W;btnPrev'],['click','W;btnClose'],['confirm_wizard_close','msgbox;tlb;yes']])guard(state(tid),{verb,ref:'r'});
        guard(state('W;btnDone'),{verb:'finish_wizard',ref:'r'},{allowUnchangedFinish:true});
        assert.throws(()=>guard(state('W;format'),{verb:'fill',ref:'r'},{allowUnchangedFinish:true}));
        assert.throws(()=>guard(null,{verb:'click',ref:'r'}));
        const date=state('W;DateReformWizard;colDisplayName_DateB');date.wizard.stage='date_time';date.wizard.root_ref='w';
        date.node_date_time={verified:true,fields:[{name:'DateB',record_id:'b'}]};
        date.ui.elements[0].date_time_cell={role:'field',field_key:'DateB',record_id:'b',wizard_root_ref:'w'};
        guard(date,{verb:'click',ref:'r'});
        date.ui.elements[0].date_time_cell.role='flag';assert.throws(()=>guard(date,{verb:'click',ref:'r'}));
        """
        subprocess.run([str(Path.home()/'.loginom-dock/current/runtime/node'), '--input-type=module', '-e', script],
                       cwd=ROOT, check=True, capture_output=True, text=True)

    def test_independent_auditor_refuses_wizard_finish_and_mutation(self):
        from date_time_saved_import_evidence import readonly_wizard_mutations
        state = dict(wizard=dict(status='observed', root_tid='W'), ui=dict(elements=[dict(ref='r',tid='W;btnNext')]))
        seq = dict(observations=[(1,state)],mutations=[(2,dict(ref='r',verb='wizard_step'),{})])
        self.assertEqual(readonly_wizard_mutations(seq), [])
        for verb,tid in [('finish_wizard','W;btnDone'),('fill','W;source'),('click','W;btnAutoSyncThroughColumns')]:
            changed = copy.deepcopy(seq);changed['observations'][0][1]['ui']['elements'][0]['tid']=tid
            changed['mutations'][0][1]['verb']=verb
            self.assertEqual(readonly_wizard_mutations(changed), ['saved_wizard_mutation'])

    def test_source_metadata_retrieval_cannot_repair_saved_definition(self):
        from date_time_saved_import_evidence import readonly_wizard_mutations
        source=dict(record_id='s',name='Id')
        before=dict(verified=True,node_context={'node_id':'n'},autosync=False,source_fields=[],
                    target_fields=[dict(record_id='old',field_id='1',index=0,name='Id',label='Id',excluded=False,source=None)])
        after=copy.deepcopy(before);after.update(source_fields=[source],inventory_complete=True,source_identity_verified=True)
        after['target_fields'][0]['source']=source
        state=dict(wizard=dict(status='observed',stage='output_mapping',root_tid='W'),
                   ui=dict(elements=[dict(ref='r',tid='W;DerivedDataSourceOutputSocketWizard;btnGetSourceColumns')]),node_mapping=before)
        sequence=dict(observations=[(1,state),(3,dict(node_mapping=after))],mutations=[(2,dict(ref='r',verb='click'),{})])
        self.assertEqual(readonly_wizard_mutations(sequence),[])
        for key,value in [('name','Changed'),('field_id','foreign'),('excluded',True)]:
            changed=copy.deepcopy(sequence);changed['observations'][1][1]['node_mapping']['target_fields'][0][key]=value
            self.assertIn('source_metadata_fetch_changed_saved_definition',readonly_wizard_mutations(changed))


if __name__ == '__main__':
    unittest.main()
