// One managed shutdown path. Kernel clipboard leases cannot survive SIGKILL or
// process death; an uncertain result must not voluntarily discard their owner.
export function installManagedShutdown({ close, host = process }) {
  let pending, keepAlive;
  const shutdown = (exitCode = 0) => {
    pending ??= (async () => {
      let result;
      try { result = await close(); } catch { /* Fixed diagnostic below; no upstream text. */ }
      if (result?.browser_transport_closed === true && result?.browser_process_terminated === true
          && result?.clipboard_leases_retained === 0) {
        host.exit(exitCode);
        return result;
      }
      host.exitCode = 1;
      // Keep the owner alive even when another handle disappears during failed
      // cleanup. This is a stop state, not a timeout-based recovery or new lock.
      keepAlive ??= setInterval(() => {}, 2147483647);
      host.stderr.write('Loginom Dock shutdown is unconfirmed. The client remains running to preserve the Loginom session and pending clipboard protection. Inspect its cleanup receipt and browser before recovery. Forced termination cannot confirm package cleanup and removes kernel locks.\n');
      return result;
    })();
    return pending;
  };
  const signal = () => { void shutdown(); };
  host.on('SIGINT', signal);
  host.on('SIGTERM', signal);
  host.stdin.once('end', signal);
  return { shutdown, dispose() {
    host.off('SIGINT', signal); host.off('SIGTERM', signal); host.stdin.off('end', signal);
    if (keepAlive) clearInterval(keepAlive);
  } };
}
