# Desktop regression after shared-host extraction

Development candidate from the current dirty worktree, commit base
c37913ab5ca8f421b76286bf25c282b83cc2de56. Not a signed release and no clean-source
release manifest is claimed. Product backend remains v1.

Desktop package tests: 5 PASS, 47 assertions (packaging configuration/static
resource verifier). Full prebuild/build PASS; 4365 bundled runtime entries,
current shared host and passwordless login fix. Build log
/tmp/loginom-desktop-0220-build.log.

Packaging version override: 0.1.4-cli.202609180220. AppImage produced at
/dev/shm/loginom-desktop-202609180220/loginom-ai-agent-linux-x86_64.AppImage.
Initial combined packaging failed during DEB FPM copy with ENOSPC in /tmp.
It did not install anything. Log /tmp/loginom-desktop-0220-package.log.

DEB packaging retried from the exact prepackaged linux-unpacked directory,
with a dedicated TMPDIR=/dev/shm/loginom-desktop-0220-fpm and --publish never.
Output /dev/shm/loginom-desktop-202609180220-deb; log
/tmp/loginom-desktop-0220-deb.log. Existing installed version before this work:
loginom-ai-agent 0.1.4, /opt/loginom-ai-agent. User processes are not terminated;
GUI acceptance must use an isolated test profile.

Static validation completed: all 4365 resource entries in linux-unpacked passed
verifyResourceTree against its manifest, including ELF architecture checks.
AppImage extracted with unsquashfs using its reported offset; all 4365 extracted
resources verified against the original payload manifest. Logs:
/tmp/loginom-desktop-0220-resource-check.log and
/tmp/loginom-desktop-0220-image-check.log. Installed acceptance not yet performed.

Resumption: DEB retry is still running in command session 65381; compression
process was observed alive (xz PID 97720, CPU active). Poll that session before
any retry. Do not restart based on missing final output. Expected output:
/dev/shm/loginom-desktop-202609180220-deb/loginom-ai-agent-linux-amd64.deb.
After successful packaging, validate DEB extraction, then installed ASAR/resources
and isolated GUI/runtime oracle. Original installed version remains 0.1.4.

DEB retry completed successfully (session 65381 exit 0). Debian version
0.1.4~cli.202609180220, amd64. DEB extracted into tmpfs; 4365 runtime entries
verified against original payload manifest; extracted ASAR equals linux-unpacked.
DEB SHA256 b7e14599023220f01de3477981490cc253fe3b19c2c67c63ae99a90c931b9c1f.
AppImage SHA256 373d51f9a62e41b148041aa6b2c251d7c65843399105e6c28bd14bccce57d0fe.

Rollback baseline verified before installation: release-0.1.4 DEB's app.asar
matches installed /opt/loginom-ai-agent/resources/app.asar, SHA256
13f7482cde905b7858a9e4979e94c1ff0441b8ef6c779657ec612614c7da2858.
Candidate installation started with dpkg; after isolated acceptance restore the
original release-0.1.4 DEB. No user app process is intentionally stopped.

## Installed 02:20 failure and rollback

Candidate dpkg installation completed, but ordinary-user access to installed
app.asar and desktop entry failed with permission denied. GUI smoke failed to
launch. **Installed acceptance FAIL**: packaging inherited umask 077, making
root-owned package contents inaccessible to ordinary users. Prior hash-only
static validation did not detect this permission failure.

Restored original release-0.1.4 DEB successfully. dpkg status is install ok
installed 0.1.4; installed ASAR again matches
13f7482cde905b7858a9e4979e94c1ff0441b8ef6c779657ec612614c7da2858.
Logs: /tmp/loginom-desktop-0220-install.log,
/tmp/loginom-desktop-0220-installed-gui.log, /tmp/loginom-desktop-0220-restore.log.
User app processes were not intentionally stopped; fully restart Desktop before
using it after these package replacements.

## Packaging permission fix

Linux builder explicitly uses umask 022 for FPM-generated desktop metadata.
Linux afterPack normalizes payload directories to 0755, executable files to
0755, ordinary files to 0644; symlinks are not followed. Bundled Chromium sandbox
helper is then restored to 04755 as before. This applies only to package contents,
not profiles. Static artifact verification now also rejects inaccessible public
payload directories/files and desktop entries.

Tests: 6 PASS, 53 assertions; Desktop package typecheck PASS. Starting builder
configuration under umask 077 yields 022: PASS. Permission verifier rejects the
old extracted DEB and accepts the new linux-unpacked payload. New 02:25 packaging
was launched from private umask 077 to exercise the fix; it is still running in
command session 60769. Output /dev/shm/loginom-desktop-202609180225, log
/tmp/loginom-desktop-0225-package.log. Poll existing process before retrying.
Installed acceptance of 02:25 remains pending. It reuses the already built app
JS; changes are packaging-only. All tmpfs artifacts remain ephemeral.

02:25 AppImage extracted to /dev/shm/loginom-desktop-0225-image-check.
Public file/directory permission audit PASS; all 4365 runtime entries verified
against the original payload manifest. Log /tmp/loginom-desktop-0225-image-check.log.
A first ad-hoc verifier command had a JavaScript syntax typo; corrected command
completed successfully without modifying the extracted artifact. DEB packaging
continues in the existing session 60769; no duplicate packaging was started.

02:25 packaging completed (session 60769 exit 0). DEB public payload/desktop-entry
permissions PASS; 4365 extracted runtime entries PASS; ASAR matches original
payload. DEB SHA256 c185f5ac3ae844c018a7aeda642e755ab18eaaad2c040791b6e7b18089f903f3;
AppImage SHA256 a47bccb16e8951ee6844322b546076f3bb00bbb8550e883df733b792480d14cf.

Actual dpkg install completed: 0.1.4~cli.202609180225 install ok installed.
Ordinary-user desktop entry read PASS, Name=Loginom AI Agent,
Exec=/opt/loginom-ai-agent/loginom-ai-agent %U. Installed ASAR equals extracted
ASAR: 9b449ea9f296f2aee0c7248f08b3b5df37f2c632aa7e807544403ee34931287c.
Installed public permissions and all 4365 runtime entries PASS.

Installed GUI smoke PASS through /usr/bin/loginom-ai-agent with restricted PATH
and isolated test root: four fields, no password placeholders, expected default
URL/username, empty secret fields. Log /tmp/loginom-desktop-0225-installed-gui.log.

Full installed Desktop CSV oracle is running in command session 8442, evidence
/tmp/loginom-linux-oracle-PfL1DD, log /tmp/loginom-desktop-0225-installed-oracle.log.
Its Python wrapper restores the original release-0.1.4 DEB in finally and verifies
the baseline ASAR hash, writing /tmp/loginom-desktop-0225-acceptance-summary.json.
Do not claim rollback or oracle success until that wrapper completes.

Installed CSV oracle intermediate evidence: dataset A import/group/save PASS,
Alpha=35, Beta=20, total=55. Independent cold reopen/readback PASS, total=55,
settingsReapplied=false. Dataset B and wrapper rollback are still pending.
These results use real installed Desktop/Loginom/Chromium with scripted provider;
no real-provider or native-platform conclusion follows.

## Final installed 02:25 result: PASS (development Linux scope)

Dataset B import/group/save PASS: Alpha=100, Beta=1, total=101.
Independent cold reopen/readback PASS, total=101, settingsReapplied=false.
The full oracle returned exit 0 and confirmed distinct original-user inputs
with the same filename sales.csv across separate chats, totals 55/101 and
independently reopened saved packages. Evidence /tmp/loginom-linux-oracle-PfL1DD.
This runs actual installed Desktop/backend v1, bundled Chromium and real Loginom;
provider is scripted. It is not real model quality/authorization acceptance.

Wrapper completed: oracleCode=0, restoreCode=0, restoredAsarMatches=true.
Summary /tmp/loginom-desktop-0225-acceptance-summary.json; dpkg confirms
0.1.4 install ok installed after rollback. Fully restart any pre-existing Desktop
process before subsequent use; the test did not terminate user processes.

Linux installed Desktop regression after host extraction is now demonstrated for
this candidate, including the passwordless login and packaging permission fixes.
Artifacts remain unsigned development outputs on tmpfs. Clean release source
manifest, native OS verification, signing and real model provider gates remain
outside this PASS; old 02:20 failed installation remains explicitly FAIL.
