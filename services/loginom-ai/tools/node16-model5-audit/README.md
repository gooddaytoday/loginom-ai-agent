# Отдельный аудит пятого прогона Node16

Run `20260914-004604-475bb0c8`, source8cd5c281/runtime17b0, execution harness ef6ba6b0.
Оригинальные request/scenario/evidence/attempt не изменяются. Wrapper завершился2
после model exit0 из-за AttributeError: Hermes вернул строки dedup/spillover вместо
объекта результата. Исходный collapse-audit.json не был создан; exception сохранён.

`reevaluate.py` проверяет хеши исходного экспорта и каждого файла frozen harness.
Затем в отдельном экземпляре аудитора восстанавливает только transport:

- Два duplicate notice связываются с единственным прежним ответом того же
  provider_tool_call_id, session, tool и точных arguments. Это промежуточный
  running import-wide, не подстановка успешного результата.
- Два spillover читаются только из cache текущего run с именем исходного call ID;
  проверяются путь, отсутствие symlink, длина, точный preview и operation_id.
  Хеши полных файлов включены в отчёт. Итог wide проходит неизменный full case
  oracle и точное сравнение с исходным native journal, включая типы и binding.
- В отдельном экземпляре verify_loss изменена единственная проверка текста
  локальной обёртки: `Public node outcome absent`. Все последующие проверки
  исходного public resume/wait остаются: NODE_WORKER_REJECTED, unresolved phase,
  outcome=null, неизменные параметры и отсутствие браузерных действий.
  Исходные loss JSON и public-api.jsonl не редактируются.

Все исходные semantic predicates и полный scope сохранены. Ни исходный evidence,
ни исходный execution harness не переписываются. Это versioned full audit, а не
успешный исходный wrapper. Старые четыре прогона не переобозначены как PASS.

Четыре тестовых метода проверяют десять оригинальных случаев и 11 подмен:
неизвестный ответ, чужая duplicate ссылка/arguments, чужой spill path/length,
изменение полного spill вне preview, повтор с дополнительным действием,
изменённый cached result, неверный native flag/status, отсутствующий raw refusal.
Тесты требуют сохранённых локальных доказательств; их отсутствие — ошибка,
а не доказательство приёмки.

```sh
python3 -m unittest discover -s tools/node16-model5-audit -p 'test_transport.py' -v
python3 tools/node16-model5-audit/reevaluate.py .dock/node16/hermes-runs/20260914-004604-475bb0c8 --independent .dock/node16/hermes-runs/20260914-004604-475bb0c8/independent/bundle.json --output .dock/node16/hermes-runs/20260914-004604-475bb0c8/versioned-full-audit-v1.json
```

Сравнение относится к неслитой ветке; main, установленный клиент и server current
не описываются результатом этого аудита. При изменении frozen harness для повторной
проверки необходим исходный execution checkout ef6ba6b0 и сохранённые evidence.
