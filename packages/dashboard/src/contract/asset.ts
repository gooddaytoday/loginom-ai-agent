import { extname } from "node:path"

const types: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

export function assetContentType(name: string) {
  if (name.startsWith(".") || /[/\\:%?#\p{Cc}]/u.test(name)) return
  return types[extname(name).toLowerCase()]
}
