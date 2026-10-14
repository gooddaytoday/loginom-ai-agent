import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { makeWorkspaceUiCode, validateUiAction, workspaceUiCapability } from '../../../lib/workspace-ui.mjs';
import { assertActionOutcome } from '../../../lib/action-catalog.mjs';

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
export class NavigationPage {
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
      getComputedStyle: element => ({ display: 'block', visibility: 'visible', opacity: '1', transform:'none', zoom:'1', scale:'none', rotate:'none', borderLeftWidth:'0px', ...element.style }), Date: clock, Math });
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

