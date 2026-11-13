import { dashboardResolver } from "./resolver.mjs"

// The installed template kit is read-only; never discover configuration outside the build.
export default { cacheDir: ".vite-cache", server: { fs: { allow: [process.cwd()] } }, css: { postcss: { plugins: [] } }, plugins: [dashboardResolver()] }
