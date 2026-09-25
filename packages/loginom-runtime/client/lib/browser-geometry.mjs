// Read-only measurement in the same browser gate and document as preparation.
// No OS window selection, resizing, external connection or model tool is used.
async function observeGeometry(page, binding) {
  const viewport = page.viewportSize();
  const observed = await page.evaluate(() => ({
    document_id: globalThis.__loginomDockPreparationV1?.id ?? null,
    origin: location.origin + '/', pathname: location.pathname,
    visibility: document.visibilityState,
    inner_width: innerWidth, inner_height: innerHeight,
    outer_width: outerWidth, outer_height: outerHeight,
    screen_x: screenX, screen_y: screenY,
    device_pixel_ratio: globalThis.devicePixelRatio ?? null,
    screen_width: screen.width ?? null, screen_height: screen.height ?? null,
    visual_viewport: globalThis.visualViewport ? {
      width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale,
      offset_left: visualViewport.offsetLeft, offset_top: visualViewport.offsetTop,
    } : null,
    available_left: screen.availLeft, available_top: screen.availTop,
    available_width: screen.availWidth, available_height: screen.availHeight,
  }));
  return { version: 1, source: 'prepare_same_browser_page', ...binding,
    observed_at: new Date().toISOString(), viewport, observed };
}

export function makeBrowserGeometryCode(binding) {
  return `async page => (${observeGeometry.toString()})(page, ${JSON.stringify(binding)})`;
}

export function parseBrowserGeometry(response) {
  if (!response?.isError) for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    try {
      const match = block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/);
      const value = JSON.parse(match?.[1] ?? block.text);
      if (value.version === 1 && value.source === 'prepare_same_browser_page' && value.observed) return value;
    } catch { /* Only a parsed receipt is evidence. */ }
  }
  throw new Error('Browser geometry observation is missing');
}
