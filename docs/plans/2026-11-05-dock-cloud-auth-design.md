# Проектирование и проверка подключения к Loginom AI

Ветка `dock-cloud-auth`, база `loginom` (`dd2f949d11`). Код продукта не изменялся.
Канонические решения: [спецификация](../superpowers/specs/2026-11-05-dock-cloud-auth-design.md).
Этот файл содержит план работы и свидетельства проверки, не вторую спецификацию.

## План обсуждения

- [x] Изучить Agent, канонический Dock и сайт; независимо проверить план исследования.
- [x] Согласовать пользовательские решения и визуальный макет.
- [x] Записать спецификацию.
- [x] Получить первоначальное Spec Review; оно пропустило перечисленные ниже проблемы
      и не является доказательством готовности прежней редакции.
- [x] Завершить повторное независимое ревью технически исправленной спецификации.
      Host/runtime, Dock и auth: Approved. Дополнительно устранена гонка GET
      выдачи новой пары после отзыва установки; повторная auth-проверка одобрила правку.
- [x] Зафиксировать проверенную документацию коммитом в `dock-cloud-auth`.
- [x] Подготовить [план Agent/Dock с TDD](../superpowers/plans/2026-11-06-dock-cloud-auth.md);
      отдельный план реализации сайта в этом репозитории не создавать.

## План исправления замечаний 2026-11-05

- [x] Разделить проверку на Host/runtime/consumers, Dock/backup/ACL, Better Auth.
- [x] Проверить фактические пути вызова, а не только текст прежнего дизайна.
- [x] Уточнить неизвестную topology у пользователя; подтверждено, что reserve
      ещё не существует и будет отдельным инстансом.
- [x] Независимо проверить подход правки: real issues исправить минимальными
      механизмами, не расширять logout на все браузерные сессии и не добавлять
      глобальную модель ACL/репликацию.
- [x] Исправить спецификацию; явно отделить будущие гарантии от проверенных фактов.
- [x] Перепроверить изменённые разделы тремя исследователями и проверить документ.
      Проверены структура разделов, покрытие всех замечаний и пробельные ошибки.

## Результаты проверки замечаний

| Замечание | Вывод и решение в спецификации |
| --- | --- |
| P1-1 | Подтверждено: ready/catalog одноразовые, acquire/tools блокируют повтор. §§3/7/11: connection-required, save до входа, mutable readiness прежнего поколения, retry до gates, тест обновления0.3.9 и восстановления. |
| P1-2 | Подтверждено: product Help обслуживает один child; browser user-v1 remote нужен только startup. §7: удалить его в managed-пути, оставить Host→Help request/reply; reverse IPC и browser transport replacement убраны. |
| P1-3 | Подтверждено: web session позволяет новый вход. §6 ограничивает отзыв уже выданными credentials; all-web logout не вводится. Открытая регистрация не обеспечивает блокировку человека. |
| P1-4 | Подтверждено по code paths: общие agent/resources доступны USER, default search может включать skills. §9 ограничивает все managed Help URI официальной KB, запрещает context mode; серверные ACL KB сохраняются. Общие OpenViking права не перепроектируются. |
| P1-5 | Backup действительно включает auth registry. Неизвестность topology разрешена ответом пользователя: будущий отдельный reserve. §9: независимые volume/registries, отдельная публикация KB, запрет primary full restore поверх reserve. |
| P2-6 | Подтверждено: config/installation binding, quota, errors, provisioning concurrency. §5 задаёт binding/exact disabledPaths/server revoke/явный лимит; §8 — singleflight/cooldown. Вечный запрет refresh до новой local revision отклонён как deadlock. |
| P2-7 | Подтверждено: runtime endpoint override и новые Host HTTP запросы не защищены существующим networking автоматически. §5: fixed release URLs, один build-only staging tuple, proxy/system-CA контракт и native проверка. |
| P2-8 | Подтверждено: build callers, evals, node acceptance и fixtures пропущены. §§10/12 перечисляют их, задают explicit custom setup через stdin и безопасную legacy migration. UI-01 находится в docs/testing/loginom-ai-agent/README.md, не корневом README.md. |
| P2-9 | Подтверждено: management timeout180с и model diagnostics=whole status. §§3/5: короткие start/status/cancel, expiry и guard; отдельные management/model проекции. |
| P3 | §§3–9: отмена незавершённого входа при закрытии формы, смена аккаунта на сайте, удаление revoked credentials с диска, отдельная cloud запись, Linux plaintext факт, общий deadline, реальный масштаб ADMIN. |

## Необязательные предложения

- Приняты Host-owned Help recovery без reverse IPC, redirect:error, закрепление
  reserve только после успешного ответа, сокращение ненужных client response ID.
- Постоянный seed не принят: повторный regenerate с ним не меняет ключ. Recovery
  выдачи/ротации должен учитывать потерянный ответ; детальный выбор хранения и
  повторяемого provisioning относится к отдельному плану сайта.
- Перенос полного primary volume в reserve не используется для обновления KB.
- Глобальные права всех USER OpenViking не меняются: предотвращение попадания
  чужих общих записей в Agent обеспечивается scoped Help и read ACL официальной KB.

## Основания и пределы проверки

Host: connection-service.ts, host.ts, host-port.ts; managed-entry.mjs/bridge.mjs;
knowledge-client.mjs; transport.ts; Desktop/CLI startup; перечисленные consumers.
Dock: api_keys/legacy.py и new.py, storage/acl.py и viking_fs/_access.py,
mcp_endpoint.py, backup-server.sh/restore-server.py, Assets catalog/import.
Better Auth: официальные docs и исходники v1.7.17, включая router.disabledPaths,
verifyApiKey, updateApiKey, signOut/revokeSession и deviceAuthorization.

Не выполнялись runtime-тесты, build, Better Auth/Electron интеграция, изменения
или запросы с credentials к production, исследование бинарника0.3.9.
Сайт и reserve ещё не реализованы. Неизвестны текущие production ACL,
allow_private_networks и внешняя доступность admin API; это условия развёртывания,
не уже доказанные свойства. Макет остаётся иллюстрацией во временной папке.

## План уточнений 2026-11-06

- [x] Сверить proxy с канонической system proxy v2, диагностику с текущим View,
      условие revokeSession с официальным исходником Better Auth v1.7.17.
- [x] Независимо проверить минимальный план правок до изменения спецификации.
      Approved; условие revokeSession сверено также независимым reviewer.
- [x] Уточнить §3–6 и проверки §11: proxy-вариант А, совместимая диагностика,
      raw token той же device-сессии, ротация пары при отзыве пользователя;
      отдельно определить browser check при сохранении до облачного входа.
- [x] Сохранить точки интеграции connection-required для будущего плана.
- [x] Проверить изменённые формулировки независимо, выполнить документальные
      проверки и зафиксировать только документацию.
      Diff получил Approved; `git diff --check` пройден. Проверка без runtime.

Для будущего плана: `connection-required` требует изменить обработку успешного
сохранения и завершения polling в
`packages/app/src/components/settings-loginom-state.ts`, убрать безусловное
`help: ready` из `packages/opencode/src/cli/loginom-management.ts` и распознавать
новый профиль в `evals/src/profile.ts`. Это точки интеграции нового состояния,
а не дефекты существующего кода до начала реализации функции.
В `packages/app/src/components/settings-loginom.tsx` отдельно проверить подписи
после browser check и toast сохранения: browser verified не означает Help ready.
Onboarding сохраняет критерий наличия настроек; CLI automation preflight вправе
требовать фактический Help ready перед работой.

Уточнения подтверждены чтением исходников. Proxy-вариант А не переносит системный
resolver в Host/Help и не меняет system proxy v2. Передача explicit env в Help
не признана доказательством её применения транспортом; эта проверка остаётся
в реализации. Diagnostics сохраняет прежний View в обоих форматах ответа.
Для revokeSession явно требуется raw token той же authenticated device-сессии.
Отзыв пользователя явно ротирует обе Dock credentials. Сохранение до входа
не запускает browser check автоматически; явный Check проверяет его отдельно.

## Подготовка плана реализации 2026-11-06

- [x] Сверить точные интерфейсы, тестовые helpers и команды Agent/Dock.
- [x] Записать план `docs/superpowers/plans/2026-11-06-dock-cloud-auth.md`:
      последовательные TDD-срезы, файлы, интерфейсы, проверки и зависимости выпуска.
- [x] Самостоятельно проверить покрытие спецификации, имена и отсутствие заглушек.
- [x] Получить независимое ревью готового плана и исправить замечания.
      Итог: общее ревью, Host, Dock/runtime — Approved. Документальные проверки пройдены; план зафиксирован вместе с журналом.

План подготовки до исполнения получил независимое Approved. Работа ограничена
документацией; реализация сайта остаётся отдельной задачей в его репозитории.

План содержит 15 задач; все implementation checkboxes пока не выполнены.
Исправлены замечания ревью: реальный порядок save/settled, observable Help snapshot,
write/clear races, installation-bound access_revoked, HTTP/deadline ограничения,
CLI save без browser до входа, зависимость Node integration от build tuple и
реальный двухпроцессный Dock fixture с MCP lifecycle. Публичный HttpApi не нужен.
Проверены пути, структура Markdown, отсутствие незаполненных шагов и покрытие
§§1–12 спецификации; `git diff --check` пройден. Runtime/тесты/сборки не запускались.
Следующий шаг — выбор способа выполнения плана; site/reserve/native gates остаются
отдельными условиями выпуска. Производственный rollout не выполнялся.
