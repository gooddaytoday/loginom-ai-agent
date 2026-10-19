// Temporary browser recovery: the same model receives a fixed allowlist of
// standard Playwright MCP tools under a bridge-owned browser lease. Everything
// outside this list stays refused at the execution boundary even if the name
// leaks into the model's catalog (design 2026-10-19-browser-recovery, §7).
export const browserRecoveryToolName = 'dock_browser_recovery';

export const recoveryBrowserTools = Object.freeze([
  'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_click', 'browser_hover', 'browser_type',
  'browser_press_sequentially', 'browser_press_key', 'browser_fill_form', 'browser_select_option', 'browser_check',
  'browser_uncheck', 'browser_drag', 'browser_mouse_click_xy', 'browser_mouse_drag_xy', 'browser_mouse_move_xy',
  'browser_mouse_wheel', 'browser_handle_dialog', 'browser_wait_for',
]);

const recoveryBrowserToolSet = new Set(recoveryBrowserTools);

export function isBrowserRecoveryTool(name) {
  return name === browserRecoveryToolName || recoveryBrowserToolSet.has(name);
}

export function isRecoveryBrowserTool(name) {
  return recoveryBrowserToolSet.has(name);
}
