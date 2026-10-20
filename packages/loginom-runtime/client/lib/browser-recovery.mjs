import {validateActionParameters} from './action-catalog.mjs';

export const RECOVERY_BROWSER_TOOLS = Object.freeze([
  'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_click',
  'browser_hover', 'browser_type', 'browser_press_key', 'browser_fill_form',
  'browser_select_option', 'browser_drag', 'browser_mouse_click_xy',
  'browser_mouse_move_xy', 'browser_mouse_drag_xy', 'browser_mouse_wheel',
  'browser_handle_dialog', 'browser_wait_for',
]);

export const browserRecoveryTool = {
  name: 'dock_browser_recovery',
  description: 'Start, finish or stop a bounded browser recovery of the current Dock operation.',
  inputSchema: {type: 'object', oneOf: [
    {type: 'object', additionalProperties: false, required: ['action', 'operation_id'], properties: {
      action: {const: 'start'}, operation_id: {type: 'string', minLength: 1, maxLength: 128},
    }},
    {type: 'object', additionalProperties: false, required: ['action', 'report'], properties: {
      action: {const: 'finish'}, report: {type: 'object', additionalProperties: false,
        required: ['actions', 'result', 'settings'], properties: {
          actions: {type: 'array', maxItems: 30, items: {type: 'string', maxLength: 500}},
          result: {type: 'string', maxLength: 2000},
          settings: {type: 'array', maxItems: 50, items: {type: 'string', maxLength: 500}},
        }},
    }},
    {type: 'object', additionalProperties: false, required: ['action', 'reason'], properties: {
      action: {const: 'stop'}, reason: {type: 'string', maxLength: 1000},
    }},
  ]},
};

export function recoveryBrowserCatalog(browserTools) {
  return RECOVERY_BROWSER_TOOLS.map(name => {
    const original = browserTools.find(tool => tool.name === name);
    if (!original) throw new Error(`Missing browser recovery tool: ${name}`);
    const tool = structuredClone(original);
    delete tool.inputSchema.properties.filename;
    return tool;
  });
}

export function admitRecoveryBrowserCall(name, args, publishedTools) {
  if (!RECOVERY_BROWSER_TOOLS.includes(name)) throw new Error('BROWSER_RECOVERY_TOOL_FORBIDDEN');
  const tool = publishedTools.find(tool => tool.name === name);
  if (!tool) throw new Error('BROWSER_RECOVERY_TOOL_FORBIDDEN');
  try {
    return validateActionParameters(tool.inputSchema, args);
  } catch {
    throw new Error('BROWSER_RECOVERY_ARGUMENT_FORBIDDEN');
  }
}
