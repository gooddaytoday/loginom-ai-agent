# Завершение Close перед проверкой неизменности графа

2026-09-28, продолжение согласованного persistence-design.md; private operator.
Основание — source100 writer03 (original66147 exit1): после нашего Close граф
восстановлен, JS locked:false→true, прочие semantic graph fields неизменны.
Наблюдение не доказывает, что lock временный: это проверит следующий live-прогон.

Существующий waitGraphReady проверяет материализацию, package ownership,
отсутствие drag/mask/dialog, но не FLocked. Строгое сравнение графа остаётся
авторитетным; ни игнорирование lock в финальном сравнении, ни принудительное
снятие lock, ни повтор Close не допускаются.

Выбран bounded read-only settlement после успешного closeWizardOnce и до
checkBoundary/source delivery. Альтернативы: немедленный отказ сохраняет
наблюдаемую гонку readiness; глобальное игнорирование locked скрывает чужую
или незавершённую операцию и отвергнуто. Новый helper доступен writer и cold
runtime, без предоставления cold дополнительных методов мутации.

На каждом чтении проверяются account и retained native topology identities.
Временно допускается только locked:true у конкретного исходно unlocked узла
с точными document/workflow/node refs. Все остальные graph fields проверяются
строго (существующее исключение node DOM epochs сохраняется). Финальный граф
обязан совпасть с исходным без нормализации lock. После этого прежние source
process boundary проверки выполняются снова; новый Execute не добавляется.

Лимит: min(original deadline, start+15000ms), не более151 наблюдения,
интервал100ms; проверка срока после чтения и журналирования. Helper не нажимает
кнопки, не вызывает server RPC, не меняет native objects и не повторяет эффект.
Изменение любого другого поля, owner drift, ошибка чтения/журнала или истечение
срока завершают попытку отказом и прежним uncertain cleanup.

Тесты исполняют реальный helper и wrapper: unlock, stuck, foreign lock, graph
position/link/epoch drift, native owner, expired observation/journal, неверный
baseline/ref. Actual source/cold adapter tests проверяют отказ settlement;
cold facade разрешает только новый метод чтения. Полный набор и новый freeze
обязательны до headed live-проверки; local PASS не закрывает G7.
