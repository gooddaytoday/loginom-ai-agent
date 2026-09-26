// GENERATED FROM examples/memory-plugin-shared/lib. DO NOT EDIT.
// Retry only reads or failures known to happen before a request was sent.
// A dropped response to add_message/commit/write must never duplicate a write.
export function networkError(error) {
  return {
    message: error?.cause?.message || error?.message || String(error),
    code: error?.cause?.code || error?.code || error?.name || "Error",
  };
}

export async function fetchWithRetry(url, init = {}, { fetchImpl = globalThis.fetch, readOnly = false, onRetry = () => {} } = {}) {
  const safe = readOnly || ["GET", "HEAD"].includes((init.method || "GET").toUpperCase());
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    const code = networkError(error).code;
    const beforeSend = ["EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"].includes(code);
    const transientRead = safe && ["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"].includes(code);
    if (init.signal?.aborted || (!beforeSend && !transientRead)) throw error;
    onRetry(networkError(error));
    // Reuse the caller's deadline; retries do not extend a hook's budget.
    return fetchImpl(url, init);
  }
}
