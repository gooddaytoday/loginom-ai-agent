// DOM coordinates remain CSS pixels. This policy removes OS DPI variation,
// but page zoom and fractional layout still require tolerant geometry guards.
export function browserLaunch(headless) {
  return {
    // Maximization needs a window manager; keep the native Files toolbar in
    // view when Chromium starts on a display without one.
    args: headless ? [] : ['--start-maximized', '--window-size=1280,800', '--force-device-scale-factor=1'],
    viewport: headless ? {width:1280,height:800} : null,
    windowMode: headless ? 'headless' : 'maximized',
  };
}
