> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-b589bd6a6f2d` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Удалены записи принятых узлов, вошедших в main

Пользователь явно разрешил удаление и самостоятельное завершение начатых узлов.
Проверены acceptance отчёты и Git ancestry main (локальный origin/main также
подтверждён помощником; fetch не выполнялся). Удалены только игнорируемые
исторические диагностические каталоги основного checkout для узлов03–10.
Код, тесты, отчёты, fixtures, Git, резервная копия сервера и все worktrees сохранены.
Узлы11/12 приняты, но не входят в main: их raw evidence НЕ удалялись.

Удалённые каталоги:

- `unavailable:artifact-812b689e159d3c78`
- `unavailable:artifact-6382bddadbeb28a1`
- `unavailable:artifact-1be4ef5443b6cc90`
- `unavailable:artifact-b7dc04677bd65def`
- `unavailable:artifact-3f66224c1841beb3`
- `unavailable:artifact-6f3dbbf5b519fad6`
- `unavailable:artifact-3285f2fb29d23eb3`
- `unavailable:artifact-6e2e85d303edac36`
- `unavailable:artifact-b22a7a61ab04a2a9`
- `unavailable:artifact-1c6935d921dee803`
- `unavailable:artifact-f639a353de17cd8c`

Все11каталогов проверены отсутствующими. Свободное место: до
1.03GiB, после95.61GiB;
фактический прирост94.58GiB.
Receipt `unavailable:artifact-914dcab297bf9e46`.

Старые ссылки отчётов на эти raw файлы теперь исторические: повторный аудит
удалённых прогонов по ним недоступен. Это разрешённое удаление, не потеря
доказательств текущих узлов. Архивные копии не создавались. В первоначальной
попытке read-only artifact directory отказал unlink; owner write добавлен
только каталогам внутри разрешённых деревьев удаления, затем удаление завершено.

После свежей ресурсной проверки продолжены только13/14/16/17:
13—frozen-v4 live/preflight;16—native gates/producers;17—observer native smoke;
14—один Hermes run5 после обязательного свежего preflight, отдельный общий слот.
Новые узлы запрещены. Первичная разработка будущих узлов должна использовать
Goal до первого ревью; это не разрешение запускать их сейчас.
