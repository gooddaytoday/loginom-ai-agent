import { createHash } from 'node:crypto';
import { savedPackagePath } from '../client/lib/write-outcome.mjs';

export async function savedCopyDigest(context, path) {
  if (!savedPackagePath(path)) return null;
  const page = context.pages()[0];
  if (!page) return null;
  const encoded = await page.evaluate(async path => {
    const connection = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection;
    if (!connection?.Connected || !connection.Session || !connection.UserName) return null;
    const storage = await connection.Session.get_FileStorage();
    const info = await storage.GetFileInfo(path);
    if (!info) return null;
    let size;
    try { size = await info.Size; } finally { await ReleaseObject(info, true); }
    if (!Number.isSafeInteger(size) || size < 1 || size > 1_048_576) return null;
    const stream = await storage.OpenFile(path, bg.TBGFileOpenMode.fomRead);
    try {
      if (await stream.Size !== size) return null;
      const bytes = new Uint8Array(size);
      await stream.ReadBuffer(bytes);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 16384)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      return btoa(binary);
    } finally {
      await ReleaseObject(stream, true);
    }
  }, path).catch(() => null);
  return encoded ? createHash('sha256').update(Buffer.from(encoded, 'base64')).digest('hex') : null;
}
