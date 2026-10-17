import {execFile} from 'node:child_process';
import {join, win32} from 'node:path';
import {promisify} from 'node:util';

const execute = promisify(execFile);
const urls = [
  'http://crl.microsoft.com/pki/crl/products/MicRooCerAut2011_2011_03_22.crl',
  'http://crl.microsoft.com/pki/crl/products/MicRooCerAut_2010-06-23.crl',
];

export function isWindowsCryptoRequest(request) {
  return request.method === 'GET' && urls.includes(request.url) && request.headers['user-agent'] === 'Microsoft-CryptoAPI/10.0';
}

export function isWindowsCryptSvcOwner(owner, systemRoot) {
  if (!owner || !systemRoot || !Number.isInteger(owner.pid) || owner.pid <= 0) return false;
  return owner.pid === owner.servicePid && owner.serviceName === 'CryptSvc' && owner.serviceState === 'Running'
    && owner.name?.toLowerCase() === 'svchost.exe' && owner.parentName?.toLowerCase() === 'services.exe'
    && owner.path?.toLowerCase() === win32.join(systemRoot, 'System32', 'svchost.exe').toLowerCase();
}

export async function observeWindowsCryptSvc(socket) {
  // Keep the HTTP connection open until attribution finishes: a closed socket
  // can appear as PID 0, which must never classify a request as an OS probe.
  const command = `$ErrorActionPreference = 'Stop';
    $connections = @(Get-NetTCPConnection -LocalPort ${socket.remotePort} -RemotePort ${socket.localPort} -State Established -ErrorAction SilentlyContinue);
    if ($connections.Count -ne 1) { throw 'Expected one established client endpoint' }
    $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $connections[0].OwningProcess);
    $parent = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $owner.ParentProcessId);
    $service = Get-CimInstance Win32_Service -Filter "Name='CryptSvc'";
    [pscustomobject]@{pid=$owner.ProcessId; name=$owner.Name; path=$owner.ExecutablePath;
      parentName=$parent.Name; servicePid=$service.ProcessId; serviceName=$service.Name;
      serviceState=$service.State} | ConvertTo-Json -Compress`;
  return execute(join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command], {timeout:10000, maxBuffer:64*1024})
    .then(result => JSON.parse(result.stdout))
    .catch(() => undefined);
}

// Names the owner of an unexpected proxy client connection for the failure
// report. It never exempts a request; only a separately proved owner may.
export async function observeWindowsSocketOwner(socket) {
  const command = `$ErrorActionPreference = 'Stop';
    $connections = @(Get-NetTCPConnection -LocalPort ${socket.remotePort} -RemotePort ${socket.localPort} -State Established -ErrorAction SilentlyContinue);
    if ($connections.Count -ne 1) { throw 'Expected one established client endpoint' }
    $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $connections[0].OwningProcess);
    $parent = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $owner.ParentProcessId);
    $services = @(Get-CimInstance Win32_Service -Filter ('ProcessId=' + $owner.ProcessId) | ForEach-Object { $_.Name });
    [pscustomobject]@{pid=$owner.ProcessId; name=$owner.Name; path=$owner.ExecutablePath;
      commandLine=$owner.CommandLine; parentPid=$owner.ParentProcessId; parentName=$parent.Name;
      services=$services} | ConvertTo-Json -Compress`;
  return execute(join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command], {timeout:10000, maxBuffer:64*1024})
    .then(result => {const owner = JSON.parse(result.stdout);
      return {...owner, commandLine:typeof owner.commandLine === 'string' ? owner.commandLine.slice(0, 300) : owner.commandLine};})
    .catch(error => ({error:String(error.message).slice(0, 200)}));
}
