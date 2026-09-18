// Build candidates only, not release acceptance. Values are from the verified
// native archive inventory reports dated 2026-09-18; native execution is pending.
export const nativeResourceCandidates = {
  "win32-x64": {
    chromiumRevision: "1243",
    node: "bin/node.exe",
    browser: "chromium-1243/chrome-win64/chrome.exe",
    nodeSha256: "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
    browserSha256: "9b07943f834485b43c9d54caea2951c78715f9f07070a80ab6658465ebd3e711",
  },
  "darwin-arm64": {
    chromiumRevision: "1243",
    node: "bin/node",
    browser: "chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    nodeSha256: "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1",
    browserSha256: "8319963f6625accf51c0dd4f55091ceaf9f09ed39e7a52fed4fae12b2a6b668a",
  },
}
