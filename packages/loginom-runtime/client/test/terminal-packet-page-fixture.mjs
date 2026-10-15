import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
const build='7.4.2';
function pageFixture({ authenticated = false, workflow = false, actualBuild = build, loseReply = false, blocked = false, entryDelay = 0, busyTicks = 0, native } = {}) {
  // Genuine raw FileStorage proxy inherits the loaded ObjectProxy methods.
  Object.setPrototypeOf(native.definitions.FileStoragePrototype,native.definitions.ObjectProxyPrototype);
  const events = [], tabs = [], packages = new Map();
  let url = 'about:blank', active = null, openedPath = null;
  const element = (tid, text = '') => ({tid,textContent:text,innerHTML:'',isConnected:true,
    getAttribute: () => tid,getBoundingClientRect:()=>({width:100,height:100}),
    classList:{contains:()=>false},matches:()=>false});
  const add = path => {
    const n=tabs.length+2,prefix='MF;TF-'+n;
    const tab=element('MF;cntMain;cntWorkspace;Workspace;t.br;tb-'+n);
    tab.classList.contains=()=>active===tab;
    tab.graph=element(prefix+';ModelForm;cmpDiagram');tab.area=element(prefix+';ModelForm;pnlWorkarea');
    tab.crumbs=['Server','Packages','Package'+n,'Module','Workflow'].map((text,i)=>element(prefix+';cnrNaviMode;b.s_'+i,text));
    tabs.push(tab);active=tab;packages.set(tab,new PackageNode(path));
  };
  class PackageNode { constructor(path) {this.PackageFileName=path;this.PackageName='Draft';this.Package=native.packageProxy;} }
  if (workflow) add(null);
  else {add(null);tabs[0].home=element('MF;TF-2;HomePage;btnCreateUnsavedPackage');tabs[0].graph=null;tabs[0].area=null;packages.delete(tabs[0]);}
  const context=createContext(Object.assign(native.closureContext,{Date,Math,Map,Set,JSON,screen:{availWidth:1000,availHeight:900},
    innerWidth:1000,innerHeight:800,outerWidth:1000,outerHeight:900,getComputedStyle:()=>({visibility:'visible'}),
    location:{origin:'http://loginom.example',pathname:'/app'},
    document:{querySelectorAll(selector) {
      if(selector.startsWith('[data-tid^="MF;cntMain;cntWorkspace'))return tabs;
      if(selector.startsWith('[role=')) {if(blocked)return [element('blocker')];if(busyTicks>0)return [{...element('busy'),matches:()=>true}];return [];}
      const prefix=selector.match(/^\[data-tid\^=(".*")\]$/);
      if(prefix)return tabs.flatMap(t=>t.crumbs).filter(e=>e.tid.startsWith(JSON.parse(prefix[1])));
      const exact=selector.match(/^\[data-tid=(".*")\]$/);
      if(exact && JSON.parse(exact[1]).endsWith(';HomePage;btnCreateUnsavedPackage') && entryDelay>0)return [];
      return exact?tabs.flatMap(t=>[t.graph,t.area,t.home]).filter(e=>e && e.tid===JSON.parse(exact[1])):[];
    }},bg:{app:{Version:actualBuild,PackageTreeNode:PackageNode,Application:{FInstance:{FMainForm:{Items:{Workspace:{
      getActiveTab:()=>({Controller:{Node:{data:{node:packages.get(active)}}}}),
    }},FUrlUtils:{FFileStorage:native.storage},FMapTree:{FServerConnection:{
      FUsername:'test-account',FSession:{$S:native.session},
      get UserName(){return this.FUsername},get Session(){return this.FSession}
    }}}}}}}}));
  const locator = selector => ({
    or() { return this; }, first() { return this; }, async waitFor() {}, async inputValue() { return ''; },
    async isVisible() {
      if (selector.includes('btnAvatar')) return authenticated;
      if (selector.includes('edtUsername')) return !authenticated;
      return true;
    },
    async count() { return selector.includes('x-form-invalid')?0:1; },
    async click() {
      if(selector.includes('btnLogin')) {events.push('login');authenticated=true;}
      else if(selector.includes('btnCreateUnsavedPackage')) {
        events.push('create_draft');if(active?.home)tabs.splice(tabs.indexOf(active),1);add(null);
        if(loseReply){loseReply=false;throw new Error('lost response');}
      } else if(selector.includes('btnOpen"')){events.push('open_package');add(openedPath);}
      else if(selector.includes('t.br;tb'))active=tabs.find(t=>selector.includes(t.tid));
      else {assert.equal(entryDelay,0,'menu must wait for homepage readiness');events.push('menu');}
    },
    async fill(value) { events.push({ fill: value });if(selector.includes('edtFileName'))openedPath=value; },
    locator(child) { return locator(selector + ' ' + child); },
  });
  return { events, tabs, context, openFiles() {add(null);const tab=tabs.at(-1);tab.graph=null;tab.area=null;packages.delete(tab);}, page: {
    url: () => url,
    async goto(value) { url = value;context.location={origin:new URL(value).origin,pathname:new URL(value).pathname};events.push('navigate'); },
    async evaluate(fn,args) {context.args=args;return runInContext(`(${fn.toString()})(args)`,context);},
    locator, async waitForTimeout() {entryDelay=Math.max(0,entryDelay-1);busyTicks=Math.max(0,busyTicks-1);},
  } };
}
export {pageFixture};
