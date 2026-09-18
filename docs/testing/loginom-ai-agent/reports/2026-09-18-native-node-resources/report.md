# Native Node resources: Windows x64 / macOS arm64

Получены официальные архивы Node v24.19.0. SHA256 архивов сверены с
[SHASUMS256.txt](https://nodejs.org/dist/v24.19.0/SHASUMS256.txt).
Это resource inventory, не release pins и не доказательство запуска на целевой ОС.

| Target | Archive SHA256 | Node binary SHA256 |
| --- | --- | --- |
| win32-x64 | 57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73 | 3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237 |
| darwin-arm64 | 8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d | 27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1 |

Windows binary:
`/home/kiselev/.cache/loginom-ai-agent/native-resources/node-v24.19.0-win-x64/node.exe`.
file: PE32+ console x86-64 Windows.

macOS binary:
`/home/kiselev/.cache/loginom-ai-agent/native-resources/macos-node-verified/node-v24.19.0-darwin-arm64/bin/node`.
file: Mach-O 64-bit arm64. LICENSE и npm closure сохранены из архивов.

Первая macOS extraction остановлена data_filter локального Python 3.10:
реализация tarfile проверяет symlink target относительно extraction root вместо
каталога ссылки. В новом macos-node-verified обычные файлы/каталоги извлечены
с data_filter; три ссылки bin/npm,npx,corepack созданы отдельно после проверки
реального target относительно parent каждой ссылки и принадлежности extraction root.
Частичный первоначальный каталог не используется как проверенный ресурс.

Node на Windows/macOS не запускался; версия установлена по официальному archive
identity. Подпись SHASUMS отдельно не проверялась. Linux release pins не менялись.
Следующие gates: соответствующий Chromium, native execution, resource staging,
platform signing/packaging/acceptance.
