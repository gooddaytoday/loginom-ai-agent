import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {observeJavascriptSourceProcesses} from '../lib/javascript-source-browser.mjs';

for(const prefix of ['ConsoleForm','MF;ConsoleForm'])test('source witness preserves exact '+prefix+' tree and refuses another tree',()=>{
 const tree={id:'tree'},record={internalId:'root',data:{loaded:true},childNodes:[]};
 const store={isLoading:()=>false,getRoot:()=>record},trees=[tree];
 const context=vm.createContext({document:{querySelectorAll:selector=>{
  assert.ok(selector.includes('[data-tid="'+prefix+';ProgressForm;trpProgress;treepanel;tree"]'));
  return trees;
 }},Ext:{getCmp:id=>{assert.equal(id,'tree');return {getStore:()=>store};}}});
 const observe=vm.runInContext('('+observeJavascriptSourceProcesses.toString()+')',context);
 const held=observe({capture:true});assert.equal(held.tree,tree);
 assert.equal(observe({held}).unchanged,true);
 trees.push({id:'other'});assert.throws(()=>observe({held}),/tree ambiguous/);
});
