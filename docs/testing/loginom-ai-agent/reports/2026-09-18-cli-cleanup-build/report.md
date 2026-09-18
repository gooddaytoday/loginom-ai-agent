# CLI cleanup/profile candidate — 0.1.4-cli.202609180038

Linux x64, prod, dirty source candidate. Source commit
c37913ab5ca8f421b76286bf25c282b83cc2de56, snapshot
`2bac138ec28265e5c36a5e5a710689dfe80350267bdcf56eb86b55e1235b215c`.

Artifact `/tmp/loginom-cli-cleanup-202609180038`.
Archive `/tmp/loginom-ai-agent-cli-0.1.4-cli.202609180038-linux-x64.tar.gz`,
SHA256 `187bb1a89a831c5bc00d6048fd9ba161051d0dfcdd83e5413d1516698d6fb182`.
Build log `/tmp/loginom-cli-cleanup-202609180038.log`.

Pinned Bun 1.3.14, Node 24.19.0, Chromium1243 inputs. Build under umask077
completed exit0, checked source stability, native version smoke, full resource
manifest and extracted archive manifest. Includes latest IPC disconnect and
bounded host cleanup fixes, POSIX profile permissions and Windows ACL source.
Windows/macOS source inclusion is not native platform acceptance.

Actual install.sh installed versioned user payload and ~/.local/bin launcher.
With PATH=/tmp/loginom-cli-path-1930 (no Node/Bun/Chrome/Desktop), installed CLI
passed --version, --help and unconfigured loginom status --format json.
An explicit test profile root with mode0755 returned exit1 and
PROFILE_PERMISSIONS_INVALID without writing files. Ordinary test profile
released its guard. Evidence `/tmp/loginom-cli-cleanup-acceptance-huvsqsid`.

Actual uninstall.sh exit0. Separate lexists checks confirmed launcher, payload
and current.json absent. SHA256 comparison of every regular file in this newly
created unconfigured test profile (one marker file) matched before/after uninstall.
This is not a hash audit of all pre-existing user profiles or Desktop data.

No live Loginom/browser/provider execution or TUI performed on this candidate.
No signature, publication, native Windows/macOS, active external mutation crash
or installed Desktop package acceptance. Prior live evidence retains its original
artifact identity and is not relabelled as this build.


## Последующая live проверка потери владельца

CLI из artifact каталога (после завершённого install/uninstall выше) открыл
существующий тестовый пакет через настоящий Node host и Chromium. Изменения
пакета не отправлялись. Сигнал отправлен после успешного prepare receipt.

SIGKILL evidence `/tmp/loginom-cli-owner-crash-dquG02`: exit137, tracked24,
alive=[], guarded=true, повторный status exit3 PROFILE_BUSY. Guard сохранён;
никакого offline снятия guard или acknowledgement этим прогоном не выполнялось.
SIGINT evidence `/tmp/loginom-cli-owner-crash-0Yz6bX`: exit130, tracked24,
alive=[], guarded=false, повторный status exit0, PROFILE_BUSY отсутствует.

Driver проверил отсутствие API key в stdout/stderr и retry output. Логи вне git:
`/tmp/loginom-cli-cleanup-crash-202609180038.log`,
`/tmp/loginom-cli-cleanup-sigint-202609180038.log`.
Это real browser lifecycle после завершённого read/open, не active external
mutation crash и не CSV/TUI acceptance. Предыдущий абзац про отсутствие live
execution описывает только первоначальный install smoke до этих прогонов.
