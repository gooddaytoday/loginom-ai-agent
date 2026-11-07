// DOM coordinates remain CSS pixels. This policy removes OS DPI variation,
// but page zoom and fractional layout still require tolerant geometry guards.
export function browserLaunch(headless, platform = process.platform, env = process.env) {
  // An explicit --window-size puts Chromium in the normal window state and
  // overrides --start-maximized on every OS (0.3.8–0.3.9 opened 1280×800 on
  // desktops). Size the window only on Linux without a desktop session (Xvfb
  // stands), where nothing maximizes it and the native Files toolbar would
  // otherwise fall off the edge.
  const fixedSize = platform === 'linux' && !env.XDG_CURRENT_DESKTOP && !env.DESKTOP_SESSION && !env.WAYLAND_DISPLAY;
  return {
    args: headless ? [] : ['--start-maximized', ...(fixedSize ? ['--window-size=1280,800'] : []), '--force-device-scale-factor=1'],
    viewport: headless ? {width:1280,height:800} : null,
    windowMode: headless ? 'headless' : 'maximized',
  };
}
