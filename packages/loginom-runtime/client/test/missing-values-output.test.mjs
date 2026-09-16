import test from 'node:test';import assert from 'node:assert/strict';
import {showMissingValuesMappingTable} from '../lib/missing-values-output.mjs';
test('missing values selects table presentation before validating mapping cells',async()=>{
 const actions=[],s={wizard:{stage:'output_mapping',root_tid:'root'},ui:{elements:[{tid:'root;DerivedDataSourceMappingEngineOutputPortWizard;rbTable;DisplayEl',ref:'table',check_state:{checked:false},allowed_actions:['set_checked']}]}};
 const channel={observe:async()=>s,perform:async spec=>actions.push(spec.resolve(s))};
 await showMissingValuesMappingTable(channel);assert.deepEqual(actions,[{verb:'set_checked',ref:'table',checked:true}]);
 s.ui.elements[0].check_state.checked=true;await showMissingValuesMappingTable(channel);assert.equal(actions.length,1);
 s.ui.elements.push({...s.ui.elements[0]});await assert.rejects(showMissingValuesMappingTable(channel));assert.equal(actions.length,1);
});
