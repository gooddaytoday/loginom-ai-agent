# Прогноз числа конфликтов по классам переименований

- форк `2e6f66a92d961d3e517fb9cc63dc4b4c77039389`, upstream `148842ef7cb1bc34192b3fff57d0f9721ab9c801`, база `501ff62cbf40d4ff260b48c9f1fc113e9b9a83e1`; git version 2.43.0

| комбинация | классы | unmerged-путей | пояснение |
|---|---|---|---|
| baseline | — | 69 | без изменений |
| svckey | svckey | 67 | ключи сервисов Effect @opencode/X (внутреннее) |
| scope | scope | 30 | область пакетов @opencode-ai/ (внутреннее) |
| pkgdir | pkgdir | 63 | каталог packages/opencode (внутреннее) |
| tier1 | svckey,scope,pkgdir | 21 | все внутренние имена |
| env | env | 68 | переменные окружения OPENCODE_* (внешнее) |
| userfiles | userfiles | 68 | каталог и файлы конфигурации/данных пользователя (внешнее) |
| tier1+env | svckey,scope,pkgdir,env | 18 | внутренние + переменные окружения |
| tier1+userfiles | svckey,scope,pkgdir,userfiles | 20 | внутренние + файлы пользователя |
| tier2 | svckey,scope,pkgdir,env,userfiles | 17 | внутренние + внешние имена (нужен адаптер идентичности) |
