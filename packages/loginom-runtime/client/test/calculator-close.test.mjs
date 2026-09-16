import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalculatorNodeSupport} from '../lib/calculator-node.mjs';
test('Close skips the input wizard entirely, including its otherwise implicit Done',async()=>{
 let browserCalls=0;const support=createCalculatorNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});
 const operation={id:'close',nodeApply:{request:{finish:'close'}}};
 const driver=support.nodeApplyDriverFactory({operation,execute:()=>{browserCalls++;throw Error('Unexpected browser work')}});
 const result=await driver.mapPorts([],{receipt_id:'close:input_mapping'});
 assert.equal(result.verified,true);assert.equal(result.effect_possible,false);assert.equal(browserCalls,0);
 await assert.rejects(driver.mapPorts([{direction:'input',port:0}],{receipt_id:'close:input_mapping'}),/cannot commit/);assert.equal(browserCalls,0);
});
