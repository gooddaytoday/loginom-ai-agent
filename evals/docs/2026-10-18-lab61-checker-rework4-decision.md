Решение Evaler по четвёртому REJECT LAB-61

Карточка: 01a1214b-4adc-75df-97df-2917732a449a.
Основание: Ben 01a14cbc-3a22-7b52-abc3-53f7801caef7, exact ae8233824a47b39be160cb0295900422cc86d174.
Полномочие: действующее расширение владельца LAB59→63 в шапке; permission f705228205b0eb40f6b1938714b46746898d79ef разрешает заранее увеличивать необходимый rework limit с old/new/usage/reason и сохранением истории. Повторное разрешение того же scope не требуется.

Автоматический цикл остановлен штатным report-событием: четвёртый свежий REJECT при rework_limit=3 даёт EVALER_DECISION_REQUIRED, phase=blocked. Это событие и исходный blocked_context сохраняются. Неизвестный будущий patch не принят.

Отдельное решение: разрешить ОДНУ дополнительную Rich OFFLINE переделку от clean isolated exact ae823382, затем отдельный независимый полный Ben review нового clean SHA. Лимит rework_limit: old=3, new=4. Уже завершены три переделки; fresh REJECT=4, review_cycle=4. Следующий свежий REJECT при новом лимите снова останавливает цикл для решения Evaler. Counters/once/ledger не сбрасываются. Reference15, Rich product10, Ben product10, recovery1, probes0 остаются прежними; никаких новых физических вызовов это решение не разрешает.

Проверенное основание: собственный полный portable replay candidate90 дал 21 совпадение/69 расхождений, parent90 — 54 совпадения; 36 false PASS/33 false FAIL, 33 регрессии. Warning-reader 7/7. Все пять замечаний воспроизведены. Прежние конкретные controls проходят; причина повторения — привязка полярности к целому prefix/suffix и неполная привязка причин/сообщений к проверенным фактам, а не отсутствие live evidence.

Новая гипотеза для адресного TDD: разделить наблюдаемый факт, его причину, отрицание/модальность и упоминание чужого утверждения на уровне соответствующих propositions/clauses с сохранёнными связями. Положение утверждения до/после отдельной причинной гипотезы не меняет его полярность; отрицание причины не отрицает результат. Полный native error, включая несколько предложений, и точный перефразированный отказ должны сопоставляться с установленными фактами, а утверждение native warning — только с привязанным подтверждённым evidence. Не считать это требованием конкретной реализации или принятием неизвестного патча.

Rich сначала фиксирует объяснение дефекта и проверяемую модель границ, затем identical-final-tests RED на unchanged ae → минимальная реализация → GREEN/negative/regression. Исправить все пять замечаний одним этапом. Добавить независимые от буквальных фраз Ben проверки сочетаний: причина/следствие, порядок clauses, полярность и модальность до/после span, цитирование/атрибуция, отказ/успех, многопредложный literal error, утверждаемое/отрицаемое warning и verified/foreign/unknown native evidence. Проверять обе стороны каждой границы; не ограничиваться списком прежних строк.

Область изменения: checker и его поведенческие tests. TASK/input/10 IDs/criteria/допустимые языки и формат ответа, исходные Ben inputs-only ожидания, oracle/reference provenance не менять. Нет обязательной фразы, словаря ответа, структурированного отчёта или LLM-судьи; нет специальных исключений по конкретной строке. Уже принятые inspect/table/exact binding/initial literal omission/native owner/effect/cleanup/once guards не ослаблять. Если предложенная гипотеза требует изменения контракта, вернуть BLOCKED с доказательством.

Перепроверить 10 выбранных genuine reference и 20 имеющихся product histories только offline; отдельные derived reports с новым Git/checker SHA. Raw Rich3/7, Ben2/8, wrapperERROR/zero attempts, прежние FAIL/AMBIGUOUS/ERROR и перенос reservation ordinal1 сохранить. Reference provenance: 6×d6 +3×2e990 +initial×a2ba. Product a2ba, helper f2aa, установки/config/pins/AppArmor неизменны.

Запрещены этим назначением lease/browser/native/model/reference/product/probe/build/install/OS effects и интеграция. Каждый завершает собственные offline-процессы. Не создавать фиктивные completion/RELEASED/FREE. Полный Ben ACCEPT, подтверждённый здоровый FREE и принятая интеграция обязательны до LAB62→63; dev/main/product release не назначены.

Управляющий переход выполняется только continue_after_evaler с новым реальным ID комментария этого решения, текущими issue/report/SHA и target Rich; затем обычные dispatch/receipt. До публикации сохранён стабильный intent LAB61-RICH-CHECKER-REWORK4-ae823382-01a14cbc с outcome ambiguous; phase вручную не переписывается. Все изменения лимита и история связываются с этим опубликованным решением и evaler.state до запуска работника.
