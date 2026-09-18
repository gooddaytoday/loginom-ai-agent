# Установка актуальных Desktop и CLI — 2026-09-18

Обе программы собраны из чистого snapshot `697cc2e5addff232f2faeb9be8c4790100995f18`
и установлены в версии `0.1.4-local.20260918.697cc2e5a`, channel `prod`.
Это локальные неподписанные сборки. Пользовательские профили не переносились между продуктами.

## Сборка и установка

- Desktop: `/tmp/loginom-desktop-install-697cc2e5a/loginom-ai-agent-linux-amd64.deb`,
  установлен в `/opt/loginom-ai-agent`, launcher `/usr/bin/loginom-ai-agent`.
  Debian version: `0.1.4~local.20260918.697cc2e5a`.
- CLI archive: `/tmp/loginom-ai-agent-cli-0.1.4-local.20260918.697cc2e5a-linux-x64.tar.gz`.
  SHA256: `dd7b110d884cfaf3436e51c676f20d165d9da2f45d29be0d38ae411e9dbe9299`.
  Установлен в `~/.local/share/loginom-ai-agent-cli/0.1.4-local.20260918.697cc2e5a-prod`,
  launcher `~/.local/bin/loginom-ai-agent-cli`. Установка оставлена для использования.
- Toolchain: Bun 1.3.14, Node 24.19.0; зависимости установлены с frozen lockfile.
- Чистая сборка выявила исключённый из git `packages/agent/script/build-node.ts`:
  скрипт добавлен в git в `697cc2e5a` с исключением в `.gitignore`.
- Проверка DEB исправлена в `96bda8a55`: учитывается Debian-замена дефиса
  prerelease на тильду. Этот verifier-only commit не изменяет собранный payload.

## Выполненные проверки

- Desktop DEB и AppImage: static verification PASS, по 4365 runtime-файлов.
  Хеши артефактов и исходного архива находятся в `desktop-release-manifest.json`.
- Установленные 4365 runtime-файлов Desktop проверены по манифесту: PASS.
- Установленный ASAR совпал с собранным; launcher и desktop entry проверены.
  Единственный найденный при проверке файл config/credentials не изменился.
- GUI smoke установленного Desktop в отдельном профиле через Xvfb: PASS
  (четыре поля onboarding, корректные defaults, пустые secret values).
  Проверка не использовала профиль пользователя и не отключала sandbox.
- CLI: build/extracted manifest verification PASS; установленный launcher прошёл
  `--version`, `--help`, `loginom status --format json` с PATH `/usr/bin:/bin`.
  Help/version не создают профиль; status запускает комплектный host и освобождает writer guard.
- После исправления DEB verifier: 5 packaging tests / 47 assertions и Desktop typecheck PASS.

## Границы проверки

На этой сборке повторены установка, целостность, запуск GUI и CLI status.
Полный Loginom CSV oracle и вызов реальной модели повторно не запускались;
предыдущая приёмка остаётся привязанной к версиям в исторических отчётах.
Юридический аудит отложен пользователем; signing и публикация не выполнялись.
Если пользовательский Desktop был открыт до установки, его нужно полностью
закрыть и запустить снова для перехода на новую версию.
