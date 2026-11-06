import { createHash, createHmac, createPublicKey, verify } from "node:crypto"

export type UpdateS3Config = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export function parseUpdateS3Config(value: unknown): UpdateS3Config {
  const config = value as UpdateS3Config | undefined
  if (
    !config ||
    typeof config !== "object" ||
    ![config.endpoint, config.region, config.bucket, config.accessKeyId, config.secretAccessKey].every(
      (value) => typeof value === "string" && value.length > 0,
    ) ||
    !/^[a-z0-9-]+$/.test(config.region) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) ||
    !/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(config.accessKeyId)
  )
    throw Error("LOGINOM_UPDATE_S3_CONFIG_INVALID")
  if (!URL.canParse(config.endpoint)) throw Error("LOGINOM_UPDATE_S3_CONFIG_INVALID")
  const url = new URL(config.endpoint)
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw Error("LOGINOM_UPDATE_S3_CONFIG_INVALID")
  return {
    endpoint: url.href,
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  }
}

// S3 SigV4 query authentication. Signing GET URLs keeps all network I/O in the
// updater's proxy-aware Electron session; the secret key never enters the URL.
export function presignUpdateGet(config: UpdateS3Config, key: string, options: { now?: Date; expires?: number } = {}) {
  const expires = options.expires ?? 3600
  if (
    !Number.isInteger(expires) ||
    expires < 1 ||
    expires > 604800 ||
    key.split("/").some((part) => !part || part === "." || part === ".." || /[%\\?#]/.test(part))
  )
    throw Error("LOGINOM_UPDATE_S3_TARGET_INVALID")
  const encode = (value: string) =>
    encodeURIComponent(value).replace(/[!'()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase())
  const url = new URL(config.endpoint)
  url.hostname = config.bucket + "." + url.hostname
  url.pathname = "/" + key.split("/").map(encode).join("/")
  const timestamp = (options.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "")
  const date = timestamp.slice(0, 8)
  const scope = `${date}/${config.region}/s3/aws4_request`
  const query = Object.entries({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": config.accessKeyId + "/" + scope,
    "X-Amz-Date": timestamp,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => encode(name) + "=" + encode(value))
    .join("&")
  const hash = (value: string) => createHash("sha256").update(value).digest("hex")
  const canonical = ["GET", url.pathname, query, "host:" + url.host + "\n", "host", "UNSIGNED-PAYLOAD"].join("\n")
  const signingKey = [date, config.region, "s3", "aws4_request"].reduce(
    (key, value) => createHmac("sha256", key).update(value).digest(),
    Buffer.from("AWS4" + config.secretAccessKey),
  )
  const signature = createHmac("sha256", signingKey)
    .update(["AWS4-HMAC-SHA256", timestamp, scope, hash(canonical)].join("\n"))
    .digest("hex")
  url.search = query + "&X-Amz-Signature=" + signature
  return url.href
}

export function redactUpdateMessage(message: string) {
  return message
    .replace(/(https?:\/\/[^\s"<>?]+)\?[^\s"<>]*/gi, "$1?[REDACTED]")
    .replace(/X-Amz-(?:Credential|Signature|Security-Token)=[^&\s<>"']+/gi, "X-Amz-REDACTED")
}

export const UPDATE_PUBLIC_KEYS = Object.freeze([
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAekkV+yIMJpDlzXoJAWpT9ifgHKbKe5PJdtGC8FjmJ2c=\n-----END PUBLIC KEY-----\n",
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuVor7DX+ReBZ+tg8gXaygsXqxF+WKA9dijYEIDNHTtc=\n-----END PUBLIC KEY-----\n",
])

/** Verify the downloaded bytes before parsing; either pinned key permits rotation. */
export function verifyUpdateSignature(
  bytes: Uint8Array,
  signature: string,
  keys: readonly string[] = UPDATE_PUBLIC_KEYS,
) {
  const encoded = signature.trim()
  if (!/^[A-Za-z0-9+/]{86}==$/.test(encoded)) return false
  const decoded = Buffer.from(encoded, "base64")
  if (decoded.toString("base64") !== encoded) return false
  return keys.some((pem) => {
    try {
      const key = createPublicKey(pem)
      return key.asymmetricKeyType === "ed25519" && verify(null, bytes, key, decoded)
    } catch {
      return false
    }
  })
}
