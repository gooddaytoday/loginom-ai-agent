// The same selection drives the archive, checksum and commands shown to the user.
export function installation(release, agent, platform) {
  if (!['codex', 'hermes'].includes(agent) || !['darwin-arm64', 'linux-x64', 'win32-x64'].includes(platform)) throw new Error('Unsupported installation selection');
  const entry = release.platforms[platform];
  if (!entry) throw new Error('Unsupported installation selection');
  const windows = platform === 'win32-x64';
  const filename = `loginom-dock-${release.version}-${platform}.${windows ? 'zip' : 'tar.gz'}`;
  const installer = windows ? `powershell -ExecutionPolicy Bypass -File .\\install.ps1 --agent ${agent}` : `./install.sh --agent ${agent}`;
  return {
    filename,
    url: `${release.downloadBase}/${filename}`,
    checksum: windows ? `(Get-FileHash .\\${filename} -Algorithm SHA256).Hash` : `${platform === 'darwin-arm64' ? 'shasum -a 256' : 'sha256sum'} ${filename}`,
    install: windows
      ? `Expand-Archive -LiteralPath .\\${filename} -DestinationPath .\\loginom-dock-package\nSet-Location .\\loginom-dock-package\\loginom-dock\n${installer}`
      : `tar -xzf ${filename}\ncd loginom-dock\n${installer}`,
    sha256: entry.sha256,
    size: `${(entry.bytes / 1048576).toFixed(1).replace('.', ',')} МБ`,
    update: installer,
    rollback: `${installer} --rollback`,
    uninstall: `${installer} --uninstall`,
  };
}
