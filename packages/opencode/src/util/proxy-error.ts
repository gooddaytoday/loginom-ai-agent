export function describeProxyFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/\b407\b|proxy authentication required/i.test(message)) return "auth-required"
  if (/ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENETUNREACH/i.test(message)) return "unreachable"
  if (/tunnel|CONNECT/i.test(message)) return "tunnel"
  return undefined
}
