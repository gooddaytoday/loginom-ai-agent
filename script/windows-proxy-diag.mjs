import {readFile, writeFile} from 'node:fs/promises';

// Diagnostic branch only: retain every assertion and hold the trap connection
// open while Windows attributes its client-side TCP endpoint to a process.
const file = 'test/browser-proxy.integration.test.mjs';
const source = await readFile(file, 'utf8');
const original = "requests.push(request.url); response.end('PROXY');";
if (!source.includes(original)) throw Error('Proxy diagnostic insertion point changed');
const diagnostic = `requests.push(request.url);
    const observed = {method:request.method, url:request.url, userAgent:request.headers['user-agent'],
      clientPort:request.socket.remotePort, proxyPort:request.socket.localPort};
    console.log('[proxy-diag-request]', JSON.stringify(observed));
    const command = \`$ErrorActionPreference = 'Stop';
      $connections = @(Get-NetTCPConnection -LocalPort \${request.socket.remotePort} -RemotePort \${request.socket.localPort} -ErrorAction SilentlyContinue);
      @($connections | ForEach-Object {
        $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess);
        $parent = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $owner.ParentProcessId);
        [pscustomobject]@{Pid=$owner.ProcessId; Name=$owner.Name; Path=$owner.ExecutablePath;
          CommandLine=$owner.CommandLine; Created=$owner.CreationDate; ParentPid=$owner.ParentProcessId;
          ParentName=$parent.Name; ParentCommandLine=$parent.CommandLine}
      }) | ConvertTo-Json -Depth 4 -Compress\`;
    void execute(join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', command], {timeout:15000, maxBuffer:1024*1024})
      .then(result => console.log('[proxy-diag-owner]', JSON.stringify({...observed, ownership:result.stdout.trim()})),
        error => console.log('[proxy-diag-unavailable]', JSON.stringify({...observed, error:error.message})))
      .finally(() => response.end('PROXY'));`;
await writeFile(file, source.replace(original, diagnostic));
console.log('Proxy PID diagnostics enabled; existing assertions and timeouts retained');
