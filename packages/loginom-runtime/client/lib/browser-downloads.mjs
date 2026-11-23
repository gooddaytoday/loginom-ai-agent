import {join} from 'node:path';

// Chromium appends a GUID and .crdownload. Keep this runtime-owned component
// short for Windows MAX_PATH without moving files outside the private session.
export function browserDownloadsPath(directory){return join(directory,'d');}

// Loginom chooses its save mechanism while loading. File System Access writes
// bypass Playwright downloads and MCP's chooser interception rejects its picker.
// Hide only that capability before page scripts so Loginom uses native downloads.
export function browserDownloadScript(loginomUrl) {
  const origin = loginomUrl ? new URL(loginomUrl).origin : null;
  return `if (${origin === null ? 'true' : `globalThis.location.origin === ${JSON.stringify(origin)}`}) delete globalThis.showSaveFilePicker;`;
}
