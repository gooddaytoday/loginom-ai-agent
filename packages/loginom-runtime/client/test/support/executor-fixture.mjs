import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { makeCapabilityCode, createActionRuntime } from '../../lib/executor.mjs';

const actions = new Map(JSON.parse(await readFile(new URL('../../../executor/catalog/actions.json', import.meta.url), 'utf8')).actions.map(value => [value.action_key, value]));
const selectors = new Map(JSON.parse(await readFile(new URL('../../../executor/catalog/selectors.json', import.meta.url), 'utf8')).selectors.map(value => [value.symbol, value]));
const build = '7.5.0-alpha+build.49202';
const clone = value => JSON.parse(JSON.stringify(value));

// This DOM model executes the complete, serialized production capability body.
// Only Playwright and the external Loginom DOM are deterministic test doubles.
class Locator {
  constructor(page, select) { this.page = page; this.select = select; }
  all() { return this.select(); }
  async count() { return this.all().length; }
  nth(index) { return new Locator(this.page, () => this.all().slice(index, index + 1)); }
  first() { return this.nth(0); }
  locator(query) { const descendants=item=>(item.children??[]).flatMap(child=>[child,...descendants(child)]);return new Locator(this.page, () => this.page.match(query, this.all().flatMap(descendants))); }
  async isVisible() { return this.all()[0]?.visible !== false && this.all().length > 0; }
  async isEnabled() { return this.all()[0]?.enabled !== false; }
  async boundingBox() { return this.all()[0]?.box ?? null; }
  async getAttribute(name) { return this.all()[0]?.getAttribute(name) ?? null; }
  async innerText() { return this.all()[0]?.text ?? ''; }
  async evaluateAll(fn, arg) { return fn(this.all(), arg); }
  async evaluate(fn, arg) {
    const item = this.all()[0]; if (!item) throw new Error('Detached element');
    if (item.symbol === 'workflow.graph') this.page.model.FDiagram.FmxGraph.container = item;
    const source = fn.toString();
    // Workspace DOM extraction/handle identity are independently exercised by
    // workspace-ui.test.mjs. Here the external DOM fixture exposes its same graph
    // to the real serialized UI gesture body and runtime recovery gate.
    if (source.includes('workspace-ui.identity.v1')) return this.page.uiReference(item.tid) === arg;
    if (source.includes('document.elementFromPoint')) {
      this.page.lastCheckedControl = item.tid;
      return { point: arg.point, source: 'box_center', candidates_checked: 1 };
    }
    if (source.includes('document.activeElement')) return this.page.focused === item.tid;
    return fn(item, arg);
  }
  async elementHandle() { return this; }
  async dispose() {}
  async click() { await this.page.click(this.all()[0]); }
  async dblclick() {
    if (this.page.failRenameOnce) { this.page.failRenameOnce = false; throw new Error('Transient rename editor did not open'); }
    this.page.events.push('double_click');
    const item = this.all()[0]; this.page.editor = { label: item.label, text: item.label };
    await this.page.afterDoubleClick?.();
  }
  async fill(value) { this.page.fileValue = value; }
  async inputValue() { return this.page.fileValue; }
  async press(key) {
    if (key === 'Enter' && this.page.editor) {
      const entry = this.page.nodes.find(item => item.label === this.page.editor.label);
      entry.label = this.page.editor.text.replace(/\s/g, '_').replace(/,/g, '');
      this.page.editor = null;
    }
    if (key === 'Escape') this.page.editor = null;
    if (key === 'ControlOrMeta+A' && this.page.editor) this.page.editor.text = '';
    if (key === 'Backspace' && this.page.editor) this.page.editor.text = '';
    if (key === 'Delete' && this.page.selectedEdge) {
      this.page.edges = this.page.edges.filter(edge => edge !== this.page.selectedEdge);
      this.page.selectedEdge = null;
    } else if (key === 'Delete' && this.page.selectedNode) {
      const selected = this.page.selectedNode;
      this.page.nodes = this.page.nodes.filter(node => node.label !== selected);
      this.page.edges = this.page.edges.filter(edge => { const parts = edge.split('|'); return parts[0] !== selected && parts[2] !== selected; });
      this.page.selectedNode = null;
    }
    if (key === 'ControlOrMeta+A' && this.page.fileFocused) this.page.fileValue = '';
    if (key === 'Tab') this.page.fileFocused = false;
  }
}

class Page {
  constructor() {
    this.clock = 1000;
    this.prefix = 'MF;TF-1'; this.tabTid = 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';
    this.active = true; this.identity = 'Без имени'; this.nodes = []; this.edges = [];
    this.events = []; this.drops = 0; this.upCalls = 0; this.down = false; this.menu = false;
    this.dialog = null; this.fileValue = ''; this.storage = new Map(); this.conflict = false;
    this.graph = { scrollLeft: 0, scrollTop: 0 };
    this.dom={createTreeWalker:root=>{function* walk(node){for(const child of node.children??[]){yield child;yield* walk(child);}}const iterator=walk(root);return {nextNode:()=>iterator.next().value??null};}};
    this.diagramOffset = { x: 0, y: 0 };
    this.viewScale = 1;
    this.packagePath = null;
    this.uiRefs = new Map();
    const page = this;
    class ModelForm {}
    class PackageTreeNode {
      get PackageFileName() { return page.packagePath; }
      get PackageName() { return page.packagePath?.split('/').at(-1) ?? 'Без имени'; }
    }
    this.model = new ModelForm();
    this.model.View = { getEl: () => ({ dom: { contains: element => element.symbol === 'workflow.graph' } }) };
    this.model.Items = { cntDiagram: { getBox: () => ({ x: 300 + page.diagramOffset.x, y: 100 + page.diagramOffset.y }) } };
    this.model.FDiagram = { FInitialScale: 1, FmxGraph: { gridSize: 8,
      view: { get scale() { return page.viewScale; }, translate: { x: 0, y: 0 } } } };
    this.app = { Version: build, ModelForm, PackageTreeNode, Application: { FInstance: { FMainForm: { Items: {
      Workspace: { getActiveTab: () => ({ Controller: { FController: page.model, Node: { data: { node: { ParentNode: new PackageTreeNode() } } } } }) },
    } } } } };

    this.mouse = {
      click: async (x, y, options = {}) => {
        this.events.push('mouse_click'); this.point = { x, y };
        const all = this.elements().flatMap(item => [item, ...(item.children ?? [])]);
        const checked = all.find(item => item.tid === this.lastCheckedControl && this.contains(item.box, this.point));
        const item = checked ?? all.find(candidate => this.contains(candidate.box, this.point));
        if (!item) throw new Error('Mouse click has no DOM target');
        if (options.clickCount === 2) await new Locator(this, () => [item]).dblclick();
        else await this.click(item);
      },
      move: async (x, y) => {
        if (this.down && this.failDrag) throw new Error('Drag transport interrupted');
        this.point = { x, y };
      },
      down: async () => {
        this.down = true;
        this.source = this.elements().find(item => ['component', 'port'].includes(item.kind) && this.contains(item.box, this.point));
      },
      up: async () => {
        this.upCalls++; this.events.push('mouse_up');
        const wasDown = this.down; this.down = false;
        if (wasDown && !this.failDrag) { this.drops++; await this.drop(); }
      },
    };
    this.keyboard = {
      type: async value => { this.events.push('keyboard_type'); if (this.editor) this.editor.text = value; else if (this.fileFocused) this.fileValue += value; },
      press: async key => {
        this.events.push(key);
        if (key === 'Escape') { this.editor = null; this.dialog = null; this.conflict = false; this.menu = false; }
      },
    };
  }
  contains(box, point) { return box && point && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height; }
  ref(label) { return { kind: 'node', node_label: label, workflow_ref: { tab_tid: this.tabTid, prefix: this.prefix } }; }
  addNode(label, x, y, ports = []) { this.nodes.push({ label, x, y, ports: [...ports] }); }
  element(tid, props = {}) { const page=this;return { tid,ownerDocument:page.dom, visible: true, box: { x: 10, y: 10, width: 20, height: 20 }, ...props,
    querySelectorAll(selector) {const descendants=item=>(item.children??[]).flatMap(child=>[child,...descendants(child)]);return page.match(selector,descendants(this));},
    getBoundingClientRect() { return { ...this.box, left: this.box.x, top: this.box.y, right: this.box.x + this.box.width, bottom: this.box.y + this.box.height }; },
    getAttribute(name) { return name === 'data-tid' ? this.tid : this.attributes?.[name] ?? null; } }; }
  elements() {
    const result = [];
    for (const [symbol, definition] of selectors) {
      if (definition.parameters && Object.keys(definition.parameters).length) continue;
      if (definition.scope.startsWith('active') && !this.active) continue;
      if (symbol === 'workspace.active_tab') continue;
      if (symbol === 'file_dialog.file_name' || symbol === 'file_dialog.confirm') {
        if (!this.dialog) continue;
      } else if (symbol === 'message.text' || symbol === 'message.no' || symbol === 'message.yes') {
        if (!this.conflict) continue;
      } else if (symbol === 'message.error') { if (!this.error) continue; }
      else if (symbol.startsWith('packages.') && symbol !== 'packages.menu' && !this.menu) continue;
      const tid = definition.scope.startsWith('active') ? this.prefix + ';' + definition.value : definition.value;
      const item = this.element(tid, { symbol });
      if (symbol.startsWith('component.')) { item.kind = 'component'; item.box = { x: 10, y: 100 + result.length * 25, width: 200, height: 20 }; }
      if (symbol === 'workflow.workarea') item.box = { x: 300, y: 100, width: 1000, height: 800 };
      if (symbol === 'workflow.graph') {
        Object.assign(item, this.graph);
        item.box = { x: 300, y: 100, width: 1000, height: 800 };
        item.children = this.editor ? [this.element('editor', { tag: 'textarea', text: this.editor.text })] : [];
        Object.defineProperties(item, {
          scrollLeft: { get: () => this.graph.scrollLeft, set: value => { this.graph.scrollLeft = value; } },
          scrollTop: { get: () => this.graph.scrollTop, set: value => { this.graph.scrollTop = value; } },
        });
      }
      if (symbol === 'file_dialog.file_name') item.children = [this.element('fileInput', { tag: 'input' })];
      if (symbol === 'message.text') item.text = this.conflictText ?? '"'+this.fileValue+'" уже существует. Вы хотите заменить его?';
      if (symbol === 'message.yes') item.text = 'Да';
      if (symbol === 'message.no') item.text = 'Нет';
      if (symbol === 'message.error') item.text = this.error;
      result.push(item);
    }
    if (this.active) {
      result.push(this.element(this.tabTid, { text: this.identity, classes: ['x-tab-active'] }));
      for (const node of this.nodes) {
        const nodeTid = (this.graphPrefix??this.prefix) + ';Graph;' + node.label;
        const box = { x: 300 + node.x * this.viewScale - this.graph.scrollLeft, y: 100 + node.y * this.viewScale - this.graph.scrollTop, width: 100 * this.viewScale, height: 60 * this.viewScale };
        result.push(this.element(nodeTid, { box, children: [this.element('', { tag: 'rect', box, attributes: { x: String(node.x * this.viewScale), y: String(node.y * this.viewScale) } })] }));
        result.push(this.element(nodeTid + ';Label;Label', { box, label: node.label, visible: !(this.hideLabelWhileEditing && this.editor?.label === node.label) }));
        node.ports.forEach((port, index) => result.push(this.element(nodeTid + ';' + port, {
          kind: 'port', node: node.label, port,
          box: { x: box.x + (port.startsWith('Output') ? 100 : 0), y: box.y + 5 + index * 10, width: 8, height: 8 },
        })));
      }
      for (const edge of this.edges) result.push(this.element((this.graphPrefix??this.prefix) + ';Graph;' + edge, { kind: 'link', edge }));
    }
    const graph=result.find(e=>e.symbol==='workflow.graph');
    if(graph) {
      for(const item of result.filter(e=>e.tid.includes(';Graph;'))) {graph.children.push(item);item.parentElement=graph;}
      const parents=item=>{for(const child of item.children??[]){child.parentElement=item;parents(child);}};parents(graph);
    }
    return result;
  }
  match(query, candidates = this.elements()) {
    if (query.endsWith(' > :nth-child(1)')) return this.match(query.slice(0, -' > :nth-child(1)'.length), candidates).flatMap(item => item.children ?? []).slice(0, 1);
    if (['rect', 'input', 'textarea'].includes(query)) return candidates.filter(item => item.tag === query);
    if (query.startsWith('.bg-mask-message')) return [];
    const parts = [...query.matchAll(/\[data-tid([\^$]?)=("(?:\\.|[^"\\])*")\]/g)];
    return candidates.filter(item => {
      for (const [, operator, text] of parts) {
        const value = JSON.parse(text);
        if (operator === '^' ? !item.tid.startsWith(value) : operator === '$' ? !item.tid.endsWith(value) : item.tid !== value) return false;
      }
      return !query.includes('.x-tab-active') || item.classes?.includes('x-tab-active');
    });
  }
  locator(query) { return new Locator(this, () => this.match(query)); }
  viewportSize() { return { width: 1600, height: 1000 }; }
  async waitForTimeout(ms) { this.clock += ms; }
  uiReference(tid) { if (!this.uiRefs.has(tid)) this.uiRefs.set(tid, 'ui-fixture-' + (this.uiRefs.size + 1)); return this.uiRefs.get(tid); }
  uiSnapshot() {
    const graph = this.elements(), workflow = { tab_tid: this.tabTid, prefix: this.prefix };
    const controls = graph.filter(item => item.label || item.kind === 'port' || item.kind === 'link');
    if (this.editor) controls.push(graph.find(item => item.symbol === 'workflow.graph').children[0]);
    const elements = controls.map(item => {
      const field = item.tag === 'textarea';
      return { ref: this.uiReference(item.tid), tid: field ? null : item.tid,
        identity: { anchor_tid: field ? this.prefix + ';ModelForm;cmpDiagram' : item.tid, path: field ? [0] : [] },
        signature: { tag: item.tag ?? 'g', tid: field ? null : item.tid, role: null, type: null, name: null,
          label: item.label ?? '', ...(field ? { value: this.editor.text } : {}), dialog_ref: null },
        label: item.label ?? '', kind: field ? 'field' : item.kind === 'port' ? 'port' : 'graph',
        scope: field ? 'graph_editor' : 'graph', ...(field ? { value: this.editor.text } : {}),
        enabled: true, visible: true, bounding_box: item.box,
        allowed_actions: ['click', 'double_click', 'press', 'drag', ...(field ? ['fill'] : [])] };
    });
    return { origin: 'https://loginom.invalid', authenticated: true, loginom_build: build, workflow_ref: workflow,
      graph_identity:{status:'observed',container_tid:this.prefix+';ModelForm;cmpDiagram',container_ref:'fixture-diagram',native_prefix:(this.graphPrefix??this.prefix)+';Graph;'},
      dom_epoch: {document:'fixture-document',revision:0},
      active_identity: this.identity, package_identity: { path: this.packagePath, name: this.packagePath?.split('/').at(-1) ?? null },
      nodes: this.nodes.map(node => ({ node_ref: this.ref(node.label), ports: node.ports.map(port => ({
        tid: `${this.graphPrefix??this.prefix};Graph;${node.label};${port}`, ui_ref: this.uiReference(`${this.graphPrefix??this.prefix};Graph;${node.label};${port}`),
      })) })), links: this.edges.map(edge => (this.graphPrefix??this.prefix) + ';Graph;' + edge),
      ui: { elements, dialogs: [], messages: [], masks: [], table_cells: [], truncated: {} } };
  }
  async evaluate(fn, arg) {
    if (fn.toString().includes('return {document:state.epoch,revision:state.revision}')) return this.uiSnapshot().dom_epoch;
    if (fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')")) return this.uiSnapshot();
    return fn(arg);
  }
  async drop() {
    this.events.push('drop');
    if (this.onDrop) return this.onDrop(this);
    if (this.source?.kind === 'component') {
      this.addNode('Текстовый_файл', Math.round(Math.round((this.point.x - 300 - this.diagramOffset.x + this.graph.scrollLeft) / this.viewScale) / 8) * 8, Math.round(Math.round((this.point.y - 100 - this.diagramOffset.y + this.graph.scrollTop) / this.viewScale) / 8) * 8);
      return;
    }
    const target = this.elements().find(item => item.kind === 'port' && item.port.startsWith('Input') && this.contains(item.box, this.point));
    if (!this.source || !target) return;
    const node = this.nodes.find(item => item.label === target.node);
    let port = target.port;
    if (port === 'Input_Add') { port = 'Input_Data-' + node.ports.filter(item => item.startsWith('Input_Data-')).length; node.ports.push(port); }
    this.edges.push(`${this.source.node}|${this.source.port}|${target.node}|${port}`);
    this.graph.scrollLeft = 77; this.graph.scrollTop = 88;
  }
  save() {
    this.storage.set(this.fileValue, { nodes: clone(this.nodes), edges: clone(this.edges) });
    this.identity = 'Сценарий'; this.packagePath = this.fileValue; this.dialog = null; this.conflict = false;
  }
  async click(item) {
    if (!item) throw new Error('Missing click target');
    this.focused = item.tid;
    if (item.kind === 'link') { this.selectedEdge = item.edge; this.selectedNode = null; return; }
    if (item.label) { this.selectedNode = item.label; this.selectedEdge = null; return; }
    if (item.tag === 'input') { this.fileFocused = true; return; }
    const symbol = item.symbol;
    if (symbol === 'packages.menu') this.menu = true;
    else if (symbol === 'packages.save_as') { this.dialog = 'save'; this.menu = false; }
    else if (symbol === 'packages.open') { this.dialog = 'open'; this.menu = false; }
    else if (symbol === 'packages.close') { this.active = false; this.menu = false; this.events.push('package_closed'); }
    else if (symbol === 'file_dialog.confirm') {
      if (this.dialog === 'save') {
        if (this.storage.has(this.fileValue)) this.conflict = true; else this.save();
      } else {
        const stored = this.storage.get(this.fileValue);
        if (!stored) { this.error = 'Файл не найден'; return; }
        this.nodes = clone(stored.nodes); this.edges = clone(stored.edges);
        this.active = true; this.prefix = 'MF;TF-2'; this.tabTid = 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-2';
        this.identity = 'Сценарий'; this.packagePath = this.fileValue; this.dialog = null;
        this.events.push('package_reopened'); this.onReopen?.(this);
      }
    } else if (symbol === 'message.no') this.conflict = false;
    else if (symbol === 'message.yes') this.save();
  }
  async execute(code) {
    const page = this;
    class Clock extends Date { static now() { return page.clock; } }
    this.context ??= vm.createContext({ Date: Clock, bg: { app: this.app },
      getComputedStyle: element => ({ display: element.visible ? 'block' : 'none', visibility: element.visible ? 'visible' : 'hidden' }) });
    const fn = vm.runInContext(`(${code})`, this.context);
    return clone(await fn(this));
  }
}

const nodeParameters = { component_key: 'imports.text', target_position: { x: 104, y: 104 }, expected_label: 'Источник' };
function linkPage() { const page = new Page(); page.graph = { scrollLeft: 12, scrollTop: 15 }; page.addNode('Источник', 104, 104, ['Output_Data-0']); page.addNode('Приёмник', 400, 104, ['Input_Add', 'Input_Data-0']); return page; }
function linkParameters(page, kind = 'add') { return { source_node: page.ref('Источник'), target_node: page.ref('Приёмник'), source_port: { kind: 'data' }, target_port: { kind } }; }
const run = (page, key, parameters, options = {}) => page.execute(makeCapabilityCode(actions.get(key), selectors, parameters, { expected_build: build, ...options }));
function runtime(page, options = {}) { return createActionRuntime({ pinned: { actions, selectors, pins: {}, compatibility: { loginom_build: build } }, allowCandidate: true,
  execute: code => page.execute(code), now: () => page.clock, targetOrigin: 'https://loginom.invalid', ...options }); }


export { actions, selectors, build, clone, Page, Locator, nodeParameters, linkPage, linkParameters, run, runtime };
