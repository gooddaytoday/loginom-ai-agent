import {execFile} from 'node:child_process';
import {join, win32} from 'node:path';
import {isIP} from 'node:net';
import {promisify} from 'node:util';

const execute = promisify(execFile);

export function isWindowsSystemOwner(owner, systemRoot) {
  if (!owner || !systemRoot || !Number.isInteger(owner.pid) || owner.pid <= 0) return false;
  return owner.name?.toLowerCase() === 'svchost.exe' && owner.parentName?.toLowerCase() === 'services.exe'
    && owner.path?.toLowerCase() === win32.join(systemRoot, 'System32', 'svchost.exe').toLowerCase()
    // Protected services.exe can hide ExecutablePath from an unprivileged observer.
    && (owner.parentPath === null
      || owner.parentPath?.toLowerCase() === win32.join(systemRoot, 'System32', 'services.exe').toLowerCase())
    && Array.isArray(owner.services) && owner.services.some(service =>
      service.pid === owner.pid && service.state === 'Running' && typeof service.name === 'string' && service.name.length > 0);
}

export async function observeWindowsCryptSvc(socket) {
  // Use the complete client endpoint, for GET and CONNECT alike. The caller
  // keeps the socket open: PID 0, ambiguous endpoints and lookup errors fail.
  const {remotePort, localPort, remoteAddress, localAddress} = socket;
  if (![remotePort, localPort].every(port => Number.isInteger(port) && port > 0 && port <= 65535)
    || ![remoteAddress, localAddress].every(address => isIP(address))) throw Error('Missing live TCP endpoint');
  const command = `$ErrorActionPreference = 'Stop';
    $connections = @(Get-NetTCPConnection -LocalPort ${remotePort} -RemotePort ${localPort} -State Established -ErrorAction Stop | Where-Object {
      ([ipaddress]$_.LocalAddress).MapToIPv6().Equals(([ipaddress]'${remoteAddress}').MapToIPv6()) -and
      ([ipaddress]$_.RemoteAddress).MapToIPv6().Equals(([ipaddress]'${localAddress}').MapToIPv6())
    });
    if ($connections.Count -ne 1) { throw 'Expected one established client endpoint' }
    if ($connections[0].OwningProcess -le 0) { throw 'TCP owner PID must be positive' }
    $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $connections[0].OwningProcess);
    if (-not $owner) { throw 'TCP owner process disappeared' }
    $parent = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $owner.ParentProcessId);
    $services = @(Get-CimInstance Win32_Service -Filter ('ProcessId=' + $owner.ProcessId) | ForEach-Object {
      [pscustomobject]@{pid=$_.ProcessId; name=$_.Name; state=$_.State}
    });
    [pscustomobject]@{pid=$owner.ProcessId; name=$owner.Name; path=$owner.ExecutablePath;
      parentName=$parent.Name; parentPath=$parent.ExecutablePath; services=$services;
      localAddress=$connections[0].LocalAddress; localPort=$connections[0].LocalPort;
      remoteAddress=$connections[0].RemoteAddress; remotePort=$connections[0].RemotePort
    } | ConvertTo-Json -Compress -Depth 4`;
  const result = await execute(join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command], {timeout:10000, maxBuffer:64*1024});
  return JSON.parse(result.stdout);
}
