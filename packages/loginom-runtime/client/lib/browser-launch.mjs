// DOM coordinates remain CSS pixels. This policy removes OS DPI variation,
// but page zoom and fractional layout still require tolerant geometry guards.
export function browserLaunch(headless) {
  return {
    args: headless ? [] : ['--start-maximized', '--force-device-scale-factor=1'],
    viewport: headless ? {width:1280,height:800} : null,
    windowMode: headless ? 'headless' : 'maximized',
  };
}
