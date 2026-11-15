# Dashboard M4 — checkpoint

- Основа checkout: `bbef0b2e4fabda3aba524823dba20c8130419a8e`, ветка `dashboard-m4`.
- Tasks 0–6 приняты; Task 6 Spec/Quality Approved, обязательных замечаний нет.
- Текущие команды, версия/source поставки, результаты и история — [runbook M4](dashboard-m4.md).
- Task 7 source gate PASS; три whole-branch замечания по коду исправлены, strongest re-review Approved.
- Общая чистая Desktop/CLI поставка установлена; оба normal-profile master main path PASS.
- Холодный Desktop: controlled IPC pending/consumed → ready/downloaded и отдельно normal cold UI PASS.
- Обновлённый образ трёх ролей на migrated стенде: identity/isolation/check и три pending → ready PASS.
- M3-переход сохранный: все21 исходные записи UserStorage, primary src/control и published state прежние.
- Original M3 trio/images/data, старые артефакты и раздельные Desktop/CLI источники сохранены; rollback не выполнялся.
- Собственные Desktop/CLI имеют дисковую историю; пользовательское приложение принудительно не закрывалось.
- Native Close/Logout отделён от runtime ACK/exit; .3 app/runtime/own Xvfb exit PASS.
- Historical Knowledge ACK→SIGKILL: причина UNKNOWN; поздний PASS не объясняет прежний сбой.
- Full release 7.4.x при отсутствии полноценного стенда — M5; bare-stand ordinary Logout NOT_PROVEN, выполнен own maintenance.
- Private configs, credentials, raw logs, команды и receipts вне Git; прежние FAIL сохранены.
- Следующий шаг: controller final Task7 review, whole-branch closure и completion audit; M4 ещё не объявлен завершённым.
- Push/merge/release и очистка прежних данных не разрешены этим результатом.
