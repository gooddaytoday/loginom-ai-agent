// Loginom chooses its save mechanism while loading. File System Access writes
// bypass Playwright downloads and MCP's chooser interception rejects its picker.
// Hide only that capability before page scripts so Loginom uses native downloads.
export function browserDownloadScript(loginomUrl) {
  const origin = loginomUrl ? new URL(loginomUrl).origin : null;
  return `if (${origin === null ? 'true' : `globalThis.location.origin === ${JSON.stringify(origin)}`}) delete globalThis.showSaveFilePicker;`;
}
