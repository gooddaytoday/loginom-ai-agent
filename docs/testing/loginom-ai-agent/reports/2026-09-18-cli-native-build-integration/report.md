# Native CLI build integration — source and Linux candidate

Полный build-cli теперь допускает linux-x64, win32-x64 и darwin-arm64 только
на соответствующей native OS/arch. Agent output directory выбирается согласно
реальному build naming (windows-x64 для Windows binary); итоговые архивы следуют
спецификации win32-x64.zip / darwin-arm64.tar.gz / linux-x64.tar.gz.

Windows использует системный System32/tar.exe для ZIP, macOS /usr/bin/tar для
tar.gz; Linux сохраняет GNU tar reproducible flags. Каждый путь распаковывает
архив и проверяет CLI manifest до exclusive publication. Windows/macOS branches
не исполнялись; наличие исходников не является native PASS. Signing не добавлен.

Linux build 0.1.4-cli.202609180107, prod, dirty snapshot:
`cc3131c8af823ab33fc12a5182503d16fa10475a7defee4e5628fec4edaa5d7b`, commit
c37913ab5ca8f421b76286bf25c282b83cc2de56.
Artifact `/tmp/loginom-cli-native-staging-202609180107`.
Archive `/tmp/loginom-ai-agent-cli-0.1.4-cli.202609180107-linux-x64.tar.gz`.
SHA256 `e21bc79bfdba979ad3d6f57db2c7db35ee53627d699df5a5b5bda7718f395b72`.
Log `/tmp/loginom-cli-native-staging-202609180107.log`.

PASS: native CLI version, build snapshot stability, shared resource staging,
installer bundling, full CLI manifest, extracted archive manifest under umask077,
и отдельная проверка runtime resources комплектным Node (4365 entries).
Host typecheck PASS. Эта сборка не устанавливалась и не проходила live Loginom;
предыдущие installed/live отчёты сохраняют свои версии. Native candidate hashes
не заменяют Product release pins; Windows/macOS manifests помечаются pending.
