import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createObservationPages } from '../lib/observation-pages.mjs';
import { makeWorkspaceUiCode, validateUiAction, workspaceUiCapability } from '../lib/workspace-ui.mjs';
import { assertActionOutcome } from '../lib/action-catalog.mjs';

const build = '7.5.0-alpha+build.49202', origin = 'https://loginom.test';
const clone = value => JSON.parse(JSON.stringify(value));

// This small DOM is an external UI double, not a replacement of the production
// observer/guards. Every test executes the full serialized browser capability.
function matches(element, selector) {
  if (selector.includes(',')) return selector.split(',').some(part => matches(element, part));
  selector = selector.trim();
  const breadcrumbLabel=/^(\[data-tid\*=";cnrNaviMode;b\.s"\]) (\.x-btn-inner-default-toolbar-small)$/.exec(selector);
  if(breadcrumbLabel)return matches(element,breadcrumbLabel[2]) && !!element.parentElement?.closest(breadcrumbLabel[1]);
  const ownedInput=/^((?:\[data-tid[$^*]?="[^"]+"\])+) (input|textarea|\.x-form-error-msg|img\.x-grid-checkcolumn)$/.exec(selector);
  if(ownedInput)return matches(element,ownedInput[2]) && !!element.parentElement?.closest(ownedInput[1]);
  const not = [...selector.matchAll(/:not\(([^)]+)\)/g)];
  if (not.some(([, inner]) => matches(element, inner))) return false;
  selector = selector.replace(/:not\([^)]+\)/g, '');
  if (selector === ':disabled') return !!element.disabled;
  const tag = selector.match(/^[a-z]+/i)?.[0];
  if (tag && element.tagName !== tag.toUpperCase()) return false;
  const attributes=/\[([^\s=\]$^*]+)(?:([$^*]?=)"([^"]*)")?\]/g;
  for (const [,name,operator,value] of selector.matchAll(attributes)) {
    const actual=element.getAttribute(name);
    if (actual===null) return false;
    if (operator==='=' && actual!==value || operator==='$=' && !actual.endsWith(value)
      || operator==='^=' && !actual.startsWith(value) || operator==='*=' && !actual.includes(value)) return false;
  }
  selector=selector.replace(attributes,'');
  for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!element.classList.contains(name)) return false;
  return true;
}
class Element {
  constructor(tag = 'div', attrs = {}, text = '', box = { x: 0, y: 0, width: 10, height: 10 }) {
    this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.ownText = text;
    this.children = []; this.parentElement = null; this.box = box; this.style = {};
    this.value = ''; this.readOnly = false; this.disabled = false;
    this.classList = { contains: name => (this.attrs.class ?? '').split(' ').includes(name) };
  }
  append(...elements) { for (const element of elements) { this.children.push(element); element.parentElement = this; } return elements.at(-1); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(element => element !== this); this.parentElement = null; }
  get isConnected() { return this.root || !!this.parentElement?.isConnected; }
  get isContentEditable() { return this.attrs.contenteditable === 'true'; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(' '); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  getBoundingClientRect() { return { ...this.box }; }
  matches(selector) { return matches(this, selector); }
  closest(selector) { for (let element = this; element; element = element.parentElement) if (element.matches(selector)) return element; return null; }
  contains(other) { for (let element = other; element; element = element.parentElement) if (element === this) return true; return false; }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelectorAll(selector) { return this.descendants().filter(element => element.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
class Document {
  constructor() {
    this.documentElement = new Element('html', {}, '', { x: 0, y: 0, width: 1000, height: 800 }); this.documentElement.root = true;
    this.body = this.documentElement.append(new Element('body', {}, '', { x: 0, y: 0, width: 1000, height: 800 }));
    this.activeElement = this.body;
  }
  all() { return [this.documentElement, ...this.documentElement.descendants()]; }
  querySelectorAll(selector) { return this.all().filter(element => element.matches(selector)); }
  createTreeWalker(element, kind, filter) {
    if (kind === 1) {
      const items=[];
      const visit=parent=>{for(const child of parent.children){const accepted=filter?.acceptNode(child)??1;if(accepted===2)continue;if(accepted===1)items.push(child);visit(child);}};
      visit(element);let index=0;return {nextNode:()=>items[index++]??null};
    }
    const text = [element, ...element.descendants()].filter(item => item.ownText).map(item => ({ parentElement: item, textContent: item.ownText }));
    let index = 0; return { nextNode: () => text[index++] ?? null };
  }
  elementFromPoint(x, y) {
    return this.all().filter(element => element.style.display !== 'none' && element.style.visibility !== 'hidden' && x >= element.box.x && y >= element.box.y
      && x <= element.box.x + element.box.width && y <= element.box.y + element.box.height).at(-1) ?? null;
  }
}
class Handle {
  constructor(page, element) { this.page = page; this.element = element; }
  async evaluate(fn, arg) {
    if (fn.toString().includes('getBoundingClientRect')) this.page.beforeHandleGeometry?.(this.element);
    return fn(this.element, arg);
  }
  async isVisible() { return this.element.isConnected && this.element.style.display !== 'none'; }
  async isEnabled() { return !this.element.disabled; }
  async boundingBox() { this.page.playwrightBoxReads++; return this.element.isConnected ? { ...this.element.box, ...this.page.playwrightBox } : null; }
  async click() { this.page.events.push('click'); this.page.document.activeElement = this.element; }
  async dblclick() { this.page.events.push('double_click'); this.page.document.activeElement = this.element; }
  async press(key) {
    this.page.events.push(key);
    this.page.onPress?.(key,this.element);
    if (key === 'ControlOrMeta+A') this.page.selectedAll = true;
    if (key === 'Backspace' && this.page.selectedAll) this.element.value = '';
    if (key === 'Enter') this.page.committed = this.element.value;
  }
  async dispose() { this.page.disposed++; }
}
class Page {
  constructor({ clock = Date } = {}) {
    this.document = new Document(); this.events = []; this.disposed = 0; this.location = { origin }; this.clickedPoints = []; this.playwrightBoxReads = 0;
    this.app = { Version: build };
    this.avatar = this.add('button', 'MF;cntMain;tlbMainToolbar;btnAvatar', '', { x: 950, y: 0, width: 30, height: 20 });
    this.tab = this.add('div', 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', 'Сценарий', { x: 10, y: 5, width: 100, height: 20 });
    this.tab.attrs.class = 'x-tab-active';
    const page = this;
    class MutationObserverFixture {
      constructor(callback) { this.callback=callback; this.pending=[]; page.mutationObserver=this; }
      observe(root, options) { this.root=root; this.options=options; }
      takeRecords() { return this.pending.splice(0); }
    }
    this.context = vm.createContext({ document: this.document, location: this.location, bg: { app: this.app },
      MutationObserver: MutationObserverFixture,
      getComputedStyle: element => ({ display: 'block', visibility: 'visible', opacity: '1', ...element.style }), Date: clock, Math });
    this.keyboard = { type: async text => {
      this.events.push('keyboard_type'); const element = this.document.activeElement;
      element.value = this.selectedAll ? text : element.value + text; this.selectedAll = false;
    } };
    this.mouse = {
      click: async (x, y, { clickCount, button }) => {
        this.clickedButton = button;
        this.events.push(clickCount === 2 ? 'double_click' : 'click'); this.clickedPoints.push({ x, y, clickCount });
        this.document.activeElement = this.document.elementFromPoint(x, y);
        if (this.failClick) { this.mouseHeld = true; throw new Error('Click response lost'); }
      },
      move: async (x, y) => { this.events.push('mouse_move'); if (this.mouseHeld && this.failDrag) throw new Error('lost browser response with secret=thismustnotleak'); this.point = { x, y }; },
      down: async () => { this.events.push('mouse_down'); this.mouseHeld = true; },
      up: async options => { this.releasedButton = options?.button; this.events.push('mouse_up'); if (this.failRelease) throw new Error('mouse release interrupted'); this.mouseHeld = false; },
    };
  }
  add(tag, tid, text = '', box = { x: 30, y: 100, width: 100, height: 25 }, parent = this.document.body) {
    // Graph fixture shorthand models Loginom's real cmpDiagram ownership.
    // Tests for foreign elements pass an explicit parent to bypass this helper.
    const prefix=/^(MF;TF(?:-\d+)?);Graph;/.exec(tid??'')?.[1];
    if(prefix && arguments.length<5) {
      const containerTid=prefix+';ModelForm;cmpDiagram';
      parent=this.document.querySelectorAll('[data-tid="'+containerTid+'"]').find(e=>e.isConnected)
        ?? this.document.body.append(new Element('div',{'data-tid':containerTid},'',{x:0,y:50,width:1000,height:700}));
    }
    return parent.append(new Element(tag, tid ? { 'data-tid': tid } : {}, text, box));
  }
  async evaluate(fn, arg) { return fn(arg); }
  viewportSize() { return { width: 1000, height: 800 }; }
  locator(selector, root = this.document) {
    let [anchor, ...steps] = selector.split(' > ');
    let elements = root.querySelectorAll(anchor);
    for (const step of steps) { const index = Number(step.match(/nth-child\((\d+)\)/)[1]) - 1; elements = elements.map(element => element.children[index]).filter(Boolean); }
    return { count: async () => elements.length, elementHandle: async () => new Handle(this, elements[0]),
      locator: child=>this.locator(child,{querySelectorAll:query=>elements.flatMap(e=>e.querySelectorAll(query))}) };
  }
  async execute(options) { return clone(await vm.runInContext(`(${makeWorkspaceUiCode({ expected_build: build, expected_origin: origin, ...options })})`, this.context)(this)); }
  async observe() { const outcome = await this.execute({ mode: 'observe' }); assertActionOutcome(outcome); assert.equal(outcome.status, 'SUCCEEDED'); return outcome.output; }
  async act(action, snapshot) { return this.execute({ mode: 'act', operation_id: 'test-primitive', action, snapshot }); }
}

// Large fake-DOM tests measure traversal/ownership, not the JavaScript selector
// double's speed under parallel test-runner load. Time guards have explicit tests.
function fixtureClock() {
  let elapsed = 0;
  class Clock extends Date { static now() { return elapsed; } }
  return { Date: Clock, advance(ms) { elapsed += ms; } };
}

function tabBarFixture(options) {
  const page=new Page(options),base='MF;cntMain;cntWorkspace;Workspace;t.br';
  const bar=page.add('div',base,'',{x:10,y:5,width:400,height:30});
  page.tab.remove();bar.append(page.tab);
  const target=page.add('a',base+';tb-2','Черновик',{x:140,y:5,width:100,height:20},bar);
  const close=page.add('span',null,'',{x:230,y:5,width:10,height:20},target);close.attrs.class='x-tab-close-btn';
  return {page,base,bar,target};
}

test('tab bar discovery issues only a region then a fresh narrow tab click reports the observed new workspace',async()=>{
  const {page,base,target}=tabBarFixture({ clock: fixtureClock().Date });
  for(let i=0;i<6500;i++)page.add('div',null,'background');
  const roots=await page.execute({mode:'observe',discover_roots:true});
  const region=roots.output.ui.elements.find(e=>e.tid===base);
  assert.ok(region);assert.deepEqual(region.allowed_actions,[]);
  assert.equal(roots.output.ui.elements.some(e=>e.tid===base+';tb-2'),false);
  const raw=await page.execute({mode:'observe',root_ref:region.ref});
  assert.equal(raw.status,'SUCCEEDED');assert.ok(raw.output.scan.detail_elements<10);
  const snapshot=raw.output,pager=createObservationPages(),issued=pager.retain(raw);
  const tab=issued.output.ui.elements.find(e=>e.tid===base+';tb-2');
  assert.ok(tab.allowed_actions.includes('click'));
  assert.doesNotThrow(()=>pager.assertIssued(issued.output.observation_id,{verb:'click',ref:tab.ref}));
  assert.equal(issued.output.ui.elements.some(e=>e.signature?.tag==='span'),false);
  const click=page.mouse.click;page.mouse.click=async(...args)=>{
    await click(...args);page.tab.attrs.class='';target.attrs.class='x-tab-active';
  };
  const result=await page.act({verb:'click',ref:tab.ref},snapshot);
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);
  assert.equal(result.output.workflow_ref.prefix,'MF;TF-2');
  assert.equal(result.output.active_identity,'Черновик');
});

test('tab navigation retains fresh context mask and dangerous-anchor guards',async()=>{
  for(const mode of ['changed_context','changed_epoch','mask','dialog','href','hidden','replacement']) {
    const {page,base,target}=tabBarFixture();
    if(mode==='href')target.attrs.href='https://outside.test';
    if(mode==='hidden')target.style.visibility='hidden';
    if(mode==='mask')page.add('div','mask','Loading',{x:0,y:0,width:500,height:50}).attrs.class='x-mask-msg';
    if(mode==='dialog') {
      page.add('div','msgbox','Confirm',{x:20,y:60,width:300,height:100}).attrs.class='x-window';
      const mask=page.add('div',null,'',{x:0,y:0,width:500,height:50});mask.attrs.class='bg-mask-message';mask.attrs['bg-mask-text']='';
    }
    const roots=await page.execute({mode:'observe',discover_roots:true});
    const region=roots.output.ui.elements.find(e=>e.tid===base);
    const raw=await page.execute({mode:'observe',root_ref:region.ref});
    const tab=raw.output.ui.elements.find(e=>e.tid===base+';tb-2');
    if(['href','hidden'].includes(mode)) {
      assert.ok(!tab || !tab.allowed_actions.includes('click'),mode);continue;
    }
    if(mode==='changed_context'){page.tab.attrs.class='';target.attrs.class='x-tab-active';}
    if(mode==='changed_epoch')page.mutationObserver.pending.push({type:'attributes',target,attributeName:'title'});
    if(mode==='replacement'){
      const parent=target.parentElement;target.remove();page.add('a',base+';tb-2','Черновик',target.box,parent);
    }
    const result=await page.act({verb:'click',ref:tab.ref},raw.output);
    assert.notEqual(result.status,'SUCCEEDED',mode);
    assert.equal(page.events.filter(e=>e==='click').length,0,mode);
  }
});

function calculatorManifestFixture(count=1) {
  const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;
  const base='MF;TF-1;WizrdMCF;',box={x:30,y:100,width:334,height:238},wizard=page.add('div',base.slice(0,-1),'',box);
  page.add('button',base+'CalcDataWizard;btnAddExpr','',undefined,wizard);
  const replace=page.add('button',base+'CalcDataWizard;btnReplaceField','Заменять поле',undefined,wizard);
  const grid=page.add('div',base+'CalcDataWizard;grdExpressions;tbl','',box,wizard);grid.attrs.id='expression-grid';
  Object.assign(grid,{clientWidth:334,scrollWidth:334,clientHeight:238,scrollHeight:238,scrollTop:0,scrollLeft:0});
  const container=page.add('div',null,'',{...box,height:24*count},grid);container.attrs.class='x-grid-item-container';
  const records=[];
  for(let index=0;index<count;index++) {
    const name=index?'Extra'+index:'Amount',rb={x:30,y:100+24*index,width:334,height:24};
    const row=page.add('table',null,'',rb,container);row.attrs={class:'x-grid-item'+(index?'':' x-grid-item-selected'),'data-recordindex':String(index),'data-boundview':'expression-grid'};
    const body=page.add('tbody',null,'',rb,row),tr=page.add('tr',null,'',rb,body);tr.attrs.class='x-grid-row';
    const cell=page.add('td',base+'CalcDataWizard;colExpressionName_'+name,name,{...rb,width:167},tr);
    const icon=page.add('div',null,'',{x:30,y:rb.y,width:16,height:16},cell);icon.attrs.class='bg-TBGDataType-dtFloat bg-grid-icon';
    const label=page.add('td',base+'CalcDataWizard;colExpressionDisplayName_'+name,'Стоимость',{...rb,x:197,width:167},tr);
    const replaced=page.add('td',base+'CalcDataWizard;colExprReplaced_'+name,'',{...rb,x:364,width:0},tr);
    records.push({row,tr,cell,icon,label,replaced});
  }
  return {page,base,wizard,grid,container,records,replace};
}

test('calculator manifest proves bounded definition count while keeping label name text and mapping claims distinct',async()=>{
  const {page,records,replace}=calculatorManifestFixture(2);
  let full=await page.observe(),manifest=full.wizard.calculator_expressions;
  assert.equal(manifest.status,'rendered_expression_definitions');
  assert.equal(manifest.definition_coverage.status,'complete_configured_rows');assert.equal(manifest.definition_coverage.count,2);
  assert.deepEqual(manifest.fields.map(f=>[f.name,f.label,f.type]),[['Amount','Стоимость','real'],['Extra1','Стоимость','real']]);
  assert.equal(manifest.complete,false);assert.equal(manifest.expression_texts_verified,false);assert.equal(manifest.source_identity_verified,false);
  assert.equal(manifest.selected_replacement.value,false);assert.equal(manifest.selected_replacement.row_ref,manifest.fields[0].row_ref);
  replace.attrs.class='x-btn-pressed';
  assert.equal((await page.observe()).wizard.calculator_expressions.selected_replacement.value,true);
  records[0].row.attrs.class='x-grid-item';records[1].row.attrs.class='x-grid-item x-grid-item-selected';
  const next=(await page.observe()).wizard.calculator_expressions;
  assert.equal(next.selected_replacement.row_ref,next.fields[1].row_ref);
  const roots=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(roots.output.wizard.calculator_expressions.definition_coverage.status,'partial');
  const narrow=await page.execute({mode:'observe',root_ref:manifest.definition_coverage.grid_ref});
  assert.equal(narrow.output.wizard.calculator_expressions.definition_coverage.count,2);
  const cellRead=await page.execute({mode:'observe',root_ref:manifest.fields[0].name_ref});
  assert.equal(cellRead.output.wizard.calculator_expressions.definition_coverage.status,'partial');
});

test('calculator complete definitions reject hidden rows gaps clipping duplicates editor and source ambiguity',async()=>{
  for(const mode of ['hidden','gap','offset','overflow','spacer','duplicate_name','wrong_key','duplicate_label','ambiguous_type','missing_type','editor','mask','foreign_view','clipped','sensitive','extra_tr','extra_row','too_many']) {
    const {page,base,wizard,grid,container,records:r}=calculatorManifestFixture(mode==='too_many'?9:2);
    if(mode==='hidden')r[1].row.style.visibility='hidden';
    if(mode==='gap')r[1].row.attrs['data-recordindex']='2';
    if(mode==='offset')container.box.y++;
    if(mode==='overflow')grid.scrollHeight=500;
    if(mode==='spacer')page.add('div',null,'',grid.box,grid);
    if(mode==='duplicate_name'){r[1].cell.ownText='Amount';r[1].cell.attrs['data-tid']=r[0].cell.attrs['data-tid'];}
    if(mode==='wrong_key')r[0].cell.attrs['data-tid']=base+'CalcDataWizard;colExpressionName_Wrong';
    if(mode==='duplicate_label')page.add('td',r[0].label.attrs['data-tid'],'Other',r[0].label.box,r[0].tr);
    if(mode==='ambiguous_type')r[0].icon.attrs.class+=' bg-TBGDataType-dtInteger';
    if(mode==='missing_type')r[0].icon.remove();
    if(mode==='editor')page.add('div',base+'ExprDataEditForm','',undefined,wizard);
    if(mode==='mask')page.add('div','mask','Loading').attrs.class='x-mask-msg';
    if(mode==='foreign_view')r[1].row.attrs['data-boundview']='foreign';
    if(mode==='clipped')r[1].label.box.width=200;
    if(mode==='sensitive')page.add('span','password','secret',undefined,r[1].label);
    if(mode==='extra_tr')page.add('tr',null,'',r[1].row.box,r[1].row);
    if(mode==='extra_row')page.add('div',null,'',r[1].row.box,container);
    const manifest=(await page.observe()).wizard.calculator_expressions;
    assert.equal(manifest.definition_coverage.status,'partial',mode);assert.deepEqual(manifest.fields,[],mode);assert.equal(manifest.complete,false,mode);
    assert.ok(!JSON.stringify(manifest).includes('secret'),mode);
  }
});

test('calculator option readback uses exact Ext owners and never native checked or hidden replacement cells',async()=>{
  for(const mode of ['unchecked','checked','missing','duplicate','foreign','hidden','selected_ambiguous']) {
    const {page,base,wizard,records,replace}=calculatorManifestFixture(2);
    const dialog=page.add('div',base+'ExprDataEditForm');
    for(const name of ['chbIntermediate','chbCached']) {
      const owner=page.add('div',base+'ExprDataEditForm;'+name,'',undefined,mode==='foreign'?wizard:dialog);
      if(mode==='checked')owner.attrs.class='x-form-cb-checked';
      const input=page.add('input',base+'ExprDataEditForm;'+name+';InputEl','',undefined,owner);input.attrs.class='x-form-checkbox';input.attrs.type='button';input.checked=mode!=='checked';
      const display=page.add('span',base+'ExprDataEditForm;'+name+';DisplayEl','',undefined,owner);display.attrs.class='x-form-checkbox';
      if(mode==='hidden')owner.style.visibility='hidden';
      if(mode==='missing')display.remove();
      if(mode==='duplicate')page.add('div',base+'ExprDataEditForm;'+name,'',undefined,dialog);
    }
    if(mode==='selected_ambiguous')records[1].row.attrs.class+=' x-grid-item-selected';
    if(mode==='missing')replace.remove();
    const snapshot=await page.observe(),options=snapshot.wizard.expression_parameters.options;
    for(const name of ['intermediate','cached']) {
      if(['unchecked','checked','selected_ambiguous'].includes(mode)) {
        assert.equal(options[name].status,'observed',mode);assert.equal(options[name].value,mode==='checked',mode);
        assert.equal(options[name].applied_verified,false);
      } else assert.equal(options[name].status,'unobserved',mode);
    }
    if(['missing','selected_ambiguous'].includes(mode))assert.equal(snapshot.wizard.calculator_expressions.selected_replacement.status,'unobserved');
    const narrow=await page.execute({mode:'observe',root_ref:snapshot.wizard.expression_parameters.root_ref});
    assert.deepEqual(narrow.output.wizard.expression_parameters.options,options);
  }
});

test('fixed observation remains available during masks and login, bounds evidence, and never reads password controls', async () => {
  const page = new Page(); page.avatar.remove();
  const password = page.add('input', 'LoginForm;Login;edtPassword'); password.attrs.type = 'password';
  Object.defineProperty(password, 'value', { get() { throw new Error('Password value must never be read'); } });
  page.add('div', null, 'Вычисление', { x: 20, y: 200, width: 100, height: 20 }).attrs.class = 'bg-mask-message';
  page.add('div', null, 'Не удалось прочитать файл', { x: 20, y: 250, width: 200, height: 20 }).attrs.role = 'alert';
  const snapshot = await page.observe();
  assert.equal(snapshot.authenticated, false);
  assert.equal(snapshot.ui.masks[0].text, 'Вычисление');
  assert.equal(snapshot.ui.messages[0].text, 'Не удалось прочитать файл');
  assert.ok(!snapshot.ui.elements.some(element => element.tid?.includes('Password')));
  for (let index = 0; index < 250; index++) page.add('button', `button-${index}`, String(index));
  const bounded = await page.observe(); assert.equal(bounded.ui.elements.length, 240); assert.equal(bounded.ui.truncated.elements, true);
});

test('observation supplies real graph references, visible editor settings, dialogs and table text', async () => {
  const page = new Page();
  page.add('div', 'MF;TF-1;Graph;Источник', '', { x: 200, y: 100, width: 100, height: 50 });
  page.add('span', 'MF;TF-1;Graph;Источник;Label;Label', 'Источник', { x: 200, y: 100, width: 80, height: 20 });
  page.add('div', 'MF;TF-1;Graph;Источник;Output_Data-0', '', { x: 290, y: 120, width: 10, height: 10 });
  page.add('div', 'MF;TF-1;Graph;Источник|Output_Data-0|Приёмник|Input_Data-0');
  const dialog = page.add('div', 'Dialog', '', { x: 400, y: 100, width: 300, height: 300 }); dialog.attrs.role = 'dialog'; dialog.attrs['aria-label'] = 'Настройка';
  const field = page.add('textarea', null, '', { x: 450, y: 150, width: 150, height: 80 }, dialog); field.value = 'a;b\n1;2';
  const table = page.add('table', null, '', { x: 20, y: 450, width: 200, height: 100 });
  page.add('td', null, '42', { x: 20, y: 450, width: 100, height: 20 }, table);
  const snapshot = await page.observe();
  assert.equal(snapshot.nodes[0].node_ref.node_label, 'Источник'); assert.equal(snapshot.nodes[0].ports.length, 1);
  assert.equal(snapshot.links.length, 1); assert.equal(snapshot.ui.dialogs[0].title, 'Настройка');
  const observedField = snapshot.ui.elements.find(element => element.kind === 'field');
  assert.equal(observedField.value, 'a;b\n1;2'); assert.deepEqual(observedField.identity, { anchor_tid: 'Dialog', path: [0] });
  assert.equal(snapshot.ui.table_cells[0].text, '42');
});

function deleteConfirmation(page, { id = 'msgbox-1', y = 340, z = 19000 } = {}) {
  const dialog = page.add('div', null, 'Удалить выделенную связь?', { x: 460, y, width: 280, height: 140 });
  dialog.attrs.class = 'x-window x-message-box'; dialog.style.zIndex = String(z);
  const yes = page.add('a', id + ';tlb;yes', 'Удалить', { x: 500, y: y + 90, width: 90, height: 25 }, dialog);
  const no = page.add('a', id + ';tlb;no', 'Нет', { x: 610, y: y + 90, width: 70, height: 25 }, dialog);
  return { dialog, yes, no };
}

test('native message-box anchor buttons are actionable inside a foreground dialog above its masked workspace', async () => {
  const page = new Page();
  page.add('span', 'MF;TF-1;Graph;Источник;Label;Label', 'Источник');
  page.add('span', 'MF;TF-1;Graph;Приёмник;Label;Label', 'Приёмник');
  page.add('g', 'MF;TF-1;Graph;Источник;Output_Data-0');
  page.add('g', 'MF;TF-1;Graph;Приёмник;Input_Data-0');
  const edge = page.add('g', 'MF;TF-1;Graph;Источник|Output_Data-0|Приёмник|Input_Data-0');
  const background = page.add('div', null, 'Компоненты Импорт Текстовый файл Калькулятор', { x: 40, y: 70, width: 900, height: 700 });
  background.attrs.class = 'bg-mask-message'; background.attrs['bg-mask-text'] = '';
  const { dialog, yes } = deleteConfirmation(page);
  const snapshot = await page.observe(), buttons = snapshot.ui.elements.filter(element => element.scope === 'dialog');
  assert.deepEqual(buttons.map(element => element.label), ['Удалить', 'Нет']);
  assert.ok(buttons.every(element => element.signature.dialog_ref === snapshot.ui.dialogs[0].ref && element.allowed_actions.includes('click')));
  assert.equal(snapshot.ui.truncated.elements, false);
  assert.equal(snapshot.ui.masks[0].kind, 'modal_background'); assert.equal(snapshot.ui.masks[0].text, '');
  const click = page.mouse.click;
  page.mouse.click = async (...args) => { await click(...args); if (page.document.activeElement === yes) { edge.remove(); dialog.remove(); background.remove(); } };
  const result = await page.act({ verb: 'click', ref: buttons[0].ref }, snapshot);
  assert.equal(result.status, 'SUCCEEDED'); assert.equal(page.clickedPoints.length, 1);
  assert.deepEqual(result.output.links, []); assert.equal(result.output.nodes.length, 2);
  assert.deepEqual(result.output.nodes.map(node => node.ports.length), [1, 1]);
  assert.deepEqual(result.output.ui.dialogs, []); assert.deepEqual(result.output.ui.masks, []);
});

test('a modal background never permits workspace controls or controls of a lower dialog', async () => {
  const page = new Page(); const button = page.add('button', 'Actions;btnRun', 'Выполнить');
  const mask = page.add('div', null, 'Компоненты', { x: 40, y: 70, width: 900, height: 700 }); mask.attrs.class = 'bg-mask-message'; mask.attrs['bg-mask-text'] = '';
  const lower = deleteConfirmation(page), top = deleteConfirmation(page, { id: 'msgbox-2', y: 510, z: 20000 });
  const snapshot = await page.observe();
  for (const tid of [button.getAttribute('data-tid'), lower.yes.getAttribute('data-tid')]) {
    const target = snapshot.ui.elements.find(element => element.tid === tid);
    for (const verb of ['click','right_click']) {
      const result = await page.act({ verb, ref: target.ref }, snapshot);
      assert.equal(result.status, 'NOT_APPLIED'); assert.equal(result.error.code, 'UI_MASKED');
    }
  }
  assert.deepEqual(page.clickedPoints, []);
  const allowed = snapshot.ui.elements.find(element => element.tid === top.no.getAttribute('data-tid'));
  const result = await page.act({ verb: 'click', ref: allowed.ref }, snapshot);
  assert.equal(result.status, 'SUCCEEDED'); assert.equal(page.document.activeElement, top.no);
});

test('dialog, ancestor and painted external masks all prevent confirmation', async () => {
  for (const blocking of ['dialog_mask', 'ancestor_mask', 'external_mask', 'point_overlay']) {
    const page = new Page();
    const background = page.add('div', null, 'Компоненты', { x: 40, y: 70, width: 900, height: 700 }); background.attrs.class = 'bg-mask-message'; background.attrs['bg-mask-text'] = '';
    const { dialog, yes } = deleteConfirmation(page);
    const overlay = page.add('div', null, 'Ожидание', { ...yes.box }, blocking === 'dialog_mask' ? dialog : page.document.body);
    if (blocking !== 'point_overlay') { overlay.attrs.class = 'bg-mask-message'; overlay.attrs['bg-mask-text'] = 'Загрузка'; }
    if (blocking === 'ancestor_mask') { dialog.remove(); overlay.append(dialog); }
    const snapshot = await page.observe(), button = snapshot.ui.elements.find(element => element.tid === yes.getAttribute('data-tid'));
    const result = await page.act({ verb: 'click', ref: button.ref }, snapshot);
    assert.equal(result.status, 'NOT_APPLIED', blocking);
    assert.equal(result.error.code, ['dialog_mask', 'ancestor_mask'].includes(blocking) ? 'UI_MASKED' : 'UI_REFERENCE_OBSCURED', blocking);
    assert.deepEqual(page.clickedPoints, [], blocking);
  }
});

test('background loading text is preserved without blocking the exposed foreground dialog', async () => {
  for (const maskKind of ['loginom', 'ext']) {
    const page = new Page();
    const mask = page.add('div', null, maskKind === 'ext' ? 'Загрузка данных' : 'Компоненты Импорт', { x: 40, y: 70, width: 900, height: 700 });
    mask.attrs.class = maskKind === 'ext' ? 'x-mask-msg' : 'bg-mask-message';
    if (maskKind === 'loginom') mask.attrs['bg-mask-text'] = 'Загрузка данных';
    const { yes } = deleteConfirmation(page);
    const snapshot = await page.observe(), button = snapshot.ui.elements.find(element => element.tid === yes.getAttribute('data-tid'));
    assert.equal(snapshot.ui.masks[0].kind, 'modal_background'); assert.equal(snapshot.ui.masks[0].text, 'Загрузка данных');
    const result = await page.act({ verb: 'click', ref: button.ref }, snapshot);
    assert.equal(result.status, 'SUCCEEDED'); assert.equal(page.clickedPoints.length, 1); assert.equal(page.document.activeElement, yes);
  }
});

test('message-box discovery does not exempt anchors with navigation or script hrefs', async () => {
  for (const href of ['#', 'javascript:void(0)', 'https://external.test']) {
    const page = new Page(), { yes } = deleteConfirmation(page); yes.attrs.href = href;
    const snapshot = await page.observe(), button = snapshot.ui.elements.find(element => element.tid === yes.getAttribute('data-tid'));
    assert.ok(button); assert.deepEqual(button.allowed_actions, []);
    assert.throws(() => validateUiAction({ verb: 'click', ref: button.ref }, snapshot), /does not support/);
  }
});

test('opaque editor reference performs real keyboard input and leaves commit to a separate observed action', async () => {
  const page = new Page(), editor = page.add('textarea', null); editor.value = 'Старое имя';
  const snapshot = await page.observe(), field = snapshot.ui.elements.find(element => element.kind === 'field');
  const applied = await page.act({ verb: 'fill', ref: field.ref, text: 'Исправленное имя' }, snapshot);
  assert.equal(applied.status, 'SUCCEEDED'); assert.equal(applied.cleanup_complete, true);
  assert.equal(applied.output.gesture_applied, true); assert.equal(applied.output.verification_required, true);
  assert.equal(editor.value, 'Исправленное имя'); assert.equal(page.committed, undefined);
  assert.deepEqual(page.events, ['click', 'ControlOrMeta+A', 'keyboard_type']);
  const committed = await page.act({ verb: 'press', ref: field.ref, key: 'Enter' }, applied.output);
  assert.equal(committed.status, 'SUCCEEDED'); assert.equal(page.committed, 'Исправленное имя');
});

test('active graph editors and graph controls survive the cap, while inactive workflows are excluded', async () => {
  const page = new Page();
  for (let index = 0; index < 250; index++) page.add('button', `MF;TF-1;ModelForm;btnComponent-${index}`, String(index));
  const graph = page.add('div', 'MF;TF-1;ModelForm;cmpDiagram', '', { x: 300, y: 300, width: 500, height: 300 });
  page.add('textarea', null, '', { x: 350, y: 350, width: 100, height: 20 }, graph);
  page.add('span', 'MF;TF-1;Graph;Исправить;Label;Label', 'Исправить', { x: 350, y: 400, width: 100, height: 20 }, graph);
  page.add('button', 'MF;TF-2;ModelForm;btnOther', 'Неактивный сценарий');
  const snapshot = await page.observe();
  assert.equal(snapshot.ui.elements[0].scope, 'graph_editor');
  assert.deepEqual(snapshot.ui.elements[0].identity, { anchor_tid: 'MF;TF-1;ModelForm;cmpDiagram', path: [0] });
  assert.ok(snapshot.ui.elements.some(element => element.tid?.includes(';Graph;Исправить;Label;Label')));
  assert.ok(!snapshot.ui.elements.some(element => element.tid?.startsWith('MF;TF-2;')));
  assert.equal(snapshot.ui.truncated.elements, true);
});

test('same-looking replacement, changed value, and duplicate IDs cannot retarget an observed reference', async () => {
  for (const change of ['replacement', 'value', 'duplicate']) {
    const page = new Page(), field = page.add('input', 'Parameters;edtValue'); field.value = 'old';
    const snapshot = await page.observe(), ref = snapshot.ui.elements.find(element => element.tid === 'Parameters;edtValue').ref;
    if (change === 'replacement') { field.remove(); const replacement = page.add('input', 'Parameters;edtValue'); replacement.value = 'old'; }
    if (change === 'value') field.value = 'external change';
    if (change === 'duplicate') page.add('input', 'Parameters;edtValue');
    const outcome = await page.act({ verb: 'fill', ref, text: 'new' }, snapshot);
    assert.equal(outcome.status, 'NOT_APPLIED', change); assert.equal(outcome.error.code, 'UI_REFERENCE_STALE', change);
    assert.deepEqual(page.events, [], change); assert.equal(outcome.effect_possible, false);
  }
});

test('stable SVG DOM geometry dispatches the checked point even when Playwright reports a different box', async () => {
  for (const verb of ['click', 'double_click']) {
    const page = new Page();
    const shape = page.add('g', 'MF;TF-1;Graph;Узел', '', { x: 620, y: 372, width: 56, height: 76 });
    page.playwrightBox = { x: 620, y: 372, width: 56, height: 56 };
    const snapshot = await page.observe(), element = snapshot.ui.elements.find(item => item.tid === shape.getAttribute('data-tid'));
    const result = await page.act({ verb, ref: element.ref }, snapshot);
    assert.equal(result.status, 'SUCCEEDED'); assert.equal(page.playwrightBoxReads, 0);
    assert.deepEqual(page.clickedPoints, [{ x: 648, y: 410, clickCount: verb === 'click' ? 1 : 2 }]);
    assert.equal(page.document.activeElement, shape);
  }
});

test('a DOM geometry change during preflight is rejected before any checked-point click', async () => {
  const page = new Page(), shape = page.add('g', 'MF;TF-1;Graph;Узел');
  const snapshot = await page.observe(), element = snapshot.ui.elements.find(item => item.tid === shape.getAttribute('data-tid'));
  page.beforeHandleGeometry = target => { target.box.x += 4; };
  const result = await page.act({ verb: 'click', ref: element.ref }, snapshot);
  assert.equal(result.status, 'NOT_APPLIED'); assert.equal(result.error.code, 'UI_REFERENCE_STALE');
  assert.equal(result.effect_possible, false); assert.deepEqual(page.clickedPoints, []);
});

function bentSvgLink(page, { matrix = { a: 1, b: 0, c: 0, d: 1, e: 100, f: 100 }, box = { x: 100, y: 100, width: 200, height: 100 } } = {}) {
  const link = page.add('g', 'MF;TF-1;Graph;Источник|Output_Data-0|Приёмник|Input_Data-0', '', box);
  const path = page.add('path', null, '', box, link);
  path.getTotalLength = () => 300;
  path.getPointAtLength = length => length <= 100 ? { x: 0, y: length } : { x: length - 100, y: 100 };
  path.getScreenCTM = () => matrix;
  page.document.elementFromPoint = (x, y) => {
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    const local = { x: (matrix.d * (x - matrix.e) - matrix.c * (y - matrix.f)) / determinant,
      y: (-matrix.b * (x - matrix.e) + matrix.a * (y - matrix.f)) / determinant };
    const painted = (Math.abs(local.x) <= 1 && local.y >= 0 && local.y <= 100)
      || (Math.abs(local.y - 100) <= 1 && local.x >= 0 && local.x <= 200);
    return painted ? path : page.document.body;
  };
  return { link, path };
}

test('bent SVG link is clicked once on its actual painted geometry instead of empty bounding-box center', async () => {
  const page = new Page(); const { link, path } = bentSvgLink(page);
  assert.equal(page.document.elementFromPoint(200, 150), page.document.body);
  const snapshot = await page.observe(), element = snapshot.ui.elements.find(item => item.tid === link.getAttribute('data-tid'));
  const result = await page.act({ verb: 'click', ref: element.ref }, snapshot);
  assert.equal(result.status, 'SUCCEEDED'); assert.deepEqual(page.clickedPoints, [{ x: 150, y: 200, clickCount: 1 }]);
  assert.equal(page.document.activeElement, path);
  assert.ok(result.trace.some(event => event.event === 'ui_link_hit_point' && event.source === 'svg_geometry' && event.candidates_checked === 2));
});

test('SVG path points use their actual screen transform and already-valid center remains the first choice', async () => {
  const page = new Page();
  const { link, path } = bentSvgLink(page, { matrix: { a: 0, b: 2, c: -2, d: 0, e: 500, f: 100 }, box: { x: 300, y: 100, width: 200, height: 400 } });
  let snapshot = await page.observe(), element = snapshot.ui.elements.find(item => item.tid === link.getAttribute('data-tid'));
  const transformed = await page.act({ verb: 'click', ref: element.ref }, snapshot);
  assert.equal(transformed.status, 'SUCCEEDED'); assert.deepEqual(page.clickedPoints, [{ x: 300, y: 200, clickCount: 1 }]);
  page.document.elementFromPoint = () => path;
  path.getTotalLength = () => { throw new Error('No path sampling needed for a valid center'); };
  snapshot = await page.observe(); element = snapshot.ui.elements.find(item => item.tid === link.getAttribute('data-tid'));
  const centered = await page.act({ verb: 'click', ref: element.ref }, snapshot);
  assert.equal(centered.status, 'SUCCEEDED'); assert.deepEqual(page.clickedPoints.at(-1), { x: 400, y: 300, clickCount: 1 });
  assert.ok(centered.trace.some(event => event.event === 'ui_link_hit_point' && event.source === 'box_center' && event.candidates_checked === 1));
});

test('malformed SVG geometry and an actually covered link never become blind click retries', async () => {
  for (const failure of ['length', 'point', 'matrix', 'throw', 'covered', 'no_painted_point']) {
    const page = new Page(); const { link, path } = bentSvgLink(page);
    if (failure === 'length') path.getTotalLength = () => NaN;
    if (failure === 'point') path.getPointAtLength = () => ({ x: Infinity, y: 100 });
    if (failure === 'matrix') path.getScreenCTM = () => null;
    if (failure === 'throw') path.getPointAtLength = () => { throw new Error('Detached geometry'); };
    if (failure === 'covered') { const overlay = page.add('div', null, 'Overlay', { ...link.box }); page.document.elementFromPoint = () => overlay; }
    if (failure === 'no_painted_point') page.document.elementFromPoint = () => page.document.body;
    const snapshot = await page.observe(), element = snapshot.ui.elements.find(item => item.tid === link.getAttribute('data-tid'));
    const result = await page.act({ verb: 'click', ref: element.ref }, snapshot);
    assert.equal(result.status, 'NOT_APPLIED', failure); assert.equal(result.error.code, 'UI_REFERENCE_OBSCURED', failure);
    assert.equal(result.effect_possible, false, failure); assert.deepEqual(page.clickedPoints, [], failure);
  }
});

test('only exact graph-link identities admit painted zero-height SVG strokes', async () => {
  const page = new Page();
  const link = page.add('g', 'MF;TF-1;Graph;Источник|Output_Data-0|Приёмник|Input_Data-0', '', { x: 100, y: 100, width: 200, height: 0 });
  const stroke = page.add('path', null, '', { ...link.box }, link);
  page.document.elementFromPoint = (x, y) => x >= 100 && x <= 300 && Math.abs(y - 100) <= 1 ? stroke : page.document.body;
  page.add('button', 'Actions;btnEmpty', '', { ...link.box });
  page.add('g', link.getAttribute('data-tid') + ';SourceBend', '', { ...link.box });
  const snapshot = await page.observe(), element = snapshot.ui.elements.find(item => item.tid === link.getAttribute('data-tid'));
  assert.ok(element); assert.ok(!snapshot.ui.elements.some(item => item.tid === 'Actions;btnEmpty' || item.tid?.endsWith(';SourceBend')));
  const result = await page.act({ verb: 'click', ref: element.ref }, snapshot);
  assert.equal(result.status, 'SUCCEEDED'); assert.deepEqual(page.clickedPoints, [{ x: 200, y: 100, clickCount: 1 }]);
  link.style.visibility = 'hidden';
  const hidden = await page.observe(); assert.ok(!hidden.ui.elements.some(item => item.ref === element.ref));
});

test('an uncertain checked-point click releases the mouse and does not claim a completed gesture', async () => {
  const page = new Page(); page.failClick = true;
  const button = page.add('button', 'Controls;btnExecute', 'Выполнить');
  const snapshot = await page.observe(), element = snapshot.ui.elements.find(item => item.tid === button.getAttribute('data-tid'));
  const result = await page.act({ verb: 'click', ref: element.ref }, snapshot);
  assert.equal(result.status, 'AMBIGUOUS'); assert.equal(result.cleanup_complete, true);
  assert.equal(page.mouseHeld, false); assert.equal(page.events.filter(event => event === 'mouse_up').length, 1);
  assert.equal(result.output.gesture_applied, undefined);
});

test('UI actions reject changed context, masks, new dialogs, hidden and covered controls before mutation', async () => {
  for (const change of ['origin', 'build', 'workflow', 'mask', 'dialog', 'hidden', 'covered']) {
    const page = new Page(), button = page.add('button', 'Actions;btnRun', 'Выполнить');
    const snapshot = await page.observe(), ref = snapshot.ui.elements.find(element => element.tid === 'Actions;btnRun').ref;
    if (change === 'origin') page.location.origin = 'https://other.test';
    if (change === 'build') page.app.Version = 'different';
    if (change === 'workflow') page.tab.attrs['data-tid'] = 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-2';
    if (change === 'mask') page.add('div', null, 'Ожидание').attrs.class = 'bg-mask-message';
    if (change === 'dialog') page.add('div', null, 'Предупреждение').attrs.role = 'dialog';
    if (change === 'hidden') button.style.display = 'none';
    if (change === 'covered') page.add('div', null, 'Overlay', { ...button.box });
    const outcome = await page.act({ verb: 'click', ref }, snapshot);
    assert.equal(outcome.status, 'NOT_APPLIED', change); assert.deepEqual(page.events, [], change);
  }
});

test('drag emits actual bounded mouse gestures and releases the mouse after a failure', async () => {
  for (const failure of [false, true]) {
    const page = new Page(); page.failDrag = failure;
    page.add('div', 'MF;TF-1;Graph;Источник;Output_Data-0', '', { x: 100, y: 100, width: 10, height: 10 });
    page.add('div', 'MF;TF-1;Graph;Приёмник;Input_Data-2', '', { x: 300, y: 100, width: 10, height: 10 });
    const snapshot = await page.observe(), ports = snapshot.ui.elements.filter(element => element.kind === 'port');
    const outcome = await page.act({ verb: 'drag', source_ref: ports[0].ref, target_ref: ports[1].ref }, snapshot);
    assert.equal(outcome.status, failure ? 'AMBIGUOUS' : 'SUCCEEDED'); assert.equal(outcome.cleanup_complete, true);
    assert.equal(page.mouseHeld, false); assert.equal(page.events.filter(event => event === 'mouse_up').length, 1);
    assert.ok(outcome.trace.some(event => event.event === 'cleanup_completed' && event.resource === 'mouse'));
    assert.ok(!JSON.stringify(outcome).includes('thismustnotleak'));
  }
});

test('unconfirmed mouse release is explicitly recorded and never reported as completed cleanup', async () => {
  const page = new Page(); page.failDrag = true; page.failRelease = true;
  page.add('div', 'MF;TF-1;Graph;A;Output_Data-0', '', { x: 100, y: 100, width: 10, height: 10 });
  page.add('div', 'MF;TF-1;Graph;B;Input_Data-0', '', { x: 300, y: 100, width: 10, height: 10 });
  const snapshot = await page.observe(), ports = snapshot.ui.elements.filter(element => element.kind === 'port');
  const outcome = await page.act({ verb: 'drag', source_ref: ports[0].ref, target_ref: ports[1].ref }, snapshot);
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.equal(outcome.cleanup_complete, false); assert.equal(outcome.error.code, 'UI_CLEANUP_FAILED');
});

test('failure output observes the graph after finally mouse-up, including effects caused by release', async () => {
  const page = new Page(); page.failDrag = true;
  page.add('div', 'MF;TF-1;Graph;A;Output_Data-0', '', { x: 100, y: 100, width: 10, height: 10 });
  page.add('div', 'MF;TF-1;Graph;B;Input_Data-0', '', { x: 300, y: 100, width: 10, height: 10 });
  const originalUp = page.mouse.up;
  page.mouse.up = async () => { await originalUp(); page.add('span', 'MF;TF-1;Graph;Последствие;Label;Label', 'Последствие'); };
  const snapshot = await page.observe(), ports = snapshot.ui.elements.filter(element => element.kind === 'port');
  const outcome = await page.act({ verb: 'drag', source_ref: ports[0].ref, target_ref: ports[1].ref }, snapshot);
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.equal(outcome.cleanup_complete, true);
  assert.deepEqual(outcome.output.nodes.map(node => node.node_ref.node_label), ['Последствие']);
  assert.equal(outcome.output.verification_required, true);
});

test('navigation links, URL/file/password fields and code editors are not actionable and model selectors are rejected', async () => {
  const page = new Page();
  const anchor = page.add('a', null, 'External'); anchor.attrs.href = 'https://external.test';
  page.add('button', 'Link;btnOpen', 'Открыть', undefined, anchor);
  for (const type of ['url', 'file', 'password']) { const input = page.add('input', `Field-${type}`); input.attrs.type = type; }
  const code = page.add('textarea', 'Editor;python'); code.value = 'not executed';
  const snapshot = await page.observe();
  for (const element of snapshot.ui.elements.filter(element => /Link;|Field-|python/.test(element.tid ?? ''))) assert.deepEqual(element.allowed_actions, []);
  assert.throws(() => validateUiAction({ verb: 'click', ref: 'ui-1', selector: 'body' }), /fields/);
  assert.throws(() => validateUiAction({ verb: 'press', ref: 'ui-1', key: 'ControlOrMeta+V' }), /Unsupported UI key/);
  assert.throws(() => validateUiAction({ verb: 'fill', ref: 'ui-1', text: 'x'.repeat(2049) }), /2048/);
  assert.throws(() => validateUiAction({ verb: 'click', ref: '[data-tid="foo"]' }), /opaque/);
  assert.throws(() => validateUiAction({ verb: 'click', ref: 'ui-missing' }, snapshot), /absent/);
});

test('palette spans provide observed references for enumeration without raw selectors', async () => {
  const page = new Page();
  const expander = page.add('span', 'MF;TF-1;ModelForm;colVendors_Компоненты>Импорт;TreeExpander', '', { x: 30, y: 50, width: 20, height: 20 });
  page.add('span', 'MF;TF-1;ModelForm;colVendors_Компоненты>Импорт>Текстовый_файл;TreeText', 'Текстовый файл');
  const snapshot = await page.observe();
  const target = snapshot.ui.elements.find(item => item.tid === expander.getAttribute('data-tid'));
  assert.ok(target?.allowed_actions.includes('click'));
  assert.ok(snapshot.ui.elements.some(item => item.label === 'Текстовый файл'));
  assert.equal((await page.act({ verb: 'click', ref: target.ref }, snapshot)).status, 'SUCCEEDED');
  expander.remove();
  assert.equal((await page.act({ verb: 'click', ref: target.ref }, snapshot)).status, 'NOT_APPLIED');
});

test('right click uses the checked ref and releases the right button after a lost reply', async () => {
  for (const failure of [false, true]) {
    const page = new Page();
    page.add('button', 'Node;btnMenu', 'Menu');
    const snapshot = await page.observe();
    const target = snapshot.ui.elements.find(e => e.tid === 'Node;btnMenu');
    validateUiAction({verb:'right_click',ref:target.ref},snapshot);
    page.failClick = failure;
    const outcome = await page.act({verb:'right_click',ref:target.ref},snapshot);
    assert.equal(page.clickedButton,'right');
    assert.equal(page.clickedPoints.length,1);
    assert.equal(outcome.status,failure ? 'AMBIGUOUS' : 'SUCCEEDED');
    assert.equal(outcome.cleanup_complete,true);
    if (failure) assert.equal(page.releasedButton,'right');
    else assert.ok(outcome.trace.some(e=>e.event==='ui_gesture_applied' && e.verb==='right_click'));
  }
  assert.throws(()=>validateUiAction({verb:'right_click',ref:'ui-one',x:100}), /fields/);
});

test('initial region discovery avoids a large document and only admits later detailed reads', async () => {
  const page=new Page({ clock: fixtureClock().Date });
  const form=page.add('div','Form;Main','',{x:30,y:100,width:300,height:100});form.attrs.role='form';form.attrs['aria-label']='Import settings';
  page.add('input','Form;edtInside','',{x:35,y:110,width:100,height:25},form);
  const background=page.add('div','Background');
  for(let i=0;i<6500;i++) page.add('div',null,'',{x:600,y:500,width:1,height:1},background);
  let visits=0;const original=page.document.createTreeWalker.bind(page.document);
  page.document.createTreeWalker=(node,kind)=>{visits++;return original(node,kind);};
  const discovered=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(discovered.status,'SUCCEEDED');assert.equal(visits,0);
  assert.equal(discovered.output.observation_kind,'roots');
  const root=discovered.output.ui.elements.find(e=>e.tid==='Form;Main');
  assert.ok(root);assert.deepEqual(root.allowed_actions,[]);
  assert.equal(discovered.output.ui.truncated.masks,true);
  assert.throws(()=>validateUiAction({verb:'click',ref:root.ref},discovered.output),/does not support/);
  const detail=await page.execute({mode:'observe',root_ref:root.ref});
  assert.equal(detail.status,'SUCCEEDED');assert.ok(detail.output.ui.elements.some(e=>e.tid==='Form;edtInside'));
});

test('global toolbar is discoverable and readable above a large workspace', async () => {
  const page=new Page({ clock: fixtureClock().Date });
  const toolbar=page.add('div','MF;cntMain;tlbMainToolbar');
  page.add('button','MF;cntMain;tlbMainToolbar;btnFilestorage','Файлы',undefined,toolbar);
  for(let i=0;i<6500;i++) page.add('div',null,'background');
  let visits=0;const walker=page.document.createTreeWalker.bind(page.document);
  page.document.createTreeWalker=(root,kind)=>{if(kind===1)visits++;return walker(root,kind);};
  const discovery=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(discovery.status,'SUCCEEDED');assert.equal(visits,0);
  const root=discovery.output.ui.elements.find(e=>e.tid==='MF;cntMain;tlbMainToolbar');
  assert.ok(root);assert.deepEqual(root.allowed_actions,[]);
  const detail=await page.execute({mode:'observe',root_ref:root.ref});
  assert.equal(detail.status,'SUCCEEDED');assert.equal(visits,1);
  const button=detail.output.ui.elements.find(e=>e.tid.endsWith(';btnFilestorage'));
  assert.ok(button.ref.startsWith('ui-'));assert.ok(button.allowed_actions.includes('click'));
  assert.ok(detail.output.scan.detail_elements<10);
});

test('package menu remains discoverable above a large workflow', async () => {
  const page=new Page({ clock: fixtureClock().Date });
  const menu=page.add('div','MF;MainMenuForm');
  page.add('button','MF;MainMenuForm;btnClosePackage','Закрыть пакет',undefined,menu);
  for(let i=0;i<6500;i++) page.add('div',null,'background');
  const discovery=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(discovery.status,'SUCCEEDED');
  const root=discovery.output.ui.elements.find(e=>e.tid==='MF;MainMenuForm');
  assert.ok(root);assert.deepEqual(root.allowed_actions,[]);
  const detail=await page.execute({mode:'observe',root_ref:root.ref});
  assert.equal(detail.status,'SUCCEEDED');
  const close=detail.output.ui.elements.find(e=>e.tid==='MF;MainMenuForm;btnClosePackage');
  assert.ok(close.allowed_actions.includes('click'));
});

test('selected root traverses only its small subtree while a large background and global blocker remain outside', async () => {
  const page=new Page({ clock: fixtureClock().Date }),root=page.add('div','Form;btnSection','Section',{x:30,y:100,width:300,height:100});
  page.add('input','Form;edtInside','',{x:35,y:110,width:100,height:25},root);
  const initial=await page.observe(),ref=initial.ui.elements.find(e=>e.tid==='Form;btnSection').ref;
  const large=page.add('div','Background');
  for(let i=0;i<6500;i++) page.add('div',null,'',{x:600,y:500,width:1,height:1},large);
  assert.equal((await page.execute({mode:'observe'})).error.code,'UI_SCAN_LIMIT');
  let elementVisits=0;const original=page.document.createTreeWalker.bind(page.document);
  page.document.createTreeWalker=(node,kind)=>{
    const walker=original(node,kind);
    return {nextNode:()=>{const value=walker.nextNode();if(kind===1 && value) elementVisits++;return value;}};
  };
  const narrow=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(narrow.status,'SUCCEEDED');assert.equal(elementVisits,1);
  assert.equal(narrow.output.scan.detail_elements,2);
  assert.equal(narrow.output.observation_root.global_scan,false);
  assert.equal(narrow.output.authenticated,true);assert.deepEqual(narrow.output.workflow_ref,initial.workflow_ref);
  assert.equal(narrow.output.ui.truncated.nodes,true);
  const mask=page.add('div',null,'Busy',{x:0,y:0,width:1000,height:800},large);mask.attrs.class='bg-mask-message';
  const blocked=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(blocked.output.ui.masks.length,1);
  const target=blocked.output.ui.elements.find(e=>e.tid==='Form;edtInside');
  assert.equal((await page.act({verb:'fill',ref:target.ref,text:'x'},blocked.output)).error.code,'UI_MASKED');
  mask.remove();
  page.add('input','Form;edtInside','',{x:650,y:550,width:100,height:25},large);
  const duplicate=await page.execute({mode:'observe',root_ref:ref});
  const ambiguous=duplicate.output.ui.elements.find(e=>e.tid==='Form;edtInside');
  const denied=await page.act({verb:'fill',ref:ambiguous.ref,text:'x'},duplicate.output);
  assert.equal(denied.error.code,'UI_REFERENCE_STALE');
  assert.equal(denied.effect_possible,false);
});

test('root detail preserves global masks and rejects a detached root', async () => {
  const page=new Page(),root=page.add('div','Form;btnSection','Section',{x:30,y:100,width:300,height:100});
  const inside=page.add('input','Form;edtInside','',{x:35,y:110,width:100,height:25},root);
  page.add('input','Other;edtOutside','',{x:400,y:110,width:100,height:25});
  const initial=await page.observe(),ref=initial.ui.elements.find(e=>e.tid==='Form;btnSection').ref;
  const result=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(result.status,'SUCCEEDED');
  assert.equal(result.output.authenticated,true);assert.deepEqual(result.output.workflow_ref,initial.workflow_ref);
  assert.equal(result.output.observation_root.ref,ref);
  assert.ok(result.output.ui.elements.some(e=>e.tid==='Form;edtInside'));
  assert.ok(!result.output.ui.elements.some(e=>e.tid==='Other;edtOutside'));
  assert.equal(result.output.ui.truncated.elements,true);
  const mask=page.add('div',null,'Busy',{x:0,y:0,width:1000,height:800});mask.attrs.class='bg-mask-message';
  const blocked=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(blocked.output.ui.masks.length,1);
  const target=blocked.output.ui.elements.find(e=>e.tid===inside.getAttribute('data-tid'));
  assert.equal((await page.act({verb:'fill',ref:target.ref,text:'x'},blocked.output)).error.code,'UI_MASKED');
  root.remove();
  assert.equal((await page.execute({mode:'observe',root_ref:ref})).error.code,'UI_ROOT_STALE');
});

test('field observation labels bounded prefixes and never admits a gesture against an unseen suffix', async () => {
  const page=new Page();const field=page.add('textarea','Form;edtLong');
  field.value='x'.repeat(2048);
  const initial=await page.observe();const target=initial.ui.elements.find(e=>e.tid==='Form;edtLong');
  assert.equal(target.value_truncated,false);assert.equal(target.value_length_utf16,2048);
  assert.ok(target.allowed_actions.includes('fill'));
  field.value+='hidden suffix';
  const snapshot=await page.observe(),long=snapshot.ui.elements.find(e=>e.tid==='Form;edtLong');
  assert.equal(long.value.length,2048);assert.equal(long.value_truncated,true);
  assert.equal(long.value_length_utf16,2061);assert.deepEqual(long.allowed_actions,[]);
  assert.ok(!JSON.stringify(snapshot).includes('hidden suffix'));
  assert.equal((await page.act({verb:'fill',ref:target.ref,text:'replacement'},initial)).status,'NOT_APPLIED');
  assert.deepEqual(page.clickedPoints,[]);assert.equal(field.value.length,2061);
});

test('DOM epoch rejects ABA before any gesture and consumes pending mutation records', async () => {
  const page = new Page(); page.add('button','Safe;btnAction','Action');
  const before = await page.observe();
  const target = before.ui.elements.find(e=>e.tid==='Safe;btnAction');
  // The DOM has returned to A, but the browser queued the A→B and B→A records.
  page.mutationObserver.pending.push({},{});
  const outcome=await page.act({verb:'click',ref:target.ref},before);
  assert.equal(outcome.status,'NOT_APPLIED');assert.equal(outcome.error.code,'UI_EPOCH_CHANGED');
  assert.equal(outcome.effect_possible,false);assert.deepEqual(page.clickedPoints,[]);
  assert.equal(page.mutationObserver.pending.length,0);
  const fresh=await page.observe();assert.equal(fresh.dom_epoch.revision,2);
  assert.equal((await page.act({verb:'click',ref:target.ref},fresh)).status,'SUCCEEDED');
  page.mutationObserver.callback([{}]);
  assert.equal((await page.observe()).dom_epoch.revision,3);
});

test('context menu wrapper keeps its E2E identity alongside the anonymous ARIA child', async () => {
  const page = new Page();
  const wrapper = page.add('div','mn;mniSetupNode','',{x:30,y:100,width:200,height:25});
  const inner = page.add('a',null,'Настроить узел...',wrapper.box,wrapper);
  inner.attrs.role = 'menuitem';
  const snapshot = await page.observe();
  const target = snapshot.ui.elements.find(e=>e.tid==='mn;mniSetupNode');
  assert.ok(target?.allowed_actions.includes('click'));
  assert.equal(snapshot.ui.elements[0].tid,'mn;mniSetupNode');
  assert.equal((await page.act({verb:'click',ref:target.ref},snapshot)).status,'SUCCEEDED');
  wrapper.remove();
  assert.equal((await page.act({verb:'click',ref:target.ref},snapshot)).status,'NOT_APPLIED');
});

test('node settings affordance without button role is observable and guarded', async () => {
  const page = new Page();
  const settings = page.add('g', 'MF;TF-1;Graph;Текстовый_файл;Setting', '', {x:30,y:50,width:20,height:20});
  page.add('g', 'MF;TF-1;Graph;Текстовый_файл;UnknownDecoration', '');
  const snapshot = await page.observe();
  const target = snapshot.ui.elements.find(item => item.tid === settings.getAttribute('data-tid'));
  assert.ok(target?.allowed_actions.includes('click'));
  assert.ok(!snapshot.ui.elements.some(item => item.tid?.endsWith(';UnknownDecoration')));
  assert.equal((await page.act({verb:'click',ref:target.ref},snapshot)).status,'SUCCEEDED');
  settings.remove();
  assert.equal((await page.act({verb:'click',ref:target.ref},snapshot)).status,'NOT_APPLIED');
});

test('oversized DOM stops observation and rejects a gesture before input without an empty graph claim', async () => {
  const page=new Page();page.add('button','Safe;btnAction','Action');
  const snapshot=await page.observe();
  assert.equal(snapshot.scan.complete,true);
  const ref=snapshot.ui.elements.find(item=>item.tid==='Safe;btnAction').ref;
  let visits=0;
  const original=page.document.createTreeWalker.bind(page.document);
  page.document.createTreeWalker=(root,kind)=>kind===1 ? {nextNode:()=>{visits++;return page.document.body;}} : original(root,kind);
  const observed=await page.execute({mode:'observe'});
  assert.equal(observed.error.code,'UI_SCAN_LIMIT');assert.equal(visits,6001);
  assert.equal(observed.output.scan.complete,false);assert.equal(observed.output.nodes,undefined);
  assert.equal(observed.output.ui,undefined);
  const acted=await page.act({verb:'click',ref},snapshot);
  assert.equal(acted.status,'NOT_APPLIED');assert.equal(acted.effect_possible,false);
  assert.equal(acted.error.code,'UI_SCAN_LIMIT');assert.deepEqual(page.events,[]);
});

test('scroll clamps to its observed owner, rejects old state and does not scroll its parent', async () => {
  const page=new Page();page.waitForTimeout=async()=>{};
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const outer=page.add('div','Outer','',{x:10,y:60,width:500,height:500});
  const inner=page.add('div','Inner','',{x:20,y:80,width:300,height:300},outer);
  for (const [el,height] of [[outer,2000],[inner,1000]]) Object.assign(el,{scrollTop:0,scrollHeight:height,clientHeight:300,style:{overflowY:'auto'}});
  page.add('button','Inner;btnRow','Row',undefined,inner);
  const initial=await page.observe(),target=initial.ui.elements.find(e=>e.tid==='Inner;btnRow');
  assert.ok(target.allowed_actions.includes('scroll'));
  const result=await page.act({verb:'scroll',ref:target.ref,delta_y:1000},initial);
  assert.equal(result.status,'SUCCEEDED');assert.equal(inner.scrollTop,700);assert.equal(outer.scrollTop,0);
  assert.ok(result.trace.some(e=>e.event==='ui_scroll_applied' && e.from===0 && e.to===700));
  const stale=await page.act({verb:'click',ref:target.ref},initial);
  assert.equal(stale.status,'NOT_APPLIED');assert.equal(stale.error.code,'UI_REFERENCE_STALE');
  const boundary=await page.act({verb:'scroll',ref:target.ref,delta_y:100},result.output);
  assert.equal(boundary.status,'NOT_APPLIED');assert.equal(boundary.effect_possible,false);assert.equal(outer.scrollTop,0);
  for (const delta of [0,1001,-1001,1.5,'100']) assert.throws(()=>validateUiAction({verb:'scroll',ref:target.ref,delta_y:delta}),/delta_y/);
});

test('virtualized row replacement after scrolling issues a new incarnation', async () => {
  const page=new Page(),owner=page.add('div','Rows','',{x:20,y:80,width:300,height:300});
  page.context.innerWidth=1000;page.context.innerHeight=800;
  Object.assign(owner,{scrollTop:0,scrollHeight:1000,clientHeight:300,style:{overflowY:'auto'}});
  const row=page.add('button','Rows;btnItem','Old row',undefined,owner);
  const snapshot=await page.observe(),ref=snapshot.ui.elements.find(e=>e.tid==='Rows;btnItem').ref;
  page.waitForTimeout=async()=>{row.remove();page.add('button','Rows;btnItem','New row',undefined,owner);};
  const result=await page.act({verb:'scroll',ref,delta_y:200},snapshot);
  assert.equal(result.status,'SUCCEEDED');
  const next=result.output.ui.elements.find(e=>e.tid==='Rows;btnItem');
  assert.notEqual(next.ref,ref);assert.equal(next.label,'New row');
  assert.equal((await page.act({verb:'click',ref},snapshot)).status,'NOT_APPLIED');
});

test('observation distinguishes rendered offscreen and covered targets from reachable targets',async()=>{
  const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;
  page.add('button','Hit;btnVisible','Visible',{x:30,y:100,width:100,height:25});
  page.add('button','Hit;btnOffscreen','Offscreen',{x:30,y:1200,width:100,height:25});
  page.add('button','Hit;btnCovered','Covered',{x:300,y:100,width:100,height:25});
  page.add('div','Overlay','',{x:295,y:95,width:110,height:35});
  const s=await page.observe();
  const state=tid=>s.ui.elements.find(e=>e.tid===tid).interaction.state;
  assert.equal(state('Hit;btnVisible'),'point_observed');
  assert.equal(state('Hit;btnOffscreen'),'outside_viewport');
  assert.equal(state('Hit;btnCovered'),'point_not_observed');
});

test('set_checked reads back native state and does not toggle an already satisfied request',async()=>{
  const page=new Page();page.waitForTimeout=async()=>{};
  const input=page.add('input','Wizard;Flag');input.attrs.type='checkbox';input.checked=false;
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);input.checked=!input.checked;};
  const before=await page.observe(),ref=before.ui.elements.find(e=>e.tid==='Wizard;Flag').ref;
  const first=await page.act({verb:'set_checked',ref,checked:true},before);
  assert.equal(first.status,'SUCCEEDED');assert.equal(input.checked,true);
  assert.ok(first.trace.some(t=>t.event==='ui_state_verified' && t.checked===true));
  const count=page.events.length;
  const again=await page.act({verb:'set_checked',ref,checked:true},first.output);
  assert.equal(again.status,'SUCCEEDED');assert.equal(again.effect_possible,false);
  assert.equal(again.output.gesture_applied,false);assert.equal(page.events.length,count);
  assert.ok(!again.trace.some(t=>t.event==='ui_gesture_applied'));
  assert.throws(()=>validateUiAction({verb:'set_checked',ref,checked:'true'}),/boolean/);
});

test('unconfirmed checkbox change stays ambiguous instead of blindly retrying a toggle',async()=>{
  const page=new Page();page.waitForTimeout=async()=>{};
  const input=page.add('input','Wizard;Flag');input.attrs.type='checkbox';input.checked=false;
  const s=await page.observe(),ref=s.ui.elements.find(e=>e.tid==='Wizard;Flag').ref;
  const r=await page.act({verb:'set_checked',ref,checked:true},s);
  assert.equal(r.status,'AMBIGUOUS');assert.equal(r.error.code,'UI_STATE_NOT_CONFIRMED');
  assert.equal(page.events.filter(e=>e==='click').length,1);
});

test('Loginom Ext DisplayEl state is read from its exact checked owner and radio cannot be unchecked',async()=>{
  const page=new Page();page.waitForTimeout=async()=>{};
  const owner=page.add('div','Wizard;Option','',{x:20,y:90,width:150,height:50});
  const display=page.add('span','Wizard;Option;DisplayEl','',{x:30,y:100,width:20,height:20},owner);
  display.attrs.class='x-form-radio';display.classList.contains=name=>display.attrs.class.split(' ').includes(name);
  owner.classList.contains=name=>(owner.attrs.class??'').split(' ').includes(name);
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);owner.attrs.class='x-form-cb-checked';};
  const s=await page.observe(),target=s.ui.elements.find(e=>e.tid==='Wizard;Option;DisplayEl');
  assert.equal(target.check_state.source,'loginom_ext');assert.equal(target.check_state.checked,false);
  assert.throws(()=>validateUiAction({verb:'set_checked',ref:target.ref,checked:false},s),/radio/);
  assert.equal((await page.act({verb:'set_checked',ref:target.ref,checked:true},s)).status,'SUCCEEDED');
});

test('file storage directory uses active complete breadcrumbs and never proves file absence', async () => {
  const page=new Page();
  page.add('div','MF;TF-1;FileStorageForm;pnlFileStorage;tbl');
  const bar=page.add('div','MF;TF-1;NavigationBar;NavigationPanel');
  const labels=[];
  for (const [index,text] of ['Файлы','user','data','Приёмка 1'].entries()) {
    const button=page.add('div',`MF;TF-1;cnrNaviMode;b.s-${index}`,'',undefined,bar);
    const label=page.add('span',null,text,undefined,button);
    label.attrs.class='x-btn-inner-default-toolbar-small';labels.push(label);
  }
  let output=await page.observe();
  assert.equal(output.file_storage.directory,'/user/data/Приёмка 1');
  assert.equal(output.file_storage.listing_complete,false);
  const duplicate=page.add('div','MF;TF-1;Other;NavigationBar;NavigationPanel');
  assert.equal((await page.observe()).file_storage.status,'unobserved');duplicate.remove();
  labels[1].style.display='none';
  assert.equal((await page.observe()).file_storage.directory,null);labels[1].style.display='';
  for (const bad of ['../data','data/other',' data','x'.repeat(201)]) {
    labels[1].ownText=bad;assert.equal((await page.observe()).file_storage.status,'unobserved');
  }
  labels[1].ownText='data';bar.attrs['data-tid']='MF;TF-2;NavigationBar;NavigationPanel';
  assert.equal((await page.observe()).file_storage.directory,null);
});

test('narrow file rows retain exact active breadcrumb context without issuing navigation controls',async()=>{
  const page=new Page(),table=page.add('div','MF;TF-1;FileStorageForm;pnlFileStorage;tbl');
  const row=page.add('table',null,'',undefined,table);
  page.add('td','MF;TF-1;FileStorageForm;colName_sample_csv','sample.csv',undefined,row);
  const bar=page.add('div','MF;TF-1;NavigationBar;NavigationPanel');
  const labels=[];
  for(const [i,text] of ['Файлы','test'].entries()) {
    const button=page.add('div','MF;TF-1;cnrNaviMode;b.s_'+i,'',undefined,bar);
    const label=page.add('span',null,text,undefined,button);label.attrs.class='x-btn-inner-default-toolbar-small';labels.push(label);
  }
  const roots=await page.execute({mode:'observe',discover_roots:true});
  const root=roots.output.ui.elements.find(e=>e.identity?.anchor_tid===table.getAttribute('data-tid') && e.identity.path.length);
  assert.ok(root);
  const read=()=>page.execute({mode:'observe',root_ref:root.ref});
  let narrow=await read();assert.equal(narrow.output.file_storage.directory,'/test');
  assert.ok(narrow.output.ui.elements.every(e=>!e.tid?.includes('cnrNaviMode')));
  labels[1].ownText='another';assert.equal((await read()).output.file_storage.directory,'/another');
  labels[1].style.display='none';assert.equal((await read()).output.file_storage.status,'unobserved');
  labels[1].style.display='';labels[1].ownText='../test';assert.equal((await read()).output.file_storage.status,'unobserved');
  bar.attrs['data-tid']='MF;TF-2;NavigationBar;NavigationPanel';assert.equal((await read()).output.file_storage.status,'unobserved');
});

test('file storage name cells expose E2E targets without requiring a button role', async () => {
  const page=new Page();
  const row=page.add('td','MF;TF-1;FileStorageForm;colName_user','user');
  const observed=await page.observe();
  const target=observed.ui.elements.find(e=>e.tid===row.getAttribute('data-tid'));
  assert.ok(target.allowed_actions.includes('double_click'));
  assert.deepEqual(target.identity,{anchor_tid:row.getAttribute('data-tid'),path:[]});
  row.remove();
  page.add('td','MF;TF-1;FileStorageForm;colName_user','user');
  const result=await page.execute({mode:'act',snapshot:observed,action:{verb:'double_click',ref:target.ref}});
  assert.notEqual(result.status,'SUCCEEDED');assert.deepEqual(page.events,[]);
});

test('observation error codes cross a serialized browser boundary without exception text', async () => {
  for (const [code,expected] of [['UI_SCAN_LIMIT','UI_SCAN_LIMIT'],[undefined,'UI_OBSERVATION_FAILED']]) {
    const page=new Page(),evaluate=page.evaluate.bind(page);
    page.evaluate=async (...args)=>{try{return clone(await evaluate(...args));}catch(error){throw new Error(error.message);}};
    page.document.createTreeWalker=()=>{const error=new Error('private-page-value');error.code=code;throw error;};
    const result=await page.execute({mode:'observe'});
    assert.equal(result.status,'NOT_APPLIED');assert.equal(result.error.code,expected);
    assert.equal(JSON.stringify(result).includes('private-page-value'),false);
    if (code) assert.equal(result.output.scan.complete,false);
  }
});

test('navigation root reads the directory without traversing a large storage table', async () => {
  const page=new Page({ clock: fixtureClock().Date }),table=page.add('div','MF;TF-1;FileStorageForm;pnlFileStorage;tbl');
  for(let i=0;i<6500;i++) page.add('div',null,'row',undefined,table);
  const bar=page.add('div','MF;TF-1;NavigationBar;NavigationPanel');
  for(const [i,text] of ['Файлы','user','data'].entries()) {
    const button=page.add('div',`MF;TF-1;cnrNaviMode;b.s-${i}`,'',undefined,bar);
    page.add('span',null,text,undefined,button).attrs.class='x-btn-inner-default-toolbar-small';
  }
  // Emulate the fixed native queries; JavaScript detail walks remain real.
  page.document.querySelectorAll=selector=>selector.includes('[role="grid"]')?[bar,table]:[page.avatar,page.tab,table];
  let walkedTable=false;const walker=page.document.createTreeWalker.bind(page.document);
  page.document.createTreeWalker=(element,kind)=>{if(element===table)walkedTable=true;return walker(element,kind);};
  const roots=await page.execute({mode:'observe',discover_roots:true});
  const ref=roots.output.ui.elements.find(e=>e.tid===bar.getAttribute('data-tid')).ref;
  const detail=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(detail.status,'SUCCEEDED');assert.equal(detail.output.file_storage.directory,'/user/data');
  assert.equal(detail.output.file_storage.listing_complete,false);assert.equal(walkedTable,false);
});

test('storage-name discovery uses escaped fixed lookup and no table traversal', async () => {
  const page=new Page({ clock: fixtureClock().Date }),name='data, " ]';
  const cell=page.add('td','MF;TF-1;FileStorageForm;colName_data_"_]','data, " ]');
  for(let i=0;i<6500;i++) page.add('div',null,'background');
  let lookup='',walks=0;const walker=page.document.createTreeWalker.bind(page.document);
  page.document.createTreeWalker=(element,kind)=>{if(kind===1)walks++;return walker(element,kind);};
  page.document.querySelectorAll=selector=>{
    if(selector.startsWith('[data-tid$="\\')) {lookup=selector;return [cell];}
    return [page.avatar,page.tab];
  };
  const result=await page.execute({mode:'observe',discover_roots:true,storage_name:name});
  assert.equal(result.status,'SUCCEEDED');assert.equal(walks,0);
  assert.equal(result.output.observation_filter.storage_name,name);
  assert.deepEqual(result.output.ui.elements[0].allowed_actions,[]);
  assert.equal(lookup.replace(/\\([a-f0-9]+) /g,(_,hex)=>String.fromCodePoint(parseInt(hex,16))),
    '[data-tid$=";FileStorageForm;colName_data_"_]"]');
  const ref=result.output.ui.elements[0].ref;
  const detail=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(detail.status,'SUCCEEDED');assert.equal(walks,1);
  assert.equal(detail.output.ui.elements[0].label,name);
});

test('nested breadcrumb button parts are one segment and incomplete paths explain refusal', async () => {
  const page=new Page();page.add('div','MF;TF-1;FileStorageForm;pnlFileStorage;tbl');
  const bar=page.add('div','MF;TF-1;NavigationBar;NavigationPanel');
  const outer=page.add('div','MF;TF-1;cnrNaviMode;b.s-1','',undefined,bar);
  const inner=page.add('span','MF;TF-1;cnrNaviMode;b.s-1;inner','',undefined,outer);
  const label=page.add('span',null,'user',undefined,inner);label.attrs.class='x-btn-inner-default-toolbar-small';
  const root=page.add('div','MF;TF-1;cnrNaviMode;b.s-0','',undefined,bar);
  const rootLabel=page.add('span',null,'Файлы',undefined,root);rootLabel.attrs.class='x-btn-inner-default-toolbar-small';
  bar.children=[root,outer];
  assert.equal((await page.observe()).file_storage.directory,'/user');
  label.remove();const failed=(await page.observe()).file_storage;
  assert.equal(failed.reason,'navigation_segments_incomplete');
  assert.deepEqual(failed.segment_counts,{buttons:2,labels:1});
});

test('empty navigation decorations are skipped without accepting an empty directory', async () => {
  const page=new Page();page.add('div','MF;TF-1;FileStorageForm;pnlFileStorage;tbl');
  const bar=page.add('div','MF;TF-1;NavigationBar;NavigationPanel');
  const labels=[];
  for(const [i,text] of ['', 'Файлы', 'user', 'data', ''].entries()) {
    const button=page.add('div',`MF;TF-1;cnrNaviMode;b.s-${i}`,'',undefined,bar);
    const label=page.add('span',null,text,undefined,button);label.attrs.class='x-btn-inner-default-toolbar-small';
    if(!text) label.style.display='none';labels.push(label);
  }
  assert.equal((await page.observe()).file_storage.directory,'/user/data');
  for(const label of labels)label.ownText='';
  assert.equal((await page.observe()).file_storage.status,'unobserved');
});

test('wizard context exposes the current step and lifecycle states on a narrow read',async()=>{
  const page=new Page({ clock: fixtureClock().Date }),base='MF;TF-1;WizrdMCF';
  const form=page.add('div',base);
  const title=page.add('div',base+';cardWizardPanel;p.h;p.t','Сопоставление входных полей',undefined,form);
  page.add('button',base+';TuneDataSourceInputPortWizard;btnAddMappingColumn','',undefined,form);
  const hidden=page.add('button',base+';CalcDataWizard;btnAddExpr','',undefined,form);hidden.style.display='none';
  const next=page.add('button',base+';btnNext','Далее',undefined,form);next.attrs.disabled='';next.disabled=true;
  const input=page.add('input',base+';edtSmall','',undefined,form);
  const first=await page.observe(),ref=first.ui.elements.find(e=>e.tid===input.getAttribute('data-tid')).ref;
  assert.equal(first.wizard.stage,'input_mapping');assert.equal(first.wizard.controls.btnNext.enabled,false);
  for(let i=0;i<6500;i++)page.add('div',null,'background');
  const narrow=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(narrow.status,'SUCCEEDED');assert.deepEqual(narrow.output.wizard,first.wizard);
  assert.equal(narrow.output.scan.detail_elements,1);
  const roots=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(roots.output.wizard.title,title.ownText);assert.equal(roots.output.wizard.stage,'input_mapping');
  // A transition is observed, not inferred from the previous requested action.
  hidden.style.display='';
  const mixed=await page.execute({mode:'observe',root_ref:ref});
  assert.equal(mixed.output.wizard.stage,null);assert.equal(mixed.output.wizard.stage_status,'ambiguous');
});

test('wizard metadata excludes hidden and inactive forms and redacts sensitive title children',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF';
  const inactive=page.add('div','MF;TF-2;WizrdMCF');
  page.add('div','MF;TF-2;WizrdMCF;cardWizardPanel;p.h;p.t','Wrong title',undefined,inactive);
  assert.equal((await page.observe()).wizard.status,'absent');
  const form=page.add('div',base),title=page.add('div',base+';cardWizardPanel;p.h;p.t','Visible title',undefined,form);
  page.add('span','secret-token','never expose',undefined,title);
  const output=await page.observe();assert.equal(output.wizard.title,'Visible title');
  assert.equal(output.wizard.stage_status,'unrecognized');
  assert.ok(!JSON.stringify(output.wizard).includes('never expose'));
  page.add('div',base);assert.equal((await page.observe()).wizard.status,'ambiguous');
});


test('output-column mapping is distinguished from input mapping and the done step',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
  page.add('div',base+';cardWizardPanel;p.h;p.t','Настройка соответствия между столбцами',undefined,form);
  page.add('button',base+';ColumnsMappingEngineOutputPortWizard;btnAddMappingColumn','',undefined,form);
  const output=await page.observe();
  assert.equal(output.wizard.stage,'output_mapping');assert.equal(output.wizard.stage_status,'observed');
  const roots=await page.execute({mode:'observe',discover_roots:true});
  assert.deepEqual(roots.output.wizard,output.wizard);
});

test('data table observations preserve field types, row identity, empty strings and null markers',async()=>{
  for(const suffix of ['ModelForm;PreviewWindow;PreviewForm;DataSetForm','ViewsForm;BrowseView']) {
    const page=new Page(),base='MF;TF-1;'+suffix,view=page.add('div',base);
    const header=(key,type)=>{const h=page.add('div',base+';normalHeaderCt;'+key,key,undefined,view);h.attrs.class='x-column-header bg-TBGDataType-'+type+'-before';return h;};
    header('Comment','dtString');header('Amount','dtFloat');
    const cell=(key,row,text,isNull=false)=>{
      const td=page.add('td',base+';normalHeaderCt;'+key+'_'+row,'',undefined,view);
      if(isNull)td.attrs.class='bg-cell-null-value';
      const inner=page.add('div',null,text,undefined,td);inner.attrs.class='x-grid-cell-inner';return inner;
    };
    cell('Comment',0,'');cell('Comment',1,'<null>',true);cell('Comment',2,'  spaced; value  ');cell('Amount',0,'37.50');
    const output=await page.observe(),columns=output.ui.table_cells.filter(c=>c.data_column).map(c=>c.data_column);
    assert.deepEqual(columns.map(c=>[c.column_key,c.declared_type]),[['Comment','string'],['Amount','real']]);
    const values=output.ui.table_cells.filter(c=>c.data_cell).map(c=>c.data_cell);
    assert.deepEqual(values.map(c=>[c.column_key,c.row_index,c.display_text,c.null_marker_present]),[
      ['Comment',0,'',false],['Comment',1,'<null>',true],['Comment',2,'  spaced; value  ',false],['Amount',0,'37.50',false]]);
    assert.ok(values.every(c=>c.header_observed && c.text_complete && c.view_key===base));
    const roots=await page.execute({mode:'observe',discover_roots:true});
    assert.ok(roots.output.ui.elements.some(e=>e.tid===base));
  }
});

test('indexed Table discovery and scoped cells exclude the offscreen first view and malformed suffixes',async()=>{
  const page=new Page(),base='MF;TF-1;ViewsForm;BrowseView';
  const addView=(suffix,text,box)=>{
    const tid=base+suffix,view=page.add('div',tid,'',box);
    const head=page.add('div',tid+';normalHeaderCt;Amount','Amount',box,view);
    head.attrs.class='x-column-header bg-TBGDataType-dtFloat-before';
    page.add('td',tid+';normalHeaderCt;Amount_0',text,box,view);
    return view;
  };
  const oldView=addView('','stale',{x:48,y:-9929,width:2,height:2});
  oldView.style.visibility='hidden';
  addView('-1','52.004',{x:48,y:71,width:500,height:300});
  for(const suffix of ['-x','-01','-0','-1;Nested'])addView(suffix,'foreign',{x:48,y:71,width:500,height:300});
  const roots=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(roots.status,'SUCCEEDED');
  const views=roots.output.ui.elements.filter(e=>e.tid?.startsWith(base));
  assert.deepEqual(views.map(e=>e.tid),[base+'-1']);
  const read=await page.execute({mode:'observe',root_ref:views[0].ref});
  assert.equal(read.status,'SUCCEEDED');
  const cells=read.output.ui.table_cells.filter(c=>c.data_cell).map(c=>c.data_cell);
  assert.equal(cells.length,1);
  assert.equal(cells[0].view_key,base+'-1');
  assert.equal(cells[0].display_text,'52.004');
  assert.equal(cells[0].header_observed,true);
  const global=await page.observe();
  assert.deepEqual(global.ui.table_cells.filter(c=>c.data_cell).map(c=>c.data_cell.view_key),[base+'-1']);
});

test('table evidence refuses missing or ambiguous headers, marks truncation and redacts sensitive columns',async()=>{
  const page=new Page(),base='MF;TF-1;ViewsForm;BrowseView',view=page.add('div',base);
  const head=page.add('div',base+';normalHeaderCt;Field','Field',undefined,view);head.attrs.class='x-column-header bg-TBGDataType-dtString-before';
  const cell=page.add('td',base+';normalHeaderCt;Field_0','x'.repeat(2100),undefined,view);
  let data=(await page.observe()).ui.table_cells.find(c=>c.data_cell).data_cell;
  assert.equal(data.display_text.length,2048);assert.equal(data.text_complete,false);
  head.ownText='Пароль';cell.ownText='do-not-export';
  const redacted=await page.observe();data=redacted.ui.table_cells.find(c=>c.data_cell).data_cell;
  assert.equal(data.display_text,null);assert.equal(data.redacted,true);assert.ok(!JSON.stringify(redacted.ui.table_cells).includes('do-not-export'));
  head.ownText='Field';const duplicate=page.add('div',base+';normalHeaderCt;Field','Other',undefined,view);duplicate.attrs.class='x-column-header';
  data=(await page.observe()).ui.table_cells.find(c=>c.data_cell).data_cell;
  assert.equal(data.header_observed,false);assert.equal(data.display_text,null);
  duplicate.remove();head.remove();data=(await page.observe()).ui.table_cells.find(c=>c.data_cell).data_cell;
  assert.equal(data.header_observed,false);assert.equal(data.text_complete,false);
});

test('calculator editor reports rendered lines and syntax mode without granting generic gestures',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF;CalcDataWizard;';
  const button=page.add('button',base+'btnCalcMode');
  const icon=page.add('span',null,'',undefined,button);icon.attrs.class='bg-TBGCalcMode-cmExpression';
  const editor=page.add('div',base+'cmpExpression');
  page.add('pre',null,' Quantity * UnitPrice ',undefined,editor);
  page.add('textarea',null,'',undefined,editor);
  const output=await page.observe(),record=output.ui.elements.find(e=>e.tid===base+'cmpExpression');
  assert.equal(record.calculator_editor.mode,'expression');
  assert.deepEqual(record.calculator_editor.rendered_lines,[' Quantity * UnitPrice ']);
  assert.equal(record.calculator_editor.full_text_verified,false);
  assert.equal(record.calculator_editor.syntax_validity,'unverified');
  assert.deepEqual(record.allowed_actions,[]);
  assert.deepEqual(output.ui.elements.find(e=>e.signature.tag==='textarea').allowed_actions,[]);
  icon.attrs.class='bg-TBGCalcMode-cmJavaScript';
  const narrow=await page.execute({mode:'observe',root_ref:record.ref});
  assert.equal(narrow.output.ui.elements.find(e=>e.tid===base+'cmpExpression').calculator_editor.mode,'javascript');
});

test('calculator rendering bounds and redaction never become a complete formula',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF;CalcDataWizard;';
  const editor=page.add('div',base+'cmpExpression');
  const line=page.add('pre',null,'x'.repeat(3000),undefined,editor);
  const read=async()=>(await page.observe()).ui.elements.find(e=>e.tid===base+'cmpExpression').calculator_editor;
  let result=await read();assert.equal(result.rendered_lines[0].length,2048);
  assert.equal(result.rendering_truncated,true);assert.equal(result.mode,null);
  line.ownText='';
  const secret=page.add('span',null,'secret-value',undefined,line);secret.attrs['data-tid']='password';
  result=await read();assert.equal(result.redacted,true);assert.deepEqual(result.rendered_lines,[]);
  assert.equal(result.full_text_verified,false);
});

test('calculator mode rejects conflicting icons and ignores inactive editor context',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF;CalcDataWizard;';
  const button=page.add('button',base+'btnCalcMode');
  for(const mode of ['Expression','JavaScript']){
    const icon=page.add('span',null,'',undefined,button);icon.attrs.class='bg-TBGCalcMode-cm'+mode;
  }
  page.add('div',base+'cmpExpression');
  page.add('div','MF;TF-2;WizrdMCF;CalcDataWizard;cmpExpression');
  const records=(await page.observe()).ui.elements.filter(e=>e.calculator_editor);
  assert.equal(records.length,1);assert.equal(records[0].calculator_editor.mode,null);
  assert.equal(records[0].calculator_editor.mode_status,'ambiguous');
});

test('calculator rendering caps line count and excludes hidden lines',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF;CalcDataWizard;';
  const editor=page.add('div',base+'cmpExpression');
  const hidden=page.add('pre',null,'hidden',undefined,editor);hidden.style.display='none';
  for(let i=0;i<40;i++)page.add('pre',null,String(i),undefined,editor);
  const result=(await page.observe()).ui.elements.find(e=>e.tid===base+'cmpExpression').calculator_editor;
  assert.equal(result.rendered_lines.length,32);assert.equal(result.rendered_lines[0],'0');
  assert.equal(result.rendered_lines[31],'31');assert.equal(result.rendering_truncated,true);
});

function calculatorDocument(page,text='original') {
  const base='MF;TF-1;WizrdMCF;CalcDataWizard;';
  const button=page.add('button',base+'btnCalcMode');
  const icon=page.add('span',null,'',undefined,button);icon.attrs.class='bg-TBGCalcMode-cmExpression';
  const row=page.add('table',null);row.attrs.class='x-grid-item-selected';
  const field=page.add('td',base+'colExpressionName_Amount','Amount',undefined,row);
  const editor=page.add('div',base+'cmpExpression');
  const wrapper=page.add('div',null,'',undefined,editor);wrapper.attrs.class='CodeMirror';
  const input=page.add('textarea',null,'',undefined,wrapper);
  const state={text,readOnly:false};
  const doc={firstLine:()=>0,lastLine:()=>state.text.split('\n').length-1,
    lineCount:()=>state.text.split('\n').length,getLine:i=>state.text.split('\n')[i]};
  wrapper.CodeMirror={getDoc:()=>doc,getInputField:()=>input,getWrapperElement:()=>wrapper,getOption:()=>state.readOnly};
  return {base,editor,wrapper,input,icon,row,field,state,doc};
}

test('Calculator document read distinguishes empty, multiline and offscreen text from rendering',async()=>{
  const page=new Page(),c=calculatorDocument(page,'first\n\n last ');
  page.add('pre',null,'visible prefix',undefined,c.wrapper);
  const read=async()=>(await page.observe()).ui.elements.find(e=>e.tid===c.base+'cmpExpression');
  let record=await read();assert.equal(record.calculator_editor.document.text,'first\n\n last ');
  assert.equal(record.calculator_editor.document.full_text_verified,true);
  assert.equal(record.calculator_editor.selected_expression.tid,c.field.getAttribute('data-tid'));
  assert.deepEqual(record.allowed_actions,['replace_expression']);
  c.state.text='';record=await read();assert.equal(record.calculator_editor.document.text,'');
  assert.equal(record.calculator_editor.document.full_text_verified,true);
  c.state.text='x'.repeat(2049);record=await read();assert.deepEqual(record.allowed_actions,[]);
  assert.equal(record.calculator_editor.document.full_text_verified,false);
});

test('Calculator replacement requires selected field, expression mode and writable owned document',async()=>{
  const page=new Page(),c=calculatorDocument(page);
  const read=async()=>(await page.observe()).ui.elements.find(e=>e.tid===c.base+'cmpExpression');
  c.row.attrs.class='';assert.deepEqual((await read()).allowed_actions,[]);
  c.row.attrs.class='x-grid-item-selected';c.state.readOnly=true;assert.deepEqual((await read()).allowed_actions,[]);
  c.state.readOnly=false;c.icon.attrs.class='bg-TBGCalcMode-cmJavaScript';assert.deepEqual((await read()).allowed_actions,[]);
  c.icon.attrs.class='bg-TBGCalcMode-cmExpression';c.wrapper.CodeMirror.getWrapperElement=()=>c.editor;
  assert.deepEqual((await read()).allowed_actions,[]);
  assert.throws(()=>validateUiAction({verb:'replace_expression',ref:'ui-1',text:'a\rb'}),/LF/);
});

function calculatorKeyboard(page,c,{corrupt=false,loseFocus=false}={}) {
  page.keyboard.press=async key=>{
    page.events.push(key);
    if(key==='ControlOrMeta+A')page.selectedAll=true;
    if(key==='Backspace' && page.selectedAll){c.state.text='';page.selectedAll=false;}
    if(loseFocus && key==='ControlOrMeta+A')page.document.activeElement=page.document.body;
  };
  page.keyboard.type=async text=>{page.events.push('keyboard_type');c.state.text+=corrupt?'wrong':text;};
}

test('typed Calculator replacement confirms exact multiline and empty document via keyboard',async()=>{
  for(const text of ['Quantity * UnitPrice','a\n\n b','']) {
    const page=new Page(),c=calculatorDocument(page);calculatorKeyboard(page,c);
    const snapshot=await page.observe(),record=snapshot.ui.elements.find(e=>e.tid===c.base+'cmpExpression');
    const result=await page.act({verb:'replace_expression',ref:record.ref,text},snapshot);
    assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(c.state.text,text);
    assert.ok(result.trace.some(e=>e.event==='expression_text_verified' && e.settings_applied===false));
    assert.equal(result.output.verification_required,true);
  }
});

test('typed Calculator replacement refuses changed original document before keyboard input',async()=>{
  const page=new Page(),c=calculatorDocument(page);calculatorKeyboard(page,c);
  const snapshot=await page.observe(),record=snapshot.ui.elements.find(e=>e.tid===c.base+'cmpExpression');
  c.state.text='changed without DOM mutation';
  const result=await page.act({verb:'replace_expression',ref:record.ref,text:'new'},snapshot);
  assert.equal(result.status,'NOT_APPLIED');assert.equal(page.events.length,0);
});

test('typed Calculator replacement preserves uncertainty on focus loss or mismatching readback',async()=>{
  for(const options of [{loseFocus:true},{corrupt:true}]) {
    const page=new Page(),c=calculatorDocument(page);calculatorKeyboard(page,c,options);
    const snapshot=await page.observe(),record=snapshot.ui.elements.find(e=>e.tid===c.base+'cmpExpression');
    const result=await page.act({verb:'replace_expression',ref:record.ref,text:'new'},snapshot);
    assert.equal(result.status,'AMBIGUOUS');
    assert.equal(result.error.code,options.loseFocus?'EXPRESSION_FOCUS_CHANGED':'EXPRESSION_TEXT_NOT_CONFIRMED');
    if(options.loseFocus)assert.equal(c.state.text,'original');
    assert.ok(!result.trace.some(e=>e.event==='expression_text_verified'));
  }
});

test('Calculator field switch during focus acquisition prevents clearing either expression',async()=>{
  const page=new Page(),c=calculatorDocument(page);calculatorKeyboard(page,c);
  const snapshot=await page.observe(),record=snapshot.ui.elements.find(e=>e.tid===c.base+'cmpExpression');
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);c.row.attrs.class='';};
  const result=await page.act({verb:'replace_expression',ref:record.ref,text:'new'},snapshot);
  assert.equal(result.status,'AMBIGUOUS');assert.equal(c.state.text,'original');
  assert.ok(!page.events.includes('Backspace'));
});

test('root discovery delivers the current wizard ahead of many earlier tables',async()=>{
  const page=new Page();
  for(let i=0;i<80;i++)page.add('table',null);
  const form=page.add('div','MF;TF-1;WizrdMCF');
  page.add('input','MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;edtValueNull','',undefined,form);
  const result=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.ui.elements[0].tid,'MF;TF-1;WizrdMCF');
  assert.deepEqual(result.output.ui.elements[0].allowed_actions,[]);
  const read=await page.execute({mode:'observe',root_ref:result.output.ui.elements[0].ref});
  assert.equal(read.output.scan.detail_elements,2);
  assert.ok(read.output.ui.elements.some(e=>e.tid.endsWith('edtValueNull')));
});

test('Calculator lifecycle and expression controls are delivered before operator palettes',async()=>{
  const page=new Page(),form=page.add('div','MF;TF-1;WizrdMCF'),base='MF;TF-1;WizrdMCF;';
  for(let i=0;i<70;i++)page.add('button',base+'CalcDataWizard;btnOperator'+i,'operator '+i,undefined,form);
  const next=page.add('button',base+'btnNext','Далее',undefined,form);
  const edit=page.add('button',base+'CalcDataWizard;btnExprEdit','',undefined,form);
  const row=page.add('td',base+'CalcDataWizard;colExpressionName_Amount','Amount',undefined,form);
  const raw=await page.execute({mode:'observe'}),pages=createObservationPages(),first=pages.retain(raw);
  for(const target of [next,edit,row]) {
    const record=first.output.ui.elements.find(e=>e.tid===target.getAttribute('data-tid'));
    assert.ok(record,'essential control was not delivered');assert.ok(record.allowed_actions.includes('click'));
    assert.doesNotThrow(()=>pages.assertIssued(first.output.observation_id,{ref:record.ref}));
  }
  assert.ok(first.output.page.next_cursor,'operator palette remains available on later pages');
});

test('text import draft settings preserve exact null marker and reject ambiguous editors',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
  page.add('div',base+';ImportTextFileParamsWizard;edtValueNull','',undefined,form);
  const owner=page.add('div',base+';ImportTextFileParamsWizard;edtValueNull;ValueControl','',undefined,form);
  const input=page.add('input',null,'',undefined,owner);input.value='\\N';
  let settings=(await page.observe()).wizard.settings;
  assert.equal(settings.applied_verified,false);assert.equal(settings.fields.null_marker.value,'\\N');
  assert.equal(settings.fields.null_marker.value_length_utf16,2);assert.equal(settings.fields.delimiter.status,'unobserved');
  input.value='x'.repeat(257);settings=(await page.observe()).wizard.settings;
  assert.equal(settings.fields.null_marker.truncated,true);assert.equal(settings.fields.null_marker.value.length,256);
  page.add('input',null,'',undefined,owner);settings=(await page.observe()).wizard.settings;
  assert.equal(settings.fields.null_marker.status,'ambiguous');assert.equal(settings.fields.null_marker.value,undefined);
});

test('import settings preserve blank and whitespace values and exclude hidden or password inputs',async()=>{
  const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
  page.add('div',base+';ImportTextFileParamsWizard;edtValueNull','',undefined,form);
  const owner=page.add('div',base+';ImportTextFileParamsWizard;edtDelimiterChar;ValueControl','',undefined,form);
  const input=page.add('input',null,'',undefined,owner);
  assert.equal((await page.observe()).wizard.settings.fields.delimiter.value,'');
  input.value='\t ';input.readOnly=true;
  let field=(await page.observe()).wizard.settings.fields.delimiter;
  assert.equal(field.value,'\t ');assert.equal(field.read_only,true);
  input.disabled=true;field=(await page.observe()).wizard.settings.fields.delimiter;
  assert.equal(field.enabled,false);
  input.attrs.type='password';field=(await page.observe()).wizard.settings.fields.delimiter;
  assert.equal(field.status,'unobserved');assert.equal(field.value,undefined);
  input.attrs.type='text';input.style.display='none';
  assert.equal((await page.observe()).wizard.settings.fields.delimiter.status,'unobserved');
});

function importFormatField(page) {
  page.waitForTimeout=async()=>{};
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const base='MF;TF-1;WizrdMCF',form=page.add('div',base);
  page.add('div',base+';ImportTextFileParamsWizard;edtValueNull','',undefined,form);
  const owner=page.add('div',base+';ImportTextFileParamsWizard;edtValueNull;ValueControl','',undefined,form);
  const input=page.add('input',null,'',undefined,owner);input.value='old';
  return {form,owner,input};
}

test('typed wizard field replacement confirms exact draft values without claiming apply',async()=>{
  for(const text of ['\\N','', '\t ']) {
    const page=new Page(),c=importFormatField(page),snapshot=await page.observe();
    const field=snapshot.ui.elements.find(e=>e.wizard_field?.name==='null_marker');
    assert.ok(field.allowed_actions.includes('set_wizard_field'));
    const result=await page.act({verb:'set_wizard_field',ref:field.ref,text},snapshot);
    assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(c.input.value,text);
    assert.ok(result.trace.some(e=>e.event==='wizard_draft_value_verified' && e.settings_applied===false));
    assert.equal(result.output.wizard.settings.applied_verified,false);
  }
});

test('typed wizard field rejects stale values and invalid text before input',async()=>{
  const page=new Page(),c=importFormatField(page),snapshot=await page.observe();
  const field=snapshot.ui.elements.find(e=>e.wizard_field);
  c.input.value='externally changed';
  const result=await page.act({verb:'set_wizard_field',ref:field.ref,text:'new'},snapshot);
  assert.equal(result.status,'NOT_APPLIED');assert.deepEqual(page.events,[]);
  for(const text of ['x'.repeat(257),'a\nb','a\rb'])
    assert.throws(()=>validateUiAction({verb:'set_wizard_field',ref:field.ref,text}),/256/);
});

test('wizard replacement retains uncertainty on focus loss, ownership change and corrupt readback',async()=>{
  for(const mode of ['focus','owner','corrupt']) {
    const page=new Page(),c=importFormatField(page),snapshot=await page.observe();
    const field=snapshot.ui.elements.find(e=>e.wizard_field);
    const click=page.mouse.click;
    page.mouse.click=async(...args)=>{await click(...args);
      if(mode==='focus')page.document.activeElement=page.document.body;
      if(mode==='owner')c.form.attrs['data-tid']='MF;TF-1;PreviousWizard';
    };
    if(mode==='corrupt')page.keyboard.type=async()=>{c.input.value='wrong';};
    const result=await page.act({verb:'set_wizard_field',ref:field.ref,text:'new'},snapshot);
    assert.equal(result.status,'AMBIGUOUS',mode);
    assert.ok(!result.trace.some(e=>e.event==='wizard_draft_value_verified'));
    if(mode!=='corrupt')assert.equal(c.input.value,'old');
  }
});

test('satisfied wizard field issues no keyboard or click and read-only editor denies typed set',async()=>{
  const page=new Page(),c=importFormatField(page),snapshot=await page.observe();
  const field=snapshot.ui.elements.find(e=>e.wizard_field);
  const result=await page.act({verb:'set_wizard_field',ref:field.ref,text:'old'},snapshot);
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.gesture_applied,false);
  assert.deepEqual(page.events,[]);
  c.input.readOnly=true;assert.ok(!(await page.observe()).ui.elements.some(e=>e.wizard_field));
});

function wizardStepFixture(page,direction='next') {
  const base='MF;TF-1;WizrdMCF',form=page.add('div',base);
  const marker=page.add('div',base+';ImportTextFileParamsWizard;edtValueNull','',undefined,form);
  const button=page.add('button',base+(direction==='next'?';btnNext':';btnPrev'),'Step',undefined,form);
  const advance=()=>{marker.remove();page.add('div',base+';TuneDataSourceInputPortWizard;btnAddMappingColumn','',undefined,form);};
  return {base,form,marker,button,advance};
}

test('wizard step clicks once and verifies only the requested stage in the same form',async()=>{
  for(const direction of ['next','previous']) {
    const page=new Page(),c=wizardStepFixture(page,direction),snapshot=await page.observe();
    page.waitForTimeout=async()=>{};
    const button=snapshot.ui.elements.find(e=>e.wizard_step);
    assert.equal(button.wizard_step.direction,direction);
    const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);c.advance();};
    const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:'input_mapping'},snapshot);
    assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1);
    assert.ok(result.trace.some(e=>e.event==='wizard_step_verified' && e.to_stage==='input_mapping' && e.settings_applied===false));
    assert.equal(result.output.verification_required,true);
  }
});

test('supported transforms accept only owned conditional destinations after one click',async()=>{
 for(const marker of [';CalcDataWizard;btnAddExpr',';GroupDataWizard;grdUsedFields;tbl',';SortingWizard;SortingColumnCollection;grdSorting;tbl',';ReplaceColumnsWizard;grdDataList;tbl',';ReformColumnsWizard;grdTargetColumns;tbl'])for(const destination of ['done','output_mapping','input_mapping']) {
  const page=new Page(),c=wizardStepFixture(page);c.marker.attrs['data-tid']=c.base+marker;
  const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_step);
  page.waitForTimeout=async()=>{};const click=page.mouse.click;
  page.mouse.click=async(...args)=>{await click(...args);c.marker.remove();page.add('div',c.base+(destination==='done'?';DoneWizard;edtDisplayName':destination==='output_mapping'?';DerivedDataSourceMappingEngineOutputPortWizard;btnAddMappingColumn':';TuneDataSourceInputPortWizard;btnAddMappingColumn'),'',undefined,c.form);};
  const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:['output_mapping','done']},snapshot);
  assert.equal(result.status,destination==='input_mapping'?'AMBIGUOUS':'SUCCEEDED',JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);
 }
 const page=new Page();wizardStepFixture(page);const s=await page.observe(),b=s.ui.elements.find(e=>e.wizard_step);
 assert.throws(()=>validateUiAction({verb:'wizard_step',ref:b.ref,expected_stage:['output_mapping','done']},s),/supported transform/);
});

test('wizard transition waits through a transient mask without repeating its click',async()=>{
  const page=new Page(),c=wizardStepFixture(page),snapshot=await page.observe();
  const button=snapshot.ui.elements.find(e=>e.wizard_step);let mask,waits=0;
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);c.advance();
    mask=page.add('div',null,'Processing');mask.attrs.class='bg-mask-message';};
  page.waitForTimeout=async()=>{waits++;mask.remove();};
  const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:'input_mapping'},snapshot);
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(waits,4);
  assert.equal(page.events.filter(e=>e==='click').length,1);
});

test('wizard step waits for delayed layout epochs and bounds a continuously changing destination',async()=>{
  for(const mode of ['delayed','continuous','replaced']) {
    const page=new Page(),c=wizardStepFixture(page),snapshot=await page.observe();
    const button=snapshot.ui.elements.find(e=>e.wizard_step);let waits=0;
    const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);c.advance();};
    page.waitForTimeout=async()=>{
      waits++;
      if(mode==='continuous' || mode==='delayed' && waits<=2)page.mutationObserver.callback([{}]);
      if(mode==='replaced' && waits===1){c.form.remove();wizardStepFixture(page).advance();}
    };
    const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:'input_mapping'},snapshot);
    assert.equal(result.status,mode==='delayed'?'SUCCEEDED':'AMBIGUOUS',JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1);
    if(mode==='delayed'){
      assert.equal(waits,5);assert.ok(result.trace.some(e=>e.event==='wizard_step_settled' && e.quiet_samples===3));
      assert.equal(result.output.dom_epoch.revision,snapshot.dom_epoch.revision+2);
    } else {
      assert.equal(result.error.code,mode==='continuous'?'WIZARD_STEP_NOT_SETTLED':'WIZARD_STEP_NOT_CONFIRMED');
      assert.ok(waits<=12);assert.ok(!result.trace.some(e=>e.event==='wizard_step_verified'));
    }
  }
});

test('wizard step never confirms an unchanged stage, a closed form or its replacement',async()=>{
  for(const mode of ['unchanged','closed','replacement']) {
    const page=new Page(),c=wizardStepFixture(page),snapshot=await page.observe();
    const button=snapshot.ui.elements.find(e=>e.wizard_step);let waits=0;
    const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);
      if(mode==='closed')c.form.remove();
      if(mode==='replacement'){c.form.remove();const replacement=wizardStepFixture(page);replacement.advance();}
    };
    page.waitForTimeout=async()=>{waits++;};
    const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:'input_mapping'},snapshot);
    assert.equal(result.status,'AMBIGUOUS',mode);assert.equal(result.error.code,'WIZARD_STEP_NOT_CONFIRMED');
    assert.equal(page.events.filter(e=>e==='click').length,1);assert.ok(waits<=24);
    assert.ok(!result.trace.some(e=>e.event==='wizard_step_verified'));
  }
});

test('wizard step rejects unsupported destinations and changed original form before input',async()=>{
  const page=new Page(),c=wizardStepFixture(page),snapshot=await page.observe();
  const button=snapshot.ui.elements.find(e=>e.wizard_step);
  assert.throws(()=>validateUiAction({verb:'wizard_step',ref:button.ref,expected_stage:'arbitrary'}),/recognized/);
  assert.throws(()=>validateUiAction({verb:'wizard_step',ref:button.ref,expected_stage:'text_import_format'},snapshot),/different/);
  c.advance();
  const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:'input_mapping'},snapshot);
  assert.equal(result.status,'NOT_APPLIED');assert.deepEqual(page.events,[]);
});

function importCombo(page) {
  const c=importFormatField(page),ownerTid=c.owner.getAttribute('data-tid');
  const picker=page.add('div',ownerTid+';trg_picker','▼',undefined,c.owner);
  const list=page.add('div',ownerTid+';boundlist','',{x:200,y:200,width:160,height:60});
  const option=page.add('div',ownerTid+';boundlist;NULL','NULL',{x:205,y:205,width:140,height:20},list);
  return {...c,picker,list,option};
}

test('wizard combo option is bound to its field and confirms the displayed selection',async()=>{
  const page=new Page(),c=importCombo(page),snapshot=await page.observe();
  const option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');
  assert.equal(option.wizard_combo.field.name,'null_marker');
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);c.input.value='NULL';c.list.remove();};
  const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
  assert.ok(result.trace.some(e=>e.event==='wizard_option_verified' && e.settings_applied===false));
  assert.deepEqual(page.events,['click']);
});

test('export header waits for delayed readback after one click and refuses a replacement field',async()=>{
 for(const fault of ['none','wrong_value','replaced_input']){
  const page=new Page(),wizard=page.add('div','MF;TF-1;WizrdMCF'),base='MF;TF-1;WizrdMCF;ExportTextFilePreviewWizard;';
  const switches=new Map(),inputs={};let headerOwner;
  for(const [key,value] of [['edtDelimiterChar','Запятая'],['edtCodePage','UTF-8 (65001)'],['edtLineEnding','Unix (LF)'],['edtCaptionType','Метки полей']]){
   const wrapper=page.add('div',base+key,'',undefined,wizard);
   const owner=page.add('div',base+key+';ValueControl','',undefined,wrapper),input=page.add('input',null,'',undefined,owner);input.value=value;inputs[key]=input;
   const sw=page.add('div',base+key+';SwitchButton','',undefined,wizard);sw.id='switch-'+key;switches.set(sw.id,{pressed:false});
   if(key==='edtCaptionType')headerOwner=owner;
  }
  page.context.Ext={getCmp:id=>switches.get(id)};
  const ownerTid=headerOwner.getAttribute('data-tid'),list=page.add('div',ownerTid+';boundlist','',{x:200,y:200,width:180,height:60});
  page.add('div',ownerTid+';boundlist;Имена_полей','Имена полей',{x:205,y:205,width:170,height:20},list);
  const snapshot=await page.observe(),option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');
  assert.equal(snapshot.wizard.stage,'text_export_format');assert.equal(option.wizard_combo.field.name,'header');
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);list.remove();};
  let waits=0;page.waitForTimeout=async()=>{if(++waits===1){
   if(fault==='replaced_input'){inputs.edtCaptionType.remove();page.add('input',null,'',undefined,headerOwner).value='Имена полей';}
   else if(fault==='none')inputs.edtCaptionType.value='Имена полей';
  }};
  const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
  assert.equal(result.status,fault==='none'?'SUCCEEDED':'AMBIGUOUS',JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);assert.ok(waits>0);
 }
});

test('wizard combo binding survives a narrow floating list read without scanning background',async()=>{
  const page=new Page(),c=importCombo(page),snapshot=await page.observe();
  const listRef=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option').wizard_combo.list_ref;
  const result=await page.execute({mode:'observe',root_ref:listRef});
  assert.equal(result.status,'SUCCEEDED');
  assert.ok(result.output.ui.elements.some(e=>e.allowed_actions.includes('select_wizard_option')));
  assert.equal(result.output.wizard.settings.fields.null_marker.value,'old');
  const option=result.output.ui.elements.find(e=>e.wizard_combo?.kind==='option');
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);c.input.value='NULL';c.list.remove();};
  const selected=await page.act({verb:'select_wizard_option',ref:option.ref},result.output);
  assert.equal(selected.status,'SUCCEEDED',JSON.stringify(selected.error));
});

test('wizard option refuses a moved or disabled owner and does not confirm a different input',async()=>{
  for(const mode of ['disabled','reparent','wrong-value','replaced-input']) {
    const page=new Page(),c=importCombo(page),snapshot=await page.observe();
    const option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');
    if(mode==='disabled')c.input.disabled=true;
    if(mode==='reparent')page.document.body.append(c.option); // loses exact list containment
    const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);
      if(mode==='replaced-input'){c.input.remove();page.add('input',null,'',undefined,c.owner).value='NULL';}
    };
    const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
    assert.equal(result.status,['disabled','reparent'].includes(mode)?'NOT_APPLIED':'AMBIGUOUS',mode);
    assert.ok(!result.trace.some(e=>e.event==='wizard_option_verified'));
  }
});

test('wizard field enforces observed native maxlength before typing a dropdown label',async()=>{
  const page=new Page(),c=importFormatField(page);c.input.attrs.maxlength='1';
  const snapshot=await page.observe(),field=snapshot.ui.elements.find(e=>e.wizard_field);
  assert.equal(field.wizard_field.max_length_utf16,1);
  assert.throws(()=>validateUiAction({verb:'set_wizard_field',ref:field.ref,text:'Точка с запятой'},snapshot),/native input limit/);
  assert.doesNotThrow(()=>validateUiAction({verb:'set_wizard_field',ref:field.ref,text:';'},snapshot));
  assert.deepEqual(page.events,[]);
});


test('root discovery delivers the owned floating import list ahead of background tables',async()=>{
  const page=new Page();for(let i=0;i<80;i++)page.add('table','Background;Table'+i);
  const c=importCombo(page),out=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(out.status,'SUCCEEDED');
  assert.equal(out.output.ui.elements[0].tid,c.form.getAttribute('data-tid'));
  assert.equal(out.output.ui.elements[1].tid,c.list.getAttribute('data-tid'));
});


test('mutation diagnostics distinguish cursor styles without ignoring any epoch change',async()=>{
  const page=new Page(),button=page.add('button','Safe;btnAction','Act');
  const before=await page.observe(),target=before.ui.elements.find(e=>e.tid==='Safe;btnAction');
  const cursor=new Element('div',{class:'CodeMirror-cursor'});
  page.mutationObserver.pending.push({type:'attributes',attributeName:'style',target:cursor},
    {type:'attributes',attributeName:'style',target:button},{type:'characterData'},
    {type:'attributes',attributeName:'value'},{type:'childList'});
  const result=await page.act({verb:'click',ref:target.ref},before);
  assert.equal(result.status,'NOT_APPLIED');assert.equal(result.error.code,'UI_EPOCH_CHANGED');
  assert.equal(result.output.dom_epoch.revision,5);
  assert.deepEqual(result.output.scan.mutation_counts,{cursor_style:1,other_style:1,attributes:1,child_list:1,text:1,other:0,unclassified:0,ignored_cursor_blink:0});
  assert.deepEqual(page.events,[]);
});

test('mutation classification caps work while epoch counts every record',async()=>{
  const page=new Page();await page.observe();
  const records=Array.from({length:500},()=>({type:'childList'}));
  page.mutationObserver.callback(records);
  const after=await page.observe();
  assert.equal(after.dom_epoch.revision,500);
  assert.equal(after.scan.mutation_counts.child_list,128);
  assert.equal(after.scan.mutation_counts.unclassified,372);
});


test('owned Calculator cursor visibility blinking does not stale an unrelated checked control',async()=>{
  const page=new Page(),c=calculatorDocument(page);
  const cursor=page.add('div',null,'',{x:0,y:0,width:0,height:0},c.wrapper);cursor.attrs.class='CodeMirror-cursors';
  const button=page.add('button','Safe;btnAction','Act',{x:800,y:700,width:50,height:20});
  const before=await page.observe(),target=before.ui.elements.find(e=>e.tid==='Safe;btnAction');
  cursor.attrs.style='';
  page.mutationObserver.pending.push({type:'attributes',attributeName:'style',target:cursor,oldValue:''},
    {type:'attributes',attributeName:'style',target:cursor,oldValue:'visibility: hidden;'});
  const result=await page.act({verb:'click',ref:target.ref},before);
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
  assert.equal(result.output.dom_epoch.revision,before.dom_epoch.revision);
  assert.equal(result.output.scan.mutation_counts.ignored_cursor_blink,2);
  assert.deepEqual(page.events,['click']);
});

test('cursor exemption rejects geometry ABA, individual cursor styles and unowned containers',async()=>{
  for(const mode of ['geometry-aba','individual','unowned','content']) {
    const page=new Page(),c=calculatorDocument(page);
    const cursor=page.add('div',null,'',undefined,mode==='unowned'?page.document.body:c.wrapper);
    cursor.attrs.class=mode==='individual'?'CodeMirror-cursor':'CodeMirror-cursors';cursor.attrs.style='';
    const before=await page.observe();
    const records=[{type:mode==='content'?'childList':'attributes',attributeName:'style',target:cursor,oldValue:'visibility: hidden;'}];
    if(mode==='geometry-aba')records.push({type:'attributes',attributeName:'style',target:cursor,oldValue:'left: 100px;'});
    page.mutationObserver.callback(records);
    assert.ok((await page.observe()).dom_epoch.revision>before.dom_epoch.revision,mode);
  }
});


test('covered control reports only bounded blocker identities, without text or new refs',async()=>{
  const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;
  const button=page.add('button','Safe;btnAction','Act');
  const overlay=page.add('div','Overlay;Panel','private unrelated content',button.box);
  const input=page.add('input',null,'',button.box,overlay);input.value='private value';
  const snapshot=await page.observe(),record=snapshot.ui.elements.find(e=>e.tid==='Safe;btnAction');
  assert.equal(record.interaction.state,'point_not_observed');
  assert.deepEqual(record.interaction.covering,[{tag:'input',tid:null,anchor_tid:'Overlay;Panel',role:null}]);
  assert.ok(!JSON.stringify(record.interaction).includes('private'));
  input.attrs.type='password';
  const redacted=(await page.observe()).ui.elements.find(e=>e.tid==='Safe;btnAction').interaction;
  assert.deepEqual(redacted.covering,[{redacted:true}]);
  overlay.remove();assert.equal((await page.observe()).ui.elements.find(e=>e.tid==='Safe;btnAction').interaction.state,'point_observed');
});


test('navigation trees expose named roots and guarded text/expander actions',async()=>{
  for(const prefix of ['MF','MF;TF-1']) {
    const page=new Page();
    for(let i=0;i<80;i++)page.add('table',null);
    const tree=page.add('div',prefix+';MapTreeForm;tree');
    const base=prefix+';MapTreeForm;colNavigation_Сервер>Пакеты>Package1';
    const label=page.add('span',base+';TreeText','Package1',{x:30,y:50,width:80,height:20},tree);
    page.add('img',base+';TreeExpander','',{x:10,y:50,width:20,height:20},tree);
    page.add('span',base+';NotAnAction','',undefined,tree);
    const roots=await page.execute({mode:'observe',discover_roots:true});
    assert.equal(roots.output.ui.elements[0].tid,prefix+';MapTreeForm;tree');
    assert.deepEqual(roots.output.ui.elements[0].allowed_actions,[]);
    const read=await page.execute({mode:'observe',root_ref:roots.output.ui.elements[0].ref});
    const snapshot=read.output,target=snapshot.ui.elements.find(e=>e.tid===base+';TreeText');
    assert.equal(target.label,'Package1');
    assert.ok(target.allowed_actions.includes('click'));
    assert.ok(snapshot.ui.elements.find(e=>e.tid===base+';TreeExpander').allowed_actions.includes('click'));
    assert.ok(!snapshot.ui.elements.some(e=>e.tid===base+';NotAnAction'));
    assert.equal((await page.act({verb:'click',ref:target.ref},snapshot)).status,'SUCCEEDED');
    label.remove();
    assert.equal((await page.act({verb:'click',ref:target.ref},snapshot)).status,'NOT_APPLIED');
  }
});

test('completed generic click rediscovers regions when its observed root closes',async()=>{
  for(const when of ['after','before','lost_reply']) {
    const page=new Page(),tree=page.add('div','MF;MapTreeForm;tree');
    page.add('span','MF;MapTreeForm;colNavigation_Сервер>Пакеты;TreeText','Пакеты',undefined,tree);
    const roots=await page.execute({mode:'observe',discover_roots:true});
    const root=roots.output.ui.elements.find(e=>e.tid==='MF;MapTreeForm;tree');
    const read=await page.execute({mode:'observe',root_ref:root.ref});
    const target=read.output.ui.elements.find(e=>e.label==='Пакеты');
    const click=page.mouse.click;
    page.mouse.click=async(...args)=>{await click(...args);tree.remove();if(when==='lost_reply')throw new Error('lost reply');};
    if(when==='before')tree.remove();
    const result=await page.act({verb:'click',ref:target.ref},read.output);
    assert.equal(result.status,when==='after'?'SUCCEEDED':when==='before'?'NOT_APPLIED':'AMBIGUOUS');
    assert.equal(page.clickedPoints.length,when==='before'?0:1);
    if(when==='after') {
      assert.equal(result.output.observation_kind,'roots');
      assert.equal(result.output.verification_required,true);
      assert.ok(result.output.ui.elements.every(e=>e.allowed_actions.length===0));
      assert.ok(result.trace.some(e=>e.event==='ui_root_closed_after_gesture'));
    }
  }
});

test('graph paging retains identified node controls without anonymous SVG vertices',async()=>{
  const page=new Page();
  for(let i=0;i<70;i++)page.add('g','MF;TF-1;Graph;Vertex');
  for(const name of ['Источник','Расчёт','Итог']) {
    const body=page.add('g','MF;TF-1;Graph;'+name);
    page.add('span','MF;TF-1;Graph;'+name+';Label;Label',name,undefined,body);
  }
  page.add('g','MF;TF-1;Graph;Источник;Setting');
  const raw=await page.execute({mode:'observe'}),snapshot=raw.output,pages=createObservationPages();
  const first=pages.retain(raw,'graph');
  for(const name of ['Источник','Расчёт','Итог']) {
    const label=first.output.ui.elements.find(e=>e.graph_node?.node_label===name && e.graph_node.part==='label');
    assert.ok(label?.allowed_actions.includes('click'));
    assert.doesNotThrow(()=>pages.assertIssued(first.output.observation_id,{ref:label.ref}));
  }
  assert.equal(first.output.ui.elements[0].graph_node.part,'settings');
  assert.equal(first.output.ui.elements[1].graph_node.part,'body');
  assert.equal(snapshot.ui.elements.some(e=>e.tid==='MF;TF-1;Graph;Vertex'),false);
});

test('Calculator parameter dialog is read outside the wizard subtree with bounded ambiguity-safe fields',async()=>{
  const page=new Page(),wizard=page.add('div','MF;TF-1;WizrdMCF');
  page.add('button','MF;TF-1;WizrdMCF;CalcDataWizard;btnAddExpr','',undefined,wizard);
  const base='MF;TF-1;WizrdMCF;ExprDataEditForm',dialog=page.add('div',base);
  dialog.attrs.class='x-window';
  const inputs=[];
  for(const [key,value] of [['edtName','Amount'],['edtDisplayName','AmountAmount'],['cbxDataType','Вещественный']]) {
    const owner=page.add('div',base+';'+key,'',undefined,dialog),input=page.add('input',null,'',undefined,owner);input.value=value;inputs.push(input);
  }
  const roots=await page.execute({mode:'observe',discover_roots:true});
  const root=roots.output.ui.elements.find(e=>e.tid==='MF;TF-1;WizrdMCF');
  const read=await page.execute({mode:'observe',root_ref:root.ref});
  const params=read.output.wizard.expression_parameters;
  assert.equal(params.applied_verified,false);assert.equal(params.fields.name.value,'Amount');
  assert.equal(params.fields.label.value,'AmountAmount');assert.equal(params.fields.type_label.value,'Вещественный');
  inputs[1].value='x'.repeat(257);
  assert.equal((await page.observe()).wizard.expression_parameters.fields.label.truncated,true);
  inputs[0].attrs.type='password';
  assert.equal((await page.observe()).wizard.expression_parameters.fields.name.status,'unobserved');
  page.add('input',null,'',undefined,inputs[2].parentElement);
  assert.equal((await page.observe()).wizard.expression_parameters.fields.type_label.status,'ambiguous');
});

test('typed Calculator parameter editing binds dialog, selected row and exact draft values',async()=>{
  for(const variation of ['label','linked_name','wrong_label','selection_changed','type_changed','focus_lost']) {
    const page=new Page(),wizard=page.add('div','MF;TF-1;WizrdMCF');
    page.add('button','MF;TF-1;WizrdMCF;CalcDataWizard;btnAddExpr','',undefined,wizard);
    const row=page.add('table',null,'',undefined,wizard);row.attrs.class='x-grid-item-selected';
    const selected=page.add('td','MF;TF-1;WizrdMCF;CalcDataWizard;colExpressionName_Expr1','Expr1',undefined,row);
    const base='MF;TF-1;WizrdMCF;ExprDataEditForm',dialog=page.add('div',base);dialog.attrs.class='x-window';
    const inputs={};
    for(const [key,value] of [['edtName','Expr1'],['edtDisplayName','Expr1'],['cbxDataType','Вещественный']]) {
      const owner=page.add('div',base+';'+key,'',undefined,dialog),input=page.add('input',null,'',undefined,owner);input.value=value;input.box={x:300,y:200+Object.keys(inputs).length*40,width:100,height:25};inputs[key]=input;
    }
    const snapshot=await page.observe(),name=variation==='linked_name'?'name':'label';
    const target=snapshot.ui.elements.find(e=>e.wizard_field?.scope==='expression_parameter' && e.wizard_field.name===name);
    assert.ok(target);assert.ok(!snapshot.ui.elements.find(e=>e.ref===snapshot.wizard.expression_parameters.fields.type_label.input_ref).allowed_actions.includes('set_wizard_field'));
    const type=page.keyboard.type;
    page.onPress=(key)=>{if(key==='Tab' && variation==='linked_name')inputs.edtDisplayName.value=inputs.edtName.value;};
    page.keyboard.type=async(...args)=>{await type(...args);
      if(variation==='focus_lost')page.document.activeElement=page.document.body;
      if(variation==='wrong_label')inputs.edtDisplayName.value='AmountAmount';
      if(variation==='selection_changed')selected.attrs['data-tid']='MF;TF-1;WizrdMCF;CalcDataWizard;colExpressionName_Expr2';
      if(variation==='type_changed')inputs.cbxDataType.value='Целый';
    };
    const outcome=await page.act({verb:'set_wizard_field',ref:target.ref,text:'Amount'},snapshot);
    assert.equal(outcome.status,['label','linked_name'].includes(variation)?'SUCCEEDED':'AMBIGUOUS',variation+JSON.stringify(outcome.error));
    if(outcome.status==='SUCCEEDED') {
      assert.equal(outcome.output.wizard.expression_parameters.fields[name].value,'Amount');
      assert.equal(outcome.output.wizard.expression_parameters.applied_verified,false);
      assert.ok(outcome.trace.some(e=>e.event==='wizard_draft_value_verified' && e.scope==='expression_parameter'));
    }
  }
});

test('expression apply checks the resulting selected row after its separate dialog closes',async()=>{
  for(const variation of ['success','delayed_mask','wrong_name','wrong_label','wrong_type','still_open','lost_reply','cancel_success','cancel_changed','cancel_replaced_row']) {
    const page=new Page(),wizard=page.add('div','MF;TF-1;WizrdMCF'),base='MF;TF-1;WizrdMCF;';
    page.add('button',base+'CalcDataWizard;btnAddExpr','',undefined,wizard);
    const row=page.add('table',null,'',undefined,wizard);row.attrs.class='x-grid-item-selected';
    const name=page.add('td',base+'CalcDataWizard;colExpressionName_Expr1','Expr1',undefined,row);
    const label=page.add('td',base+'CalcDataWizard;colExpressionDisplayName_Expr1','Expr1',undefined,row);
    const icon=page.add('div',null,'',undefined,name);icon.attrs.class='bg-TBGDataType-dtFloat';
    const dialog=page.add('div',base+'ExprDataEditForm');dialog.attrs.class='x-window';
    for(const [key,value] of [['edtName','Amount'],['edtDisplayName','Сумма'],['cbxDataType','Вещественный']]) {
      const owner=page.add('div',base+'ExprDataEditForm;'+key,'',undefined,dialog),input=page.add('input',null,'',undefined,owner);input.value=value;
    }
    const cancelling=variation.startsWith('cancel_'),verb=cancelling?'cancel_expression_parameters':'apply_expression_parameters';
    const button=page.add('button',base+'ExprDataEditForm;'+(cancelling?'btnCancel':'btnApply'),'Изменить',{x:600,y:400,width:90,height:25},dialog);
    const roots=await page.execute({mode:'observe',discover_roots:true});
    const root=roots.output.ui.elements.find(e=>e.tid===base+'ExprDataEditForm');
    const read=await page.execute({mode:'observe',root_ref:root.ref});
    const target=read.output.ui.elements.find(e=>e.tid===button.getAttribute('data-tid'));
    assert.ok(target.allowed_actions.includes(verb));
    const click=page.mouse.click;
    page.mouse.click=async(...args)=>{await click(...args);if(variation==='still_open')return;
      dialog.remove();
      if(cancelling){
        if(variation==='cancel_changed')label.ownText='Incorrect';
        if(variation==='cancel_replaced_row'){const replacement=page.add('table',null,'',undefined,wizard);replacement.attrs.class='x-grid-item-selected';name.remove();label.remove();replacement.append(name,label);row.remove();}
        return;
      }
      name.attrs['data-tid']=base+'CalcDataWizard;colExpressionName_Amount';name.ownText=variation==='wrong_name'?'Other':'Amount';
      label.attrs['data-tid']=base+'CalcDataWizard;colExpressionDisplayName_Amount';label.ownText=variation==='wrong_label'?'Other':'Сумма';
      if(variation==='wrong_type')icon.attrs.class='bg-TBGDataType-dtInteger';
      if(variation==='delayed_mask'){const mask=page.add('div',null,'Загрузка');mask.attrs.class='x-mask-msg';page.waitForTimeout=async()=>mask.remove();}
      if(variation==='lost_reply')throw new Error('reply lost');
    };
    const outcome=await page.act({verb,ref:target.ref},read.output);
    assert.equal(outcome.status,['success','delayed_mask','cancel_success'].includes(variation)?'SUCCEEDED':'AMBIGUOUS',variation+JSON.stringify(outcome.error));
    assert.equal(page.clickedPoints.length,1);
    if(variation==='cancel_success')assert.ok(outcome.trace.some(e=>e.event==='expression_parameters_cancel_verified'));
    if(variation==='success')assert.ok(outcome.trace.some(e=>e.event==='expression_parameters_row_verified' && e.node_settings_applied===false));
  }
});


test('Calculator type selection reads the original form after closing a narrow list and rejects collateral changes',async()=>{
  for(const variation of ['success','background_mask','busy_mask','wrong_type','name_changed','selection_changed','replaced_input']) {
    const page=new Page(),wizard=page.add('div','MF;TF-1;WizrdMCF');
    page.add('button','MF;TF-1;WizrdMCF;CalcDataWizard;btnAddExpr','',undefined,wizard);
    const row=page.add('table',null,'',undefined,wizard);row.attrs.class='x-grid-item-selected';
    page.add('td','MF;TF-1;WizrdMCF;CalcDataWizard;colExpressionName_Expr1','Expr1',undefined,row);
    const base='MF;TF-1;WizrdMCF;ExprDataEditForm',dialog=page.add('div',base);dialog.attrs.class='x-window';
    const inputs={};let typeOwner;
    for(const [key,value] of [['edtName','Expr1'],['edtDisplayName','Expr1'],['cbxDataType','Вещественный']]) {
      const owner=page.add('div',base+';'+key,'',undefined,dialog),input=page.add('input',null,'',undefined,owner);
      input.value=value;input.box={x:300,y:200+Object.keys(inputs).length*40,width:100,height:25};inputs[key]=input;
      if(key==='cbxDataType')typeOwner=owner;
    }
    if(variation==='background_mask'){wizard.attrs.class='bg-mask-message';wizard.attrs['bg-mask-text']='Загрузка';}
    if(variation==='busy_mask')dialog.attrs.class='x-window bg-mask-message';
    const list=page.add('div',base+';cbxDataType;boundlist','',{x:500,y:300,width:150,height:60});
    page.add('div',base+';cbxDataType;boundlist;Целый','    Целый',{x:510,y:310,width:130,height:20},list);
    const snapshot=await page.observe(),initial=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');
    assert.ok(initial);
    const narrow=await page.execute({mode:'observe',root_ref:initial.wizard_combo.list_ref});
    const option=narrow.output.ui.elements.find(e=>e.wizard_combo?.kind==='option');
    const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);list.remove();
      inputs.cbxDataType.value=variation==='wrong_type'?'Строковый':'Целый';
      if(variation==='name_changed')inputs.edtName.value='Other';
      if(variation==='selection_changed')row.attrs.class='';
      if(variation==='replaced_input'){inputs.cbxDataType.remove();page.add('input',null,'',undefined,typeOwner).value='Целый';}
    };
    const result=await page.act({verb:'select_wizard_option',ref:option.ref},narrow.output);
    assert.equal(result.status,['success','background_mask'].includes(variation)?'SUCCEEDED':variation==='busy_mask'?'NOT_APPLIED':'AMBIGUOUS',variation+JSON.stringify(result.error));
    if(variation==='busy_mask')assert.equal(result.error.code,'UI_MASKED');
    else if(!['success','background_mask'].includes(variation))assert.equal(result.error.code,'WIZARD_OPTION_NOT_CONFIRMED');
    assert.equal(page.events.filter(e=>e==='click').length,variation==='busy_mask'?0:1);
  }
});

test('wizard owner context uses bounded active-tab breadcrumbs and survives narrow wizard reads',async()=>{
  for(const mode of ['valid','duplicate','broken_chain','wrong_tab','no_wizard_icon','no_vendor_icon','port_owner','too_many','long_path']) {
    const page=new Page(),wizard=page.add('div','MF;TF-1;WizrdMCF');
    page.add('button','MF;TF-1;WizrdMCF;CalcDataWizard;btnAddExpr','',undefined,wizard);
    const tab=mode==='wrong_tab'?'MF;TF-2':'MF;TF-1';
    const panel=page.add('div',tab+';NavigationBar;NavigationPanel');
    const labels=['Сервер','Пакеты','Package1','Модуль1','Сценарий','Сумма','Настройка'];let path='';
    for(const [index,label] of labels.entries()) {
      path+=(index?'>':'')+(mode==='long_path'?'x'.repeat(220):label);
      const tid=tab+';cnrNaviMode;b.s_'+(mode==='broken_chain' && index===3?'Other':path);
      const crumb=page.add('a',tid,label,undefined,panel);
      if(index===4 && mode!=='port_owner')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
      if(index===5 && mode!=='no_vendor_icon')page.add('span',null,'',undefined,crumb).attrs.class='bg-vendor-icon-calcdata';
      if(index===6 && mode!=='no_wizard_icon')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-wizard';
      if(index===5 && mode==='duplicate')page.add('a',tid,label,undefined,panel);
    }
    if(mode==='too_many')for(let i=0;i<33;i++)page.add('a',tab+';cnrNaviMode;b.s_extra'+i,'Extra',undefined,panel);
    const full=await page.observe();
    const wizardRef=full.wizard.root_ref;
    const narrow=await page.execute({mode:'observe',root_ref:wizardRef});
    assert.equal(narrow.status,'SUCCEEDED',mode);
    assert.deepEqual(narrow.output.wizard.owner_context,full.wizard.owner_context,mode);
    const context=narrow.output.wizard.owner_context;
    assert.equal(context.opening_verified,false);
    if(mode==='valid'){assert.equal(context.status,'observed');assert.equal(context.node.label,'Сумма');assert.equal(context.path.length,7);}
    else assert.notEqual(context.status,'observed',mode);
  }
});

test('typed wizard opening verifies node and workflow path after one settings click',async()=>{
  for(const mode of ['bound_begin_suffix','bound_begin_pending','bound_begin_lock','bound_begin_foreign','bound_begin_churn','success','clipped_settings','clipped_settings_covered','formatted_name','same_label_wrong_key','renamed_tab','replaced_tab','wrong_node','wrong_workflow','dialog','lost_reply',
    'stale_region','stale_origin','stale_document','stale_tab','stale_wrong_owner','stale_exhausted']) {
    const page=new Page(),base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');
    let path='';
    for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий']) {
      path+=(path?'>':'')+label;
      const crumb=page.add('a',base+'cnrNaviMode;b.s_'+path,label,undefined,panel);
      if(label==='Сценарий')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
    }
    const nodeKey=mode==='bound_begin_suffix'?'Сумма@1':mode==='formatted_name'?'Quantity_Сумма_по_Region':'Сумма';
    const nodeLabel=mode==='formatted_name'?'Quantity, Сумма по Region':'Сумма';
    const graph=page.add('div',base+'ModelForm;cmpDiagram');
    const body=page.add('g',base+'Graph;'+nodeKey,'',undefined,graph);
    page.add('span',base+'Graph;'+nodeKey+';Label;Label',nodeLabel,undefined,body);
    page.add('g',base+'Graph;'+nodeKey+';Setting','',mode.startsWith('clipped_settings')?{x:500,y:86,width:24,height:24}:{x:500,y:300,width:30,height:30},graph);
    if(mode.startsWith('bound_begin_')) {
      let post=0;
      const reader=async()=>{const clicked=page.events.includes('click');if(clicked)post++;
        if(mode==='bound_begin_pending'&&clicked&&post<=90)return {verified:false,surface_pending:true};
        const graph=!clicked||mode==='bound_begin_churn'||post<=2;
        return {verified:true,document_id:'doc',workflow_id:'workflow',node_id:mode==='bound_begin_foreign'&&post>=2?'foreign':'node',
          surface:graph?'graph':'wizard',tid:base+(graph?'Graph;'+nodeKey:'WizrdMCF'),...(graph?{locked:clicked&&post%2===0}:{})};};
      page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
        {expected_build:build,expected_origin:origin,kind:'workspace-ui',prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}},...options},reader));
    }
    if(mode.startsWith('clipped_settings')){page.context.innerWidth=1000;page.context.innerHeight=800;Object.assign(graph,{box:{x:0,y:103,width:1000,height:600},clientWidth:1000,clientHeight:600,scrollHeight:724,scrollTop:120,style:{overflowY:'auto'}});page.add('div','GraphTopToolbar','',{x:0,y:0,width:1000,height:103});}
    const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_open);
    assert.ok(button);
    let pending=false,detached=null,waits=0;
    const transition=()=>{graph.remove();
      const tab=page.document.querySelectorAll('.x-tab-active')[0];
      if(mode==='renamed_tab')tab.ownText='Настройка';
      if(mode==='replaced_tab'){const tid=tab.getAttribute('data-tid');tab.remove();page.add('div',tid,'Настройка').attrs.class='x-tab-active';}
      const wizard=page.add('div',base+'WizrdMCF');
      page.add('button',base+'WizrdMCF;CalcDataWizard;btnAddExpr','',undefined,wizard);
      if(mode==='wrong_workflow')path=path.replace('Модуль1','Модуль2');
      const name=mode==='bound_begin_suffix'?'Сумма-3':['wrong_node','same_label_wrong_key','stale_wrong_owner'].includes(mode)?'Другой':nodeKey;
      const node=page.add('a',base+'cnrNaviMode;b.s_'+path+'>'+name,mode==='wrong_node'?'Другой':nodeLabel,undefined,panel);
      page.add('span',null,'',undefined,node).attrs.class='bg-vendor-icon-calcdata';
      const last=page.add('a',base+'cnrNaviMode;b.s_'+path+'>'+name+'>Настройка','Настройка',undefined,panel);
      page.add('span',null,'',undefined,last).attrs.class='maptree-icon-wizard';
      if(mode==='dialog')page.add('div','msgbox','Подтвердить').attrs.class='x-window';
      if(mode==='lost_reply')throw new Error('reply lost');
    };
    const click=page.mouse.click;page.mouse.click=async(...args)=>{
      await click(...args);
      if(mode.startsWith('stale_'))pending=true;else transition();
    };
    const evaluate=page.evaluate.bind(page);
    page.evaluate=async(fn,arg)=>{
      const output=await evaluate(fn,arg);
      if(arg?.discoverRoots && page.events.includes('click')) {
        // Complete the real DOM transition after discovery returned the old
        // region, before its separate detailed read starts.
        if(pending){pending=false;transition();}
        else if(mode==='stale_exhausted') {
          detached=page.document.querySelectorAll('[data-tid="'+base+'WizrdMCF"]')[0];detached.remove();
        }
      }
      return output;
    };
    page.waitForTimeout=async()=>{
      waits++;
      if(detached){page.document.body.append(detached);detached=null;}
      if(mode==='stale_origin')page.location.origin='https://other.invalid';
      if(mode==='stale_tab'){page.tab.remove();page.add('div','MF;cntMain;cntWorkspace;Workspace;t.br;tb-2','Настройка').attrs.class='x-tab-active';}
      if(mode==='stale_document')vm.runInContext('delete globalThis[Symbol.for("loginom-dock.workspace-ui.identity.v1")]',page.context);
    };
    if(mode==='clipped_settings_covered')page.document.querySelectorAll('[data-tid="GraphTopToolbar"]')[0].box.height=115;
    const result=await page.act({verb:mode.startsWith('bound_begin_')?'begin_wizard':'open_wizard',ref:button.ref},snapshot);
    const success=['bound_begin_suffix','bound_begin_pending','bound_begin_lock','success','clipped_settings','formatted_name','renamed_tab','stale_region'].includes(mode);
    assert.equal(result.status,success?'SUCCEEDED':mode==='clipped_settings_covered'?'NOT_APPLIED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,mode==='clipped_settings_covered'?0:1);
    assert.equal(result.trace.some(e=>e.event==='wizard_open_verified'),success);
    if(mode==='bound_begin_pending')assert.equal(result.trace.filter(e=>e.event==='node_surface_wait').length,90);
    if(mode==='bound_begin_lock')assert.equal(result.trace.filter(e=>e.event==='node_graph_lock_rediscovery').length,1);
    if(mode==='bound_begin_foreign')assert.equal(result.trace.filter(e=>e.event==='node_graph_lock_rediscovery').length,0);
    if(mode==='bound_begin_churn')assert.equal(result.trace.filter(e=>e.event==='node_graph_lock_rediscovery').length,2);
    if(mode.startsWith('stale_')) {
      assert.equal(result.trace.filter(e=>e.event==='wizard_region_rediscovery').length,mode==='stale_exhausted'?3:1,mode);
      assert.equal(waits,mode==='stale_exhausted'?3:1,mode);
      if(mode==='stale_exhausted')assert.equal(result.error.code,'UI_ROOT_STALE');
    }
  }
});

test('wizard cancellation confirms the original graph after one exact affirmative click',async()=>{
 for(const mode of ['success','wrong_question','wrong_node','still_open']) {
  const page=new Page(),base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');
  let path='';const crumbs=[];
  for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий','Old','Настройка']) {
   path+=(path?'>':'')+label;const crumb=page.add('a',base+'cnrNaviMode;b.s_'+path,label,undefined,panel);crumbs.push(crumb);
   if(label==='Сценарий')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
   if(label==='Old')page.add('span',null,'',undefined,crumb).attrs.class='bg-vendor-icon-calcdata';
   if(label==='Настройка')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-wizard';
  }
  const wizard=page.add('div',base+'WizrdMCF');
  page.add('input',base+'WizrdMCF;DoneWizard;edtDisplayName','',undefined,wizard).value='Draft rename';
  page.add('button',base+'WizrdMCF;btnDone','Done',undefined,wizard);
  const dialog=page.add('div',null,'',{x:400,y:200,width:400,height:150});dialog.attrs.class='x-window';
  page.add('h1',null,'Подтвердить',undefined,dialog).attrs.role='heading';
  page.add('span',null,mode==='wrong_question'?'Удалить пакет?':'Вы действительно хотите закрыть мастер настройки?',undefined,dialog);
  page.add('button','msgbox;tlb;yes','Да',{x:600,y:300,width:50,height:30},dialog);
  page.add('button','msgbox;tlb;no','Нет',{x:670,y:300,width:50,height:30},dialog);
  const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.allowed_actions.includes('confirm_wizard_close'));
  if(mode==='wrong_question'){assert.equal(button,undefined);continue;}
  assert.ok(button);
  const click=page.mouse.click;page.mouse.click=async(...args)=>{
   await click(...args);dialog.remove();if(mode==='still_open')return;
   wizard.remove();crumbs.at(-1).remove();crumbs.at(-2).remove();
   const graph=page.add('div',base+'ModelForm;cmpDiagram'),name=mode==='wrong_node'?'Other':'Old';
   const node=page.add('g',base+'Graph;'+name,'',undefined,graph);page.add('span',base+'Graph;'+name+';Label;Label',name,undefined,node);
  };
  const result=await page.act({verb:'confirm_wizard_close',ref:button.ref},snapshot);
  assert.equal(result.status,mode==='success'?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);
  assert.equal(result.trace.some(e=>e.event==='wizard_cancel_graph_verified'),mode==='success');
 }
});

for(const completion of ['done','execute'])test('wizard '+completion+' waits for the expected graph node without claiming execution completion',async()=>{
  for(const mode of ['success','bound_surface','bound_multiline','bound_multiline_wrong_text','bound_foreign','bound_graph_unlock','bound_graph_lock_churn','wrapped_label','wrapped_filename','wrapped_grouping','different_key','comma_collision','duplicate_label','duplicate_body','actual_space','wrong_label','dialog','still_open','lost_reply','empty_label','stale_region','late_body','late_epoch','epoch_churn','late_mask','late_tab','late_duplicate']) {
    const expected=mode.startsWith('bound_multiline')?'Дубликаты: out: Value, Amount; in: Key (+1)':mode==='wrapped_filename'?'sales 2026.csv':mode==='wrapped_grouping'?'Quantity, Revenue, Id по Region':mode==='comma_collision'?'A, B':mode==='empty_label'?'':'Сумма';
    const page=new Page(),base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');
    let path='';const breadcrumbs=[];
    for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий','Old','Настройка']) {
      path+=(path?'>':'')+label;
      const crumb=page.add('a',base+'cnrNaviMode;b.s_'+path,label,undefined,panel);breadcrumbs.push(crumb);
      if(label==='Сценарий')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
      if(label==='Old')page.add('span',null,'',undefined,crumb).attrs.class='bg-vendor-icon-calcdata';
      if(label==='Настройка')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-wizard';
    }
    const wizard=page.add('div',base+'WizrdMCF');
    for(const [key,value] of [['edtDisplayName',expected],['cbxNodeTitleMode','Автоматическая метка']]) {
      const owner=page.add('div',base+'WizrdMCF;DoneWizard;'+key,'',undefined,wizard);
      page.add('input',null,'',undefined,owner).value=value;
    }
    page.add('button',base+'WizrdMCF;'+(completion==='done'?'btnDone':'btnExecute'),'Finish',{x:500,y:300,width:100,height:30},wizard);
    if(mode.startsWith('bound_')) {
      let postClickReads=0;
      const readNode=async()=>{const graph=page.events.includes('click')&&++postClickReads>1;
        return {verified:true,document_id:'doc',workflow_id:'workflow',node_id:graph&&mode==='bound_foreign'?'foreign':'node',
          surface:graph?'graph':'wizard',tid:base+(graph?'Graph;'+(mode.startsWith('bound_multiline')?'Дубликаты:__out:_Value_Amount;_in:_Key_(+1)':'Сумма'):'WizrdMCF'),
          ...(graph&&['bound_graph_unlock','bound_graph_lock_churn'].includes(mode)?{locked:mode==='bound_graph_unlock'?postClickReads<4:postClickReads%2===1}:{})};};
      page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
        {expected_build:build,expected_origin:origin,kind:'workspace-ui',prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}},...options},readNode));
    }
    const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_finish);
    if(mode==='empty_label'){assert.equal(button,undefined);continue;}
    assert.ok(button);
    let pending=false,finishedNode,finishedLabel,finishedGraph;
    const transition=()=>{
      if(mode==='still_open')return;
      wizard.remove();breadcrumbs.at(-1).remove();breadcrumbs.at(-2).remove();
      const graph=page.add('div',base+'ModelForm;cmpDiagram'),name=mode.startsWith('bound_multiline')?'Дубликаты:__out:_Value_Amount;_in:_Key_(+1)':mode==='wrong_label' || mode==='different_key'?'Other':mode==='actual_space'?'Сум_ма':expected.replace(/\s/g,'_').replace(/,/g,'');
      const node=page.add('g',base+'Graph;'+name,'',undefined,graph);
      const wrapped=['wrapped_label','actual_space','wrapped_filename','wrapped_grouping'].includes(mode);
      const label=page.add('span',base+'Graph;'+name+';Label;Label',wrapped?'':mode==='bound_multiline_wrong_text'?'Дубликаты: Other':mode==='wrong_label'?'Other':mode==='comma_collision'?'A B':expected,undefined,node);
      finishedNode=node;finishedLabel=label;finishedGraph=graph;
      if(['wrapped_label','actual_space'].includes(mode)){page.add('span',null,mode==='actual_space'?'Сум ':'Сум',undefined,label);page.add('br',null,'',undefined,label);page.add('span',null,'ма',undefined,label);}
      if(mode==='wrapped_filename' || mode==='wrapped_grouping') {
        page.add('span',null,mode==='wrapped_filename'?'sales':'Quantity,\u00a0Revenue,',undefined,label);
        page.add('br',null,'',undefined,label);
        page.add('span',null,mode==='wrapped_filename'?'2026.csv':'Id\u00a0по\u00a0Region',undefined,label);
      }
      if(mode==='duplicate_label')page.add('span',base+'Graph;'+name+';Label;Label',expected,undefined,node);
      if(mode==='duplicate_body')page.add('g',base+'Graph;'+name,'',undefined,graph);
      if(mode==='dialog')page.add('div','msgbox','Подтвердить').attrs.class='x-window';
      if(mode==='lost_reply')throw new Error('Lost reply');
    };
    const click=page.mouse.click;page.mouse.click=async(...args)=>{
      await click(...args);if(mode==='stale_region')pending=true;else transition();
    };
    const evaluate=page.evaluate.bind(page);
    page.evaluate=async(fn,arg)=>{
      const output=await evaluate(fn,arg);
      if(arg?.discoverRoots && pending){pending=false;transition();}
      return output;
    };
    let waits=0;
    page.waitForTimeout=async()=>{
      waits++;
      if(mode==='late_body' && waits===2) {
        finishedNode.remove();finishedNode=page.add('g',base+'Graph;Сумма','',undefined,finishedGraph);
        finishedLabel=page.add('span',base+'Graph;Сумма;Label;Label','Сумма',undefined,finishedNode);
      }
      if(mode==='epoch_churn' || mode==='late_epoch' && waits===2)
        page.mutationObserver.pending.push({type:'attributes',target:finishedNode,attributeName:'style'});
      if(mode==='late_mask' && waits===2)page.add('div','late-mask','Загрузка').attrs.class='x-mask-msg';
      if(mode==='late_tab' && waits===2)page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-2';
      if(mode==='late_duplicate' && waits===2)page.add('span',base+'Graph;Сумма;Label;Label','Сумма',undefined,finishedNode);
    };
    const result=await page.act({verb:completion==='done'?'finish_wizard':'execute_wizard',ref:button.ref},snapshot);
    const success=['success','bound_surface','bound_multiline','bound_graph_unlock','wrapped_label','wrapped_filename','wrapped_grouping','stale_region','late_body','late_epoch'].includes(mode);
    assert.equal(result.status,success?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1);
    if(completion==='execute' && success) {
      const proof=result.trace.find(e=>e.event==='wizard_execute_graph_verified');
      assert.equal(proof.launch_gesture_verified,true);assert.equal(proof.execution_completed,false);
      assert.equal(result.trace.some(e=>e.event==='wizard_finish_graph_verified'),false);
    }
    assert.equal(result.trace.some(e=>e.event===(completion==='done'?'wizard_finish_graph_verified':'wizard_execute_graph_verified') && e.reopen_required && !e.settings_readback_verified),success);
    assert.equal(result.trace.some(e=>e.event===(completion==='done'?'wizard_finish_settled':'wizard_execute_settled') && e.quiet_samples===3),success);
    if(['late_body','late_epoch'].includes(mode))assert.equal(waits,5,mode);
    if(mode==='late_body') {
      const settled=result.trace.find(e=>e.event===(completion==='done'?'wizard_finish_settled':'wizard_execute_settled'));
      const finalNode=result.output.ui.elements.find(e=>e.graph_node?.part==='body');
      assert.equal(settled.node_ref,finalNode.ref);
      assert.equal(result.output.ui.elements.find(e=>e.ref===finalNode.ref).tid,finishedNode.attrs['data-tid']);
    }
    if(mode==='epoch_churn'){assert.equal(waits,12);assert.equal(result.error.code,'WIZARD_FINISH_NOT_SETTLED');}
    if(mode==='bound_graph_unlock')assert.equal(result.trace.filter(e=>e.event==='node_graph_lock_rediscovery').length,1);
    if(mode==='bound_graph_lock_churn'){assert.equal(result.error.code,'PREPARED_NODE_CONTEXT_CHANGED');assert.equal(result.trace.filter(e=>e.event==='node_graph_lock_rediscovery').length,2);}
    if(mode==='stale_region')assert.equal(result.trace.filter(e=>e.event==='wizard_region_rediscovery').length,1);
  }
});

test('date/time exposes untagged native checkbox images only for the exact cached row and flag',async()=>{
 for(const mode of ['valid','record_changed','flag_changed','duplicate_image','foreign_store']){
  const page=new Page(),base='MF;TF-1;WizrdMCF;DateReformWizard;';
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const form=page.add('div','MF;TF-1;WizrdMCF','',{x:10,y:80,width:1000,height:600});
  const root=page.add('div',base.slice(0,-1),'',{x:20,y:90,width:900,height:500},form);
  const grid=page.add('div',base+'grdDataFormat;tbl','',{x:30,y:100,width:800,height:400},root);grid.attrs.id='date-grid';grid.id='date-grid';
  const row=page.add('table',null,'',{x:35,y:120,width:700,height:30},grid);Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':'0','data-recordid':mode==='record_changed'?'other':'r0','data-boundview':'date-grid'});
  const cell=page.add('td',base+'colDoDateTimeFirst_0','',{x:160,y:120,width:100,height:30},row);
  const image=page.add('img',null,'',{x:200,y:125,width:16,height:16},cell);image.attrs.class='x-grid-checkcolumn';
  if(mode==='duplicate_image'){const second=page.add('img',null,'',{x:220,y:125,width:16,height:16},cell);second.attrs.class='x-grid-checkcolumn';}
  const record={isModel:true,internalId:'r0',data:{Func:0,ISO8601:false,DoDateTimeFirst:mode==='flag_changed',DoDateTimeLast:false,DoNumber:false,DoString:false}};
  page.context.Ext={getCmp:id=>id==='date-grid'?{el:{dom:grid},getStore:()=>({$className:mode==='foreign_store'?'Other':'Ext.data.Store',isLoading:()=>false,getData:()=>({items:[record]})})}:undefined};
  const s=await page.observe(),flags=s.ui.elements.filter(e=>e.date_time_cell?.role==='flag');
  assert.equal(flags.length,mode==='valid'?1:0,mode+JSON.stringify({wizard:s.wizard,elements:s.ui.elements.map(e=>({tid:e.tid,role:e.date_time_cell}))}));
  if(mode==='valid'){assert.equal(flags[0].date_time_cell.record_id,'r0');assert.equal(flags[0].date_time_cell.checked,false);assert.ok(flags[0].allowed_actions.includes('click'),JSON.stringify(flags[0]));assert.equal(flags[0].identity.anchor_tid,base+'colDoDateTimeFirst_0');}
 }
});

test('date orphan delete cells require the date wizard, exact cached row and an unbound optional output',async()=>{
 for(const mode of ['valid','linked','required','record_changed','other_wizard']){
  const page=new Page(),base='MF;TF-1;WizrdMCF;DerivedDataSourceMappingEngineOutputPortWizard;';
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const form=page.add('div','MF;TF-1;WizrdMCF','',{x:10,y:80,width:900,height:600});
  if(mode!=='other_wizard'){const date=page.add('div','MF;TF-1;WizrdMCF;DateReformWizard','',{x:10,y:80,width:900,height:500},form);date.style.display='none';}
  const root=page.add('div',base.slice(0,-1),'',{x:20,y:90,width:850,height:500},form);
  page.add('button',base+'btnAddMappingColumn','',{x:30,y:90,width:20,height:20},root);
  const grid=page.add('div',base+'grdTargetColumns;tbl','',{x:30,y:100,width:800,height:400},root);grid.attrs.id='orphan-grid';grid.id='orphan-grid';
  const row=page.add('table',null,'',{x:35,y:120,width:700,height:30},grid);Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':'0','data-recordid':mode==='record_changed'?'other':'r0','data-boundview':'orphan-grid'});
  const cell=page.add('td',base+'colTargetDelete_RenamedYear','',{x:650,y:120,width:30,height:30},row);
  const icon=page.add('img',null,'',{x:655,y:125,width:16,height:16},cell);icon.attrs.role='button';icon.attrs.class='x-action-col-icon';
  const record={isModel:true,internalId:'r0',data:{Name:'RenamedYear',Required:mode==='required',ConnectedRecord:mode==='linked'?{}:null}};
  page.context.Ext={getCmp:id=>id==='orphan-grid'?{el:{dom:grid},getStore:()=>({$className:'Ext.data.Store',isLoading:()=>false,getData:()=>({items:[record]})})}:undefined};
  const state=await page.observe(),cells=state.ui.elements.filter(e=>e.date_time_cell?.role==='output_delete');
  assert.equal(cells.length,mode==='valid'?1:0,mode+JSON.stringify({wizard:state.wizard,elements:state.ui.elements.map(e=>({tid:e.tid,date:e.date_time_cell}))}));
  if(mode==='valid'){assert.equal(cells[0].date_time_cell.record_id,'r0');assert.ok(cells[0].allowed_actions.includes('click'));}
 }
});

function groupingFixture() {
  const page=new Page(),base='MF;TF-1;WizrdMCF;GroupDataWizard;';
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const box={x:30,y:100,width:500,height:300},wizard=page.add('div','MF;TF-1;WizrdMCF','',box);
  const grid=page.add('div',base+'grdUsedFields;tbl','',box,wizard);grid.attrs.id='group-grid';
  const spacer=page.add('div',null,'',box,grid);spacer.style.display='none';
  const container=page.add('div',null,'',box,grid);container.attrs.class='x-grid-item-container';
  const records=[];
  for(const [index,[key,type,text,header,summary]] of [
    ['Region','dtString','Region','6',0],['Quantity','dtInteger','Quantity (Сумма)','7',null],
    ['Revenue','dtFloat','Revenue (Сумма)',null,null],['Id','dtInteger','Id (Количество)',null,1]].entries()) {
    const rowBox={x:30,y:100+index*70,width:500,height:70};
    const row=page.add('table',null,'',rowBox,container);row.attrs={class:'x-grid-item','data-recordindex':String(index),'data-boundview':'group-grid'};
    const body=page.add('tbody',null,'',rowBox,row);let groupHeader;
    if(header) {
      const tr=page.add('tr',null,'',rowBox,body);
      groupHeader=page.add('div',base+'grdUsedFields;tbl;GroupHeader;'+header,header==='6'?'Группа':'Показатели',rowBox,tr);
      groupHeader.attrs.class='x-grid-group-hd x-grid-group-hd-not-collapsible';groupHeader.attrs['data-groupname']=header;
    }
    const tr=page.add('tr',null,'',rowBox,body);tr.attrs.class='x-grid-row';
    const cell=page.add('td',base+'colUsedFields_'+key,text,rowBox,tr);
    const icon=page.add('div',null,'',rowBox,cell);icon.attrs.class='bg-TBGDataType-'+type+' bg-grid-icon';
    page.add('td',base+'colUsedFieldsDelete_'+key,'',rowBox,tr);
    let summaryRow;
    if(summary!==null) {
      summaryRow=page.add('tr',null,'',rowBox,body);summaryRow.attrs.class='x-grid-row-summary';
      page.add('td',base+'colUsedFields;SummaryRow-'+summary,'\u00a0',rowBox,summaryRow);
      page.add('td',base+'colUsedFieldsDelete;SummaryRow-'+summary,'\u00a0',rowBox,summaryRow);
    }
    records.push({row,body,tr,cell,icon,groupHeader,summaryRow});
  }
  return {page,base,wizard,grid,container,records};
}

test('grouping rendered readback binds sections and SUM COUNT without claiming coverage or output types',async()=>{
  const {page}=groupingFixture(),full=await page.observe();
  const result=full.wizard.grouping;
  assert.equal(result.status,'rendered_grouping_rows',JSON.stringify(result));
  assert.deepEqual(result.keys.map(f=>[f.field_key,f.input_type]),[['Region','string']]);
  assert.deepEqual(result.measures.map(f=>[f.field_key,f.input_type,f.aggregations]),[
    ['Quantity','integer',['sum']],['Revenue','real',['sum']],['Id','integer',['count']]]);
  assert.equal(result.measures[0].section_ref,result.measures[2].section_ref);
  assert.notEqual(result.keys[0].section_ref,result.measures[0].section_ref);
  assert.equal(result.complete,false);assert.equal(result.source_identity_verified,false);
  assert.equal(result.aggregation_settings_verified,false);assert.equal(result.definition_coverage.status,'partial');
  const roots=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(roots.output.wizard.grouping.status,'unobserved');
  const narrow=await page.execute({mode:'observe',root_ref:result.grid_ref});
  assert.deepEqual(narrow.output.wizard.grouping,result);
  const cell=await page.execute({mode:'observe',root_ref:result.measures[0].cell_ref});
  assert.equal(cell.output.wizard.grouping.status,'unobserved');
});

test('grouping readback rejects ambiguous stale or incomplete rendered section structures',async()=>{
  for(const mode of ['index_gap','reordered','missing_header','wrong_header','duplicate_header','missing_summary','wrong_summary',
    'early_summary','extra_row','clipped','duplicate_cell','unknown_aggregate','multiple_aggregates','missing_type','ambiguous_type','editor','foreign_boundview','hidden_row']) {
    const {page,base,wizard,container,records:r}=groupingFixture();
    if(mode==='index_gap')r[2].row.attrs['data-recordindex']='3';
    if(mode==='reordered')container.children=[r[1].row,r[0].row,r[2].row,r[3].row];
    if(mode==='missing_header')r[1].groupHeader.remove();
    if(mode==='wrong_header')r[1].groupHeader.ownText='Группа';
    if(mode==='duplicate_header')page.add('div',r[1].groupHeader.attrs['data-tid'],'Показатели',r[1].row.box,r[1].tr).attrs.class='x-grid-group-hd';
    if(mode==='missing_summary')r[0].summaryRow.remove();
    if(mode==='wrong_summary')r[0].summaryRow.children[0].attrs['data-tid']=base+'colUsedFields;SummaryRow-1';
    if(mode==='early_summary')r[0].body.children.reverse();
    if(mode==='extra_row')page.add('tr',null,'',r[1].row.box,r[1].body);
    if(mode==='clipped')r[3].row.box.y=700;
    if(mode==='duplicate_cell')page.add('td',r[2].cell.attrs['data-tid'],'',r[2].row.box,r[2].tr);
    if(mode==='unknown_aggregate')r[1].cell.ownText='Quantity (Среднее)';
    if(mode==='multiple_aggregates')r[1].cell.ownText='Quantity (Сумма, Количество)';
    if(mode==='missing_type')r[1].icon.remove();
    if(mode==='ambiguous_type')r[1].icon.attrs.class+=' bg-TBGDataType-dtFloat';
    if(mode==='editor')page.add('div','MF;TF-1;WizrdMCF;FactorEditDialog','',r[1].row.box,wizard);
    if(mode==='foreign_boundview')r[1].row.attrs['data-boundview']='foreign-grid';
    if(mode==='hidden_row')r[1].row.style.visibility='hidden';
    const result=(await page.observe()).wizard.grouping;
    assert.equal(result.status,'unobserved',mode);assert.deepEqual(result.keys,[],mode);assert.deepEqual(result.measures,[],mode);
    assert.equal(result.complete,false,mode);
  }
});

test('grouping allows the observed 1/64px right border but rejects actual clipping and viewport overflow',async()=>{
  for(const [extra,viewport,expected] of [[1/64,1000,'rendered_grouping_rows'],[1/32,1000,'unobserved'],[1,1000,'unobserved'],[1/64,530,'unobserved']]) {
    const {page,records}=groupingFixture();
    records[0].row.box={...records[0].row.box,width:500+extra};
    page.context.innerWidth=viewport;
    assert.equal((await page.observe()).wizard.grouping.status,expected,JSON.stringify({extra,viewport}));
  }
});

test('output port mapping is recognized narrowly and conflicting visible variants stay ambiguous',async()=>{
  for(const conflict of [false,true]) {
    const page=new Page(),form=page.add('div','MF;TF-1;WizrdMCF');
    page.add('button','MF;TF-1;WizrdMCF;DerivedDataSourceOutputSocketWizard;btnAddMappingColumn','',undefined,form);
    if(conflict)page.add('button','MF;TF-1;WizrdMCF;ColumnsMappingEngineOutputPortWizard;btnAddMappingColumn','',undefined,form);
    const full=await page.observe();
    const narrow=await page.execute({mode:'observe',root_ref:full.wizard.root_ref});
    assert.equal(narrow.output.wizard.stage,conflict?null:'output_mapping');
    assert.equal(narrow.output.wizard.stage_status,conflict?'ambiguous':'observed');
  }
});

test('output columns bind names labels and types to real rows, excluding summary duplicates',async()=>{
  for(const mode of ['valid','duplicate','wrong_row','unknown_type','long_name']) {
    const page=new Page(),base='MF;TF-1;WizrdMCF;',form=page.add('div',base.slice(0,-1));
    page.add('button',base+'DerivedDataSourceOutputSocketWizard;btnAddMappingColumn','',undefined,form);
    const stem=base+'DerivedDataSourceOutputSocketWizard;',table=page.add('table',null,'',undefined,form);
    const row=page.add('tr',null,'',undefined,table);
    page.add('td',stem+'colName_QuantitySum',mode==='long_name'?'x'.repeat(250):'QuantitySum',undefined,row);
    const labelRow=mode==='wrong_row'?page.add('table',null,'',undefined,form):row;
    const label=page.add('td',stem+'colDisplayName_QuantitySum','Quantity|Сумма',undefined,labelRow);
    page.add('span',null,'',undefined,label).attrs.class=mode==='unknown_type'?'unknown':'bg-TBGDataType-dtInteger';
    const summary=page.add('tr',null,'',undefined,table);summary.attrs.class=mode==='duplicate'?'':'x-grid-row-summary';
    page.add('td',stem+'colName_QuantitySum','',undefined,summary);
    page.add('td',stem+'colDisplayName_QuantitySum','',undefined,summary);
    const full=await page.observe(),narrow=await page.execute({mode:'observe',root_ref:full.wizard.root_ref});
    assert.equal(narrow.status,'SUCCEEDED');
    assert.deepEqual(narrow.output.wizard.output_columns,full.wizard.output_columns);
    const columns=narrow.output.wizard.output_columns;
    assert.equal(columns.complete,false);assert.equal(columns.settings_applied,false);
    if(mode==='valid'){assert.equal(columns.fields.length,1);assert.equal(columns.fields[0].type,'integer');assert.equal(columns.fields[0].name,'QuantitySum');}
    else assert.ok(columns.fields.every(f=>f.status!=='observed'),mode);
  }
});

test('output column typed editing preserves the selected row and all other parameters',async()=>{
  for(const mode of ['name','label','linked_name','linked_wrong','unlinked_changed','type_changed','selection_changed','missing_type','combo','combo_kind_changed','combo_busy']) {
    const page=new Page(),base='MF;TF-1;WizrdMCF;',form=page.add('div',base.slice(0,-1));
    page.add('button',base+'DerivedDataSourceOutputSocketWizard;btnAddMappingColumn','',undefined,form);
    const table=page.add('table',null,'',undefined,form);table.attrs.class='x-grid-item-selected';
    page.add('td',base+'DerivedDataSourceOutputSocketWizard;colName_Quantity','Quantity',undefined,table);
    const label=page.add('td',base+'DerivedDataSourceOutputSocketWizard;colDisplayName_Quantity','Quantity|Сумма',undefined,table);
    page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dtInteger';
    const dialog=page.add('div',base+'EditColumnDefForm');dialog.attrs.class='x-window';const inputs={};
    for(const [key,value] of [['edtName','Quantity'],['edtDisplayName','Quantity|Сумма'],['cbxDataType','Целый'],['cbxDataKind','Непрерывный'],['cbxUsageType','Не задано']]) {
      const owner=page.add('div',base+'EditColumnDefForm;'+key,'',undefined,dialog),input=page.add('input',null,'',undefined,owner);
      input.value=value;input.box={x:300,y:200+Object.keys(inputs).length*40,width:120,height:25};inputs[key]=input;
    }
    if(mode.startsWith('combo')) {
      const stem=base+'EditColumnDefForm;cbxDataType;';
      const list=page.add('div',stem+'boundlist','',{x:600,y:300,width:140,height:40});
      page.add('div',stem+'boundlist;Вещественный','Вещественный',{x:605,y:305,width:130,height:25},list);
      if(mode==='combo_busy')dialog.attrs.class='x-window bg-mask-message';
      else {form.attrs.class='bg-mask-message';form.attrs['bg-mask-text']='Загрузка';}
      const snapshot=await page.observe(),first=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');
      assert.ok(first);
      const read=await page.execute({mode:'observe',root_ref:first.wizard_combo.list_ref});
      const option=read.output.ui.elements.find(e=>e.wizard_combo?.kind==='option');
      const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);list.remove();inputs.cbxDataType.value='Вещественный';
        if(mode==='combo_kind_changed')inputs.cbxDataKind.value='Дискретный';};
      const result=await page.act({verb:'select_wizard_option',ref:option.ref},read.output);
      assert.equal(result.status,['combo','combo_enable_kind'].includes(mode)?'SUCCEEDED':mode==='combo_busy'?'NOT_APPLIED':'AMBIGUOUS',mode+JSON.stringify(result.error));
      assert.equal(page.events.filter(e=>e==='click').length,mode==='combo_busy'?0:1);
      continue;
    }
    if(mode.startsWith('linked_'))inputs.edtDisplayName.value='Quantity';
    if(mode==='missing_type')inputs.cbxDataType.remove();
    const full=await page.observe(),read=await page.execute({mode:'observe',root_ref:full.wizard.column_parameters.root_ref});
    const target=read.output.ui.elements.find(e=>e.wizard_field?.scope==='output_column' && e.wizard_field.name===(mode==='label'?'label':'name'));
    if(mode==='missing_type'){assert.equal(target,undefined);continue;}
    assert.ok(target);
    page.onPress=key=>{if(key==='Tab'){if(mode==='type_changed')inputs.cbxDataType.value='Вещественный';if(mode==='selection_changed')table.attrs.class='';if(mode==='linked_name'||mode==='unlinked_changed')inputs.edtDisplayName.value='QuantitySum';if(mode==='linked_wrong')inputs.edtDisplayName.value='Wrong';}};
    const result=await page.act({verb:'set_wizard_field',ref:target.ref,text:'QuantitySum'},read.output);
    assert.equal(result.status,['name','label','linked_name'].includes(mode)?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    if(['name','label','linked_name'].includes(mode))assert.ok(result.trace.some(e=>e.event==='wizard_draft_value_verified' && e.scope==='output_column' && e.settings_applied===false));
  }
});

test('input and output editors apply and cancel verify all row properties after one click',async()=>{
  for(const direction of ['input','output'])for(const mode of ['apply','cancel','wrong_type','wrong_kind','cancel_replaced','lost_reply']) {
    const page=new Page(),base='MF;TF-1;WizrdMCF;',form=page.add('div',base.slice(0,-1));
    const editor=direction==='input'?'EditTuneColumnDefForm':'EditColumnDefForm',usageColumn=direction==='input'?'colUsageType_':'colDefaultUsageType_';
    const stem=base+(direction==='input'?'TuneDataSourceMappingWizard;':'DerivedDataSourceOutputSocketWizard;');page.add('button',stem+'btnAddMappingColumn','',undefined,form);
    let table;
    const createRow=(name='Quantity',type='Integer',kind='Непрерывный')=>{
      table=page.add('table',null,'',undefined,form);table.attrs.class='x-grid-item-selected';
      page.add('td',stem+'colName_'+name,name,undefined,table);
      const label=page.add('td',stem+'colDisplayName_'+name,'Sum',undefined,table);page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dt'+type;
      page.add('td',stem+'colDataKind_'+name,kind,undefined,table);page.add('td',stem+usageColumn+name,'Не задано',undefined,table);
    };createRow();
    const dialog=page.add('div',base+editor);dialog.attrs.class='x-window';
    for(const [key,value] of [['edtName','QuantitySum'],['edtDisplayName','Sum'],['cbxDataType','Целый'],['cbxDataKind','Непрерывный'],['cbxUsageType','Не задано']]) {
      const owner=page.add('div',base+editor+';'+key,'',undefined,dialog);page.add('input',null,'',undefined,owner).value=value;
    }
    const cancel=mode.startsWith('cancel'),verb=cancel?'cancel_output_column':'apply_output_column';
    page.add('button',base+editor+';'+(cancel?'btnCancel':'btnApply'),'Close',{x:600,y:400,width:80,height:25},dialog);
    const full=await page.observe(),read=await page.execute({mode:'observe',root_ref:full.wizard.column_parameters.root_ref});
    const target=read.output.ui.elements.find(e=>e.column_close);assert.ok(target);
    const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);dialog.remove();
      if(mode!=='cancel'){table.remove();createRow(cancel?'Quantity':'QuantitySum',mode==='wrong_type'?'Float':'Integer',mode==='wrong_kind'?'Дискретный':'Непрерывный');}
      if(mode==='lost_reply')throw new Error('Lost reply');
    };
    const result=await page.act({verb,ref:target.ref},read.output);
    assert.equal(result.status,['apply','cancel'].includes(mode)?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1);
  }
});

test('output-port context binds distinct node and port breadcrumbs and rejects wrong ownership',async()=>{
  for(const mode of ['valid','socket','input_port','wrong_folder','missing_workflow','duplicate','overflow_bound','overflow_unbound']) {
    const page=new Page(),base='MF;TF-1;',wizard=page.add('div',base+'WizrdMCF');
    page.add('button',base+(mode==='socket'?'WizrdMCF;DataSetOutputSocketWizard;grdTargetColumns;tbl':'WizrdMCF;DerivedDataSourceOutputSocketWizard;btnAddMappingColumn'),'',undefined,wizard);
    const panel=page.add('div',base+'NavigationBar;NavigationPanel');let path='';
    const items=[['Package','maptree-icon-package'],['Workflow',mode==='missing_workflow'?'':'maptree-icon-workflow'],['Group','bg-vendor-icon-groupdata'],
      ['Outputs',mode==='wrong_folder'?'maptree-icon-modelinputports':'maptree-icon-modeloutputports'],
      ['Result',mode==='input_port'?'bg-vendor-icon-inputdatasourcesocketdef':mode==='socket'?'bg-vendor-icon-datasetoutputsocketdef':'bg-vendor-icon-deriveddatasourceoutputsocketdef'],[mode.startsWith('overflow')?'Настройка':'Settings','maptree-icon-wizard']];
    for(const [label,icon] of items){path+=(path?'>':'')+label;const tid=base+'cnrNaviMode;b.s_'+path;
      const crumb=page.add('a',tid,label,undefined,panel);page.add('span',null,'',undefined,crumb).attrs.class=icon;
      if(mode.startsWith('overflow')&&label==='Настройка')crumb.style.display='none';
      if(mode==='duplicate' && label==='Result')page.add('a',tid,label,undefined,panel);
    }
    if(mode==='overflow_bound')page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
      {expected_build:build,expected_origin:origin,prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}},...options},
      async()=>({verified:true,surface:'wizard',node_id:'node',output_port:{direction:'output',port:0}})));
    const full=await page.observe(),narrow=await page.execute({mode:'observe',root_ref:full.wizard.root_ref});
    const context=narrow.output.wizard.port_context;
    assert.deepEqual(context,full.wizard.port_context);assert.notEqual(narrow.output.wizard.owner_context.status,'observed');
    assert.equal(context.opening_verified,false);
    if(['valid','socket','overflow_bound'].includes(mode)){assert.equal(context.status,'observed');assert.equal(context.node.label,'Group');assert.equal(context.port.label,'Result');assert.equal(context.kind,'output_data');}
    else assert.notEqual(context.status,'observed',mode);
  }
});

test('node and socket output mapping read source cells without inventing source identity',async()=>{
  for(const formName of ['ColumnsMappingEngineOutputPortWizard','DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard']) {
    for(const mode of ['mapped','unmapped','missing','blank','duplicate','wrong_row','contradiction','unknown_type','long_label']) {
      const page=new Page(),base='MF;TF-1;WizrdMCF;',form=page.add('div',base.slice(0,-1)),stem=base+formName+';';
      page.add('button',stem+'btnAddMappingColumn','',undefined,form);
      const row=page.add('table',null,'',undefined,form);
      const name=page.add('td',stem+'colName_Total','Total',undefined,row);
      const label=page.add('td',stem+'colDisplayName_Total','Total',undefined,row);
      page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dtFloat';
      if(mode!=='missing') {
        const parent=mode==='wrong_row'?page.add('table',null,'',undefined,form):row;
        const source=page.add('td',stem+'colSourceDisplayName_Total',['unmapped','blank'].includes(mode)?'':mode==='long_label'?'x'.repeat(250):'Quantity|Сумма',undefined,parent);
        if(['unmapped','contradiction'].includes(mode))page.add('div',null,'',undefined,source).attrs.class='bg-cell-null-value';
        if(!['unmapped','blank'].includes(mode))page.add('span',null,'',undefined,source).attrs.class=mode==='unknown_type'?'bg-TBGDataType-dtUnknown':'bg-TBGDataType-dtFloat';
        if(mode==='duplicate')page.add('td',stem+'colSourceDisplayName_Total','Other',undefined,row);
        const summary=page.add('tr',null,'',undefined,row);summary.attrs.class='x-grid-row-summary';
        page.add('td',stem+'colSourceDisplayName_Total','Summary',undefined,summary);
      }
      const full=await page.observe(),narrow=await page.execute({mode:'observe',root_ref:full.wizard.output_columns.fields[0].name_ref});
      assert.equal(full.wizard.stage,'output_mapping');
      assert.deepEqual(narrow.output.wizard.output_columns,full.wizard.output_columns);
      const source=full.wizard.output_columns.fields[0].source;
      assert.equal(source.status,mode==='mapped'?'rendered_source':mode==='unmapped'?'unmapped':['missing','wrong_row'].includes(mode)?'unobserved':'ambiguous',mode);
      assert.equal(source.identity_verified,false);
      if(mode==='mapped'){assert.equal(source.label,'Quantity|Сумма');assert.equal(source.type,'real');}
    }
  }
});

test('field parameters read row types caching and exclusion separately from port mapping',async()=>{
  for(const mode of ['valid','excluded','missing_check','duplicate_check','missing_cache','conflict']) {
    const page=new Page(),base='MF;TF-1;WizrdMCF;',form=page.add('div',base.slice(0,-1)),stem=base+'ReformColumnsWizard;';
    page.add('div',stem+'grdTargetColumns;tbl','',undefined,form);
    if(mode==='conflict')page.add('button',base+'DerivedDataSourceOutputSocketWizard;btnAddMappingColumn','',undefined,form);
    const row=page.add('table',null,'',undefined,form);
    page.add('td',stem+'colName_QuantitySum','QuantitySum',undefined,row);
    const label=page.add('td',stem+'colDisplayName_QuantitySum','QuantitySum',undefined,row);
    page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dtInteger';
    page.add('td',stem+'colDataKind_QuantitySum','Непрерывный',undefined,row);
    page.add('td',stem+'colDefaultUsageType_QuantitySum','Не задано',undefined,row);
    if(mode!=='missing_cache')page.add('td',stem+'colCachingMethod_QuantitySum','Отключено',undefined,row);
    const excluded=page.add('td',stem+'colExcluded_QuantitySum','',undefined,row);
    if(mode!=='missing_check')page.add('img',null,'',undefined,excluded).attrs.class='x-grid-checkcolumn'+(mode==='excluded'?' x-grid-checkcolumn-checked':'');
    if(mode==='duplicate_check')page.add('img',null,'',undefined,excluded).attrs.class='x-grid-checkcolumn';
    const full=await page.observe();
    if(mode==='conflict'){assert.equal(full.wizard.stage,null);assert.equal(full.wizard.reform_columns,undefined);continue;}
    assert.equal(full.wizard.stage,'field_parameters');assert.equal(full.wizard.output_columns,undefined);
    const columns=full.wizard.reform_columns,field=columns.fields[0];
    assert.equal(field.type,'integer');assert.equal(field.caching,mode==='missing_cache'?null:'Отключено');
    assert.equal(field.excluded,['missing_check','duplicate_check'].includes(mode)?null:mode==='excluded');
    assert.equal(field.source,undefined);assert.equal(columns.complete,false);assert.equal(columns.settings_applied,false);
    const narrow=await page.execute({mode:'observe',root_ref:field.name_ref});
    assert.deepEqual(narrow.output.wizard.reform_columns,columns);
  }
});

test('reform editor reads seven native parameters including disabled cache and owner checkbox state',async()=>{
  for(const mode of ['global','global_duplicate','global_impostor','global_foreign_wizard','valid','checked','missing_display','duplicate_display','duplicate_form','long_name','combo','combo_enable_kind','combo_wrong_kind','combo_excluded','combo_cache','combo_busy','combo_lost']) {
    const page=new Page(),base='MF;TF-1;WizrdMCF;',form=page.add('div',base.slice(0,-1)),stem=base+'ReformColumnsWizard;';
    page.add('div',stem+'grdTargetColumns;tbl','',undefined,form);
    const row=page.add('table',null,'',undefined,form);row.attrs.class='x-grid-item-selected';
    page.add('td',stem+'colName_QuantitySum','QuantitySum',undefined,row);
    const label=page.add('td',stem+'colDisplayName_QuantitySum','QuantitySum',undefined,row);
    page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dtInteger';
    const dialogBase=mode.startsWith('global')?'':base;
    const dialog=page.add('div',dialogBase+'EditReformColumnDefForm');dialog.attrs.class=mode==='global_impostor'?'':'x-window';
    if(mode==='global_foreign_wizard')page.add('div','MF;TF-2;WizrdMCF');
    const root=dialogBase+'EditReformColumnDefForm;',inputs={};
    for(const [key,value] of [['edtName',mode==='long_name'?'x'.repeat(257):'QuantitySum'],['edtDisplayName','QuantitySum'],['cbxDataType','Целый'],['cbxDataKind','Непрерывный'],['cbxUsageType','Не задано'],['cntMain;cbxCachingMethod','Отключено']]) {
      const owner=page.add('div',root+key,'',undefined,dialog),input=page.add('input',null,'',undefined,owner);input.value=value;inputs[key]=input;
      if(key.endsWith('cbxCachingMethod'))input.disabled=true;
    }
    const owner=page.add('div',root+'cntMain;chbExcluded','',undefined,dialog);owner.attrs.class=mode==='checked'?'x-form-cb-checked':'';
    const hidden=page.add('input',null,'',undefined,owner);hidden.checked=false;
    if(mode!=='missing_display')page.add('span',root+'cntMain;chbExcluded;DisplayEl','',undefined,owner).attrs.class='x-form-checkbox';
    if(mode==='duplicate_display')page.add('span',root+'cntMain;chbExcluded;DisplayEl','',undefined,owner).attrs.class='x-form-checkbox';
    if(mode==='duplicate_form' || mode==='global_duplicate')page.add('div',base+'EditReformColumnDefForm');
    if(mode==='combo_enable_kind'){inputs.cbxDataType.value='Строковый';inputs.cbxDataKind.disabled=true;}
    if(mode.startsWith('combo')) {
      const list=page.add('div',root+'cbxDataType;boundlist','',{x:600,y:300,width:140,height:40});
      page.add('div',root+'cbxDataType;boundlist;Вещественный','Вещественный',{x:605,y:305,width:130,height:25},list);
      form.attrs.class='bg-mask-message';form.attrs['bg-mask-text']='Загрузка';
      if(mode==='combo_busy')dialog.attrs.class='x-window bg-mask-message';
      const full=await page.observe(),first=full.ui.elements.find(e=>e.wizard_combo?.kind==='option');assert.ok(first);
      const read=await page.execute({mode:'observe',root_ref:first.wizard_combo.list_ref});
      const option=read.output.ui.elements.find(e=>e.wizard_combo?.kind==='option');assert.ok(option);
      const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);list.remove();
        inputs.cbxDataType.value='Вещественный';
        if(mode==='combo_enable_kind')inputs.cbxDataKind.disabled=false;
        if(mode==='combo_wrong_kind')inputs.cbxDataKind.value='Дискретный';
        if(mode==='combo_excluded')owner.attrs.class='x-form-cb-checked';
        if(mode==='combo_cache')inputs['cntMain;cbxCachingMethod'].value='При активации';
        if(mode==='combo_lost')throw new Error('lost reply');
      };
      const result=await page.act({verb:'select_wizard_option',ref:option.ref},read.output);
      assert.equal(result.status,['combo','combo_enable_kind'].includes(mode)?'SUCCEEDED':mode==='combo_busy'?'NOT_APPLIED':'AMBIGUOUS',mode+JSON.stringify(result.error));
      assert.equal(page.events.filter(e=>e==='click').length,mode==='combo_busy'?0:1);continue;
    }
    const full=await page.observe(),params=full.wizard.reform_parameters;
    if(['duplicate_form','global_duplicate','global_impostor','global_foreign_wizard'].includes(mode)){assert.equal(params.status,'ambiguous');assert.equal(params.fields,undefined);continue;}
    assert.equal(params.selected_column.name,'QuantitySum');assert.equal(Object.keys(params.fields).length,7);
    assert.equal(params.fields.caching.enabled,false);assert.equal(params.fields.caching.value,'Отключено');
    assert.equal(params.fields.name.truncated,mode==='long_name');
    assert.equal(params.fields.excluded.status,mode==='missing_display'?'unobserved':mode==='duplicate_display'?'ambiguous':'observed');
    if(['valid','checked'].includes(mode))assert.equal(params.fields.excluded.value,mode==='checked');
    const narrow=await page.execute({mode:'observe',root_ref:params.root_ref});
    assert.deepEqual(narrow.output.wizard.reform_parameters,params);
    assert.equal(params.applied_verified,false);
  }
});

test('reform editor close verifies caching exclusion and original row after one click',async()=>{
  for(const mode of ['global_apply','global_cancel','apply','cancel','wrong_type','wrong_kind','cancel_replaced','lost_reply','wrong_cache','wrong_excluded']) {
    const page=new Page(),base='MF;TF-1;WizrdMCF;',form=page.add('div',base.slice(0,-1));
    const stem=base+'ReformColumnsWizard;';page.add('button',stem+'grdTargetColumns;tbl','',undefined,form);
    let table;
    const createRow=(name='Quantity',type='Integer',kind='Непрерывный')=>{
      table=page.add('table',null,'',undefined,form);table.attrs.class='x-grid-item-selected';
      page.add('td',stem+'colName_'+name,name,undefined,table);
      const label=page.add('td',stem+'colDisplayName_'+name,'Sum',undefined,table);page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dt'+type;
      page.add('td',stem+'colDataKind_'+name,kind,undefined,table);page.add('td',stem+'colDefaultUsageType_'+name,'Не задано',undefined,table);
      page.add('td',stem+'colCachingMethod_'+name,'Отключено',undefined,table);
      const excluded=page.add('td',stem+'colExcluded_'+name,'',undefined,table);page.add('img',null,'',undefined,excluded).attrs.class='x-grid-checkcolumn';
    };createRow();
    const dialogBase=mode.startsWith('global')?'':base;
    const dialog=page.add('div',dialogBase+'EditReformColumnDefForm');dialog.attrs.class='x-window';
    for(const [key,value] of [['edtName','QuantitySum'],['edtDisplayName','Sum'],['cbxDataType','Целый'],['cbxDataKind','Непрерывный'],['cbxUsageType','Не задано'],['cntMain;cbxCachingMethod','Отключено']]) {
      const owner=page.add('div',dialogBase+'EditReformColumnDefForm;'+key,'',undefined,dialog);page.add('input',null,'',undefined,owner).value=value;
    }
    const excluded=page.add('div',dialogBase+'EditReformColumnDefForm;cntMain;chbExcluded','',undefined,dialog);
    page.add('span',dialogBase+'EditReformColumnDefForm;cntMain;chbExcluded;DisplayEl','',undefined,excluded).attrs.class='x-form-checkbox';
    const cancel=(mode.startsWith('cancel') || mode==='global_cancel'),verb=cancel?'cancel_reform_column':'apply_reform_column';
    page.add('button',dialogBase+'EditReformColumnDefForm;'+(cancel?'btnCancel':'btnApply'),'Close',{x:600,y:400,width:80,height:25},dialog);
    const full=await page.observe(),read=await page.execute({mode:'observe',root_ref:full.wizard.reform_parameters.root_ref});
    const target=read.output.ui.elements.find(e=>e.column_close);assert.ok(target);
    const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);dialog.remove();
      if(mode!=='cancel' && mode!=='global_cancel'){table.remove();createRow(cancel?'Quantity':'QuantitySum',mode==='wrong_type'?'Float':'Integer',mode==='wrong_kind'?'Дискретный':'Непрерывный');}
      if(mode==='wrong_cache')table.querySelectorAll('[data-tid="'+stem+'colCachingMethod_QuantitySum"]')[0].ownText='При активации';
      if(mode==='wrong_excluded')table.querySelectorAll('.x-grid-checkcolumn')[0].attrs.class+=' x-grid-checkcolumn-checked';
      if(mode==='lost_reply')throw new Error('Lost reply');
    };
    const result=await page.act({verb,ref:target.ref},read.output);
    assert.equal(result.status,['apply','cancel','global_apply','global_cancel'].includes(mode)?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1);
  }
});

test('storage row selection reads folder type from its own visible unique cell', async () => {
  const page=new Page(),row=page.add('table',null);
  row.attrs.class='x-grid-item';
  const cell=row.append(new Element('td',{'data-tid':'MF;TF-1;FileStorageForm;colName_test'},'test'));
  const type=row.append(new Element('td',{'data-tid':'MF;TF-1;FileStorageForm;colFileType_test'},'Папка'));
  const read=async()=> (await page.observe()).ui.elements.find(e=>e.tid===cell.getAttribute('data-tid')).storage_entry;
  const before=await read();assert.equal(before.kind,'folder');assert.equal(before.selected,false);assert.ok(before.row_ref);
  row.attrs.class+=' x-grid-item-selected';
  assert.deepEqual(await read(),{...before,selected:true});
  type.style.display='none';assert.equal((await read()).kind,'unknown');type.style.display='';
  const duplicate=row.append(new Element('td',type.attrs,'Папка'));
  assert.equal((await read()).kind,'unknown');duplicate.remove();
  type.ownText='Текстовый файл';assert.equal((await read()).kind,'unknown');
});

test('narrow storage name reads retain sibling type without issuing sibling controls', async () => {
  const page=new Page(),row=page.add('table',null);row.attrs.class='x-grid-item';
  const cell=row.append(new Element('td',{'data-tid':'MF;TF-1;FileStorageForm;colName_test'},'test'));
  const type=row.append(new Element('td',{'data-tid':'MF;TF-1;FileStorageForm;colFileType_test'},'Папка'));
  const full=await page.observe(),ref=full.ui.elements.find(e=>e.tid===cell.getAttribute('data-tid')).ref;
  const read=async()=> (await page.execute({mode:'observe',root_ref:ref})).output;
  const narrow=await read(),entry=narrow.ui.elements.find(e=>e.ref===ref);
  assert.equal(entry.storage_entry.kind,'folder');
  assert.equal(narrow.ui.elements.some(e=>e.tid===type.getAttribute('data-tid')),false);
  row.attrs.class+=' x-grid-item-selected';
  assert.equal((await read()).ui.elements.find(e=>e.ref===ref).storage_entry.selected,true);
  for(const mode of ['hidden','duplicate','other_type','other_row']) {
    let extra;
    type.style.display=mode==='hidden'?'none':'';type.ownText=mode==='other_type'?'Текстовый файл':'Папка';
    if(mode==='duplicate')extra=row.append(new Element('td',type.attrs,'Папка'));
    if(mode==='other_row'){type.remove();const foreign=page.add('table',null);foreign.attrs.class='x-grid-item';foreign.append(type);}
    assert.equal((await read()).ui.elements.find(e=>e.ref===ref).storage_entry.kind,'unknown',mode);
    extra?.remove();
  }
});

test('import input completion waits through delayed preview masks and never repeats typing',async()=>{
  for(const mode of ['refresh','late_refresh','stuck','replacement','reverted','lost_tab_reply']) {
    const page=new Page(),c=importFormatField(page),snapshot=await page.observe();
    const field=snapshot.ui.elements.find(e=>e.wizard_field?.name==='null_marker');
    let mask,waits=0;
    const block=()=>{mask=page.add('div',null,'Обновление');mask.attrs.class='x-mask-msg';};
    page.onPress=key=>{if(key==='Tab') {
      if(mode==='lost_tab_reply')throw new Error('lost completion reply');
      if(mode!=='late_refresh')block();
    }};
    page.waitForTimeout=async()=>{
      waits++;
      if(mode==='late_refresh' && waits===1)block();
      if(mode==='replacement')c.form.attrs['data-tid']='MF;TF-1;OtherWizard';
      if(mode==='reverted')c.input.value='old';
      if(mode!=='stuck' && waits===3)mask?.remove();
    };
    const result=await page.act({verb:'set_wizard_field',ref:field.ref,text:'\\N'},snapshot);
    assert.equal(result.status,['refresh','late_refresh'].includes(mode)?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='keyboard_type').length,1,mode);
    assert.equal(page.events.filter(e=>e==='Tab').length,1,mode);
    if(result.status==='SUCCEEDED') {
      assert.ok(waits>=5,mode);
      assert.ok(result.trace.some(e=>e.event==='import_format_input_settled'));
      assert.equal(result.output.wizard.settings.applied_verified,false);
    } else assert.ok(!result.trace.some(e=>e.event==='wizard_draft_value_verified'),mode);
  }
});

function importColumnFixture(page,form,index,name='Quantity',type='Целый') {
  const prefix='MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;'+index;
  const box={x:250+index*80,y:250,width:70,height:20};
  page.add('div',prefix,name,box,form);
  const cells=[name,name,type,'Непрерывный',''].map((v,i)=>page.add('td',prefix+'_'+i,v,{...box,y:280+i*25},form));
  const check=cells[4].append(new Element('img',{class:'x-grid-checkcolumn x-grid-checkcolumn-checked'},'',box));
  return {cells,check,prefix};
}

test('import column readback binds five properties to the same column index',async()=>{
  const page=new Page(),c=importFormatField(page),col=importColumnFixture(page,c.form,0);
  const second=importColumnFixture(page,c.form,1,'UnitPrice','Вещественный');
  const read=async()=> (await page.observe()).wizard.import_columns;
  const initial=await read();
  const roots=await page.execute({mode:'observe',discover_roots:true});
  assert.deepEqual(roots.output.wizard.import_columns,initial);
  assert.equal(initial.complete,false);assert.equal(initial.settings_applied,false);
  assert.deepEqual(initial.fields.map(e=>[e.name,e.type,e.used]),[['Quantity','integer',true],['UnitPrice','real',true]]);
  col.check.attrs.class='x-grid-checkcolumn';assert.equal((await read()).fields[0].used,false);
  col.check.style.display='none';assert.equal((await read()).fields[0].status,'unobserved_or_ambiguous');col.check.style.display='';
  second.cells[2].style.display='none';assert.equal((await read()).fields[1].status,'unobserved_or_ambiguous');second.cells[2].style.display='';
  page.add('td',second.prefix+'_2','Строковый',second.cells[2].box,c.form);
  assert.equal((await read()).fields[1].status,'unobserved_or_ambiguous');
  for(let i=2;i<9;i++)importColumnFixture(page,c.form,i,'Field'+i);
  const bounded=await read();assert.equal(bounded.fields.length,8);assert.equal(bounded.truncated,true);
});

test('format edit exposes recomputed column types without claiming schema acceptance',async()=>{
  const page=new Page(),c=importFormatField(page),col=importColumnFixture(page,c.form,0,'Quantity','Строковый');
  const snapshot=await page.observe(),field=snapshot.ui.elements.find(e=>e.wizard_field?.name==='null_marker');
  page.onPress=key=>{if(key==='Tab')col.cells[2].ownText='Целый';};
  const result=await page.act({verb:'set_wizard_field',ref:field.ref,text:'\\N'},snapshot);
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
  assert.equal(result.output.wizard.import_columns.fields[0].type,'integer');
  assert.equal(result.output.wizard.import_columns.settings_applied,false);
  assert.equal(result.output.wizard.import_columns.complete,false);
});

test('import floating editor binds selected type/kind and rejects ambiguous selection',async()=>{
  for(const suffix of ['celleditor','celleditor-1']) {
    const page=new Page(),c=importFormatField(page),col=importColumnFixture(page,c.form,2);
    col.cells[2].attrs.class='x-grid-cell-selected';col.cells[2].ownText='';
    const hidden=col.cells[2].append(new Element('div',{},'Целый',col.cells[2].box));hidden.style.visibility='hidden';
    const tid='MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;tbl;'+suffix+';cbx';
    const owner=page.add('div',tid,'',col.cells[2].box,c.form);
    const input=owner.append(new Element('input',{},'',col.cells[2].box));input.value='Строковый';
    const initial=await page.observe();
    assert.equal(initial.wizard.import_columns.fields[0].status,'unobserved_or_ambiguous');
    const editor=initial.wizard.import_column_editor;
    assert.equal(editor.status,'observed');assert.equal(editor.index,2);assert.equal(editor.name,'Quantity');
    assert.equal(editor.property,'type');assert.equal(editor.canonical_value,'string');assert.equal(editor.settings_applied,false);
    const roots=await page.execute({mode:'observe',discover_roots:true});
    assert.deepEqual(roots.output.wizard.import_column_editor,editor);
    col.cells[3].attrs.class='x-grid-cell-selected';
    assert.equal((await page.observe()).wizard.import_column_editor.status,'unobserved_or_ambiguous');
    col.cells[2].attrs.class='';input.value='Дискретный';
    assert.equal((await page.observe()).wizard.import_column_editor.property,'data_kind');
    input.value='unknown';assert.equal((await page.observe()).wizard.import_column_editor.status,'unobserved_or_ambiguous');
    input.value='Непрерывный';input.style.display='none';
    assert.equal((await page.observe()).wizard.import_column_editor.status,'unobserved_or_ambiguous');
    owner.remove();assert.equal((await page.observe()).wizard.import_column_editor,undefined);
  }
});


function importChoiceFixture(page, property='type') {
  const c=importFormatField(page),col=importColumnFixture(page,c.form,2);
  const row=property==='type'?2:3;
  col.cells[row].attrs.class='x-grid-cell-selected';col.cells[row].ownText='';
  const hidden=col.cells[row].append(new Element('div',{},row===2?'Целый':'Непрерывный',col.cells[row].box));
  hidden.style.visibility='hidden';
  const tid='MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;tbl;celleditor-1;cbx';
  const owner=page.add('div',tid,'',col.cells[row].box,c.form);
  const input=owner.append(new Element('input',{},'',col.cells[row].box));input.value=row===2?'Целый':'Непрерывный';
  const list=page.add('div',tid+';boundlist','',{x:700,y:400,width:160,height:90});
  const label=row===2?'Строковый':'Дискретный';
  const option=page.add('div',tid+';boundlist;'+label,label,{x:705,y:405,width:140,height:25},list);
  return {...c,...col,owner,input,list,option,row,label,hidden};
}

test('import column choices bind unique cells and expose only supported labels',async()=>{
  for(const mode of ['valid','duplicate_header','duplicate_cell','duplicate_editor','duplicate_selected','unknown_option','hidden_used']) {
    const page=new Page(),c=importChoiceFixture(page);
    if(mode==='duplicate_header')page.add('div',c.prefix,'Quantity',c.cells[0].box,c.form);
    if(mode==='duplicate_cell')page.add('td',c.prefix+'_2','Целый',c.cells[2].box,c.form);
    if(mode==='duplicate_editor')page.add('div',c.owner.attrs['data-tid'],'',c.owner.box,c.form);
    if(mode==='duplicate_selected')c.cells[3].attrs.class='x-grid-cell-selected';
    if(mode==='unknown_option'){c.option.ownText='Other';c.option.attrs['data-tid']=c.owner.attrs['data-tid']+';boundlist;Other';}
    if(mode==='hidden_used')c.check.style.display='none';
    const read=await page.observe(),option=read.ui.elements.find(e=>e.wizard_combo?.kind==='option');
    assert.equal(!!option,mode==='valid',mode);
    if(option){assert.equal(option.wizard_combo.field.scope,'import_column');assert.ok(option.allowed_actions.includes('select_wizard_option'));}
  }
});

test('import column choice closes editor and settles both type and kind without replay',async()=>{
  for(const mode of ['type','kind','late_kind','late_mask','stuck','replacement','header_replaced','label_changed','used_changed','wrong_type','kind_changes_type','context','editor_reopened','lost_reply']) {
    const page=new Page(),c=importChoiceFixture(page,mode==='kind'||mode==='kind_changes_type'?'data_kind':'type');
    const snapshot=await page.observe(),option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');assert.ok(option);
    let waits=0,mask;
    const click=page.mouse.click;
    page.mouse.click=async(...args)=>{
      await click(...args);c.owner.remove();c.list.remove();c.hidden.remove();c.cells[c.row].ownText=c.label;
      if(mode==='type')c.cells[3].ownText='Дискретный';
      if(mode==='wrong_type')c.cells[2].ownText='Целый';
      if(mode==='kind_changes_type')c.cells[2].ownText='Строковый';
      if(mode==='replacement'){c.cells[2].remove();page.add('td',c.prefix+'_2',c.label,c.cells[2].box,c.form);}
      if(mode==='header_replaced'){const h=c.form.querySelector('[data-tid="'+c.prefix+'"]');h.remove();page.add('div',c.prefix,'Quantity',c.cells[0].box,c.form);}
      if(mode==='label_changed')c.cells[1].ownText='Changed';
      if(mode==='used_changed')c.check.attrs.class='x-grid-checkcolumn';
      if(mode==='context')page.app.Version='changed';
      if(mode==='editor_reopened')c.form.append(c.owner);
      if(mode==='lost_reply')throw new Error('lost reply');
    };
    page.waitForTimeout=async()=>{
      waits++;
      if(mode==='late_kind' && waits===3)c.cells[3].ownText='Дискретный';
      if(['late_mask','stuck'].includes(mode) && waits===1){mask=page.add('div',null,'Loading');mask.attrs.class='x-mask-msg';}
      if(mode==='late_mask' && waits===4){mask.remove();c.cells[3].ownText='Дискретный';}
    };
    const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
    const success=['type','kind','late_kind','late_mask'].includes(mode);
    assert.equal(result.status,success?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1,mode);
    assert.equal(result.trace.some(e=>e.event==='import_column_option_verified'),success,mode);
    if(success){
      const column=result.output.wizard.import_columns.fields[0];
      assert.equal(column.type,mode==='kind'?'integer':'string');assert.equal(column.data_kind,'Дискретный');
      assert.equal(result.output.wizard.import_columns.settings_applied,false);assert.ok(waits>=5);
      if(mode==='late_kind')assert.ok(waits>=8);
    }
  }
});

test('closed import type and kind cells are delivered as actionable observed controls',async()=>{
  const page=new Page(),c=importFormatField(page);importColumnFixture(page,c.form,2);
  const snapshot=await page.observe(),column=snapshot.wizard.import_columns.fields[0];
  for(const property of ['type','data_kind']) {
    const control=snapshot.ui.elements.find(e=>e.ref===column.cell_refs[property]);
    assert.ok(control);assert.ok(control.allowed_actions.includes('click'));
  }
});


test('import option rejects changed editor input or selection before any click',async()=>{
  for(const mode of ['input_replaced','selection_changed','editor_replaced']) {
    const page=new Page(),c=importChoiceFixture(page),snapshot=await page.observe();
    const option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');
    if(mode==='input_replaced'){c.input.remove();c.owner.append(new Element('input',{},'',c.input.box)).value='Целый';}
    if(mode==='selection_changed')c.cells[3].attrs.class='x-grid-cell-selected';
    if(mode==='editor_replaced'){
      c.owner.remove();const owner=page.add('div',c.owner.attrs['data-tid'],'',c.owner.box,c.form);
      owner.append(new Element('input',{},'',c.input.box)).value='Целый';
    }
    const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
    assert.equal(result.status,'NOT_APPLIED',mode);assert.equal(page.events.filter(e=>e==='click').length,0);
  }
});

function importSourceFixture(page) {
  const base='MF;TF-1;WizrdMCF;ImportTextFilePreviewWizard;';
  const form=page.add('div','MF;TF-1;WizrdMCF'),inputs={},owners={};
  for(const [name,key,value] of [['source_path','edtFileName','/test/source.csv'],['connection','edtConnection','Локальное'],
    ['encoding','edtCodePage','UTF-8 (65001)'],['rows_to_skip','edtRowsToSkip','0']]) {
    const property=page.add('div',base+key,'',undefined,form);
    const owner=name==='connection'?property:page.add('div',base+key+';ValueControl','',undefined,property);
    const input=owner.append(new Element('input'));input.value=value;input.readOnly=name==='connection';
    if(name!=='connection')property.append(new Element('input')).value='unrelated variable';
    inputs[name]=input;owners[name]=owner;
  }
  const header=page.add('div',base+'edtFirstLineAsTitle;ValueControl','',undefined,form);header.attrs.class='x-form-cb-checked';
  const native=header.append(new Element('input'));native.checked=false;
  const display=page.add('span',base+'edtFirstLineAsTitle;ValueControl;DisplayEl','',undefined,header);display.attrs.class='x-form-checkbox';
  return {base,form,inputs,owners,header,native,display};
}

test('source code page selection verifies the original field after one native choice',async()=>{
  for(const mode of ['applied','delayed','unchanged','replaced']) {
    const page=new Page(),c=importSourceFixture(page),owner=c.owners.encoding;
    const tid=owner.attrs['data-tid'],label='Кириллическая (1251)';
    page.add('div',tid+';trg_picker','',{x:500,y:200,width:20,height:20},owner);
    const list=page.add('div',tid+';boundlist','',{x:700,y:400,width:180,height:90});
    page.add('div',tid+';boundlist;Кириллическая_(1251)',label,{x:705,y:405,width:170,height:25},list);
    const snapshot=await page.observe();
    const option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');
    assert.equal(option?.wizard_combo.field.scope,'import_source');
    const click=page.mouse.click;let waits=0;
    page.mouse.click=async(...args)=>{
      await click(...args);list.remove();
      if(mode==='applied')c.inputs.encoding.value=label;
      if(mode==='replaced'){
        c.inputs.encoding.remove();owner.append(new Element('input')).value=label;
      }
    };
    page.waitForTimeout=async()=>{if(++waits===3 && mode==='delayed')c.inputs.encoding.value=label;};
    const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
    const success=['applied','delayed'].includes(mode);
    assert.equal(result.status,success?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1,mode);
    assert.equal(result.trace.some(e=>e.event==='wizard_option_verified'),success,mode);
  }
});

test('import source reads exact controls and Ext checkbox equally in full roots and narrow views',async()=>{
  const page=new Page(),c=importSourceFixture(page);
  const snapshot=await page.observe(),source=snapshot.wizard.import_source;
  assert.equal(snapshot.wizard.stage,'text_import_file');assert.ok(source);
  assert.deepEqual(Object.fromEntries(Object.entries(source.fields).map(([k,v])=>[k,v.value])),{
    source_path:'/test/source.csv',connection:'Локальное',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true});
  assert.equal(source.fields.connection.read_only,true);assert.equal(c.native.checked,false);
  for(const options of [{discover_roots:true},{root_ref:snapshot.wizard.root_ref}]) {
    const read=await page.execute({mode:'observe',...options});assert.deepEqual(read.output.wizard.import_source,source);
  }
  assert.equal(source.settings_applied,false);assert.equal(source.file_bytes_verified,false);assert.equal(source.schema_complete,false);
  assert.ok(!snapshot.ui.elements.some(e=>e.wizard_field?.scope==='import_source' || e.wizard_combo?.field?.scope==='import_source'));
  c.header.attrs.class='';assert.equal((await page.observe()).wizard.import_source.fields.first_line_as_title.value,false);
});

test('import source fails closed for duplicate hidden missing controls and redacts URL values',async()=>{
  for(const mode of ['duplicate_owner','duplicate_input','hidden_input','missing_input','hidden_owner','long','url','duplicate_header','duplicate_display','hidden_display']) {
    const page=new Page(),c=importSourceFixture(page);
    if(mode==='duplicate_owner')page.add('div',c.owners.source_path.attrs['data-tid'],'',undefined,c.form);
    if(mode==='duplicate_input')c.owners.source_path.append(new Element('input')).value='other';
    if(mode==='hidden_input')c.inputs.source_path.style.display='none';
    if(mode==='missing_input')c.inputs.source_path.remove();
    if(mode==='hidden_owner')c.owners.source_path.style.display='none';
    if(mode==='long')c.inputs.source_path.value='/test/'+'x'.repeat(2048);
    if(mode==='url')c.inputs.source_path.value='https://name:credential@example.test/input.csv?token=hidden';
    if(mode==='duplicate_header')page.add('div',c.header.attrs['data-tid'],'',undefined,c.form);
    if(mode==='duplicate_display')page.add('span',c.display.attrs['data-tid'],'',undefined,c.header).attrs.class='x-form-checkbox';
    if(mode==='hidden_display')c.display.style.display='none';
    const snapshot=await page.observe(),source=snapshot.wizard.import_source;
    const field=['duplicate_header','duplicate_display','hidden_display'].includes(mode)?source.fields.first_line_as_title:source.fields.source_path;
    if(mode==='long'){assert.equal(field.truncated,true);assert.equal(field.value.length,2048);}
    else if(mode==='url'){assert.equal(field.status,'redacted');assert.equal(field.value,undefined);assert.ok(!JSON.stringify(source).includes('credential'));}
    else assert.equal(field.status,mode.startsWith('duplicate')?'ambiguous':'unobserved',mode);
    const roots=await page.execute({mode:'observe',discover_roots:true});assert.deepEqual(roots.output.wizard.import_source,source,mode);
  }
});


test('import type controls are delivered before format inputs in compact observation',async()=>{
  const page=new Page(),c=importFormatField(page);
  for(let i=0;i<5;i++)importColumnFixture(page,c.form,i,['Id','Region','Quantity','UnitPrice','Comment'][i]);
  for(let i=0;i<40;i++)page.add('input','MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;extra'+i,'',{x:10,y:100,width:30,height:15},c.form);
  const raw=await page.execute({mode:'observe'}),ref=raw.output.wizard.import_columns.fields[3].cell_refs.type;
  const pager=createObservationPages(),first=pager.retain(raw);
  assert.ok(first.output.ui.elements.some(e=>e.ref===ref && e.allowed_actions.includes('click')));
  assert.doesNotThrow(()=>pager.assertIssued(first.output.observation_id,{verb:'click',ref}));
  const unused=first.output.wizard.import_columns.fields[3].cell_refs.name;
  assert.throws(()=>pager.assertIssued(first.output.observation_id,{verb:'click',ref:unused}),/not been delivered/);
});

test('import editor exposes only a unique enabled owned picker with equivalent roots readback',async()=>{
  for(const mode of ['valid','hidden','duplicate','foreign','disabled','sensitive']) {
    const page=new Page(),c=importChoiceFixture(page);c.list.remove();
    const picker=page.add('div',c.owner.attrs['data-tid']+';trg_picker','',
      {x:600,y:320,width:20,height:20},mode==='foreign'?c.form:c.owner);
    if(mode==='hidden')picker.style.display='none';
    if(mode==='disabled')picker.disabled=true;
    if(mode==='sensitive')picker.attrs['aria-label']='password';
    if(mode==='duplicate')page.add('div',picker.attrs['data-tid'],'',picker.box,c.owner);
    const raw=await page.execute({mode:'observe'}),editor=raw.output.wizard.import_column_editor;
    assert.equal(editor.picker_status,mode==='valid'?'observed':mode==='duplicate'?'ambiguous':'unobserved',mode);
    const controls=raw.output.ui.elements.filter(e=>e.wizard_combo?.kind==='picker');
    if(mode==='valid'){
      assert.equal(controls.length,1);assert.equal(controls[0].ref,editor.picker_ref);
      assert.equal(controls[0].label,'Открыть список: Тип данных');assert.ok(controls[0].allowed_actions.includes('click'));
    }else {assert.equal(editor.picker_ref,undefined);assert.equal(controls.length,0,mode);}
    const roots=await page.execute({mode:'observe',discover_roots:true});
    assert.deepEqual(roots.output.wizard.import_column_editor,editor,mode);
  }
});

test('import picker leads compact page and is issued only through its delivered control',async()=>{
  const page=new Page(),c=importChoiceFixture(page,'data_kind');c.list.remove();
  for(let i=0;i<8;i++)if(i!==2)importColumnFixture(page,c.form,i,'Field'+i);
  for(let i=0;i<40;i++)page.add('input','MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;extra'+i,'',undefined,c.form);
  page.add('div',c.owner.attrs['data-tid']+';trg_picker','',{x:600,y:340,width:20,height:20},c.owner);
  const raw=await page.execute({mode:'observe'}),ref=raw.output.wizard.import_column_editor.picker_ref;
  const pager=createObservationPages(),first=pager.retain(raw);
  assert.equal(first.output.ui.elements[0].ref,ref);
  assert.equal(first.output.ui.elements[0].label,'Открыть список: Вид данных');
  assert.doesNotThrow(()=>pager.assertIssued(first.output.observation_id,{verb:'click',ref}));
  const roots=await page.execute({mode:'observe',discover_roots:true}),rootPage=pager.retain(roots);
  assert.equal(rootPage.output.wizard.import_column_editor.picker_ref,ref);
  assert.throws(()=>pager.assertIssued(rootPage.output.observation_id,{verb:'click',ref}),/not been delivered/);
});

function importCoverageFixture(page, count=3) {
  const c=importFormatField(page),base='MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1';
  const grid=page.add('div',base,'',{x:100,y:200,width:600,height:180},c.form);
  const header=page.add('div',base+';normalHeaderCt','',{x:100,y:200,width:600,height:25},grid);
  const body=page.add('div',base+';tbl','',{x:100,y:225,width:600,height:155},grid);
  grid.clientWidth=grid.scrollWidth=header.clientWidth=header.scrollWidth=body.clientWidth=body.scrollWidth=600;
  const cols=[];
  for(let index=0;index<count;index++) {
    const col=importColumnFixture(page,c.form,index,'Field'+index),h=c.form.querySelector('[data-tid="'+col.prefix+'"]');
    h.remove();header.append(h);h.box={x:100+index*135,y:200,width:135,height:25};
    h.attrs.class='x-column-header'+(index===0?' x-column-header-first':'')+(index===count-1?' x-column-header-last':'');
    col.cells.forEach((cell,row)=>{cell.remove();body.append(cell);cell.box={x:100+index*135,y:225+row*25,width:135,height:25};col.check.box=cell.box;});
    cols.push({...col,header:h});
  }
  return {...c,base,grid,header,body,cols};
}

test('import header vertical gutter preserves only fully visible field coverage',async()=>{
 for(const mode of ['valid','clipped_header','clipped_cell','horizontal_overflow','not_vertical_gutter','scrolled','mismatched_body','unmeasured_client']) {
  const page=new Page(),c=importCoverageFixture(page,5);
  for(const e of [c.grid,c.header,c.body]){e.box.width=719;e.clientWidth=e.scrollWidth=719;}
  for(const e of [c.header,c.body]){e.clientWidth=704;e.clientLeft=0;e.offsetWidth=719;}
  c.body.scrollWidth=704;c.header.scrollLeft=0;c.header.style.overflowY='scroll';
  if(mode==='clipped_header')c.cols[4].header.box.x=680;
  if(mode==='clipped_cell')c.cols[4].cells[3].box.x=680;
  if(mode==='horizontal_overflow')c.header.scrollWidth=720;
  if(mode==='not_vertical_gutter')c.header.style.overflowY='hidden';
  if(mode==='scrolled')c.header.scrollLeft=1;
  if(mode==='mismatched_body')c.body.clientWidth=703;
  if(mode==='unmeasured_client')delete c.header.offsetWidth;
  const raw=await page.execute({mode:'observe'}),coverage=raw.output.wizard.import_columns.definition_coverage;
  assert.equal(coverage.status,mode==='valid'?'complete_configured_columns':'partial',mode);
  for(const scope of [{discover_roots:true},{root_ref:raw.output.wizard.root_ref}]){
   const scoped=await page.execute({mode:'observe',...scope});
   assert.deepEqual(scoped.output.wizard.import_columns.definition_coverage,coverage,mode);
  }
 }
});

test('configured import definition coverage requires the entire owned bounded grid',async()=>{
  for(const mode of ['valid','missing_bounds','hidden_extra','gap','overflow','duplicate','foreign_owner','editor','clipped_header','clipped_cell','missing_last','hidden_cell','duplicate_cell','sensitive_header','unknown_header','too_many']) {
    const page=new Page(),c=importCoverageFixture(page);
    if(mode==='missing_bounds')delete c.body.clientWidth;
    if(mode==='hidden_extra'){const h=page.add('div',c.base+';normalHeaderCt;3','',c.cols[0].header.box,c.header);h.attrs.class='x-column-header';h.style.display='none';}
    if(mode==='gap')c.cols[1].header.attrs['data-tid']=c.base+';normalHeaderCt;4';
    if(mode==='overflow')c.header.scrollWidth=601;
    if(mode==='duplicate')page.add('div',c.cols[0].header.attrs['data-tid'],'',c.cols[0].header.box,c.header).attrs.class='x-column-header';
    if(mode==='foreign_owner'){c.cols[0].header.remove();c.form.append(c.cols[0].header);}
    if(mode==='editor')page.add('div',c.base+';tbl;celleditor;cbx','',c.cols[0].header.box,c.form);
    if(mode==='clipped_header')c.cols[2].header.box.x=950;
    if(mode==='clipped_cell')c.cols[2].cells[4].box.x=800;
    if(mode==='missing_last')c.cols[2].header.attrs.class='x-column-header';
    if(mode==='hidden_cell')c.cols[0].cells[1].style.display='none';
    if(mode==='duplicate_cell')page.add('td',c.cols[0].prefix+'_1','Field0',c.cols[0].cells[1].box,c.body);
    if(mode==='sensitive_header')c.cols[0].header.attrs['aria-label']='secret';
    if(mode==='unknown_header')page.add('div',null,'',c.cols[0].header.box,c.header).attrs.class='x-column-header';
    if(mode==='too_many')for(let i=3;i<9;i++)page.add('div',c.base+';normalHeaderCt;'+i,'',c.cols[0].header.box,c.header).attrs.class='x-column-header';
    const raw=await page.execute({mode:'observe'}),columns=raw.output.wizard.import_columns;
    assert.equal(columns.definition_coverage.status,mode==='valid'?'complete_configured_columns':'partial',mode);
    assert.equal(columns.complete,false);assert.equal(columns.definition_coverage.source_schema_verified,false);
    if(mode==='valid'){
      assert.equal(columns.definition_coverage.count,3);assert.ok(columns.definition_coverage.container_ref);
      assert.equal(columns.definition_coverage.first_header_ref,columns.fields[0].header_ref);
      assert.equal(columns.definition_coverage.last_header_ref,columns.fields[2].header_ref);
    }
    for(const scope of [{discover_roots:true},{root_ref:raw.output.wizard.root_ref}]) {
      const narrow=await page.execute({mode:'observe',...scope});
      assert.deepEqual(narrow.output.wizard.import_columns.definition_coverage,columns.definition_coverage,mode);
    }
  }
});

function mappingCoverageFixture(page,count=2) {
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const form=page.add('div','MF;TF-1;WizrdMCF'),base='MF;TF-1;WizrdMCF;ColumnsMappingEngineOutputPortWizard;';
  page.add('button',base+'btnAddMappingColumn','',undefined,form);
  const body=page.add('div',base+'grdTargetColumns;tbl','',{x:100,y:200,width:600,height:400},form);body.attrs.id='bound-grid';
  body.clientWidth=body.scrollWidth=600;body.clientHeight=body.scrollHeight=400;body.scrollLeft=body.scrollTop=0;
  body.scrollHeight=Math.max(body.clientHeight,count*25);
  const container=page.add('div',null,'',{x:100,y:200,width:500,height:count*25},body);container.attrs.class='x-grid-item-container';
  const filter=page.add('div',base+'TargetFilter','',undefined,form),input=filter.append(new Element('input'));input.value='';
  const tableMode=page.add('div',base+'rbTable','',undefined,form);tableMode.attrs.class='x-form-cb-checked';
  const linksMode=page.add('div',base+'rbLinks','',undefined,form);
  const auto=page.add('button',base+'btnAutoSyncThroughColumns','',undefined,form);auto.attrs.class='x-btn-pressed';
  const rows=[];
  for(let index=0;index<count;index++) {
    const row=page.add('table',null,'',{x:100,y:200+index*25,width:500,height:25},container);
    Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':String(index),'data-boundview':'bound-grid'});
    for(const [j,prefix] of ['colName_','colDisplayName_','colSourceDisplayName_','colDataKind_','colDefaultUsageType_'].entries()) {
      const cell=page.add('td',base+prefix+'Field'+index,j===3?'Непрерывный':j===4?'Не задано':'Field'+index,{x:100+j*100,y:row.box.y,width:100,height:25},row);
      if(j===1 || j===2)page.add('span',null,'',cell.box,cell).attrs.class='bg-TBGDataType-dtInteger';
    }
    rows.push(row);
  }
  return {form,base,body,container,filter,input,tableMode,linksMode,auto,rows};
}

test('configured mapping coverage rejects clipped filtered virtualized or unmatched rows',async()=>{
  for(const mode of ['valid','hidden_extra','gap','overflow','spacer','filter','mode','duplicate','offset','unmatched','wrong_boundview','clipped_cell','editor','mask','container_gap','body_extra','missing_dimensions','column_editor','horizontal_offset']) {
    const page=new Page(),c=mappingCoverageFixture(page);
    if(mode==='hidden_extra'){const row=page.add('table',null,'',c.rows[0].box,c.container);row.attrs.class='x-grid-item';row.style.display='none';}
    if(mode==='gap')c.rows[1].attrs['data-recordindex']='2';
    if(mode==='overflow')c.body.scrollHeight=401;
    if(mode==='spacer')page.add('div',null,'',{x:100,y:200,width:10,height:10},c.container);
    if(mode==='filter')c.input.value='Field';
    if(mode==='mode')c.linksMode.attrs.class='x-form-cb-checked';
    if(mode==='duplicate')c.rows[1].attrs['data-recordindex']='0';
    if(mode==='offset')c.body.scrollTop=1;
    if(mode==='unmatched')c.rows[1].children[0].remove();
    if(mode==='wrong_boundview')c.rows[1].attrs['data-boundview']='other';
    if(mode==='clipped_cell')c.rows[0].children[0].box.x=50;
    if(mode==='editor')page.add('div',c.base+'grdTargetColumns;tbl;celleditor;cbx','',undefined,c.form);
    if(mode==='mask')page.add('div',null,'Loading').attrs.class='x-mask-msg';
    if(mode==='container_gap')c.container.box.height=55;
    if(mode==='body_extra')page.add('div',null,'Extra',{x:100,y:260,width:100,height:20},c.body);
    if(mode==='missing_dimensions')delete c.body.clientHeight;
    if(mode==='column_editor')page.add('div','MF;TF-1;WizrdMCF;EditColumnDefForm','',undefined,c.form);
    if(mode==='horizontal_offset')c.container.box.x=101;
    const raw=await page.execute({mode:'observe'}),cols=raw.output.wizard.output_columns;
    assert.equal(cols.definition_coverage.status,mode==='valid'?'complete_configured_rows':'partial',mode);
    assert.equal(cols.complete,false);assert.equal(cols.definition_coverage.source_identity_verified,false);
    assert.equal(cols.auto_sync.value,true);
    if(mode==='valid'){assert.equal(cols.definition_coverage.count,2);assert.equal(cols.definition_coverage.first_row_ref,cols.fields[0].row_ref);}
    for(const options of [{discover_roots:true},{root_ref:raw.output.wizard.root_ref}]) {
      const read=await page.execute({mode:'observe',...options});
      assert.deepEqual(read.output.wizard.output_columns,cols,mode);
    }
  }
});

test('relocated native graph namespace belongs to the active diagram instead of its old tab',async()=>{
  for(const mode of ['valid','foreign','multiple_namespaces','duplicate_container','hidden_container','foreign_container_owner']) {
    const page=new Page();page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-4';
    const graph=page.add('div','MF;TF-4;ModelForm;cmpDiagram','',{x:0,y:50,width:900,height:650});
    const body=page.add('div','MF;TF-1;Graph;source-key','',{x:200,y:100,width:100,height:50},graph);
    page.add('span','MF;TF-1;Graph;source-key;Label;Label','Source',{x:200,y:100,width:80,height:20},body);
    page.add('button','MF;TF-1;Graph;source-key;Setting','',{x:280,y:100,width:20,height:20},body);
    page.add('div','MF;TF-1;Graph;source-key;Output_Data-0','',{x:285,y:140,width:10,height:10},body);
    page.add('g','MF;TF-1;Graph;source-key|Output_Data-0|target|Input_Data-0','',{x:300,y:140,width:100,height:1},graph);
    if(mode==='foreign'){
      const foreign=page.add('div','MF;TF-1;Graph;foreign','',undefined,page.document.body);
      page.add('span','MF;TF-1;Graph;foreign;Label;Label','Foreign',undefined,foreign);
    }
    if(mode==='multiple_namespaces')page.add('span','MF;TF-4;Graph;other;Label;Label','Other',undefined,graph);
    if(mode==='duplicate_container')page.add('div','MF;TF-4;ModelForm;cmpDiagram');
    if(mode==='hidden_container')graph.style.display='none';
    if(mode==='foreign_container_owner'){const other=page.add('div','MF;TF-5;ModelForm');graph.remove();other.append(graph);}
    const raw=await page.execute({mode:'observe'}),snapshot=raw.output,valid=['valid','foreign'].includes(mode);
    assert.equal(snapshot.workflow_ref.prefix,'MF;TF-4');
    assert.equal(snapshot.graph_identity.status,valid?'observed':['multiple_namespaces','duplicate_container'].includes(mode)?'ambiguous':'unobserved',mode);
    if(valid){
      assert.equal(snapshot.graph_identity.native_prefix,'MF;TF-1;Graph;');
      assert.deepEqual(snapshot.nodes.map(n=>n.node_ref.node_label),['source-key']);assert.equal(snapshot.nodes[0].ports.length,1);
      assert.equal(snapshot.links.length,1);assert.ok(snapshot.ui.elements.some(e=>e.graph_node?.part==='settings'));
      assert.ok(!snapshot.ui.elements.some(e=>e.tid?.includes(';Graph;foreign')));
      const narrow=await page.execute({mode:'observe',root_ref:snapshot.graph_identity.container_ref});
      assert.deepEqual(narrow.output.graph_identity,snapshot.graph_identity);assert.deepEqual(narrow.output.nodes,snapshot.nodes);
    }else {assert.equal(snapshot.nodes.length,0);assert.equal(snapshot.links.length,0);assert.ok(!snapshot.ui.elements.some(e=>e.scope==='graph'));}
    const roots=await page.execute({mode:'observe',discover_roots:true});
    assert.equal(roots.output.graph_identity.status,mode==='duplicate_container'?'ambiguous':'unobserved');
    assert.ok(!roots.output.ui.elements.some(e=>e.scope==='graph'));
  }
});


test('graph clicks bind the issued canvas even when a hidden outline keeps duplicate SVG tids',async()=>{
 const page=new Page(),tid='MF;TF-1;Graph;Owned';
 const body=page.add('g',tid,'',{x:200,y:200,width:60,height:60});
 const initial=await page.observe();
 const clone=page.add('g',tid,'',{x:0,y:0,width:0,height:0},page.document.body);clone.style.display='none';
 const snapshot=(await page.execute({mode:'observe',root_ref:initial.graph_identity.container_ref})).output;
 const control=snapshot.ui.elements.find(e=>e.tid===tid);
 assert.ok(control?.allowed_actions.includes('click'));assert.equal(control.identity.anchor_tid,tid);
 const result=await page.act({verb:'click',ref:control.ref},snapshot);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 const duplicate=page.add('g',tid,'',{x:300,y:200,width:60,height:60},body.parentElement);
 const refused=await page.execute({mode:'act',operation_id:'negative-outline',action:{verb:'click',ref:control.ref},snapshot});
 assert.notEqual(refused.status,'SUCCEEDED');duplicate.remove();
});

test('grouping small used-field coverage requires explicit complete geometry and closed sections',async()=>{
  for(const mode of ['complete','missing_bounds','overflow','translated','hidden_payload','extra','filter','clipped','bad_section']) {
    const {page,grid,container,records}=groupingFixture();
    for(const e of [grid,container])Object.assign(e,{scrollTop:0,scrollLeft:0,clientHeight:300,scrollHeight:300,clientWidth:500,scrollWidth:500});
    container.style.transform='none';
    const sentinel=grid.children[0];sentinel.attrs.role='presentation';sentinel.style.width='1px';sentinel.style.height='1px';
    if(mode==='missing_bounds')delete grid.scrollHeight;
    if(mode==='overflow')grid.scrollHeight=301;
    if(mode==='translated')container.style.transform='matrix(1, 0, 0, 1, 0, 50)';
    if(mode==='hidden_payload')page.add('div',null,'hidden',undefined,sentinel);
    if(mode==='extra')page.add('div',null,'',undefined,grid).style.display='none';
    if(mode==='filter')page.add('input',null,'',undefined,grid).style.display='none';
    if(mode==='clipped')records[3].row.box.y=700;
    if(mode==='bad_section')records[1].groupHeader.ownText='Группа';
    const g=(await page.observe()).wizard.grouping;
    assert.equal(g.definition_coverage.status,mode==='complete'?'complete_rendered_used_fields':'partial',mode);
    assert.equal(g.complete,false);assert.equal(g.source_identity_verified,false);
    assert.equal(g.settings_applied,false);assert.equal(g.aggregation_settings_verified,false);
    if(mode==='complete')assert.deepEqual(g.definition_coverage.sections.map(s=>[s.role,s.row_count]),[['group',1],['measure',3]]);
  }
});

test('factor dialog reads exact Ext owner states and only rendered selected-field association',async()=>{
  for(const mode of ['count','sum','missing','extra','duplicate','hidden','wrong_icon','foreign_dialog','no_selection','two_selected','hidden_input_false','native_summary','nonblank_summary','foreign_summary','hidden_summary']) {
    const {page,wizard,records,grid}=groupingFixture(),tid='MF;TF-1;WizrdMCF;FactorEditDialog';
    const dialog=page.add('div',mode==='foreign_dialog'?'MF;TF-2;WizrdMCF;FactorEditDialog':tid,'',{x:100,y:100,width:500,height:500});
    const group=page.add('div',tid+';grpFactors','',{x:110,y:110,width:450,height:400},dialog);
    const defs=[['gdSum','Сумма'],['gdCount','Количество'],['gdMin','Минимум'],['gdMax','Максимум'],['gdAvg','Среднее'],['gdMedian','Медиана'],['gdMode','Мода'],['gdStdDev','Стандартное откл.'],['gdUniqueCount','Кол-во уникальных'],['gdNullCount','Кол-во пропусков'],['gdFirst','Первый'],['gdLast','Последний'],['gdOnly','Единственный'],['gdConcat','Список']];
    const owners=[];
    for(const [index,[iconName,label]] of defs.entries()) {
      const base=tid+';grpFactors;chb'+(index?'-'+index:''),box={x:110,y:110+index*25,width:400,height:20};
      const owner=page.add('div',base,'',box,group);owner.attrs.class='x-form-type-checkbox'+(index===(mode==='sum'?0:1)?' x-form-cb-checked':'');
      const input=page.add('input',base+';InputEl','',box,owner);input.attrs.role='checkbox';input.checked=false;input.style.display='none';
      page.add('span',base+';DisplayEl','',box,owner);
      const l=page.add('label',null,label,box,owner);l.attrs.class='x-form-cb-label';
      const icon=page.add('div',null,'',box,l);icon.attrs.class='bg-TBGGroupDataFunction-'+iconName;
      owners.push({owner,icon});
    }
    if(mode!=='no_selection')records[3].row.attrs.class+=' x-grid-item-selected';
    if(mode==='two_selected')records[2].row.attrs.class+=' x-grid-item-selected';
    if(mode==='missing')owners[13].owner.remove();
    if(mode==='extra')page.add('div',tid+';grpFactors;chb-14','',undefined,group).attrs.class='x-form-type-checkbox';
    if(mode==='duplicate')page.add('div',tid+';grpFactors;chb-1','',undefined,group).attrs.class='x-form-type-checkbox';
    if(mode==='hidden')owners[3].owner.style.display='none';
    if(mode==='wrong_icon')owners[3].icon.attrs.class='bg-TBGGroupDataFunction-gdSum';
    if(mode.endsWith('_summary')) {
      const summary=records[3].summaryRow.children[0];summary.attrs['data-tid']=records[3].cell.attrs['data-tid'];
      if(mode==='nonblank_summary')summary.ownText='other';
      if(mode==='foreign_summary'){summary.remove();records[2].summaryRow=page.add('tr',null,'',summary.box,records[2].body);records[2].summaryRow.attrs.class='x-grid-row-summary';records[2].summaryRow.append(summary);}
      if(mode==='hidden_summary')summary.style.display='none';
    }
    const f=(await page.observe()).wizard.factor_editor,success=['count','sum','hidden_input_false','native_summary'].includes(mode);
    assert.equal(f.status,success?'rendered_factor_options':'unobserved',mode);
    assert.equal(f.opening_verified,false);assert.equal(f.settings_applied,false);assert.equal(f.source_identity_verified,false);
    if(success){const narrow=await page.execute({mode:'observe',root_ref:f.dialog_ref});assert.equal(narrow.output.wizard.factor_editor.status,'rendered_factor_options','portal dialog scoped read');assert.equal(narrow.output.wizard.factor_editor.selected_field.field_key,'Id');assert.equal(f.options.length,14);assert.deepEqual(f.options.filter(o=>o.checked).map(o=>o.aggregation),[mode==='sum'?'sum':'count']);assert.equal(f.selected_field.field_key,'Id');assert.equal(f.selected_field.opening_verified,false);}
  }
});

function candidateTableFixture(kind='format', suffix='-1') {
  const page=new Page();page.context.innerWidth=1400;page.context.innerHeight=1000;
  const viewKey='MF;TF-1;ViewsForm;BrowseView'+suffix;
  const view=page.add('div',viewKey,'',{x:10,y:50,width:1300,height:900});
  const name=kind==='format'?'BrowseFormat':'BrowseFilter';
  const modal=page.add('div',viewKey+';ModalWindow_'+name,'',{x:100,y:150,width:1000,height:700},view);
  modal.attrs.role='dialog';
  const base=modal.getAttribute('data-tid')+';'+name+';';
  const grid=page.add('div',base+(kind==='format'?'grdFields;tbl':'tbl'),'',{x:120,y:300,width:420,height:320},modal);
  Object.assign(grid,{clientWidth:420,clientHeight:320,scrollWidth:420,scrollHeight:320,scrollLeft:0,scrollTop:0});grid.attrs.id='view-table';
  const container=page.add('div',null,'',{x:120,y:300,width:420,height:kind==='format'?48:0},grid);container.attrs.class='x-grid-item-container';container.style.transform='none';
  const input=(key,value='')=>{const owner=page.add('div',base+key,'',{x:600,y:250,width:100,height:24},modal);const el=page.add('input',null,'',{x:600,y:250,width:100,height:24},owner);el.attrs.type='text';el.value=value;return el;};
  const check=(key,value)=>{const owner=page.add('div',base+key,'',{x:600,y:250,width:100,height:24},modal);owner.attrs.class=value?'x-form-cb-checked':'';
    const el=page.add('span',base+key+';DisplayEl','',{x:600,y:250,width:15,height:15},owner);el.attrs.class='x-form-checkbox';return {owner,el};};
  const rows=[];
  if(kind==='format') {
    for(const [i,key,type] of [[0,'Region','String'],[1,'Amount','Float']]) {
      const row=page.add('table',null,'',{x:120,y:300+i*24,width:420,height:24},container);
      row.attrs={class:'x-grid-item'+(i===1?' x-grid-item-selected':''),'data-boundview':'view-table','data-recordindex':String(i)};rows.push(row);
      page.add('td',base+'colSourceColumnIndex_'+key,String(i),{x:120,y:300+i*24,width:40,height:24},row);
      const label=page.add('td',base+'colDisplayName_'+key,key,{x:160,y:300+i*24,width:300,height:24},row);
      const icon=page.add('span',null,'',{x:160,y:300+i*24,width:12,height:12},label);icon.attrs.class='bg-TBGDataType-dt'+type;
      const cell=page.add('td',base+'colInAll_'+key,'',{x:460,y:300+i*24,width:50,height:24},row);
      const eye=page.add('img',null,'',{x:460,y:300+i*24,width:12,height:12},cell);eye.attrs.class='bg-icon-visible';
    }
    input('txtColumnsFilterField');check('BrowseFormatPanel;cntFormat;cnt-1;chb',true);check('BrowseFormatPanel;cbFormatStr',true);
    check('BrowseFormatPanel;cbThousand',false);check('BrowseFormatPanel;cbScientific',false);
    input('BrowseFormatPanel;edtDecimalDigit');input('BrowseFormatPanel;edtCurrency');input('BrowseFormatPanel;edtFormatStr','0.00');
  } else check('chkEnableFilter',true);
  return {page,view,viewKey,modal,base,grid,container,rows};
}

test('candidate Table format reads full small list including invisible field and selected Ext numeric settings',async()=>{
  const f=candidateTableFixture();f.rows[0].querySelectorAll('.bg-icon-visible')[0].attrs.class='bg-icon-invisible';
  const raw=await f.page.execute({mode:'observe'}),s=raw.output.table_settings;
  const delivered=createObservationPages().retain(raw).output.table_settings;assert.deepEqual(delivered,s);
  assert.equal(s.status,'observed');assert.equal(s.view_key,f.viewKey);assert.equal(s.format.fieldlist_complete,true);
  assert.deepEqual(s.format.fields.map(x=>[x.name_key,x.source_index,x.type,x.visible]),[['Region',0,'string',false],['Amount',1,'real',true]]);
  assert.equal(s.format.selected_numeric.formatting.value,true);assert.equal(s.format.selected_numeric.custom.value,true);
  assert.equal(s.format.selected_numeric.format_string.value,'0.00');assert.equal(s.format.selected_numeric.losslessness_verified,false);
  assert.equal(s.settings_applied,false);assert.equal(s.result_complete,false);assert.equal(s.execution_verified,false);
});

test('candidate Table format refuses hidden extra rows, filtered lists, duplicate selections and clipping',async()=>{
  for(const mode of ['hidden_extra','filter','selection','clip','foreign','other_dialog','other_view','hidden_grid_payload','translated']) {
    const f=candidateTableFixture();
    if(mode==='hidden_extra'){const extra=f.page.add('table',null,'',{x:120,y:348,width:420,height:24},f.container);extra.attrs.class='x-grid-item';extra.style.display='none';}
    if(mode==='hidden_grid_payload'){const extra=f.page.add('div',null,'',f.grid.box,f.grid);extra.style.display='none';f.page.add('span',null,'predicate',f.grid.box,extra);}
    if(mode==='translated')f.container.style.transform='translateY(24px)';
    if(mode==='filter')f.modal.querySelectorAll('input')[0].value='Amount';
    if(mode==='selection')f.rows[0].attrs.class+=' x-grid-item-selected';
    if(mode==='clip')f.grid.box.x=1300;
    if(mode==='foreign')f.view.attrs['data-tid']='MF;TF-2;ViewsForm;BrowseView-1';
    if(mode==='other_dialog'){const other=f.page.add('div','OtherDialog','',{x:200,y:200,width:200,height:100});other.attrs.role='dialog';}
    if(mode==='other_view')f.page.add('div','MF;TF-1;ViewsForm;BrowseView','',{x:10,y:50,width:1300,height:900});
    const s=(await f.page.observe()).table_settings;
    if(mode==='selection'){assert.equal(s.format.fieldlist_complete,true);assert.equal(s.format.selected_numeric,undefined);}
    else assert.notEqual(s.format?.fieldlist_complete,true,mode);
  }
});

test('candidate Table filter proves only complete empty predicates while enabled remains true',async()=>{
  const f=candidateTableFixture('filter');let s=(await f.page.observe()).table_settings;
  assert.equal(s.filter.enabled.value,true);assert.equal(s.filter.predicates_complete,true);assert.equal(s.filter.predicate_coverage,'complete_empty');
  assert.equal(s.filter.effective_filter_verified,false);assert.equal(s.settings_applied,false);
  const hidden=f.page.add('table',null,'',{x:120,y:300,width:420,height:24},f.container);hidden.attrs.class='x-grid-item';hidden.style.display='none';
  s=(await f.page.observe()).table_settings;assert.equal(s.filter.predicates_complete,false);
});

test('grouping cells are native issued controls only after exact grid row and section binding',async()=>{
  for(const mode of ['valid','duplicate','foreign_grid','wrong_section','hidden','disabled','covered']) {
    const {page,records,base,wizard}=groupingFixture();
    for(const record of records) {record.cell.box={...record.cell.box,width:450};record.icon.box={...record.icon.box,width:450};record.tr.children[1].box={...record.tr.children[1].box,x:490,width:20};}
    if(mode==='duplicate')page.add('td',base+'colUsedFields_Revenue','Revenue',records[2].cell.box,wizard);
    if(mode==='foreign_grid')records[2].row.attrs['data-boundview']='foreign';
    if(mode==='wrong_section')records[1].groupHeader.ownText='Группа';
    if(mode==='hidden')records[2].cell.style.display='none';
    if(mode==='disabled')records[2].cell.attrs['aria-disabled']='true';
    if(mode==='covered')page.add('div','cover','',records[2].cell.box);
    const snapshot=await page.observe();
    const fields=snapshot.ui.elements.filter(e=>e.grouping_field);
    if(['duplicate','foreign_grid','wrong_section','hidden'].includes(mode)){assert.equal(fields.length,0,mode);continue;}
    assert.equal(fields.length,4,mode);
    const revenue=fields.find(e=>e.grouping_field.field_key==='Revenue');
    assert.equal(revenue.ref,snapshot.wizard.grouping.measures[1].cell_ref);
    assert.equal(revenue.grouping_field.grid_ref,snapshot.wizard.grouping.grid_ref);
    assert.deepEqual(revenue.allowed_actions,mode==='valid'?['click','double_click','press']:[],mode);
    assert.equal(revenue.grouping_field.role,'measure');
  }
});



test('Table portal modal root gets exact global view owner without expanding scope',async()=>{
  for(const kind of ['format','filter']) {
    const f=candidateTableFixture(kind);
    f.modal.remove();f.page.document.body.append(f.modal);
    const initial=await f.page.observe();
    const modalRef=initial.ui.dialogs.find(d=>d.identity.anchor_tid===f.modal.getAttribute('data-tid')).ref;
    const observed=(await f.page.execute({mode:'observe',root_ref:modalRef})).output;
    assert.equal(observed.table_settings.status,'observed',kind);
    assert.equal(observed.table_settings.view_key,f.viewKey);
    assert.equal(kind==='format'?observed.table_settings.format.fieldlist_complete:observed.table_settings.filter.predicates_complete,true,kind);
    assert.equal(observed.table_settings.settings_applied,false);
    assert.equal(observed.table_settings.result_complete,false);
    const viewRef=initial.table_settings.view_ref;
    const scoped=(await f.page.execute({mode:'observe',root_ref:viewRef})).output;
    assert.equal(scoped.table_settings.status,'unobserved','portal body is outside requested view subtree');
    assert.equal(scoped.ui.table_cells.length,0,'global owner guard cannot read external modal body');
  }
});

test('Table portal global owner rejects foreign duplicate hidden and descendant impostors',async()=>{
  for(const mode of ['foreign','duplicate','hidden','impostor']) {
    const f=candidateTableFixture();f.modal.remove();f.page.document.body.append(f.modal);
    const initial=await f.page.observe(),ref=initial.ui.dialogs.find(d=>d.identity.anchor_tid===f.modal.getAttribute('data-tid')).ref;
    if(mode==='foreign')f.view.attrs['data-tid']='MF;TF-2;ViewsForm;BrowseView-1';
    if(mode==='duplicate')f.page.add('div',f.viewKey,'',f.view.box);
    if(mode==='hidden')f.view.style.visibility='hidden';
    if(mode==='impostor')f.view.attrs['data-tid']=f.viewKey+';child';
    const observed=(await f.page.execute({mode:'observe',root_ref:ref})).output;
    assert.equal(observed.table_settings.status,'unobserved',mode);
    assert.equal(observed.table_settings.result_complete,false,mode);
  }
});


test('Table schema remains complete when nonselected native eye is opacity zero',async()=>{
 const f=candidateTableFixture();
 const eye=f.rows[0].querySelectorAll('.bg-icon-visible')[0];eye.attrs.class+=' bg-hidable-gridicon';eye.style.opacity='0';
 const raw=await f.page.execute({mode:'observe'}),format=raw.output.table_settings.format;
 assert.equal(format.fieldlist_complete,true);assert.equal(format.visibility_complete,false);
 assert.equal(format.fields[0].name_key,'Region');assert.equal(format.fields[0].source_index,0);assert.equal(format.fields[0].type,'string');
 assert.equal(format.fields[0].visible,null);assert.equal(format.fields[0].visibility_status,'unobserved');
 assert.ok(format.fields[0].visibility_cell_ref);assert.equal(format.fields[0].visibility_icon_ref,undefined);
 assert.equal(format.fields[1].visible,true);assert.equal(format.fields[1].visibility_status,'observed');assert.ok(format.fields[1].visibility_icon_ref);
 assert.equal(format.selected_numeric.name_key,'Amount');assert.equal(format.selected_numeric.format_string.value,'0.00');
 assert.deepEqual(createObservationPages().retain(raw).output.table_settings,raw.output.table_settings);
 assert.equal(raw.output.table_settings.result_complete,false);assert.equal(raw.output.table_settings.settings_applied,false);
});

test('Table malformed missing duplicate or hidden eye never establishes visibility completeness',async()=>{
 for(const mode of ['missing','duplicate','both','hidden','parent_hidden','unknown','clipped_eye','painted_invisible']) {
  const f=candidateTableFixture(),eye=f.rows[0].querySelectorAll('.bg-icon-visible')[0],cell=eye.parentElement;
  if(mode==='missing')eye.remove();
  if(mode==='duplicate'){const extra=f.page.add('img',null,'',eye.box,cell);extra.attrs.class='bg-icon-visible';}
  if(mode==='both')eye.attrs.class+=' bg-icon-invisible';
  if(mode==='hidden')eye.style.visibility='hidden';
  if(mode==='parent_hidden')cell.style.opacity='0';
  if(mode==='unknown')eye.attrs.class='unknown-eye';
  if(mode==='clipped_eye')eye.box.x=1500;
  if(mode==='painted_invisible')eye.attrs.class='bg-icon-invisible';
  const format=(await f.page.observe()).table_settings.format;
  if(mode==='parent_hidden'){assert.equal(format.fieldlist_complete,false);assert.equal(format.visibility_complete,false);continue;}
  assert.equal(format.fieldlist_complete,true,mode);
  assert.equal(format.visibility_complete,mode==='painted_invisible',mode);
  assert.equal(format.fields[0].visible,mode==='painted_invisible'?false:null,mode);
  assert.equal(format.fields[0].visibility_status,mode==='painted_invisible'?'observed':'unobserved',mode);
 }
});

test('Files discovery leads with the actual listing and issues folder controls only after its scoped read',async()=>{
 const page=new Page(),prefix='MF;TF-1;FileStorageForm;';
 const tree=page.add('div',prefix+'MapTreeForm;tree');
 for(let i=0;i<40;i++)page.add('table',null,'navigation '+i,undefined,tree);
 const listing=page.add('div',prefix+'pnlFileStorage;tbl');
 const row=page.add('table',null,'',undefined,listing);row.attrs.class='x-grid-item';
 const cell=page.add('td',prefix+'colName_test','test',undefined,row);
 page.add('td',prefix+'colFileType_test','Папка',undefined,row);
 const foreign=page.add('div','MF;TF-2;FileStorageForm;pnlFileStorage;tbl');
 const roots=await page.execute({mode:'observe',discover_roots:true});
 assert.equal(roots.output.ui.elements[0].tid,listing.getAttribute('data-tid'));
 assert.deepEqual(roots.output.ui.elements[0].allowed_actions,[]);
 assert.equal(roots.output.ui.elements.some(e=>e.tid===foreign.getAttribute('data-tid')),false);
 assert.equal(roots.output.ui.elements.some(e=>e.tid===cell.getAttribute('data-tid')),false);
 const read=await page.execute({mode:'observe',root_ref:roots.output.ui.elements[0].ref});
 const pager=createObservationPages(),issued=pager.retain(read);
 const folder=issued.output.ui.elements.find(e=>e.tid===cell.getAttribute('data-tid'));
 assert.equal(folder.storage_entry.kind,'folder');assert.ok(folder.allowed_actions.includes('double_click'));
 assert.doesNotThrow(()=>pager.assertIssued(issued.output.observation_id,{ref:folder.ref}));
 listing.style.display='none';
 const hidden=await page.execute({mode:'observe',discover_roots:true});
 assert.equal(hidden.output.ui.elements.some(e=>e.tid===listing.getAttribute('data-tid')),false);
});



test('Table labels are issued native controls with exact typed owner signature and restricted actions',async()=>{
 const f=candidateTableFixture();const snapshot=await f.page.observe();
 const field=snapshot.table_settings.format.fields[1],control=snapshot.ui.elements.find(e=>e.ref===field.label_ref);
 assert.ok(control);assert.deepEqual(control.allowed_actions,['click','press']);
 assert.equal(control.table_field.name_key,'Amount');assert.equal(control.table_field.type,'real');assert.equal(control.table_field.source_index,1);
 assert.equal(control.table_field.view_key,f.viewKey);assert.deepEqual(control.signature.table_field,control.table_field);
 const result=await f.page.act({verb:'click',ref:control.ref},snapshot);assert.equal(result.status,'SUCCEEDED');
 assert.equal(f.page.events.filter(e=>e==='click').length,1);
 assert.equal(result.output.table_settings.settings_applied,false);
});

test('Table label issuance fails closed for identity/schema changes and obscured cells',async()=>{
 for(const mode of ['disabled','covered','duplicate','foreign','type_change','index_change']) {
  const f=candidateTableFixture(),before=await f.page.observe();
  const field=before.table_settings.format.fields[1],label=f.rows[1].querySelectorAll('[data-tid]')[1];
  if(mode==='disabled')label.attrs['aria-disabled']='true';
  if(mode==='covered')f.page.add('div','cover','',label.box);
  if(mode==='duplicate')f.page.add('td',label.getAttribute('data-tid'),'Amount',label.box,f.modal);
  if(mode==='foreign')f.view.attrs['data-tid']='MF;TF-2;ViewsForm;BrowseView-1';
  if(mode==='type_change')label.querySelectorAll('.bg-TBGDataType-dtFloat')[0].attrs.class='bg-TBGDataType-dtInteger';
  if(mode==='index_change')f.rows[1].querySelectorAll('[data-tid]')[0].ownText='0';
  const after=await f.page.observe(),control=after.ui.elements.find(e=>e.ref===field.label_ref);
  if(['disabled','covered'].includes(mode))assert.deepEqual(control.allowed_actions,[],mode);
  if(['duplicate','foreign','index_change'].includes(mode))assert.equal(control,undefined,mode);
  const result=await f.page.act({verb:'click',ref:field.label_ref},before);
  assert.notEqual(result.status,'SUCCEEDED',mode);assert.equal(f.page.events.includes('click'),false,mode);
 }
});


test('Table parent formatting uses exact painted Ext InputEl for zero-size inline DisplayEl',async()=>{
 for(const mode of ['checked','unchecked','duplicate_input','duplicate_display','hidden_input','wrong_type','foreign_input','hidden_display']) {
  const f=candidateTableFixture(),tid=f.base+'BrowseFormatPanel;cntFormat;cnt-1;chb';
  const owner=f.modal.querySelector('[data-tid="'+tid+'"]'),display=f.modal.querySelector('[data-tid="'+tid+';DisplayEl"]');
  display.box.width=0;display.box.height=0;display.style.display='inline';
  owner.attrs.class=mode==='unchecked'?'':'x-form-cb-checked';
  const input=f.page.add('input',tid+';InputEl','',{x:600,y:250,width:18,height:18},mode==='foreign_input'?f.modal:owner);
  input.attrs.class='x-form-checkbox';input.attrs.type=mode==='wrong_type'?'checkbox':'button';input.attrs.role='checkbox';input.checked=mode==='unchecked';
  if(mode==='duplicate_input'){const duplicate=f.page.add('input',tid+';InputEl','',input.box,owner);duplicate.attrs={...input.attrs};}
  if(mode==='duplicate_display')f.page.add('span',tid+';DisplayEl','',display.box,owner);
  if(mode==='hidden_input')input.style.opacity='0';
  if(mode==='hidden_display')display.style.visibility='hidden';
  const formatting=(await f.page.observe()).table_settings.format.selected_numeric.formatting;
  if(['checked','unchecked'].includes(mode)){assert.equal(formatting.status,'observed',mode);assert.equal(formatting.value,mode==='checked',mode);assert.ok(formatting.input_ref);assert.equal(formatting.display_ref,undefined);assert.equal(formatting.state_source,'loginom_ext');}
  else assert.equal(formatting.status,'unobserved',mode);
 }
});


// Private candidate fixture reconstructed from the root-owned live DOM probe.
async function inputMappingLiveFixture(duplicateLabels=false) {
  const {mappingLiveLayout}=await import('./mapping-layout.fixture.mjs');
  const live=structuredClone(mappingLiveLayout),page=new Page();
  if(duplicateLabels){const {duplicateTypeIcons}=await import('./mapping-duplicate-icons.fixture.mjs');
    for(const side of ['source','target'])for(const grid of live[side])for(const container of grid.children)for(const table of container.children)for(const row of table.rows)for(const cell of row.cells){
      const observed=duplicateTypeIcons.find(x=>x.tid===cell.tid);if(observed){cell.text=observed.label;cell.observedIcon=observed.icons[0];}
    }}
  page.context.innerWidth=1440;page.context.innerHeight=1000;
  page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-5';
  page.viewportSize=()=>({width:1440,height:1000});
  const nodes=new Map();
  const add=(n,parent,text='')=>{
    const e=page.add(n.tag.toLowerCase(),n.tid,text,n.rect,parent);e.style={...n.style};
    e.attrs.class=n.classes??'';if(n.id)e.attrs.id=n.id;
    if(n.tid)nodes.set(n.tid,e);
    const v=n.scroll??{};Object.assign(e,{scrollLeft:v.left,scrollTop:v.top,scrollWidth:v.width,scrollHeight:v.height,clientWidth:v.clientWidth,clientHeight:v.clientHeight});
    return e;
  };
  const owner=add(live.owner,page.document.body),base=live.owner.tid+';TuneDataSourceMappingWizard;';
  page.add('button',base+'btnAddMappingColumn','Добавить',{x:800,y:240,width:20,height:20},owner);
  for(const c of live.controls.filter(c=>['rbLinks','rbTable','SourceFilter','TargetFilter'].includes(c.name)))for(const n of c.matches){
    const control=add(n,owner);for(const p of n.parts.filter(p=>p.tid!==n.tid)){
      const e=add(p,control);if(p.value!==null)e.value=p.value;if(p.disabled!==null)e.disabled=p.disabled;
    }
  }
  for(const side of ['source','target'])for(const g of live[side]){
    const grid=add(g,owner);
    for(const c of g.children){const container=add(c,grid);
      for(const r of c.children){const table=add(r,container);table.attrs['data-recordindex']=r.recordindex;table.attrs['data-boundview']=r.boundview;
        for(const tr of r.rows){const row=add(tr,table);
          for(const c of tr.cells){const cell=add(c,row,c.text);const icon=/bg-TBGDataType-dt\w+/.exec(c.html)?.[0];
            if(icon){const e=page.add('div',null,'',c.observedIcon?.rect??{x:c.rect.x,y:c.rect.y,width:16,height:16},cell);e.attrs.class=icon;if(c.observedIcon)e.style={display:c.observedIcon.display,visibility:c.observedIcon.visibility,opacity:c.observedIcon.opacity};}
          }
        }
      }
    }
  }
  const pathNodes=[];
  for(const d of live.draws){const draw=add(d,owner);for(const s of d.svgs){const svg=add(s,draw);for(const p of s.paths){
    const path=add(p,svg);path.attrs.d=p.d;path.getScreenCTM=()=>p.screenCTM;pathNodes.push(path);
  }}}
  return {page,owner,base,nodes,pathNodes};
}

test('private input mapping full capability reads live permutation with opaque references only',async()=>{
  const {page,owner,base}=await inputMappingLiveFixture();
  const r=await page.observe();assert.equal(r.wizard.stage,'input_mapping');
  const m=r.wizard.input_mapping;assert.equal(m.status,'rendered_mapping_links',JSON.stringify(m));
  assert.deepEqual(m.links.map(x=>[x.source_key,x.target_key]),[['Quantity','Quantity'],['UnitPrice','UnitPrice'],['Id','Id'],['Region','Region'],['Comment','Comment']]);
  assert.ok(m.links.every(x=>x.path_ref&&x.source_ref&&x.target_ref&&!x.path_index&&!x.source_cell_tid));
  assert.ok(m.source_rows.every(x=>x.cell_ref&&!x.cell_tid&&!x.rect));
  assert.equal(m.source_identity_verified,false);assert.equal(m.settings_applied,false);assert.equal(m.complete,false);
  const roots=await page.execute({mode:'observe',discover_roots:true});
  assert.equal(roots.output.wizard.input_mapping.status,'unobserved');
  const root=roots.output.ui.elements.find(e=>e.tid===base.replace(/TuneDataSourceMappingWizard;$/,'').slice(0,-1));
  assert.ok(root);const scoped=await page.execute({mode:'observe',root_ref:root.ref});
  assert.equal(scoped.output.wizard.input_mapping.status,'rendered_mapping_links');assert.deepEqual(page.events,[]);
});

test('private input mapping rejects stale context, partial roots and malformed live structures',async()=>{
  for(const mode of ['foreign_tab','filtered','bad_matrix','missing_row','duplicate_path','same_label','narrow_root','sensitive','hidden_svg','too_many_paths']){
    const f=await inputMappingLiveFixture(),{page,nodes,base,pathNodes}=f;
    if(mode==='foreign_tab')page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-3';
    if(mode==='filtered')nodes.get(base+'SourceFilter').querySelectorAll('input')[0].value='Id';
    if(mode==='bad_matrix')pathNodes[0].getScreenCTM=()=>({a:1,b:0,c:0,d:1,e:695,f:209});
    if(mode==='hidden_svg')pathNodes[0].parentElement.style.opacity='0';
    if(mode==='too_many_paths')for(let i=0;i<25;i++){const p=pathNodes[0],copy=page.add('path',null,'',p.box,p.parentElement);copy.attrs.d=p.attrs.d;copy.style={...p.style};copy.getScreenCTM=p.getScreenCTM;}
    if(mode==='missing_row')nodes.get(base+'colSourceName_Quantity').closest('table').remove();
    if(mode==='duplicate_path'){const p=pathNodes[0],copy=page.add('path',null,'',p.box,p.parentElement);copy.attrs.d=p.attrs.d;copy.style={...p.style};copy.getScreenCTM=p.getScreenCTM;}
    if(mode==='same_label')for(const [tid,n] of nodes)if(/colSourceName_|colDisplayName_/.test(tid))n.ownText='Same';
    if(mode==='sensitive')nodes.get(base+'SourceFilter').querySelectorAll('input')[0].attrs.type='password';
    let r=await page.observe();
    if(mode==='foreign_tab'){assert.notEqual(r.wizard.status,'observed');continue;}
    if(mode==='same_label'){assert.equal(r.wizard.input_mapping.status,'rendered_mapping_links');continue;}
    if(mode==='narrow_root'){
      const ref=r.wizard.input_mapping.source_rows[0].cell_ref;
      r=(await page.execute({mode:'observe',root_ref:ref})).output;
    }
    assert.equal(r.wizard.input_mapping.status,'unobserved',mode);
  }
});

test('root observed Region and Comment duplicate display labels preserve distinct rendered links',async()=>{
  // Root changed only these labels in the upstream output and reopened the
  // Calculator input mapper. Exact keys and both side labels were read back in
  // duplicate-labels-mapping-native.txt; geometry uses the preceding live probe.
  const {page,nodes,base}=await inputMappingLiveFixture(true);
  const result=await page.observe(),m=result.wizard.input_mapping;
  assert.equal(m.status,'rendered_mapping_links');
  for(const rows of [m.source_rows,m.target_rows]){
    assert.deepEqual(rows.filter(r=>r.label==='Общая метка').map(r=>r.key),['Region','Comment']);
  }
  const region=m.links.find(x=>x.source_key==='Region'),comment=m.links.find(x=>x.source_key==='Comment');
  assert.equal(region.target_key,'Region');assert.equal(comment.target_key,'Comment');
  assert.notEqual(region.source_ref,comment.source_ref);assert.notEqual(region.target_ref,comment.target_ref);
  assert.equal(m.source_identity_verified,false);assert.equal(m.settings_applied,false);
  assert.ok([...m.source_rows,...m.target_rows].every(r=>r.type_verified===true));
  const icon=nodes.get(base+'colSourceName_Region').children[0];icon.box={...icon.box,x:700};
  assert.equal((await page.observe()).wizard.input_mapping.source_rows.find(r=>r.key==='Region').type_verified,false);
  // Equal labels cannot compensate for loss of one independently identified row.
  nodes.get(base+'colSourceName_Comment').attrs['data-tid']=base+'colSourceName_Region';
  assert.equal((await page.observe()).wizard.input_mapping.status,'unobserved');
});

async function inputPortContextFixture(mode='valid') {
  const {inputPortBreadcrumbs}=await import('./input-port-breadcrumbs.fixture.mjs');
  const page=new Page();page.context.innerWidth=1440;page.context.innerHeight=1000;
  page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-5';
  const base='MF;TF-5;',wizard=page.add('div',base+'WizrdMCF','',{x:48,y:71,width:1392,height:929});
  const marker=page.add('button',base+'WizrdMCF;'+(mode==='wrong_wizard'?'TuneDataSourceInputPortWizard':'TuneDataSourceMappingWizard')+';btnAddMappingColumn','',undefined,wizard);
  const panel=page.add('div',base+'NavigationBar;NavigationPanel','',{x:48,y:35,width:1392,height:36});
  const crumbs=inputPortBreadcrumbs.map((n,index)=>{
    const crumb=page.add('a',n.tid,n.label,n.rect,panel);
    const icon={4:'maptree-icon-workflow',5:'bg-vendor-icon-calcdata',8:'maptree-icon-wizard'}[index];
    if(icon)page.add('span',null,'',{x:n.rect.x+1,y:n.rect.y+1,width:16,height:16},crumb).attrs.class=icon;
    return crumb;
  });
  if(mode==='hidden')crumbs[7].style.visibility='hidden';
  if(mode==='duplicate')page.add('a',crumbs[7].attrs['data-tid'],crumbs[7].ownText,crumbs[7].box,panel);
  if(mode==='duplicate_panel')page.add('div',base+'NavigationBar;NavigationPanel','',panel.box);
  if(mode==='foreign')crumbs[7].attrs['data-tid']=crumbs[7].attrs['data-tid'].replace('TF-5','TF-3');
  if(mode==='wrong_folder')crumbs[6].ownText='Выходные порты';
  if(mode==='caption_number')crumbs[7].ownText='Входной источник данных 2';
  if(mode==='broken_chain')crumbs[3].attrs['data-tid']+='>Skipped';
  if(mode==='clipped')crumbs[8].box={...crumbs[8].box,x:1400};
  if(mode==='missing_icon')crumbs[4].children[0].remove();
  if(mode==='hidden_icon')crumbs[4].children[0].style.visibility='hidden';
  if(mode==='foreign_tab')page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-2';
  if(mode==='bounded')for(let i=0;i<33;i++)page.add('a',base+'cnrNaviMode;b.s_Extra'+i,'Extra',crumbs[0].box,panel);
  return {page,wizard,marker,panel,crumbs};
}

test('input port context observes exact node path and display caption without port identity claims',async()=>{
  const {page}=await inputPortContextFixture();const full=await page.observe(),c=full.wizard.input_port_context;
  assert.equal(c.status,'observed');assert.equal(c.node.label,'Revenue');assert.equal(c.direction,'input');
  assert.equal(c.port_display_label,'Входной источник данных');assert.equal(c.port_key,null);assert.equal(c.port_index,null);
  assert.equal(c.source_identity_verified,false);assert.equal(c.opening_verified,false);
  assert.equal(c.node_path.length,6);assert.equal(c.port_path.length,8);assert.equal(c.path.length,9);
  const narrow=await page.execute({mode:'observe',root_ref:full.wizard.root_ref});
  assert.deepEqual(narrow.output.wizard.input_port_context,c);assert.deepEqual(page.events,[]);
});

test('input port overflow caption requires native binding and the exact hidden caption',async()=>{
 for(const mode of ['bound','unbound','wrong_caption','missing_icon','port_bound','port_unbound','port_wrong_caption']) {
  const {page,crumbs}=await inputPortContextFixture();crumbs[8].style.display='none';
  if(mode.startsWith('port_'))crumbs[7].style.display='none';
  if(mode==='port_wrong_caption')crumbs[7].ownText='Other';
  if(mode==='wrong_caption')crumbs[8].ownText='Other';
  if(mode==='missing_icon')crumbs[8].children[0].remove();
  if(!mode.endsWith('unbound'))page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
   {expected_build:build,expected_origin:origin,prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-5',navigation_path:[]}},...options},
   async()=>({verified:true,surface:'wizard',node_id:'node',input_port:{direction:'input',port:0}})));
  const full=await page.observe(),narrow=await page.execute({mode:'observe',root_ref:full.wizard.root_ref});
  assert.deepEqual(narrow.output.wizard.input_port_context,full.wizard.input_port_context);
  assert.equal(full.wizard.input_port_context.status==='observed',['bound','port_bound'].includes(mode),mode);
 }
});

test('input port context rejects foreign duplicated hidden and incomplete breadcrumb evidence',async()=>{
  for(const mode of ['wrong_wizard','hidden','duplicate','duplicate_panel','foreign','wrong_folder','caption_number','broken_chain','clipped','missing_icon','hidden_icon','foreign_tab','bounded']){
    const {page}=await inputPortContextFixture(mode),r=await page.observe();assert.notEqual(r.wizard.input_port_context?.status,'observed',mode);
  }
});

test('native process console joins bounded grids and keeps ownership and execution unverified',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=JSON.parse(readFileSync(new URL('./fixtures/process-console-run15.json',import.meta.url),'utf8'));
  for(const mode of ['complete','hidden','overflow','record','unknown_state','duplicate','hidden_filter','foreign_bound','two_selected','unknown_menu']) {
    const page=new Page();page.context.innerWidth=1440;page.context.innerHeight=1000;
    const panel=page.add('div','ConsoleForm','',{x:48,y:397,width:1392,height:603});
    const grids=[];
    for(const g of source.grids) {
      const grid=page.add('div',g.attributes['data-tid'],'',g.rect,panel);grid.attrs.id=g.attributes.id;
      Object.assign(grid,{scrollTop:g.scroll.top,scrollLeft:g.scroll.left,clientWidth:g.scroll.clientWidth,clientHeight:g.scroll.clientHeight,scrollWidth:g.scroll.scrollWidth,scrollHeight:g.scroll.scrollHeight});
      const container=page.add('div',null,'',g.containers[0].rect,grid);container.attrs.class='x-grid-item-container';container.style.transform='none';
      for(const r of g.rows) {
        const row=page.add('table',null,'',r.rect,container);Object.assign(row.attrs,r.attributes,{class:'x-grid-item'});
        for(const c of r.cells){const cell=page.add('td',c.attributes['data-tid'],c.text,c.rect,row);cell.attrs.class=c.classes;}
      }
      grids.push({grid,container});
    }
    const portal=page.add('div','mnContextMenu','',{x:180,y:480,width:330,height:90});
    const showNode=page.add('div','mnContextMenu;mniShowNodeToProcess','Показать узел',{x:200,y:540,width:300,height:24},portal);
    grids[0].container.children.at(-1).attrs.class+=' x-grid-item-selected';
    const menu=page.add('div','mnContextMenu;mniShowCompletedProcesses','Отображать завершенные процессы',{x:200,y:500,width:300,height:24},portal);menu.attrs.class='x-menu-item-checked';
    if(mode==='two_selected')grids[0].container.children[0].attrs.class+=' x-grid-item-selected';
    if(mode==='unknown_menu')showNode.attrs['data-tid']='mnContextMenu;unknown';
    if(mode==='hidden')panel.style.display='none';
    if(mode==='overflow')grids[0].grid.scrollHeight++;
    if(mode==='record')grids[1].container.children[0].attrs['data-recordid']='foreign';
    if(mode==='foreign_bound')grids[1].container.children[0].attrs['data-boundview']='foreign';
    if(mode==='unknown_state')grids[1].container.children[0].children[1].attrs.class='bg-progress-ptpsUnknown';
    if(mode==='duplicate')page.add('td',grids[1].container.children[0].children[0].attrs['data-tid'],'100',undefined,panel);
    if(mode==='hidden_filter')menu.style.visibility='hidden';
    const native=await page.observe(),r=native.process_console;
    if(['hidden','overflow','record','foreign_bound','duplicate'].includes(mode)){assert.equal(r.status,'unobserved',mode);continue;}
    assert.equal(r.status,'rendered_process_inventory',mode);if(mode==='complete')assert.doesNotThrow(()=>createObservationPages().retain({status:'SUCCEEDED',operation_id:'process-read',output:native}));assert.equal(r.rows.length,19);assert.equal(r.top_groups.length,15);
    assert.equal(r.top_level_complete,mode!=='hidden_filter');const scoped=await page.execute({mode:'observe',root_ref:r.panel_ref});assert.equal(scoped.output.process_console.status,'rendered_process_inventory');assert.equal(scoped.output.process_console.top_level_complete,mode!=='hidden_filter');assert.equal(r.details_complete,false);assert.equal(r.execution_verified,false);assert.equal(r.owner_verified,false);
    assert.equal(r.rows[0].rendered_state,mode==='unknown_state'?'unknown':'completed');
    if(mode==='two_selected')assert.equal(native.ui.elements.filter(e=>e.process_menu).length,0);
    if(mode==='unknown_menu'){const roots=await page.execute({mode:'observe',discover_roots:true});assert.equal(roots.output.ui.elements.some(e=>e.tid==='mnContextMenu'),false);}
    if(mode==='complete') {
      const control=native.ui.elements.find(e=>e.process_row?.record_id===r.rows.at(-1).record_id);assert.ok(control);assert.deepEqual(control.allowed_actions,['click','right_click','press']);assert.equal(control.signature.process_row.path,r.rows.at(-1).path);
      const roots=await page.execute({mode:'observe',discover_roots:true});const menuRoot=roots.output.ui.elements.find(e=>e.tid==='mnContextMenu');assert.ok(menuRoot);
      const read=await page.execute({mode:'observe',root_ref:menuRoot.ref});const item=read.output.ui.elements.find(e=>e.tid==='mnContextMenu;mniShowNodeToProcess');assert.ok(item?.process_menu);assert.equal(item.process_menu.process.record_id,r.rows.at(-1).record_id);assert.equal(item.process_menu.opening_verified,false);assert.deepEqual(item.allowed_actions,['click','press','show_process_node']);
    }
  }
});

async function inputPortFinishFixture(mode='valid') {
  const f=await inputMappingLiveFixture(),{page,owner,base,nodes}=f;
  const {inputPortBreadcrumbs}=await import('./input-port-breadcrumbs.fixture.mjs');
  const panel=page.add('div','MF;TF-5;NavigationBar;NavigationPanel','',{x:48,y:35,width:1392,height:36});
  const crumbs=inputPortBreadcrumbs.map((n,i)=>{
    const multiline=mode==='multiline'; const crumb=page.add('a',multiline?n.tid.replace('Revenue','Duplicates:__in:_Key_Sub'):n.tid,multiline&&i===5?'Duplicates: in: Key, Sub':n.label,n.rect,panel),icon={4:'maptree-icon-workflow',5:'bg-vendor-icon-calcdata',8:'maptree-icon-wizard'}[i];
    if(icon)page.add('span',null,'',{x:n.rect.x+1,y:n.rect.y+1,width:16,height:16},crumb).attrs.class=icon;return crumb;
  });
  const done=page.add('button','MF;TF-5;WizrdMCF;btnDone','Готово',{x:1300,y:950,width:100,height:25},owner);
  if(mode==='missing_context')crumbs[7].remove();
  if(mode==='missing_mapping')nodes.get(base+'colSourceName_Region').remove();
  if(mode==='duplicate_done')page.add('button',done.attrs['data-tid'],'Готово',done.box,owner);
  let graph,node,label,toast,waits=0;
  const click=page.mouse.click;page.mouse.click=async(...args)=>{
    await click(...args);if(mode==='still_open')return;
    owner.remove();for(const c of crumbs.slice(5))c.remove();
    if(mode==='wrong_workflow')crumbs[4].ownText='Другой сценарий';
    graph=page.add('div','MF;TF-5;ModelForm;cmpDiagram','',{x:48,y:71,width:1392,height:929});
    const key=mode==='wrong_node'?'Other':mode==='multiline'?'Duplicates:__in:_Key_Sub':mode.startsWith('suffix')?'Revenue@1':'Revenue';node=page.add('g','MF;TF-5;Graph;'+key,'',{x:100,y:200,width:150,height:80},graph);
    label=page.add('span','MF;TF-5;Graph;'+key+';Label;Label',mode==='multiline'?'Duplicates:in: Key, Sub':key,{x:110,y:220,width:120,height:30},node);
    if(mode.startsWith('suffix')){label.ownText='Revenue';const other=page.add('g','MF;TF-5;Graph;Revenue','',{x:300,y:200,width:150,height:80},graph);page.add('span','MF;TF-5;Graph;Revenue;Label;Label','Revenue',{x:310,y:220,width:120,height:30},other);}
    if(mode.startsWith('ellipsis'))label.ownText=mode==='ellipsis_wrong_text'?'Other…':'Reve…';
    if(mode==='duplicate_node')page.add('g','MF;TF-5;Graph;'+key,'',node.box,graph);
    if(['toast','foreign_toast','permanent_toast'].includes(mode)){toast=page.add('div',mode==='foreign_toast'?'foreign':'toast','Сохранено',{x:1000,y:800,width:300,height:75});toast.attrs.role='dialog';}
    if(mode==='mask')page.add('div','mask','Загрузка').attrs.class='x-mask-msg';
  };
  page.waitForTimeout=async()=>{waits++;if(mode==='toast'&&waits===3)toast.remove();
    if(mode==='late_body'&&waits===2){node.remove();node=page.add('g','MF;TF-5;Graph;Revenue','',{x:100,y:200,width:150,height:80},graph);label=page.add('span','MF;TF-5;Graph;Revenue;Label;Label','Revenue',{x:110,y:220,width:120,height:30},node);}
    if(mode==='churn')page.mutationObserver.pending.push({type:'attributes',target:node,attributeName:'style'});
    if(mode==='late_tab'&&waits===2)page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-2';
  };
  if((mode.startsWith('ellipsis')&&mode!=='ellipsis_unbound')||mode.startsWith('suffix'))page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
    {expected_build:build,expected_origin:origin,prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-5',navigation_path:[]}},...options},
    async()=>({verified:true,node_id:mode==='suffix_wrong_id'?'other':'node',surface:graph?'graph':'wizard',tid:graph?(mode==='ellipsis_wrong_body'?'foreign':node.attrs['data-tid']):'MF;TF-5;WizrdMCF',...(!graph?{input_port:{direction:'input',port:0}}:{})})));
  return {...f,done,waits:()=>waits};
}

test('typed input-port finish is offered only with full mapping and exact owner evidence',async()=>{
  for(const mode of ['valid','missing_context','missing_mapping','duplicate_done']){
    const {page}=await inputPortFinishFixture(mode),r=await page.observe();
    const done=r.ui.elements.filter(e=>e.wizard_finish?.mode==='input_port');
    if(mode==='valid'){
      assert.equal(done.length,1);assert.ok(done[0].allowed_actions.includes('finish_wizard'));
      assert.deepEqual(Object.keys(done[0].wizard_finish).sort(),['mode','node_ref','port_ref','root_ref']);
      assert.ok(JSON.stringify(done[0].wizard_finish).length<256);
    } else assert.equal(done.length,0,mode);
  }
});

test('typed input-port finish uses one gesture and quiet exact graph return without applied claims',async()=>{
  for(const mode of ['valid','multiline','late_body','wrong_node','wrong_workflow','still_open','mask','duplicate_node','churn','late_tab','ellipsis_bound','ellipsis_unbound','ellipsis_wrong_body','ellipsis_wrong_text','suffix_bound','suffix_wrong_id']){
    const {page,waits}=await inputPortFinishFixture(mode),snapshot=await page.observe();
    const done=snapshot.ui.elements.find(e=>e.wizard_finish?.mode==='input_port');assert.ok(done,mode);
    const result=await page.act({verb:'finish_wizard',ref:done.ref},snapshot),success=['valid','multiline','late_body','ellipsis_bound','suffix_bound'].includes(mode);
    assert.equal(result.status,success?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
    assert.equal(page.events.filter(e=>e==='click').length,1,mode);
    const event=result.trace.find(e=>e.event==='input_port_finish_verified');assert.equal(!!event,success,mode);
    assert.ok(!result.trace.some(e=>e.event==='wizard_finish_graph_verified'));
    if(success){assert.equal(event.wizard_root_ref,snapshot.wizard.root_ref);assert.equal(event.control_ref,done.ref);
      assert.deepEqual(event.port_path,snapshot.wizard.input_port_context.port_path);
      assert.equal(event.reopen_required,true);assert.equal(event.settings_applied,false);assert.equal(event.source_identity_verified,false);
      assert.equal(result.trace.find(e=>e.event==='input_port_finish_settled').quiet_samples,3);
    }
    if(mode==='late_body')assert.equal(waits(),5);if(mode==='churn')assert.equal(waits(),12);
  }
});

test('input-port finish minimal metadata is delivered on the unchanged 12000-byte pager',async()=>{
  const {page}=await inputPortFinishFixture(),raw=await page.execute({mode:'observe'}),pager=createObservationPages();
  const issued=pager.retain(raw),button=issued.output.ui.elements.find(e=>e.wizard_finish?.mode==='input_port');
  assert.ok(button);assert.ok(Buffer.byteLength(JSON.stringify(issued.output))<=12000);
  pager.assertIssued(issued.output.observation_id,{verb:'finish_wizard',ref:button.ref});
});

async function nodeOverviewContextFixture(mode='valid') {
  const {inputPortBreadcrumbs}=await import('./input-port-breadcrumbs.fixture.mjs');
  const page=new Page();page.context.innerWidth=1440;page.context.innerHeight=1000;
  page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-5';
  const base='MF;TF-5;',panel=page.add('div',base+'NavigationBar;NavigationPanel','',{x:48,y:35,width:1392,height:36});
  const crumbs=inputPortBreadcrumbs.slice(0,6).map((n,index)=>{
    const last=index===5,crumb=page.add('a',last?n.tid.replace(/Revenue$/,'Изменение'):n.tid,last?'Изменение':n.label,last?{x:774,y:41,width:117.45,height:24}:n.rect,panel);
    const icon={4:'maptree-icon-workflow',5:'bg-vendor-icon-reformcolumns'}[index];
    if(icon)page.add('span',null,'',{x:crumb.box.x+6,y:44,width:18,height:18},crumb).attrs.class=icon;
    return crumb;
  });
  if(mode==='hidden')crumbs[5].style.visibility='hidden';
  if(mode==='extra')page.add('a',crumbs[5].attrs['data-tid']+'>Extra','Extra',crumbs[5].box,panel);
  if(mode==='duplicate')page.add('a',crumbs[5].attrs['data-tid'],'Изменение',crumbs[5].box,panel);
  if(mode==='duplicate_panel')page.add('div',base+'NavigationBar;NavigationPanel','',panel.box);
  if(mode==='foreign')crumbs[5].attrs['data-tid']=crumbs[5].attrs['data-tid'].replace('TF-5','TF-3');
  if(mode==='broken_chain')crumbs[3].attrs['data-tid']+='>Skipped';
  if(mode==='clipped')crumbs[5].box={...crumbs[5].box,x:1400};
  if(mode==='missing_icon')crumbs[4].children[0].remove();
  if(mode==='hidden_icon')crumbs[5].children[0].style.visibility='hidden';
  if(mode==='outside_icon')crumbs[5].children[0].box.x=1200;
  if(mode==='foreign_tab')page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-2';
  if(mode==='wizard')page.add('div',base+'WizrdMCF','', {x:48,y:71,width:1000,height:800});
  if(mode==='bounded')for(let i=0;i<33;i++)page.add('a',base+'cnrNaviMode;b.s_Extra'+i,'Extra',crumbs[0].box,panel);
  return {page,panel};
}
test('node overview reads six owned visible breadcrumbs without claiming ShowNode ownership',async()=>{
  const {page}=await nodeOverviewContextFixture(),r=await page.observe();
  assert.equal(r.node_context.status,'observed');assert.equal(r.node_context.kind,'node');assert.equal(r.node_context.path.length,6);
  assert.equal(r.node_context.node.label,'Изменение');assert.equal(r.node_context.opening_verified,false);
  assert.equal(r.navigation_context.status,'unobserved');
  const scoped=(await page.execute({mode:'observe',root_ref:r.node_context.panel_ref})).output;
  assert.deepEqual(scoped.node_context,r.node_context);assert.deepEqual(page.events,[]);
  const raw=await page.execute({mode:'observe'});assert.deepEqual(createObservationPages().retain(raw).output.node_context,r.node_context);
});
test('node overview rejects incomplete foreign clipped and unowned icon breadcrumbs',async()=>{
  for(const mode of ['hidden','extra','duplicate','duplicate_panel','foreign','broken_chain','clipped','missing_icon','hidden_icon','outside_icon','foreign_tab','wizard','bounded']) {
    const {page}=await nodeOverviewContextFixture(mode);assert.notEqual((await page.observe()).node_context.status,'observed',mode);
  }
});
test('prepared node overview binds a multiline automatic key without trusting collapsed label text',async()=>{
 for(const mode of ['bound','unbound','foreign_key']) {
  const {page,panel}=await nodeOverviewContextFixture(),crumb=panel.children.at(-1);
  const key='Дубликаты:__out:_Value_Amount;_in:_Key_(+1)';
  crumb.attrs['data-tid']=crumb.attrs['data-tid'].replace(/Изменение$/,key);
  crumb.ownText='Дубликаты: out: Value, Amount; in: Key (+1)';
  const binding={node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-5',navigation_path:[]}};
  const reader=async()=>({verified:true,document_id:'doc',workflow_id:'wf',node_id:'node',surface:'graph',tid:'MF;TF-5;Graph;'+(mode==='foreign_key'?'Other':key)});
  const result=await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
   {mode:'observe',expected_build:build,expected_origin:origin,...(mode==='unbound'?{}:{prepared_node_context:binding})},reader);
  assert.equal(result.output.node_context.status==='observed',mode==='bound',mode);
 }
});

function smallTableCoverageFixture() {
 const page=new Page(),key='MF;TF-1;ViewsForm;BrowseView';page.context.innerWidth=1000;page.context.innerHeight=800;
 const view=page.add('div',key,'',{x:10,y:50,width:950,height:700});
 const nulls=page.add('button',key+';btnDataGridShowNulls','',{x:30,y:60,width:30,height:20},view);nulls.attrs.class='x-btn-pressed';
 const grids=[],containers=[],rows=[];
 for(let side=0;side<2;side++) {
  const x=20+side*100,width=side?800:90,id='table-view-'+side;
  const g=page.add('div',key+';grdData;grd'+(side?'-1':'')+';tbl','',{x,y:100,width,height:500},view);
  g.attrs.id=id;Object.assign(g,{scrollTop:0,scrollLeft:0,clientWidth:width,scrollWidth:width,clientHeight:500,scrollHeight:500});
  const c=page.add('div',null,'',{x,y:100,width,height:120},g);c.attrs.class='x-grid-item-container';c.style.transform='matrix(1, 0, 0, 1, 0, 0)';
  const rs=[];for(let i=0;i<6;i++){const row=page.add('table',null,'',{x,y:100+i*20,width,height:20},c);Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':String(i),'data-recordid':'record-'+i,'data-boundview':id});rs.push(row);}
  grids.push(g);containers.push(c);rows.push(rs);
 }
 return {page,key,view,nulls,grids,containers,rows};
}
test('Table row inventory rejects hidden or virtualized remainder and mismatched grids',async()=>{
 for(const mode of ['valid','overflow','translated','missing','duplicate','mismatch','clipped','extra','no_null','foreign_view']){
  const f=smallTableCoverageFixture();
  if(mode==='overflow')f.grids[1].scrollHeight=501;
  if(mode==='translated')f.containers[1].style.transform='matrix(1, 0, 0, 1, 0, 20)';
  if(mode==='missing')f.rows[1][5].remove();
  if(mode==='duplicate')f.rows[1][5].attrs['data-recordid']='record-4';
  if(mode==='mismatch')f.rows[1][5].attrs['data-recordid']='foreign';
  if(mode==='clipped')f.rows[1][5].box.y=799;
  if(mode==='extra')f.page.add('div',null,'',undefined,f.containers[1]);
  if(mode==='no_null')f.nulls.attrs.class='';
  if(mode==='foreign_view')f.view.attrs['data-tid']='MF;TF-2;ViewsForm;BrowseView';
  const c=(await f.page.observe()).table_coverage;
  assert.equal(!!c.rendered_rows,['valid','no_null'].includes(mode),mode);
  assert.equal(c.complete_result_verified,false);
  if(mode==='valid'){assert.equal(c.rendered_rows.count,6);assert.equal(c.null_display.enabled,true);assert.equal(c.rendered_rows.source_total_verified,false);}
  if(mode==='no_null')assert.equal(c.null_display.enabled,false);
 }
});
test('disabled Ext menu cannot issue gestures including its inner menuitem',async()=>{
 const {page}=smallTableCoverageFixture(),menu=page.add('div','mnContextData','',{x:50,y:200,width:300,height:200});
 for(const [i,n] of ['btnFirstPage','btnPrevPage','btnNextPage','btnLastPage'].entries()){
  const item=page.add('div','mnContextData;'+n,'',{x:60,y:210+i*30,width:200,height:25},menu);item.attrs.class='x-menu-item-disabled';
  const inner=page.add('a',null,n,{x:60,y:210+i*30,width:200,height:25},item);inner.attrs.role='menuitem';
 }
 const s=await page.observe();assert.equal(s.table_coverage.pagination.controls.length,4);
 assert.ok(s.table_coverage.pagination.controls.every(c=>c.enabled===false));
 for(const e of s.ui.elements.filter(e=>e.tid?.startsWith('mnContextData;')||e.role==='menuitem')){assert.equal(e.enabled,false);assert.deepEqual(e.allowed_actions,[]);}
});
test('Table row range is exact, scoped and never itself a source total',async()=>{
 for(const mode of ['valid','malformed','duplicate','foreign']){
  const {page,key}=smallTableCoverageFixture();const mk=key+';ModalWindow_BrowseGoToLine';
  const modal=page.add('div',mk,'',{x:100,y:200,width:300,height:200});modal.attrs.class='x-window';
  const tid=(mode==='foreign'?'MF;TF-2;ViewsForm;BrowseView;ModalWindow_BrowseGoToLine':mk)+';BrowseGoToLine;lblRowsRange';
  const label=page.add('div',tid,mode==='malformed'?'Номер строки (1 - 6): extra':'Номер строки (1 - 6):',{x:110,y:220,width:250,height:30},modal);
  if(mode==='duplicate')page.add('div',tid,label.ownText,label.box,modal);
  const c=(await page.observe()).table_coverage;
  assert.equal(!!c.row_range,mode==='valid',mode);if(mode==='valid'){assert.equal(c.row_range.last,6);assert.equal(c.row_range.source_total_verified,false);}
 }
});
test('menu becoming disabled after observation refuses action before gesture',async()=>{
 const {page}=smallTableCoverageFixture();
 const menu=page.add('div','mnContextData','',{x:50,y:200,width:300,height:200});
 const item=page.add('div','mnContextData;btnNextPage','Следующая страница',{x:60,y:210,width:200,height:25},menu);
 const before=await page.observe(),control=before.ui.elements.find(e=>e.tid==='mnContextData;btnNextPage');
 assert.ok(control.allowed_actions.includes('click'));item.attrs.class='x-menu-item-disabled';
 const out=await page.act({verb:'click',ref:control.ref},before);
 assert.equal(out.status,'NOT_APPLIED');assert.equal(out.effect_possible,false);assert.deepEqual(page.events,[]);
});
test('native Table coverage survives actual pager and independent journal comparison',async()=>{
 const {page}=smallTableCoverageFixture(),raw=await page.execute({mode:'observe'});
 const delivered=createObservationPages().retain(clone(raw)),{spawnSync}=await import('node:child_process');
 assert.deepEqual(delivered.output.table_coverage,raw.output.table_coverage);
 const script="import sys,json,copy;from rename_effect import journal_equal;r,d=json.load(sys.stdin);d['output'].pop('operation',None);assert journal_equal(r,d);d['output']['table_coverage']['rendered_rows']['count']=7;assert not journal_equal(r,d)";
 const check=spawnSync('python3',['-B','-c',script],{cwd:new URL('../../tools/loginom-acceptance/',import.meta.url),input:JSON.stringify([raw,delivered]),encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});


test('native Upload button and descendants cannot bypass artifact transfer through generic gestures',async()=>{
  const page=new Page();
  const upload=page.add('a','MF;TF-1;FileStorageForm;btnUpload','Загрузить');
  const inner=page.add('span','upload-label','Загрузить',{x:35,y:105,width:60,height:15},upload);
  const ordinary=page.add('button','MF;TF-1;FileStorageForm;btnCreateDirectory','Создать каталог',{x:200,y:100,width:130,height:25});
  const observed=await page.observe();
  for(const tid of [upload.getAttribute('data-tid'),inner.getAttribute('data-tid')]){
    const element=observed.ui.elements.find(e=>e.tid===tid);
    if(!element)continue;
    assert.deepEqual(clone(element.allowed_actions),[]);
    for(const action of [{verb:'click',ref:element.ref},{verb:'press',ref:element.ref,key:'Enter'}]){
      assert.throws(()=>validateUiAction(action,observed));
      await assert.rejects(()=>page.act(action,observed),/does not support this action/);
    }
  }
  assert.ok(observed.ui.elements.find(e=>e.tid===ordinary.getAttribute('data-tid')).allowed_actions.includes('click'));
  assert.equal(page.events.filter(e=>e==='click'||e==='key:Enter').length,0);
});

test('empty graph decorations do not masquerade as nodes while a real Vertex node remains actionable',async()=>{
  const page=new Page(),tid='MF;TF-1;Graph;Vertex';
  page.add('g',tid,'',{x:30,y:120,width:40,height:40});
  page.add('g',tid,'',{x:90,y:120,width:40,height:40});
  let snapshot=await page.observe();
  assert.equal(snapshot.graph_identity.status,'observed');
  assert.deepEqual(clone(snapshot.nodes),[]);
  assert.equal(snapshot.ui.elements.some(e=>e.tid===tid),false);
  const real=new Page();real.add('g',tid,'',{x:30,y:120,width:40,height:40});
  real.add('text',tid+';Label;Label','Vertex',{x:30,y:165,width:60,height:20});
  snapshot=await real.observe();
  assert.equal(snapshot.nodes.length,1);
  const body=snapshot.ui.elements.find(e=>e.tid===tid);
  assert.equal(body.graph_node.part,'body');assert.ok(body.allowed_actions.includes('click'));
});

test('reform coverage binds complete visible configured fields and rejects missing remainder evidence',async()=>{
  for(const mode of ['valid','filtered','overflow','clipped','hidden_extra','gap','wrong_view','missing_check','duplicate_check','missing_cache','editor','mask','extra_container','offset','selected_excluded']) {
    const page=new Page(),c=mappingCoverageFixture(page),old=c.base;
    c.base=old.replace('ColumnsMappingEngineOutputPortWizard','ReformColumnsWizard');
    for(const e of page.document.all())if(e.attrs['data-tid']?.startsWith(old))e.attrs['data-tid']=e.attrs['data-tid'].replace(old,c.base);
    page.document.querySelectorAll('[data-tid="'+c.base+'btnAddMappingColumn"]')[0].remove();
    c.tableMode.remove();c.linksMode.remove();c.auto.remove();c.container.box.width=600;
    for(const [i,row] of c.rows.entries()){
      row.box.width=600;
      const source=row.children[2];source.attrs['data-tid']=c.base+'colCachingMethod_Field'+i;source.ownText='Отключено';source.children=[];
      const cell=page.add('td',c.base+'colExcluded_Field'+i,'',{x:600,y:row.box.y,width:100,height:25},row);
      page.add('img',null,'',cell.box,cell).attrs.class='x-grid-checkcolumn'+(mode==='selected_excluded'?' x-grid-checkcolumn-checked':'');
    }
    if(mode==='filtered')c.input.value='Field';
    if(mode==='overflow')c.body.scrollHeight=401;
    if(mode==='clipped')c.rows[1].children[5].box.x=900;
    if(mode==='hidden_extra'){const r=page.add('table',null,'',c.rows[0].box,c.container);r.attrs.class='x-grid-item';r.style.display='none';}
    if(mode==='gap')c.rows[1].attrs['data-recordindex']='2';
    if(mode==='wrong_view')c.rows[1].attrs['data-boundview']='foreign';
    if(mode==='missing_check')c.rows[0].children[5].children=[];
    if(mode==='duplicate_check')page.add('img',null,'',c.rows[0].box,c.rows[0].children[5]).attrs.class='x-grid-checkcolumn';
    if(mode==='missing_cache')c.rows[0].children[2].remove();
    if(mode==='editor')page.add('div','MF;TF-1;WizrdMCF;EditReformColumnDefForm','',undefined,c.form);
    if(mode==='mask')page.add('div',null,'Loading').attrs.class='x-mask-msg';
    if(mode==='extra_container')page.add('div',null,'',c.container.box,c.body).attrs.class='x-grid-item-container';
    if(mode==='offset')c.body.scrollLeft=1;
    const s=await page.observe(),cols=s.wizard.reform_columns;
    assert.equal(cols.definition_coverage.status,['valid','selected_excluded'].includes(mode)?'complete_configured_fields':'partial',mode);
    assert.equal(cols.complete,false);assert.equal(cols.settings_applied,false);assert.equal(cols.definition_coverage.source_identity_verified,false);
    if(mode==='valid'){assert.equal(cols.definition_coverage.count,2);assert.equal(cols.definition_coverage.first_row_ref,cols.fields[0].row_ref);const narrow=await page.execute({mode:'observe',root_ref:s.wizard.root_ref});assert.deepEqual(narrow.output.wizard.reform_columns,cols);}
  }
});


test('output mapping coverage also binds each native derived socket family',async()=>{
  for(const family of ['DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard']){
    const page=new Page(),c=mappingCoverageFixture(page);
    for(const e of page.document.all())if(e.attrs['data-tid']?.startsWith(c.base))e.attrs['data-tid']=e.attrs['data-tid'].replace('ColumnsMappingEngineOutputPortWizard',family);
    const raw=await page.execute({mode:'observe'}),m=raw.output.wizard.output_columns;
    assert.equal(m.definition_coverage.status,'complete_configured_rows');assert.equal(m.definition_coverage.count,2);assert.equal(m.auto_sync.value,true);
    const narrow=await page.execute({mode:'observe',root_ref:raw.output.wizard.root_ref});assert.deepEqual(narrow.output.wizard.output_columns,m);
    c.input.value='Field';const filtered=await page.observe();assert.equal(filtered.wizard.output_columns.definition_coverage.status,'partial');
  }
});

function outputPortFinishFixture(mode='valid') {
  const page=new Page(),c=mappingCoverageFixture(page),panel=page.add('div','MF;TF-1;NavigationBar;NavigationPanel');let path='';
  const crumbs=[];
  for(const [label,icon] of [['Package','maptree-icon-package'],['Workflow','maptree-icon-workflow'],['Calc','bg-vendor-icon-calcdata'],['Outputs','maptree-icon-modeloutputports'],['Result','bg-vendor-icon-deriveddatasourceoutputsocketdef'],['Settings','maptree-icon-wizard']]){
    path+=(path?'>':'')+label;const crumb=page.add('a','MF;TF-1;cnrNaviMode;b.s_'+path,label,undefined,panel);page.add('span',null,'',undefined,crumb).attrs.class=icon;crumbs.push(crumb);
  }
  const done=page.add('button','MF;TF-1;WizrdMCF;btnDone','Готово',{x:750,y:500,width:100,height:25},c.form);
  if(mode==='missing_context')crumbs[4].remove();
  if(mode==='filtered')c.input.value='Field';
  if(mode==='duplicate_done')page.add('button',done.attrs['data-tid'],'Готово',done.box,c.form);
  if(mode==='missing_auto')c.auto.remove();
  const click=page.mouse.click;let node,waits=0;
  page.mouse.click=async(...args)=>{await click(...args);if(mode==='still_open')return;c.form.remove();for(const crumb of crumbs.slice(2))crumb.remove();
    if(mode==='wrong_workflow')crumbs[1].ownText='Other';
    const graph=page.add('div','MF;TF-1;ModelForm;cmpDiagram','',{x:20,y:70,width:850,height:650});
    const key=mode==='wrong_node'?'Other':'Calc';node=page.add('g','MF;TF-1;Graph;'+key,'',{x:100,y:200,width:150,height:80},graph);
    page.add('span','MF;TF-1;Graph;'+key+';Label;Label',key,{x:110,y:220,width:120,height:30},node);
    if(mode==='mask')page.add('div',null,'Loading').attrs.class='x-mask-msg';
  };
  page.waitForTimeout=async()=>{waits++;if(mode==='churn')page.mutationObserver.pending.push({type:'attributes',target:node,attributeName:'style'});};
  return {page,waits:()=>waits};
}

test('typed output-port finish requires complete output mapping and its own port owner',async()=>{
  for(const mode of ['valid','missing_context','filtered','duplicate_done','missing_auto']){
    const {page}=outputPortFinishFixture(mode),s=await page.observe();const controls=s.ui.elements.filter(e=>e.wizard_finish?.mode==='output_port');
    assert.equal(controls.length,mode==='valid'?1:0,mode);
  }
});

test('overflow output socket requires a current native owner and visible actionable Done',async()=>{
  for(const mode of ['valid','unbound','stale_owner','foreign_port','missing_guid','missing_opening','wrong_index',
    'duplicate_socket','wrong_socket_icon','missing_settings','hidden_ancestor','hidden_visibility','disabled_done','hidden_done']){
    const {page}=outputPortFinishFixture();
    const find=suffix=>page.document.all().find(e=>e.attrs['data-tid']?.endsWith(suffix));
    const socket=find('>Result'),settings=find('>Settings'),done=find(';btnDone');
    settings.attrs['data-tid']=settings.attrs['data-tid'].replace('>Settings','>Настройка');settings.ownText='Настройка';
    socket.style.display='none';settings.style.display='none';
    const port={direction:'output',port:0,native_index:0,port_guid:'out-guid',opening_operation_id:'open-output'};
    if(mode==='foreign_port')port.direction='input';
    if(mode==='missing_guid')delete port.port_guid;
    if(mode==='missing_opening')delete port.opening_operation_id;
    if(mode==='wrong_index')port.native_index=1;
    if(mode==='duplicate_socket'){
      const duplicate=page.add('a',socket.attrs['data-tid'],'Result',undefined,socket.parentElement);duplicate.style.display='none';
      page.add('span',null,'',undefined,duplicate).attrs.class='bg-vendor-icon-deriveddatasourceoutputsocketdef';
    }
    if(mode==='wrong_socket_icon')socket.children[0].attrs.class='bg-vendor-icon-inputdatasourcesocketdef';
    if(mode==='missing_settings')settings.remove();
    if(mode==='hidden_ancestor')find('>Outputs').style.display='none';
    if(mode==='hidden_visibility')socket.style.visibility='hidden';
    if(mode==='disabled_done')done.disabled=true;
    if(mode==='hidden_done')done.style.display='none';
    page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
      {expected_build:build,expected_origin:origin,...(mode==='unbound'?{}:{prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}}}),...options},
      async()=>mode==='stale_owner'?{verified:false,reason:'node'}:{verified:true,surface:'wizard',node_id:'node',output_port:port}));
    const raw=await page.execute({mode:'observe'});
    if(mode==='stale_owner'){assert.notEqual(raw.status,'SUCCEEDED');assert.equal(raw.error.code,'PREPARED_NODE_CONTEXT_CHANGED');continue;}
    assert.equal(raw.status,'SUCCEEDED',mode);
    const controls=raw.output.ui.elements.filter(e=>e.allowed_actions.includes('finish_wizard'));
    assert.equal(controls.length,mode==='valid'?1:0,mode);
    if(mode==='valid'){assert.equal(raw.output.wizard.port_context.status,'observed');assert.equal(controls[0].wizard_finish.mode,'output_port');}
    assert.equal(page.events.filter(e=>e==='click').length,0,mode);
  }
});

test('typed output-port finish confirms one gesture and quiet return to the exact graph',async()=>{
  for(const mode of ['valid','wrong_workflow','wrong_node','still_open','mask','churn']){
    const {page}=outputPortFinishFixture(mode),s=await page.observe(),done=s.ui.elements.find(e=>e.wizard_finish?.mode==='output_port');assert.ok(done,mode);
    const r=await page.act({verb:'finish_wizard',ref:done.ref},s),ok=mode==='valid';assert.equal(r.status,ok?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(r.error));assert.equal(page.events.filter(e=>e==='click').length,1,mode);
    const proof=r.trace.find(t=>t.event==='output_port_finish_verified');assert.equal(!!proof,ok,mode);assert.ok(!r.trace.some(t=>t.event==='wizard_finish_graph_verified'||t.event==='input_port_finish_verified'));
    if(ok){assert.equal(proof.port_path.at(-1).label,'Result');assert.equal(proof.node.node_label,'Calc');assert.equal(proof.settings_applied,false);assert.equal(proof.source_identity_verified,false);assert.equal(proof.package_saved,false);assert.ok(r.trace.some(t=>t.event==='output_port_finish_settled'&&t.quiet_samples===3));}
  }
});

function availableGroupFixture() {
 const f=groupingFixture(),{page,base,wizard}=f;
 // No selected data rows, while the stage marker remains present.
 f.container.children=[];
 const grid=page.add('div',base+'grdDataFields;tbl','',{x:600,y:100,width:200,height:300},wizard);grid.attrs.id='available';
 const row=page.add('table',null,'',{x:600,y:100,width:200,height:24},grid);row.attrs={class:'x-grid-item','data-recordindex':'0','data-boundview':'available'};
 const cell=page.add('td',base+'colDisplayName_Region','Region',row.box,row);
 const icon=page.add('div',null,'',{x:602,y:102,width:16,height:16},cell);icon.attrs.class='bg-TBGDataType-dtString';
 return {...f,available:grid,availableRow:row,availableCell:cell,availableIcon:icon};
}
test('available Group fields can be selected before used fields exist',async()=>{
 const f=availableGroupFixture(),s=await f.page.observe();
 const fields=s.wizard.grouping.available_fields;assert.equal(fields.length,1);assert.equal(fields[0].input_type,'string');
 assert.equal(s.wizard.grouping.status,'unobserved');assert.equal(s.wizard.grouping.complete,false);
 const cell=s.ui.elements.find(e=>e.ref===fields[0].cell_ref);assert.equal(cell.grouping_field.role,'available');assert.deepEqual(cell.allowed_actions,['click','double_click','press']);
 const narrowed=(await f.page.execute({mode:'observe',root_ref:cell.ref})).output;
 assert.equal(narrowed.ui.elements.find(e=>e.ref===cell.ref).grouping_field.role,'available');
 const action=await f.page.act({verb:'click',ref:cell.ref},narrowed);assert.equal(action.status,'SUCCEEDED');assert.equal(f.page.events.filter(e=>e==='click').length,1);
});
test('Group available fields reject foreign hidden duplicate or malformed row identity',async()=>{
 for(const mode of ['hidden','duplicate','foreign_grid','foreign_row','wrong_index','summary','unknown_type','duplicate_icon','hidden_icon','foreign_tid']) {
  const f=availableGroupFixture(),{page,availableCell:cell,availableIcon:icon,availableRow:row}=f;
  if(mode==='hidden')cell.style.display='none';
  if(mode==='duplicate')page.add('td',cell.attrs['data-tid'],'Region',cell.box,row);
  if(mode==='foreign_grid')f.available.attrs['data-tid']='MF;TF-2;WizrdMCF;GroupDataWizard;grdDataFields;tbl';
  if(mode==='foreign_row')row.attrs['data-boundview']='foreign';
  if(mode==='wrong_index')row.attrs['data-recordindex']='-1';
  if(mode==='summary')row.attrs.class+=' x-grid-row-summary';
  if(mode==='unknown_type')icon.attrs.class='unknown';
  if(mode==='duplicate_icon'){const extra=page.add('div',null,'',icon.box,cell);extra.attrs.class=icon.attrs.class;}
  if(mode==='hidden_icon')icon.style.display='none';
  if(mode==='foreign_tid')cell.attrs['data-tid']='MF;TF-2;WizrdMCF;GroupDataWizard;colDisplayName_Region';
  const s=await page.observe();assert.equal(s.wizard.grouping.available_fields.length,0,mode);
  assert.equal(s.ui.elements.some(e=>e.grouping_field?.role==='available'),false,mode);
 }
});

test('Group blank summary may reuse the final data-cell tid without becoming actionable',async()=>{
 for(const mode of ['native','nonblank','other_key','duplicate_summary']) {
  const f=groupingFixture(),last=f.records.at(-1),summary=last.summaryRow.children[0];
  summary.attrs['data-tid']=last.cell.attrs['data-tid'];
  if(mode==='nonblank')summary.ownText='other';
  if(mode==='other_key')summary.attrs['data-tid']=f.base+'colUsedFields_unknown';
  if(mode==='duplicate_summary')last.summaryRow.append(new Element('td',summary.attrs,'',summary.box));
  const s=await f.page.observe(),g=s.wizard.grouping;
  assert.equal(g.status,mode==='native'?'rendered_grouping_rows':'unobserved',mode);
  if(mode==='native') {
   const candidates=s.ui.elements.filter(e=>e.tid===last.cell.attrs['data-tid']);
   assert.equal(candidates.length,1);assert.equal(candidates[0].grouping_field.field_key,'Id');
   assert.notEqual(candidates[0].identity.anchor_tid,last.cell.attrs['data-tid']);
  }
 }
});


test('scan time budget accepts 500 ms but rejects 501 ms before issuing references', async () => {
  for (const elapsed of [500, 501]) {
    const clock = fixtureClock(), page = new Page({ clock: clock.Date });
    page.add('button', 'Safe;btnAction', 'Action');
    const query = page.document.querySelectorAll.bind(page.document);
    let first = true;
    page.document.querySelectorAll = selector => {
      if (first) { first = false; clock.advance(elapsed); }
      return query(selector);
    };
    const outcome = await page.execute({ mode: 'observe', discover_roots: true });
    assert.equal(outcome.status, elapsed === 500 ? 'SUCCEEDED' : 'NOT_APPLIED');
    if (elapsed === 501) {
      assert.equal(outcome.error.code, 'UI_SCAN_LIMIT');
      assert.equal(outcome.output.scan.complete, false);
      assert.equal(outcome.output.ui, undefined);
      assert.equal(outcome.effect_possible, false);
    }
    assert.deepEqual(page.events, []);
  }
});

test('action deadline expires before the gesture with a controlled clock', async () => {
  const clock = fixtureClock(), page = new Page({ clock: clock.Date });
  page.add('button', 'Safe;btnAction', 'Action');
  const snapshot = await page.observe(), target = snapshot.ui.elements.find(e => e.tid === 'Safe;btnAction');
  const locator = page.locator.bind(page);
  page.locator = selector => {
    const found = locator(selector), count = found.count;
    found.count = async () => { clock.advance(15000); return count(); };
    return found;
  };
  const outcome = await page.act({ verb: 'click', ref: target.ref }, snapshot);
  assert.equal(outcome.status, 'NOT_APPLIED');
  assert.equal(outcome.error.code, 'UI_DEADLINE_EXCEEDED');
  assert.equal(outcome.effect_possible, false);
  assert.deepEqual(page.events, []);
});

test('wide import definitions have addressed pages with one schema identity and explicit completeness',async()=>{
 const page=new Page(),c=importCoverageFixture(page,12);c.body.scrollWidth=c.header.scrollWidth=1620;
 const read=async offset=>(await page.execute({mode:'observe',import_column_page:{offset,limit:8}})).output.wizard.import_columns;
 const first=await read(0),last=await read(8);
 assert.equal(first.page.status,'complete_definition_page');assert.equal(first.page.total_columns,12);
 assert.equal(first.page.returned,8);assert.equal(first.page.next_offset,8);assert.equal(last.page.next_offset,null);
 assert.equal(first.page.schema_id,last.page.schema_id);assert.deepEqual(last.fields.map(f=>f.index),[8,9,10,11]);
 assert.equal(first.complete,false);assert.equal(first.page.source_schema_verified,false);assert.equal(first.definition_coverage.status,'partial');
 const legacy=(await page.observe()).wizard.import_columns;assert.equal(legacy.fields.length,8);assert.equal(legacy.page,undefined);
 c.cols[11].cells[1].ownText='changed label';
 assert.notEqual((await read(0)).page.schema_id,first.page.schema_id,'changing a field outside the page invalidates its definition identity');
});

test('a malformed field outside the selected page prevents complete schema pagination',async()=>{
 for(const fault of ['missing_cell','hidden_cell','missing_last','duplicate_header','gap','editor','foreign_header']) {
  const page=new Page(),c=importCoverageFixture(page,12);
  if(fault==='missing_cell')c.cols[11].cells[1].remove();
  if(fault==='hidden_cell')c.cols[11].cells[1].style.display='none';
  if(fault==='missing_last')c.cols[11].header.attrs.class='x-column-header';
  if(fault==='duplicate_header')page.add('div',c.cols[11].prefix,'Field11',c.cols[11].header.box,c.header).attrs.class='x-column-header';
  if(fault==='gap')c.cols[11].header.attrs['data-tid']=c.base+';normalHeaderCt;12';
  if(fault==='editor')page.add('div',c.base+';tbl;celleditor;cbx','',c.cols[0].header.box,c.form);
  if(fault==='foreign_header'){c.cols[11].header.remove();c.form.append(c.cols[11].header);}
  const result=await page.execute({mode:'observe',import_column_page:{offset:0,limit:8}});
  assert.equal(result.output.wizard.import_columns.page.status,'unverified',fault);
 }
});

test('import definition page rejects unbounded addresses before the browser',()=>{
 for(const p of [{offset:-1,limit:8},{offset:1000,limit:8},{offset:0,limit:9},{offset:0,limit:0},{offset:0.5,limit:1},{offset:0,limit:8,extra:1}])
  assert.throws(()=>makeWorkspaceUiCode({mode:'observe',import_column_page:p}),/bounded offset/);
});

test('horizontal scroll changes only its exact observed owner and refuses stale state and boundaries',async()=>{
 const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;
 const outer=page.add('div','Outer','',{x:10,y:60,width:500,height:500}),inner=page.add('div','Inner','',{x:20,y:80,width:300,height:300},outer);
 for(const [el,width]of [[outer,2000],[inner,1000]])Object.assign(el,{scrollLeft:0,scrollWidth:width,clientWidth:300,style:{overflowX:'auto'}});
 page.add('button','Inner;btnRow','Row',undefined,inner);
 const initial=await page.observe(),target=initial.ui.elements.find(e=>e.tid==='Inner;btnRow');
 assert.ok(target.allowed_actions.includes('scroll_horizontal'));
 const result=await page.act({verb:'scroll_horizontal',ref:target.ref,delta_x:1000},initial);
 assert.equal(result.status,'SUCCEEDED');assert.equal(inner.scrollLeft,700);assert.equal(outer.scrollLeft,0);
 assert.ok(result.trace.some(e=>e.event==='ui_scroll_applied'&&e.axis==='horizontal'&&e.to===700));
 const stale=await page.act({verb:'scroll_horizontal',ref:target.ref,delta_x:-100},initial);
 assert.equal(stale.status,'NOT_APPLIED');assert.equal(stale.effect_possible,false);assert.equal(inner.scrollLeft,700);
 const boundary=await page.act({verb:'scroll_horizontal',ref:target.ref,delta_x:100},result.output);
 assert.equal(boundary.status,'NOT_APPLIED');assert.equal(boundary.effect_possible,false);assert.equal(outer.scrollLeft,0);
 for(const delta of [0,1001,-1001,1.5,'100'])assert.throws(()=>validateUiAction({verb:'scroll_horizontal',ref:target.ref,delta_x:delta}),/delta_x/);
 assert.throws(()=>validateUiAction({verb:'scroll_horizontal',ref:target.ref,delta_y:1}),/fields/);
});

test('addressed output definitions cover clipped rows while legacy coverage stays partial',async()=>{
 const page=new Page({ clock: fixtureClock().Date }),c=mappingCoverageFixture(page,66);
 const first=await page.execute({mode:'observe',output_column_page:{offset:0,limit:8}});
 assert.equal(first.output.wizard.output_columns.definition_coverage.status,'partial');
 const defs=first.output.wizard.output_columns;assert.equal(defs.page.status,'complete_definition_page');assert.equal(defs.page.total_columns,66);
 const last=await page.execute({mode:'observe',output_column_page:{offset:64,limit:8}});
 assert.equal(last.output.wizard.output_columns.page.schema_id,defs.page.schema_id);
 assert.deepEqual(last.output.wizard.output_columns.fields.map(f=>f.index),[64,65]);
 assert.equal(last.output.wizard.output_columns.page.next_offset,null);
 c.rows[65].children[0].ownText='Changed';
 const changed=await page.execute({mode:'observe',output_column_page:{offset:0,limit:8}});
 assert.notEqual(changed.output.wizard.output_columns.page.schema_id,defs.page.schema_id);
 assert.equal(changed.output.wizard.output_columns.complete,false);
});
for(const kind of ['missing_tail','virtual_scroll_extent','gap','missing_source','filter','foreign_boundview'])test('output page refuses '+kind,async()=>{
 const page=new Page(),c=mappingCoverageFixture(page,12);
 if(kind==='missing_tail')c.container.box.height+=25;
 if(kind==='virtual_scroll_extent')c.body.scrollHeight=1000;
 if(kind==='gap')c.rows[11].attrs['data-recordindex']='12';
 if(kind==='missing_source')c.rows[11].children[2].remove();
 if(kind==='filter')c.input.value='Field0';
 if(kind==='foreign_boundview')c.rows[11].attrs['data-boundview']='other';
 const result=await page.execute({mode:'observe',output_column_page:{offset:0,limit:8}});
 assert.equal(result.output.wizard.output_columns.page.status,'unverified_definition_page');
});

test('initial wrong-delimiter layout can be ready without accepting an overlong field name',async()=>{
 const page=new Page(),c=importCoverageFixture(page,1);
 c.cols[0].cells[0].ownText='Header_'.repeat(30);c.cols[0].cells[1].ownText='Header_'.repeat(30);
 const r=await page.execute({mode:'observe',import_column_page:{offset:0,limit:8}}),cols=r.output.wizard.import_columns;
 assert.equal(cols.initial_layout.status,'rendered_definition_layout');assert.equal(cols.page.status,'unverified');assert.equal(cols.complete,false);
 c.cols[0].cells[2].ownText='';
 const pending=await page.execute({mode:'observe',import_column_page:{offset:0,limit:8}});
 assert.equal(pending.output.wizard.import_columns.initial_layout.status,'unverified');
});

function bufferedMappingFixture(fault) {
 const page=new Page(),c=mappingCoverageFixture(page,20);
 const records=c.rows.map((row,i)=>{row.attrs['data-recordid']=String(100+i);return {isModel:true,internalId:100+i,
  data:{Index:i,Name:'Field'+i,DisplayName:'Field'+i,DataType:4,DataKind:1,DefaultUsageType:0}};});
 for(const row of c.rows.slice(12))row.remove();c.container.box.height=12*25;
 const source={items:records},collection={items:records,getSource:()=>source};
 const store={$className:'Ext.data.Store',isLoading:()=>false,getData:()=>collection,getCount:()=>20,getTotalCount:()=>20};
 page.context.Ext={getCmp:()=>({el:{dom:c.body},getStore:()=>store})};
 const evaluate=page.evaluate.bind(page);page.evaluate=(fn,arg)=>evaluate(fn,arg&&Object.hasOwn(arg,'mappingPage')?{...arg,definitionPrefix:'MF;TF-1;WizrdMCF'}:arg);
 if(fault==='missing_source')c.rows[2].children[2].remove();
 if(fault==='foreign_record')c.rows[2].attrs['data-recordid']='999';
 if(fault==='name_mismatch')records[2].data.Name='Different';
 if(fault==='filtered_store')source.items=[...records,{isModel:true}];
 if(fault==='incomplete_store')collection.items=records.slice(0,12);
 if(fault==='loading')store.isLoading=()=>true;
 if(fault==='foreign_view')page.context.Ext.getCmp=()=>({el:{dom:c.form},getStore:()=>store});
 return {page,c,records};
}
test('buffered output page binds rendered records without declaring the prefix complete',async()=>{
 const {page}=bufferedMappingFixture();
 const first=await page.execute({mode:'observe',output_column_page:{offset:0,limit:8}});
 assert.equal(first.status,'SUCCEEDED');assert.equal(first.output.wizard.output_columns.page.status,'complete_definition_page');
 assert.equal(first.output.wizard.output_columns.page.total_columns,20);
 const tail=await page.execute({mode:'observe',output_column_page:{offset:8,limit:8}});
 assert.equal(tail.output.wizard.output_columns.page.status,'rendered_definition_window');
 assert.equal(tail.output.wizard.output_columns.fields.length,0);
 assert.equal(tail.output.wizard.output_columns.page.schema_id,first.output.wizard.output_columns.page.schema_id);
});
for(const fault of ['foreign_record','name_mismatch','filtered_store','incomplete_store','loading','foreign_view','missing_source'])
 test('buffered output page refuses '+fault,async()=>{
  const {page}=bufferedMappingFixture(fault),r=await page.execute({mode:'observe',output_column_page:{offset:0,limit:8}});
  assert.equal(r.output.wizard.output_columns.page.status,'unverified_definition_page');
 });

for(const property of ['name','label'])for(const scoped of [false,true])test('import text editor separates the hidden original from the uncommitted draft: '+property+' (scoped='+scoped+')',async()=>{
 const page=new Page(),c=importCoverageFixture(page,3),row=property==='name'?0:1,cell=c.cols[0].cells[row];
 const original=cell.ownText;cell.ownText='';cell.attrs.class='x-grid-cell-selected';
 const old=page.add('div',null,original,cell.box,cell);old.attrs.class='x-grid-cell-inner';old.style.visibility='hidden';
 const base='MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;tbl;celleditor;txt';
 const editor=page.add('div',base,'',cell.box,c.body),input=page.add('input',null,'',cell.box,editor);input.value='DraftValue';
 if(scoped){const rootRef=(await page.observe()).wizard.root_ref,evaluate=page.evaluate.bind(page);page.evaluate=(fn,arg)=>evaluate(fn,arg&&Object.hasOwn(arg,'mappingPage')?{...arg,definitionPrefix:'MF;TF-1',rootRef}:arg);}
 const first=await page.execute({mode:'observe',import_column_page:{offset:0,limit:8}});
 assert.equal(first.output.wizard.import_columns.page.status,'unverified');
 const e=first.output.wizard.import_column_editor;assert.equal(e.status,'observed');assert.equal(e.property,property);
 assert.equal(e.original_value,original);assert.equal(e.value,'DraftValue');assert.equal(e.settings_applied,false);
 const control=first.output.ui.elements.find(c=>c.ref===e.input_ref);
 assert.ok(control?.allowed_actions.includes('fill'),JSON.stringify({control,editor:e,scan:first.output.scan}));
 assert.doesNotThrow(()=>validateUiAction({verb:'fill',ref:e.input_ref,text:'NewValue'},first.output));
 assert.doesNotThrow(()=>validateUiAction({verb:'press',ref:e.input_ref,key:'Enter'},first.output));
 old.remove();const second=await page.execute({mode:'observe',import_column_page:{offset:0,limit:8}});
 assert.equal(second.output.wizard.import_column_editor.status,'unobserved_or_ambiguous');
});

test('an empty native process console exposes only its bound context gesture and completed filter',async()=>{
 for(const mode of ['valid','foreign_store','foreign_dom','loading','hidden']) {
  const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;const panel=page.add('div','ConsoleForm','',{x:0,y:400,width:900,height:300});
  const store={$className:'Ext.data.TreeStore',isLoading:()=>mode==='loading'},views={};
  const grids=['treepanel;tree','grd;tbl'].map((suffix,i)=>{
    const e=page.add('div','ConsoleForm;ProgressForm;trpProgress;'+suffix,'',{x:i*400,y:420,width:400,height:250},panel);
    e.attrs.id='grid'+i;e.id=e.attrs.id;
    views[e.id]={el:{dom:mode==='foreign_dom'?{}:e},getStore:()=>mode==='foreign_store'&&i?{}:store};return e;
  });
  page.context.Ext={getCmp:id=>views[id]};
  if(mode==='hidden')panel.style.display='none';
  const portal=page.add('div','mnContextMenu','',{x:40,y:430,width:200,height:80});
  const filter=page.add('div','mnContextMenu;mniShowCompletedProcesses','Completed',{x:45,y:435,width:150,height:25},portal);filter.attrs.class='x-menu-item-unchecked';
  page.add('div','mnContextMenu;mniShowNodeToProcess','Show Node',{x:45,y:465,width:150,height:25},portal);
  const s=await page.observe(),gs=s.ui.elements.filter(e=>e.process_grid),menus=s.ui.elements.filter(e=>e.process_menu);
  assert.equal(gs.length,mode==='valid'?2:0,mode);assert.equal(menus.length,mode==='valid'?1:0,mode);
  if(mode==='valid') {
    assert.deepEqual(gs[1].allowed_actions,['right_click','press'],JSON.stringify(gs[1]));assert.equal(menus[0].process_menu.checked,false);
    assert.equal(s.process_console.execution_verified,false);
    const r=await page.act({verb:'right_click',ref:gs[1].ref},s);assert.equal(r.status,'SUCCEEDED');
    assert.equal(r.output.verification_required,true);
  }
 }
});

test('Table add/enter controls are bound to native output panels, not repeated card labels',async()=>{
 for(const mode of ['valid','clipped_add','numbered','hidden_enter','foreign_panel','foreign_card','wrong_vendor','duplicate_add']) {
  const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;
  class ViewsForm{};class BrowseViewVendor{};
  const root=page.add('div','MF;TF-1;ViewsForm','',{x:0,y:50,width:900,height:700});
  const panel=page.add('div','MF;TF-1;ViewsForm;cntPorts;11111111-1111-1111-1111-111111111111','',{x:50,y:100,width:600,height:400},root);
  const add=page.add('div','MF;TF-1;ViewsForm;ViewerAddCard'+(mode==='numbered'?'-1':''),'Add',{x:70,y:120,width:150,height:120},panel);
  if(mode==='clipped_add')add.box.y=770;
  const cardTid='MF;TF-1;ViewsForm;ViewerCard'+(mode==='numbered'?'-1':'');
  const card=page.add('div',cardTid,'Table',{x:240,y:120,width:150,height:120},panel);
  const hoverEnter=page.add('button',cardTid+';btnEnter','Table',{x:250,y:130,width:100,height:30},card);
  if(mode==='hidden_enter')hoverEnter.box={x:250,y:130,width:0,height:0};
  const nativePanel={el:{dom:panel}},nativeCard={FView:{el:{dom:card}}};
  const model=Object.assign(new ViewsForm(),{FView:{el:{dom:root}},FPortList:{'11111111-1111-1111-1111-111111111111':{Type:0,Panel:nativePanel}},
    FViewDescList:{'22222222-2222-2222-2222-222222222222':{PortPanel:nativePanel,ViewerCard:nativeCard,Vendor:new BrowseViewVendor()}}});
  page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model}})}}}}};
  if(mode==='foreign_panel')nativePanel.el.dom=page.add('div','foreign');
  if(mode==='foreign_card')nativeCard.FView.el.dom=page.add('div','foreign');
  if(mode==='wrong_vendor')model.FViewDescList['22222222-2222-2222-2222-222222222222'].Vendor={};
  if(mode==='duplicate_add')page.add('div',add.attrs['data-tid'],'Other add',{x:450,y:120,width:100,height:100},panel);
  const s=await page.observe(),adds=s.ui.elements.filter(e=>e.viewer_card?.kind==='add'),enters=s.ui.elements.filter(e=>e.viewer_card?.kind==='enter');
  assert.equal(adds.length,['foreign_panel','duplicate_add'].includes(mode)?0:1,mode);
  assert.equal(enters.length,['foreign_panel','foreign_card','wrong_vendor'].includes(mode)?0:1,mode);
  if(mode==='clipped_add'){let clicked;const click=page.mouse.click;page.mouse.click=async(x,y,...args)=>{clicked={x,y};return click(x,y,...args);};const result=await page.act({verb:'click',ref:adds[0].ref},s);assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.ok(clicked.y<800);}
  if(enters.length){assert.equal(enters[0].tid,cardTid);assert.deepEqual(enters[0].allowed_actions,['enter_table']);assert.equal(enters[0].viewer_card.view_guid,'22222222-2222-2222-2222-222222222222');}
 }
});

function pagedTableFixture() {
 const f=candidateTableFixture();f.grid.id=f.grid.attrs.id;
 const records=Array.from({length:66},(_,i)=>({isModel:true,internalId:String(100+i),data:{Index:i,Name:i===0?'Region':i===1?'Amount':'Field'+i,
  DisplayName:i===0?'Region':i===1?'Amount':'Field'+i,SourceColumnIndex:i,DataType:i===0?5:3,InGrid:true,DisplayFormat:'0.00'}}));
 for(const [i,row] of f.rows.entries())row.attrs['data-recordid']=records[i].internalId;
 const store={$className:'Ext.data.Store',isLoading:()=>false,getCount:()=>records.length,getData:()=>({items:records})};
 f.page.context.Ext={getCmp:id=>id==='view-table'?{el:{dom:f.grid},getStore:()=>store}:undefined};
 return {...f,records,store};
}
test('Table format page separates full cached metadata from painted editable rows',async()=>{
 const f=pagedTableFixture();
 const first=(await f.page.execute({mode:'observe',table_format_page:{offset:0,limit:8}})).output;
 assert.equal(first.table_settings.format.page.total_columns,66);assert.equal(first.table_settings.format.metadata_fields.length,8);
 assert.equal(first.table_settings.format.page.status,'rendered_definition_window');assert.equal(first.table_settings.format.fields.length,2);
 assert.equal(first.table_settings.format.fieldlist_complete,false);
 const last=(await f.page.execute({mode:'observe',table_format_page:{offset:64,limit:8}})).output;
 assert.equal(last.table_settings.format.page.schema_id,first.table_settings.format.page.schema_id);
 assert.equal(last.table_settings.format.metadata_fields[1].name_key,'Field65');assert.equal(last.table_settings.format.fields.length,0);
 assert.equal(last.ui.elements.filter(e=>e.table_field).length,0);
 f.records[0].data.DisplayFormat='0';
 const formatChange=(await f.page.execute({mode:'observe',table_format_page:{offset:0,limit:8}})).output;
 assert.equal(formatChange.table_settings.format.page.schema_id,first.table_settings.format.page.schema_id);
 f.records[65].data.Name='Renamed';
 const schemaChange=(await f.page.execute({mode:'observe',table_format_page:{offset:0,limit:8}})).output;
 assert.notEqual(schemaChange.table_settings.format.page.schema_id,first.table_settings.format.page.schema_id);
});
for(const mode of ['foreign_record','type_mismatch','label_mismatch','loading','duplicate_source','duplicate_name','accessor'])
 test('Table format cached page refuses '+mode,async()=>{
  const f=pagedTableFixture();
  if(mode==='foreign_record')f.rows[0].attrs['data-recordid']='other';
  if(mode==='type_mismatch')f.records[0].data.DataType=3;
  if(mode==='label_mismatch')f.records[0].data.DisplayName='other';
  if(mode==='loading')f.store.isLoading=()=>true;
  if(mode==='duplicate_source')f.records[2].data.SourceColumnIndex=0;
  if(mode==='duplicate_name')f.records[2].data.Name='Region';
  if(mode==='accessor')Object.defineProperty(f.records[0].data,'Name',{get(){throw Error('Getter must not execute');}});
  const result=await f.page.execute({mode:'observe',table_format_page:{offset:0,limit:8}});
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.table_settings.format.page.schema_id,undefined);
  assert.equal(result.output.ui.elements.filter(e=>e.table_field).length,0);
 });

for(const mode of ['valid','foreign_store','foreign_grid','foreign_port','wrong_vendor','hidden'])
 test('Table horizontal control binds native owner: '+mode,async()=>{
  const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;
  const evaluate=page.evaluate.bind(page);page.evaluate=(fn,arg)=>evaluate(fn,arg&&Object.hasOwn(arg,'mappingPage')?{...arg,definitionPrefix:'MF;TF-1'}:arg);
  class ViewsForm{};class BrowseViewVendor{};
  const owner=page.add('div','MF;TF-1;ViewsForm','',{x:0,y:50,width:900,height:700});
  const key='MF;TF-1;ViewsForm;BrowseView',root=page.add('div',key,'',{x:0,y:50,width:900,height:700},owner);
  const grid=page.add('div',key+';grdData;grd-1;tbl','',{x:50,y:100,width:800,height:600},root);grid.id='native-grid';grid.attrs.id=grid.id;
  Object.assign(grid,{scrollLeft:0,scrollWidth:3000,clientWidth:800});grid.style.overflowX='auto';
  const store={$className:'Ext.data.BufferedStore'},panel={},base={FView:{el:{dom:root}},FBrowseViewDataSourceController:{FDataStore:store}};
  const view={BaseView:base,PortPanel:panel,Vendor:new BrowseViewVendor()};
  const model=Object.assign(new ViewsForm(),{FView:{el:{dom:owner}},FPortList:{port:{Type:0,Panel:panel}},FViewDescList:{view}});
  page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model}})}}}}};
  page.context.Ext={getCmp:id=>id===grid.id?{el:{dom:mode==='foreign_grid'?{}:grid},getStore:()=>mode==='foreign_store'?{}:store}:undefined};
  if(mode==='foreign_port')view.PortPanel={};if(mode==='wrong_vendor')view.Vendor={};if(mode==='hidden')root.style.display='none';
  const s=await page.observe(),controls=s.ui.elements.filter(e=>e.table_scroller);
  assert.equal(controls.length,mode==='valid'?1:0,mode);
  if(mode==='valid') {assert.deepEqual(controls[0].allowed_actions,['scroll_horizontal']);assert.deepEqual(controls[0].table_scroller,{view_guid:'view',port_guid:'port',table_tid:key});
   assert.deepEqual(controls[0].signature.table_scroller,controls[0].table_scroller);assert.equal(controls[0].label,'');}
 });

for(const mode of ['owned','hidden','foreign','duplicate','transient']) {
 test('source validation after one Next gesture: '+mode,async()=>{
  const page=new Page(),c=wizardStepFixture(page);
  c.marker.attrs['data-tid']=c.base+';ImportTextFilePreviewWizard;edtFileName';
  page.add('button',c.base+';btnError','Подробнее',{x:100,y:100,width:10,height:10},c.form);
  const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_step);
  let error,waits=0;
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);
   const owner=mode==='foreign'?page.add('div','MF;TF-2;WizrdMCF;ImportTextFilePreviewWizard;edtFileName'):c.marker;
   error=page.add('div',null,'Файл "/missing.csv" не найден',undefined,owner);error.attrs.class='x-form-error-msg';
   if(mode==='hidden')error.style.display='none';
   if(mode==='duplicate'){const second=page.add('div',null,'Other',undefined,owner);second.attrs.class='x-form-error-msg';}
  };
  page.waitForTimeout=async()=>{waits++;if(mode==='transient' && waits===1){error.remove();c.advance();}};
  const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:'input_mapping'},snapshot);
  assert.equal(page.events.filter(e=>e==='click').length,1);
  if(mode==='owned'){
   assert.equal(result.status,'AMBIGUOUS');assert.equal(result.effect_possible,true);
   assert.equal(result.error.code,'WIZARD_SOURCE_VALIDATION_FAILED');assert.match(result.error.message,/missing.csv/);
   assert.equal(waits,1);assert.ok(result.trace.some(e=>e.event==='wizard_source_validation_failed'));
  }else if(mode==='transient')assert.equal(result.status,'SUCCEEDED');
  else {assert.equal(result.error.code,'WIZARD_STEP_NOT_CONFIRMED');assert.ok(!result.trace.some(e=>e.event==='wizard_source_validation_failed'));}
 });
}

test('Table datetime selection exposes only its bound date formatting controls',async()=>{
 const f=candidateTableFixture();f.rows[1].querySelectorAll('.bg-TBGDataType-dtFloat')[0].attrs.class='bg-TBGDataType-dtDateTime';
 const state=(await f.page.execute({mode:'observe'})).output.table_settings.format;
 assert.equal(state.selected_numeric,undefined);assert.equal(state.selected_datetime.name_key,'Amount');
 assert.equal(state.selected_datetime.source_index,1);assert.equal(state.selected_datetime.format_string.value,'0.00');
 assert.equal(state.selected_datetime.losslessness_verified,false);
 f.rows[0].attrs.class+=' x-grid-item-selected';
 assert.equal((await f.page.execute({mode:'observe'})).output.table_settings.format.selected_datetime,undefined);
});

test('native process scroll uses only the observed console grid owner',async()=>{
 const page=new Page();page.waitForTimeout=async()=>{};page.context.innerWidth=1000;page.context.innerHeight=800;
 const panel=page.add('div','ConsoleForm','',{x:0,y:400,width:900,height:300});
 const store={$className:'Ext.data.TreeStore',isLoading:()=>false},views={};
 const grids=['treepanel;tree','grd;tbl'].map((suffix,i)=>{
  const e=page.add('div','ConsoleForm;ProgressForm;trpProgress;'+suffix,'',{x:i*400,y:420,width:400,height:154},panel);
  Object.assign(e,{scrollTop:0,scrollHeight:241,clientHeight:154});e.style.overflowY='auto';e.attrs.id='process-grid'+i;e.id=e.attrs.id;
  views[e.id]={el:{dom:e},getStore:()=>store};return e;
 });
 page.context.Ext={getCmp:id=>views[id]};
 const s=await page.observe(),owner=s.ui.elements.find(e=>e.process_grid?.grid_id===grids[0].id);
 assert.ok(owner.allowed_actions.includes('scroll'));
 const result=await page.act({verb:'scroll',ref:owner.ref,delta_y:87},s);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(grids[0].scrollTop,87);assert.equal(grids[1].scrollTop,0);
 assert.ok(result.trace.some(t=>t.event==='ui_scroll_applied'&&t.owner_ref===owner.ref&&t.from===0&&t.to===87));
 const stale=await page.act({verb:'scroll',ref:owner.ref,delta_y:87},s);
 assert.notEqual(stale.status,'SUCCEEDED');assert.equal(grids[0].scrollTop,87);
});

function scrolledProcessWindowFixture() {
 const page=new Page();page.context.innerWidth=1000;page.context.innerHeight=800;
 const panel=page.add('div','ConsoleForm','',{x:0,y:400,width:900,height:300});
 const model={isModel:true,internalId:'record-5',data:{id:'5',loaded:true},childNodes:[]};
 const root={isModel:true,data:{loaded:true},childNodes:[model]};
 const store={$className:'Ext.data.TreeStore',isLoading:()=>false,getRoot:()=>root,getAt:i=>i===4?model:null},views={};
 const grids=['treepanel;tree','grd;tbl'].map((suffix,i)=>{
  const e=page.add('div','ConsoleForm;ProgressForm;trpProgress;'+suffix,'',{x:i*400,y:420,width:400,height:154},panel);
  Object.assign(e,{scrollTop:87,scrollHeight:241,clientHeight:154});e.style.overflowY='auto';e.attrs.id='process-window'+i;e.id=e.attrs.id;
  views[e.id]={el:{dom:e},getStore:()=>store};return e;
 });
 const rows=grids.map((g,i)=>{
  const row=page.add('table',null,'',{x:i*400,y:440,width:400,height:24},g);
  Object.assign(row.attrs,{class:'x-grid-item','data-recordid':'record-5','data-recordindex':'4','data-boundview':g.id});return row;
 });
 const id=page.add('td','ConsoleForm;ProgressForm;colId_Root>Task','5',{x:0,y:440,width:40,height:24},rows[0]);
 const cell=page.add('td','ConsoleForm;ProgressForm;colProcess_Root>Task','Task',{x:40,y:440,width:300,height:24},rows[0]);
 const progress=page.add('td','ConsoleForm;ProgressForm;colProgress_Root>Task','',{x:400,y:440,width:300,height:24},rows[1]);
 page.context.Ext={getCmp:id=>views[id]};return {page,store,root,model,grids,rows,id,cell,progress};
}

test('scrolled process window offers native-bound rows without claiming complete history',async()=>{
 const f=scrolledProcessWindowFixture(),s=await f.page.observe();
 assert.equal(s.process_console.status,'rendered_process_window');
 assert.equal(s.process_console.top_level_complete,false);assert.equal(s.process_console.details_complete,false);
 assert.equal(s.process_console.top_level_rendered_coverage,false);
 const row=s.ui.elements.find(e=>e.process_row?.record_id==='record-5');
 assert.ok(row?.allowed_actions.includes('right_click'));assert.equal(row.process_row.record_index,4);
});

test('scrolled process window refuses detached, foreign and clipped row bindings',async()=>{
 const changes=[f=>{f.store.getAt=()=>({...f.model});},f=>{f.rows[1].attrs['data-recordid']='foreign';},
  f=>{f.rows[1].attrs['data-boundview']='foreign';},f=>{f.rows[1].attrs['data-recordindex']='3';},
  f=>{f.id.ownText='6';},f=>{f.progress.attrs['data-tid']='ConsoleForm;ProgressForm;colProgress_Root>Other';},
  f=>{f.cell.box.y=560;},f=>{f.root.data.loaded=false;},f=>{f.model.data.loading=true;},
  f=>{f.root.childNodes.push(f.model);}];
 for(const change of changes){const f=scrolledProcessWindowFixture();change(f);const s=await f.page.observe();
  assert.equal(s.ui.elements.some(e=>e.process_row),false);assert.notEqual(s.process_console.status,'rendered_process_window');}
});

test('global output editor is typed only when its native record belongs to the active mapping',async()=>{
 for(const mappingForm of ['ColumnsMappingEngineOutputPortWizard','DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard']) for(const mode of ['bound','foreign_record','foreign_wizard','wrong_index']) {
  const page=new Page(),base='MF;TF-1;WizrdMCF;',wizard=page.add('div',base.slice(0,-1));
  const stem=base+mappingForm+';';page.add('button',stem+'btnAddMappingColumn','',undefined,wizard);
  const grid=page.add('div',stem+'grdTargetColumns;tbl','',undefined,wizard);grid.id='mapping-view';grid.attrs.id=grid.id;
  const row=page.add('table',null,'',undefined,grid);row.attrs={class:'x-grid-item-selected','data-recordindex':mode==='wrong_index'?'1':'0','data-recordid':'r1','data-boundview':grid.id};
  page.add('td',stem+'colName_A','A',undefined,row);
  const label=page.add('td',stem+'colDisplayName_A','A',undefined,row);page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dtInteger';
  page.add('td',stem+'colDataKind_A','Дискретный',undefined,row);page.add('td',stem+'colDefaultUsageType_A','Не задано',undefined,row);
  const form=page.add('div','EditColumnDefForm');form.id='output-editor';form.attrs.class='x-window';
  for(const [key,value] of [['edtName','A'],['edtDisplayName','A'],['cbxDataType','Целый'],['cbxDataKind','Дискретный'],['cbxUsageType','Не задано']]) {
   const owner=page.add('div','EditColumnDefForm;'+key,'',undefined,form),input=page.add('input',null,'',undefined,owner);input.value=value;
  }
  const record={isModel:true,internalId:'r1'},store={$className:'Ext.data.Store',isLoading:()=>false,getAt:i=>i===0?record:null};
  const native={FView:{el:{dom:form}},FAddMode:false,Records:[mode==='foreign_record'?{...record}:record]};
  page.context.Ext={getCmp:id=>id===form.id?{Controller:native}:id===grid.id?{el:{dom:grid},getStore:()=>store}:null};
  page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FView:{el:{dom:mode==='foreign_wizard'?form:wizard}}}}})}}}}};
  for(const discover_roots of [false,true]) {
   const reply=await page.execute({mode:'observe',discover_roots});assert.equal(reply.status,'SUCCEEDED');const s=reply.output;
   assert.equal(s.wizard.column_parameters.status,mode==='bound'?'observed':'ambiguous',mappingForm+':'+mode+':'+discover_roots);
   if(!discover_roots)assert.equal(s.ui.elements.some(e=>e.wizard_field?.scope==='output_column'),mode==='bound',mode);
  }
 }
});

test('output field cells are actionable only in a complete observed definition',async()=>{
 for(const fault of ['none','filter','wrong_view']) {
  const page=new Page(),f=mappingCoverageFixture(page);
  if(fault==='filter')f.input.value='Field';if(fault==='wrong_view')f.rows[0].attrs['data-boundview']='foreign';
  const s=await page.observe(),controls=s.ui.elements.filter(e=>e.output_column);
  if(fault==='none'){assert.equal(controls.length,4);assert.ok(controls.every(e=>e.allowed_actions.includes('double_click')));assert.ok(controls.every(e=>e.signature.output_column.name===e.output_column.name));}
  else assert.equal(controls.length,0);
 }
});

test('output cell gestures recheck the visible point when the center is covered',async()=>{
 for(const mode of ['partial','covered_after_read']) {
  const page=new Page(),f=mappingCoverageFixture(page),cell=f.rows[0].children[0];
  const original=page.document.elementFromPoint.bind(page.document);let covered=false;
  page.document.elementFromPoint=(x,y)=>x>=cell.box.x&&x<=cell.box.x+cell.box.width&&y>=cell.box.y&&y<=cell.box.y+cell.box.height
   ?!covered&&y<cell.box.y+8?cell:page.document.body:original(x,y);
  const s=await page.observe(),target=s.ui.elements.find(e=>e.tid===f.base+'colName_Field0');
  assert.ok(target.allowed_actions.includes('double_click'));assert.ok(target.interaction.point.y<cell.box.y+8);
  if(mode==='covered_after_read')covered=true;
  const result=await page.act({verb:'double_click',ref:target.ref},s);
  assert.equal(result.status==='SUCCEEDED',mode==='partial');
  assert.equal(page.events.filter(e=>e==='double_click').length,mode==='partial'?1:0);
  if(mode==='partial')assert.deepEqual(page.clickedPoints.at(-1),{...target.interaction.point,clickCount:2});
 }
});

test('file row gestures recheck the visible point when the center is covered',async()=>{
 for(const mode of ['partial','covered_after_read']) {
  const page=new Page(),table=page.add('div','MF;TF-1;FileStorageForm;pnlFileStorage;tbl');
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const row=page.add('table',null,'',undefined,table);row.attrs.class='x-grid-item';
  const cell=page.add('td','MF;TF-1;FileStorageForm;colName_sample_csv','sample.csv',undefined,row);
  const original=page.document.elementFromPoint.bind(page.document);let covered=false;
  page.document.elementFromPoint=(x,y)=>x>=cell.box.x&&x<=cell.box.x+cell.box.width&&y>=cell.box.y&&y<=cell.box.y+cell.box.height
   ?!covered&&y<cell.box.y+8?cell:page.document.body:original(x,y);
  const s=await page.observe(),target=s.ui.elements.find(e=>e.tid===cell.getAttribute('data-tid'));
  assert.ok(target.allowed_actions.includes('double_click'));assert.ok(target.interaction.point,JSON.stringify({mode,target}));assert.ok(target.interaction.point.y<cell.box.y+8);
  if(mode==='covered_after_read')covered=true;
  const result=await page.act({verb:'double_click',ref:target.ref},s);
  assert.equal(result.status==='SUCCEEDED',mode==='partial');
  assert.equal(page.events.filter(e=>e==='double_click').length,mode==='partial'?1:0);
  if(mode==='partial')assert.deepEqual(page.clickedPoints.at(-1),{...target.interaction.point,clickCount:2});
 }
});

async function cancelProcessFixture() {
  const {readFileSync}=await import('node:fs');
  const source=JSON.parse(readFileSync(new URL('./fixtures/process-console-run15.json',import.meta.url),'utf8'));
    const page=new Page();page.context.innerWidth=1440;page.context.innerHeight=1000;
    const panel=page.add('div','ConsoleForm','',{x:48,y:397,width:1392,height:603});
    const grids=[];
    for(const g of source.grids) {
      const grid=page.add('div',g.attributes['data-tid'],'',g.rect,panel);grid.attrs.id=g.attributes.id;grid.id=grid.attrs.id;
      Object.assign(grid,{scrollTop:g.scroll.top,scrollLeft:g.scroll.left,clientWidth:g.scroll.clientWidth,clientHeight:g.scroll.clientHeight,scrollWidth:g.scroll.scrollWidth,scrollHeight:g.scroll.scrollHeight});
      const container=page.add('div',null,'',g.containers[0].rect,grid);container.attrs.class='x-grid-item-container';container.style.transform='none';
      for(const r of g.rows) {
        const row=page.add('table',null,'',r.rect,container);Object.assign(row.attrs,r.attributes,{class:'x-grid-item'});
        for(const c of r.cells){const cell=page.add('td',c.attributes['data-tid'],c.text,c.rect,row);cell.attrs.class=c.classes;}
      }
      grids.push({grid,container});
    }
    const portal=page.add('div','mnContextMenu','',{x:180,y:480,width:330,height:90});
    const showNode=page.add('div','mnContextMenu;mniShowNodeToProcess','Показать узел',{x:200,y:540,width:300,height:24},portal);
    grids[0].container.children.at(-1).attrs.class+=' x-grid-item-selected';
    const menu=page.add('div','mnContextMenu;mniShowCompletedProcesses','Отображать завершенные процессы',{x:200,y:500,width:300,height:24},portal);menu.attrs.class='x-menu-item-checked';

  const cancel=page.add('div','mnContextMenu;mniCancel','Отменить',{x:200,y:570,width:300,height:24},portal);
  portal.box.height=120;
  const owner={FGuid:'node-a',data:{}},record={isModel:true,internalId:'2854',data:{id:'15.4',ModelNode:owner.data,
    CanCancelProcess:true,Status:1,ProgressBarCls:'bg-progress-ptpsProcessing'},childNodes:[]};
  const root={isModel:true,internalId:'root-a',data:{loaded:true},childNodes:[record]};
  const store={$className:'Ext.data.TreeStore',getRoot:()=>root,isLoading:()=>false};
  const views=grids.map(({grid})=>({el:{dom:grid},getStore:()=>store}));
  page.context.Ext={getCmp:id=>views.find(v=>v.el.dom.id===id)};
  page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:{FNodes:{FCollection:[owner]}}}}})}}}}};
  const binding={node:{node_id:'node-a'},workflow_ref:{navigation_path:[],prefix:'MF;TF-1'}};
  // The native node-context reader has its own suite; keep it fixed here to
  // isolate the process-menu guards and their pre-gesture revalidation.
  const execute=options=>vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
    {expected_build:build,expected_origin:origin,prepared_node_context:binding,...options},async()=>({verified:true,surface:'graph'}));
  return {page,cancel,owner,record,root,grids,execute};
}
test('cancel process is typed and binds exact native record root and owner',async()=>{
 const f=await cancelProcessFixture(),r=await f.execute({mode:'observe'});
 assert.equal(r.status,'SUCCEEDED');const item=r.output.ui.elements.find(e=>e.tid==='mnContextMenu;mniCancel');
 assert.deepEqual(Array.from(item.allowed_actions),['cancel_process']);
 assert.deepEqual(clone(item.process_menu.cancellation),{root_id:'root-a',record_id:'2854',process_id:'15.4',node_id:'node-a',
   owner_verified:true,can_cancel:true,source:'native_process_model_identity'});
 assert.throws(()=>validateUiAction({verb:'click',ref:item.ref},r.output));
 const applied=await f.execute({mode:'act',action:{verb:'cancel_process',ref:item.ref},snapshot:r.output});
 assert.equal(applied.status,'SUCCEEDED');assert.equal(f.page.events.filter(e=>e==='click').length,1);
});
for(const fault of ['owner','record','root','completed','not_cancellable','unknown_status','duplicate','selected','unbound'])
 test('cancel process refuses '+fault+' before any gesture',async()=>{
  const f=await cancelProcessFixture(),r=await f.execute({mode:'observe'});
  const item=r.output.ui.elements.find(e=>e.tid==='mnContextMenu;mniCancel');assert.ok(item);
  if(fault==='owner')f.record.data.ModelNode={};
  if(fault==='record')f.record.internalId='new-record';
  if(fault==='root')f.root.internalId='new-root';
  if(fault==='completed'){f.record.data.Status=3;f.record.data.ProgressBarCls='bg-progress-ptpsCompleted';}
  if(fault==='not_cancellable')f.record.data.CanCancelProcess=false;
  if(fault==='unknown_status')f.record.data.ProgressBarCls='bg-progress-ptpsUnknown';
  if(fault==='duplicate')f.root.childNodes.push(f.record);
  if(fault==='selected')f.grids[0].container.children[0].attrs.class+=' x-grid-item-selected';
  const a=await f.execute({mode:'act',action:{verb:'cancel_process',ref:item.ref},snapshot:r.output,
    ...(fault==='unbound'?{prepared_node_context:undefined}:{})});
  assert.equal(a.status,'NOT_APPLIED');assert.equal(a.effect_possible,false);assert.deepEqual(f.page.events,[]);
 });


test('Files root breadcrumb exposes only a click owned by the unique current navigation panel',async()=>{
 for(const mode of ['owned','foreign','outside','duplicate','hidden','wrong_label']) {
  const page=new Page(),prefix='MF;TF-1;',panel=page.add('div',prefix+'NavigationBar;NavigationPanel');
  page.context.innerWidth=1000;page.context.innerHeight=800;
  const tid=prefix+'cnrNaviMode;b.s_Сервер>Файлы';
  const crumb=page.add('a',tid,mode==='wrong_label'?'Пакеты':'Файлы',undefined,mode==='outside'?undefined:panel);
  if(mode==='foreign')panel.attrs['data-tid']='MF;TF-2;NavigationBar;NavigationPanel';
  if(mode==='duplicate')page.add('a',tid,'Файлы',undefined,panel);
  if(mode==='hidden')crumb.style.display='none';
  const observed=await page.observe(),found=observed.ui.elements.filter(e=>e.tid===tid);
  if(mode==='owned') {assert.equal(found.length,1);assert.deepEqual(found[0].allowed_actions,['click']);}
  else assert.equal(found.length,0,mode);
 }
});

test('read-only graph unlock discards a mixed snapshot and preserves identity guards',async()=>{
 for(const mode of ['unlock','foreign','unstable']) {
  const page=new Page();page.add('div','MF;TF-1;ModelForm;cmpDiagram');
  let reads=0;
  const reader=async()=>{reads++;return {verified:true,document_id:mode==='foreign'&&reads>1?'foreign':'doc',
    workflow_id:'workflow',node_id:'node',surface:'graph',tid:'MF;TF-1;Graph;Node',
    locked:mode==='unstable'?reads%2===1:reads===1};};
  const result=await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
    {mode:'observe',discover_roots:true,expected_build:build,expected_origin:origin,
     prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}}},reader);
  assert.deepEqual(page.events,[]);
  if(mode==='unlock') {
   assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.prepared_node_context.locked,false);
   assert.equal(result.trace.filter(e=>e.event==='node_graph_lock_rediscovery').length,1);
  } else {
   assert.equal(result.status,'NOT_APPLIED');assert.equal(result.error.code,'PREPARED_NODE_CONTEXT_CHANGED');
   assert.equal(result.trace.filter(e=>e.event==='node_graph_lock_rediscovery').length,mode==='unstable'?2:0);
  }
 }
});

test('grouped definition pages accept stale local totals only with a complete idle cache',async()=>{
 for(const fault of ['none','stale','remote','pending','filtered','no_source','foreign_proxy']) {
  const {page,c,records}=bufferedMappingFixture();
  const rename=e=>{if(e.attrs['data-tid'])e.attrs['data-tid']=e.attrs['data-tid'].replace('ColumnsMappingEngineOutputPortWizard','DerivedDataSourceMappingEngineOutputPortWizard');for(const child of e.children)rename(child);};rename(c.form);
  records.forEach((r,i)=>{r.data.GroupField=i<19?'':'Исключенные';r.data.Index=i<19?i:0;});
  const store=page.context.Ext.getCmp().getStore(),proxy={$className:'bg.ext.CollectionProxy',pendingOperations:{}};
  store.getTotalCount=()=>fault==='stale'?21:19;store.currentPage=1;store.getRemoteFilter=()=>fault==='remote';store.getRemoteSort=()=>false;store.getProxy=()=>proxy;
  if(fault==='pending')proxy.pendingOperations={one:{}};
  if(fault==='foreign_proxy')proxy.$className='RemoteProxy';
  if(fault==='filtered')store.getData().getSource().items=records.slice(1);
  if(fault==='no_source')store.getData().getSource=()=>null;
  const r=await page.execute({mode:'observe',output_column_page:{offset:0,limit:8}});
  assert.equal(r.output.wizard.output_columns.page.status,['none','stale'].includes(fault)?'complete_definition_page':'unverified_definition_page',fault);
 }
});

test('grouped mapping pages bind group-local indexes and permit only subpixel table rounding',async()=>{
 for(const family of ['DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard']) for(const fault of ['none','clipped','group','index']) {
  const {page,c,records}=bufferedMappingFixture();
  const rename=e=>{if(e.attrs['data-tid'])e.attrs['data-tid']=e.attrs['data-tid'].replace('ColumnsMappingEngineOutputPortWizard',family);for(const child of e.children)rename(child);};rename(c.form);
  records.forEach((r,i)=>{r.data.GroupField=i<10?'':'Исключенные';r.data.Index=i<10?i:i-10;});
  c.rows[11].box.width+=fault==='clipped'?0.5:1/128;
  if(fault==='group')records[19].data.GroupField='Unknown';
  if(fault==='index')records[19].data.Index=19;
  const r=await page.execute({mode:'observe',output_column_page:{offset:0,limit:8}});
  assert.equal(r.output.wizard.output_columns.page.status,fault==='none'?'complete_definition_page':'unverified_definition_page',fault);
  if(fault==='none')assert.equal(r.output.wizard.output_columns.page.total_columns,20);
 }
});

function graphLaunchFixture(){
 const page=new Page();page.context.innerWidth=1440;page.context.innerHeight=1000;const nodeDom=page.add('div','MF;TF-1;Graph;Calculator','',{x:100,y:100,width:100,height:50});
 const button=page.add('button','MF;TF-1;ModelForm;btnToggleActivateCurrent','',{x:400,y:50,width:30,height:25});
 button.id='run-button';button.attrs['data-qtip']='Выполнить узел (F9)';
 page.add('span',null,'',{x:405,y:55,width:10,height:10},button).attrs.class='bg-icon-run_current';
 const owner={FGuid:'node-a',FCell:{},FLocked:false};let selection=[owner.FCell];
 class ModelForm{};const model=new ModelForm();model.FDiagram={FNodes:{FCollection:[owner]},FmxGraph:{container:nodeDom.parentElement,getSelectionCells:()=>selection,view:{getState:()=>({shape:{node:nodeDom}})}}};
 const native={el:{dom:button},disabled:false,tooltip:'Выполнить узел'};
 page.context.Ext={getCmp:id=>id===button.id?native:null};page.app.ModelForm=ModelForm;
 page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model}})}}}}};
 const binding={node:{node_id:'node-a'},workflow_ref:{navigation_path:[],prefix:'MF;TF-1'}};
 const execute=options=>vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,{expected_build:build,expected_origin:origin,prepared_node_context:binding,...options},async()=>({verified:true,surface:'graph'}));
 return {page,button,owner,native,model,select:s=>selection=s,execute};
}
test('graph launch only exposes typed execution for the exact native selected node',async()=>{
 const f=graphLaunchFixture(),r=await f.execute({mode:'observe'});assert.equal(r.status,'SUCCEEDED');
 const e=r.output.ui.elements.find(e=>e.tid===f.button.attrs['data-tid']);assert.deepEqual(clone(e.allowed_actions),['execute_graph_node'],JSON.stringify(e));
 assert.equal(e.graph_execution.node_id,'node-a');assert.throws(()=>validateUiAction({verb:'click',ref:e.ref},r.output));
 const done=await f.execute({mode:'act',action:{verb:'execute_graph_node',ref:e.ref},snapshot:r.output});assert.equal(done.status,'SUCCEEDED');assert.equal(f.page.events.filter(e=>e==='click').length,1);
});
for(const [name,mutate] of Object.entries({unselected:f=>f.select([]),foreign:f=>f.select([{}]),multiple:f=>f.select([f.owner.FCell,{}]),locked:f=>f.owner.FLocked=true,disabled:f=>f.native.disabled=true,deactivate:f=>f.native.tooltip='Деактивировать узел',duplicate:f=>f.model.FDiagram.FNodes.FCollection.push({...f.owner}),foreign_button:f=>f.native.el.dom={}}))test('graph launch refuses native '+name+' drift without a gesture',async()=>{
 const f=graphLaunchFixture(),r=await f.execute({mode:'observe'}),e=r.output.ui.elements.find(e=>e.tid===f.button.attrs['data-tid']);
 assert.ok(e.graph_execution);mutate(f);
 const done=await f.execute({mode:'act',action:{verb:'execute_graph_node',ref:e.ref},snapshot:r.output});assert.notEqual(done.status,'SUCCEEDED');assert.equal(f.page.events.filter(e=>e==='click').length,0);
});

test('graph launch remains observable when inspection is scoped to the graph container',async()=>{
 const f=graphLaunchFixture(),roots=await f.execute({mode:'observe',discover_roots:true});
 const root=roots.output.ui.elements.find(e=>e.tid==='MF;TF-1;ModelForm;cmpDiagram');assert.ok(root);
 const r=await f.execute({mode:'observe',root_ref:root.ref});assert.equal(r.status,'SUCCEEDED');
 const e=r.output.ui.elements.find(e=>e.tid===f.button.attrs['data-tid']);assert.ok(e);assert.deepEqual(clone(e.allowed_actions),['execute_graph_node']);
});

test('prepared 1000-column import keeps page refs and rejects hidden or sensitive offscreen definitions',async()=>{
 const page=new Page({clock:fixtureClock().Date}),c=importCoverageFixture(page,1000);
 const binding={node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}};
 const read=async offset=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {expected_build:build,expected_origin:origin,prepared_node_context:binding,mode:'observe',discover_roots:true,import_column_page:{offset,limit:8}},
  async()=>({verified:true,surface:'wizard',node_id:'node'})));
 const first=await read(0),last=await read(992);
 assert.equal(first.status,'SUCCEEDED');assert.equal(last.status,'SUCCEEDED');
 assert.equal(first.output.wizard.import_columns.page.total_columns,1000);assert.equal(last.output.wizard.import_columns.page.status,'complete_definition_page');
 assert.equal(first.output.wizard.import_columns.page.schema_id,last.output.wizard.import_columns.page.schema_id);
 assert.deepEqual(last.output.wizard.import_columns.fields.map(f=>f.index),[992,993,994,995,996,997,998,999]);
 assert.ok(last.output.scan.visited_elements<6000);
 const root=last.output.wizard.root_ref;
 const sameRoot=await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {expected_build:build,expected_origin:origin,prepared_node_context:binding,mode:'observe',root_ref:root,import_column_page:{offset:992,limit:8}},
  async()=>({verified:true,surface:'wizard',node_id:'node'}));
 assert.equal(sameRoot.status,'SUCCEEDED','full definition identities must not evict the actionable root');
 c.cols[999].cells[1].style.display='none';assert.equal((await read(0)).output.wizard.import_columns.page.status,'unverified');
 c.cols[999].cells[1].style.display='block';c.cols[999].cells[1].attrs['aria-label']='password';
 assert.equal((await read(0)).output.wizard.import_columns.page.status,'unverified');
});

test('a populated console scans nested cell wrappers without quadratic work',async()=>{
 const page=new Page({clock:fixtureClock().Date});page.context.innerWidth=1440;page.context.innerHeight=1000;
 const panel=page.add('div','ConsoleForm','',{x:0,y:0,width:1400,height:950});
 for(let i=0;i<400;i++){
  const cell=page.add('td',null,'',{x:(i%20)*60,y:Math.floor(i/20)*30,width:60,height:30},panel);
  const inner=page.add('div',null,'value'+i,{x:(i%20)*60,y:Math.floor(i/20)*30,width:60,height:30},cell);inner.attrs.class='x-grid-cell-inner';
 }
 const roots=await page.execute({mode:'observe',discover_roots:true});
 const root=roots.output.ui.elements.find(e=>e.tid==='ConsoleForm');assert.ok(root);
 const scoped=await page.execute({mode:'observe',root_ref:root.ref});
 assert.equal(scoped.status,'SUCCEEDED');assert.equal(scoped.output.scan.complete,true);
 assert.equal(scoped.output.ui.table_cells.length,120);assert.equal(scoped.output.ui.table_cells[0].text,'value0');
});

 test('input-port finish waits for transient toast without repeating the gesture or accepting other dialogs',async()=>{
  for(const mode of ['toast','foreign_toast','permanent_toast']){
   const {page}=await inputPortFinishFixture(mode),snapshot=await page.observe();
   const done=snapshot.ui.elements.find(e=>e.wizard_finish?.mode==='input_port');
   const result=await page.act({verb:'finish_wizard',ref:done.ref},snapshot);
   assert.equal(result.status,mode==='toast'?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
   assert.equal(page.events.filter(e=>e==='click').length,1);
   if(mode==='toast')assert.equal(result.trace.filter(e=>e.event==='wizard_toast_wait').length,3);
  }
 });

test('reform row actions bind untidied native table records and refuse recycled or foreign rows',async()=>{
 for(const fault of ['valid','record','index','name','label','view','loading','foreign_store']){
  const page=new Page(),c=mappingCoverageFixture(page),old=c.base;
  c.base=old.replace('ColumnsMappingEngineOutputPortWizard','ReformColumnsWizard');
  for(const e of page.document.all())if(e.attrs['data-tid']?.startsWith(old))e.attrs['data-tid']=e.attrs['data-tid'].replace(old,c.base);
  page.document.querySelectorAll('[data-tid="'+c.base+'btnAddMappingColumn"]')[0].remove();
  c.tableMode.remove();c.linksMode.remove();c.auto.remove();c.body.id='bound-grid';
  const records=c.rows.map((row,i)=>{row.attrs['data-recordid']=String(100+i);return {isModel:true,internalId:100+i,data:{ID:i,Name:'Field'+i,DisplayName:'Field'+i}};});
  const store={$className:fault==='foreign_store'?'Foreign':'Ext.data.Store',isLoading:()=>fault==='loading',getAt:i=>records[i]};
  page.context.Ext={getCmp:()=>({el:{dom:c.body},getStore:()=>store})};
  if(fault==='record')c.rows[0].attrs['data-recordid']='999';
  if(fault==='index')c.rows[0].attrs['data-recordindex']='1';
  if(fault==='view')c.rows[0].attrs['data-boundview']='other';
  if(fault==='name')records[0].data.Name='Other';
  if(fault==='label')records[0].data.DisplayName='Other';
  const s=await page.observe(),field=s.wizard.reform_columns.fields[0],control=s.ui.elements.find(e=>e.ref===field.name_ref);
  assert.equal(!!control?.allowed_actions.includes('double_click'),fault==='valid',fault);
  if(fault==='valid'){
   assert.equal(control.reform_column.record_id,'100');assert.equal(control.reform_column.field_id,'0');
   const narrow=await page.execute({mode:'observe',root_ref:s.wizard.root_ref});
   assert.deepEqual(narrow.output.ui.elements.find(e=>e.ref===field.name_ref).reform_column,control.reform_column);
   c.rows[0].attrs['data-recordid']='999';
   const r=await page.execute({mode:'act',snapshot:s,action:{verb:'double_click',ref:field.name_ref}});
   assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(page.events.length,0);
  }
 }
});

test('reform writable names require the selected native record and active wizard owner',async()=>{
 for(const mode of ['bound','foreign_record','foreign_wizard','wrong_index','loading']){
  const page=new Page(),base='MF;TF-1;WizrdMCF',wizard=page.add('div',base),stem=base+';ReformColumnsWizard;';
  const grid=page.add('div',stem+'grdTargetColumns;tbl','',undefined,wizard);grid.id='reform-grid';
  const row=page.add('table',null,'',undefined,grid);row.attrs={class:'x-grid-item-selected','data-recordindex':mode==='wrong_index'?'1':'0','data-recordid':'r1','data-boundview':grid.id};
  page.add('td',stem+'colName_A','A',undefined,row);const label=page.add('td',stem+'colDisplayName_A','Same',undefined,row);
  page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dtInteger';
  const form=page.add('div','EditReformColumnDefForm');form.id='reform-editor';form.attrs.class='x-window';
  for(const [key,value] of [['edtName','A'],['edtDisplayName','Same'],['cbxDataType','Целый'],['cbxDataKind','Дискретный'],['cbxUsageType','Не задано'],['cntMain;cbxCachingMethod','Отключено']]){
   const owner=page.add('div','EditReformColumnDefForm;'+key,'',undefined,form);page.add('input',null,'',undefined,owner).value=value;
  }
  const excluded=page.add('div','EditReformColumnDefForm;cntMain;chbExcluded','',undefined,form);
  page.add('span','EditReformColumnDefForm;cntMain;chbExcluded;DisplayEl','',undefined,excluded).attrs.class='x-form-checkbox';
  const record={isModel:true,internalId:'r1'},store={$className:'Ext.data.Store',isLoading:()=>mode==='loading',getAt:i=>i===0?record:null};
  const native={FView:{el:{dom:form}},FAddMode:false,Records:[mode==='foreign_record'?{...record}:record]};
  page.context.Ext={getCmp:id=>id===form.id?{Controller:native}:id===grid.id?{el:{dom:grid},getStore:()=>store}:null};
  page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FView:{el:{dom:mode==='foreign_wizard'?form:wizard}}}}})}}}}};
  const s=await page.observe();assert.equal(s.wizard.reform_parameters.portal_bound,mode==='bound',mode);
  assert.equal(s.ui.elements.some(e=>e.wizard_field?.scope==='reform_column'),mode==='bound',mode);
 }
});

test('partly clipped import definition cells use a freshly verified visible point',async()=>{
 for(const fault of ['visible','covered_after_read','renamed_after_read']){
  const page=new Page(),f=importCoverageFixture(page),cell=f.cols[2].cells[2],b=cell.box;
  const hit=page.document.elementFromPoint.bind(page.document);let covered=false;
  page.document.elementFromPoint=(x,y)=>y>=b.y&&y<=b.y+b.height&&x>=b.x&&x<=b.x+b.width&&(covered||x>b.x+b.width*.4)?f.body:hit(x,y);
  const s=await page.observe(),field=s.wizard.import_columns.fields.find(f=>f.index===2),e=s.ui.elements.find(e=>e.ref===field.cell_refs.type);
  assert.equal(e.interaction.state,'point_observed');assert.equal(e.import_definition_cell.name,'Field2');assert.ok(e.interaction.point.x<b.x+b.width*.4);
  if(fault==='covered_after_read')covered=true;
  if(fault==='renamed_after_read')f.cols[2].cells[0].ownText='Different';
  const r=await page.act({verb:'double_click',ref:e.ref},s);
  assert.equal(r.status,fault==='visible'?'SUCCEEDED':'NOT_APPLIED',JSON.stringify(r.error));
  assert.equal(r.effect_possible,fault==='visible');
 }
});

test('compact filter observation retains visible final rows ahead of clipped saved rows',async()=>{
 const page=new Page({ clock: fixtureClock().Date }),base='MF;TF-1;WizrdMCF;FilterDataWizard;FilterDataPanel';
 page.context.innerWidth=1000;page.context.innerHeight=800;
 const wizard=page.add('div','MF;TF-1;WizrdMCF','',{x:20,y:50,width:900,height:700});
 const grid=page.add('div',base,'',{x:30,y:100,width:850,height:600},wizard);grid.id='filter-grid';grid.attrs.id=grid.id;
 const viewDom=page.add('div',base+';tbl','',{x:30,y:100,width:850,height:600},grid);
 const records=[],doms=new Map();
 for(let index=0;index<100;index++){
  const r={isModel:true,internalId:'r'+index,data:{Name:'Id',RelationType:3,IsOperatorRecord:false}};records.push(r);
  const y=index<90?-3000+index*24:100+(index-90)*24;
  const row=page.add('table',null,'',{x:30,y,width:850,height:24},viewDom);
  Object.assign(row.attrs,{'data-recordid':r.internalId,'data-boundview':'filter-view'});doms.set(r,row);
  for(const [i,part] of ['Field','RelationType','Value','CaseSensitive','Delete'].entries())page.add('td',base+';col'+part+'_Id-'+index,part==='Field'?'Id':'',{x:30+i*150,y,width:150,height:24},row);
 }
 const store={$className:'Ext.data.Store',getData:()=>({items:records})},view={id:'filter-view',getNode:r=>doms.get(r)};
 const native={el:{dom:grid},getStore:()=>store,getView:()=>view,Controller:{FFilterItemsStore:store}};
 page.context.Ext={getCmp:id=>id===grid.id?native:null};
 const observed=await page.observe();assert.equal(observed.wizard.stage,'row_filter');
 const target=observed.ui.elements.find(e=>e.tid===base+';colDelete_Id-99');
 assert.ok(target);assert.ok(target.allowed_actions.includes('click'));assert.equal(target.filter_cell.record_id,'r99');
 assert.ok(observed.ui.elements.length<=240);
});

test('duplicate role page is recognized by its native grid without an add-mapping button',async()=>{
  const page=new Page(),root='MF;TF-1;WizrdMCF',form=page.add('div',root);
  page.add('div',root+';TuneDataSourceInputPortWizard;grdTargetColumns','',undefined,form);
  page.add('button',root+';btnNext','Далее',undefined,form);
  const observed=await page.observe();assert.equal(observed.wizard.stage,'input_mapping');
  assert.equal(observed.wizard.controls.btnNext.enabled,true);
});

test('global duplicate role selection retains its dialog and rejects unrelated field changes',async()=>{
 for(const fault of [false,true]) {
  const page=new Page(),base='MF;TF-1;WizrdMCF;',wizard=page.add('div',base.slice(0,-1)),stem=base+'TuneDataSourceInputPortWizard;';
  page.add('div',stem+'grdTargetColumns','',undefined,wizard);
  const grid=page.add('div',stem+'grdTargetColumns;tbl','',undefined,wizard);grid.id='roles-view';grid.attrs.id=grid.id;
  const row=page.add('table',null,'',undefined,grid);row.attrs={class:'x-grid-item-selected','data-recordindex':'0','data-recordid':'r1','data-boundview':grid.id};
  page.add('td',stem+'colName_A','A',undefined,row);const label=page.add('td',stem+'colDisplayName_A','A',undefined,row);
  page.add('span',null,'',undefined,label).attrs.class='bg-TBGDataType-dtInteger';
  page.add('td',stem+'colDataKind_A','Дискретный',undefined,row);page.add('td',stem+'colUsageType_A','Не задано',undefined,row);
  const form=page.add('div','EditTuneColumnDefForm');form.id='role-editor';form.attrs.class='x-window';const inputs={};
  page.add('div','EditTuneColumnDefForm;header','Редактировать столбец',undefined,form);
  for(const [key,value] of [['edtName','A'],['edtDisplayName','A'],['cbxDataType','Целый'],['cbxDataKind','Дискретный'],['cbxUsageType','Не задано']]) {
   const owner=page.add('div','EditTuneColumnDefForm;'+key,'',undefined,form),input=page.add('input',null,'',undefined,owner);input.value=value;inputs[key]=input;
   if(key!=='cbxUsageType'){input.disabled=true;input.attrs.disabled='';}
  }
  const record={isModel:true,internalId:'r1'},store={$className:'Ext.data.Store',isLoading:()=>false,getAt:i=>i===0?record:null};
  const native={FView:{el:{dom:form}},FAddMode:false,Records:[record]};
  page.context.Ext={getCmp:id=>id===form.id?{Controller:native}:id===grid.id?{el:{dom:grid},getStore:()=>store}:null};
  page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FView:{el:{dom:wizard}}}}})}}}}};
  const list=page.add('div','EditTuneColumnDefForm;cbxUsageType;boundlist','',{x:600,y:300,width:140,height:40});
  page.add('div','EditTuneColumnDefForm;cbxUsageType;boundlist;Выходное','Выходное',{x:605,y:305,width:130,height:25},list);
  const first=await page.observe();assert.equal(first.wizard.stage,'input_mapping');assert.equal(first.wizard.column_parameters.portal_bound,true);
  const read=await page.execute({mode:'observe',root_ref:first.ui.elements.find(e=>e.wizard_combo?.kind==='option').wizard_combo.list_ref});
  const option=read.output.ui.elements.find(e=>e.wizard_combo?.kind==='option');assert.ok(option,JSON.stringify({wizard:read.output.wizard,combos:read.output.ui.elements.filter(e=>e.wizard_combo)}));
  assert.equal(read.output.ui.elements.some(e=>e.wizard_field?.scope==='output_column'),false);
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);list.remove();inputs.cbxUsageType.value='Выходное';if(fault)inputs.edtName.value='Other';};
  const result=await page.act({verb:'select_wizard_option',ref:option.ref},read.output);
  assert.equal(result.status,fault?'AMBIGUOUS':'SUCCEEDED',JSON.stringify(result.error));assert.equal(page.events.filter(e=>e==='click').length,1);
 }
});

test('graph observation retains automatic-label links and excludes their child decorations',async()=>{
 const page=new Page();
 const link='MF;TF-1;Graph;Source;_one|Output_Data-0|Дубликаты;_in:_Key|Input_Data-0';
 page.add('g',link,'',{x:300,y:140,width:100,height:1});
 page.add('g',link+';Decoration','',{x:300,y:140,width:100,height:1});
 const s=await page.observe();assert.deepEqual(s.links.map(e=>e.tid??e),[link]);
});
test('output-port Close returns through the port breadcrumb path after exactly one confirmation',async()=>{
 for(const mode of ['valid','duplicate','foreign_guid','foreign_document','foreign_workflow','wrong_workflow','wrong_node','still_open','missing_context']) {
  const {page}=outputPortFinishFixture(mode);
  const dialog=page.add('div',null,'',{x:400,y:200,width:400,height:150});dialog.attrs.class='x-window';
  page.add('h1',null,'Подтвердить',undefined,dialog).attrs.role='heading';
  page.add('span',null,'Вы действительно хотите закрыть мастер настройки?',undefined,dialog);
  page.add('button','msgbox;tlb;yes','Да',{x:600,y:300,width:50,height:30},dialog);
  page.add('button','msgbox;tlb;no','Нет',{x:670,y:300,width:50,height:30},dialog);
  const binding={node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}};
  const execute=options=>vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
   {expected_build:build,expected_origin:origin,prepared_node_context:binding,...options},async()=>{const graph=page.document.all().some(e=>e.attrs['data-tid']==='MF;TF-1;ModelForm;cmpDiagram');return {verified:true,
     document_id:graph&&mode==='foreign_document'?'foreign':'doc',workflow_id:graph&&mode==='foreign_workflow'?'foreign':'flow',
     node_id:graph&&['foreign_guid','wrong_node'].includes(mode)?'foreign':'node',surface:graph?'graph':'wizard',tid:graph?'MF;TF-1;Graph;'+(mode==='duplicate'?'Calc@1':'Calc'):'MF;TF-1;WizrdMCF',
     output_port:{direction:'output',port:0,native_index:0,port_guid:'out',opening_operation_id:'open'}};});
  const snapshot=(await execute({mode:'observe'})).output;
  const button=snapshot.ui.elements.find(e=>e.allowed_actions.includes('confirm_wizard_close'));
  if(mode==='missing_context'){assert.equal(button,undefined);continue;}
  assert.ok(button,mode);
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);dialog.remove();if(mode==='duplicate')for(const e of page.document.all()){
   if(e.attrs['data-tid']?.startsWith('MF;TF-1;Graph;Calc'))e.attrs['data-tid']=e.attrs['data-tid'].replace('Graph;Calc','Graph;Calc@1');}};
  const result=await execute({mode:'act',operation_id:'output-close',action:{verb:'confirm_wizard_close',ref:button.ref},snapshot});
  assert.equal(result.status,['valid','duplicate'].includes(mode)?'SUCCEEDED':'AMBIGUOUS',mode+JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);
 }
});

test('missing values constant trigger requires the exact active cached field editor',async()=>{
 for(const fault of ['none','foreign_record','inactive','wrong_field','wrong_method','foreign_grid']){
  const page=new Page(),c=wizardStepFixture(page),base=c.base+';DataRecoveryWizard;';c.marker.remove();Object.assign(page.context,{innerWidth:1000,innerHeight:800});
  const container=page.add('div',base+'grdColumnsSettings','',{x:20,y:80,width:500,height:300},c.form);container.id='mv-grid';
  const view=page.add('div',base+'grdColumnsSettings;tbl','',{x:20,y:80,width:500,height:300},container);view.id='mv-view';
  const row=page.add('table',null,'',{x:20,y:110,width:400,height:25},view);Object.assign(row.attrs,{class:'x-grid-item','data-recordindex':'0','data-recordid':'r1','data-boundview':view.id});
  page.add('td',base+'colMethod_Note','constant',{x:20,y:110,width:100,height:25},row);
  const editor=page.add('div',base+'grdColumnsSettings;tbl;celleditor;cbx','',{x:150,y:110,width:120,height:25},view);
  const trigger=page.add('div',editor.attrs['data-tid']+';trg_SetNullValue','',{x:240,y:110,width:20,height:25},editor);
  const record={isModel:true,internalId:'r1',data:{Name:'Note',ActionNull:fault==='wrong_method'?3:6}},records=[record];
  const store={$className:'Ext.data.Store',isLoading:()=>false,getData:()=>({items:records})};
  const grid={el:{dom:container},getStore:()=>store};grid.editingPlugin={editing:fault!=='inactive',context:{grid:fault==='foreign_grid'?{}:grid,record:fault==='foreign_record'?{...record}:record,field:fault==='wrong_field'?'Name':'ActionNull'}};
  page.context.Ext={getCmp:id=>id===container.id?grid:id===view.id?{el:{dom:view},getStore:()=>store}:undefined};
  const snapshot=await page.observe(),control=snapshot.ui.elements.find(e=>e.tid===trigger.attrs['data-tid']);
  if(fault==='none'){assert.equal(control?.missing_values_field.field_key,'Note');assert.equal(control?.missing_values_field.part,'constant');assert.ok(control.allowed_actions.includes('click'),JSON.stringify(control));}
  else assert.equal(control,undefined,fault);
 }
});

test('bound output scans omit inactive Table interiors while keeping live controls',async()=>{
 const page=new Page(),root=page.add('div','MF;TF-1;ViewsForm');
 for(let n=0;n<30;n++){
  const table=page.add('div','MF;TF-1;ViewsForm;BrowseView-'+(n+1),'',{x:0,y:-9999,width:2,height:2},root);
  table.attrs.class='x-hidden-offsets';
  for(let i=0;i<220;i++)page.add('span',null,'cached control',undefined,table);
 }
 page.add('button','MF;TF-1;ViewsForm;btnRename','Rename',undefined,root);
 const result=await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {expected_build:build,expected_origin:origin,mode:'observe',prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}}},
  async()=>({verified:true,surface:'views'}));
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.ok(result.output.scan.omitted_regions.includes('inactive_table_views'));
 assert.ok(result.output.scan.visited_elements<1000);
 assert.ok(result.output.ui.elements.some(e=>e.tid==='MF;TF-1;ViewsForm;btnRename'));
});


test('bound preview schema controls do not enumerate data rows but retain blockers',async()=>{
 const page=new Page(),base='MF;TF-1;ModelForm;PreviewWindow';
 const root=page.add('div',base),data=page.add('div',base+';PreviewForm;DataSetForm','',undefined,root);
 page.add('button',base+';p.h;close','Close',undefined,root);
 const grid=page.add('div',data.attrs['data-tid']+';grdDataTable','',undefined,data);
 const rows=page.add('div',grid.attrs['data-tid']+';grd-1;tbl','',undefined,grid);
 for(let i=0;i<6200;i++)page.add('span',null,'portfolio data',undefined,rows);
 const mask=page.add('div',null,'Loading',undefined,rows);mask.attrs.class='x-mask-msg';
 const result=await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {expected_build:build,expected_origin:origin,mode:'observe',prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}}},
  async()=>({verified:true,surface:'graph'}));
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.ok(result.output.scan.omitted_regions.includes('preview_data_cells'));
 assert.ok(result.output.scan.visited_elements<1000);
 assert.ok(result.output.ui.elements.some(e=>e.tid===base+';p.h;close'));
 assert.ok(result.output.ui.masks.length>0,'omitting rows must not omit loading guards');
 assert.equal(result.output.ui.table_cells.filter(c=>c.data_cell).length,0);
});


test('duplicate overview keys require a matching prepared native navigation identity',async()=>{
 for(const mode of ['bound','unbound','foreign']){
  const {page,panel}=await nodeOverviewContextFixture(),crumb=panel.children.at(-1);
  crumb.attrs['data-tid']+='-3';
  const binding={node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-5',navigation_path:[]}};
  const reader=async()=>({verified:true,document_id:'doc',workflow_id:'wf',node_id:'node',surface:'graph',tid:'MF;TF-5;Graph;Изменение@1',
    ...(mode!=='unbound'?{navigation_node:{tid:crumb.attrs['data-tid'],label:mode==='foreign'?'Foreign':'Изменение'}}:{})});
  const result=await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,{mode:'observe',expected_build:build,expected_origin:origin,prepared_node_context:binding},reader);
  assert.equal(result.output.node_context.status==='observed',mode==='bound',mode);
 }
});

test('completed graph node exposes only deactivation from rendered native mode and rejects mode drift',async()=>{
 for(const drift of [false,true]){
 const f=graphLaunchFixture();f.button.attrs['data-qtip']='Деактивировать узел';f.button.children[0].attrs.class='bg-icon-stop';
 const r=await f.execute({mode:'observe'}),e=r.output.ui.elements.find(e=>e.tid===f.button.attrs['data-tid']);
 assert.deepEqual(clone(e.allowed_actions),['deactivate_graph_node']);assert.equal(e.graph_execution.mode,'deactivate');
 assert.throws(()=>validateUiAction({verb:'execute_graph_node',ref:e.ref},r.output));
 if(drift){f.button.attrs['data-qtip']='Выполнить узел (F9)';f.button.children[0].attrs.class='bg-icon-run_current';}
 const result=await f.execute({mode:'act',action:{verb:'deactivate_graph_node',ref:e.ref},snapshot:r.output});
 assert.equal(result.status==='SUCCEEDED',!drift);assert.equal(f.page.events.filter(e=>e==='click').length,drift?0:1);
 }
});
