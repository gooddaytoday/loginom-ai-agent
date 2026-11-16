Импортируй ab.csv (UTF-8, запятая, заголовок): 20 000 строк, RowIndex и UserId целые, TestGroup строка, Converted логический, TotalAds целое, MostAdsDay строка, MostAdsHour целое. Перед настройкой Калькулятора открой предпросмотр исходной таблицы, если это доступно штатными инструментами, и оставь открытым.
Создай один Калькулятор в режиме expression и одним запросом добавь ровно восемь новых полей, исходные семь сохрани:
Batch string "AB test"
NA integer IF(TestGroup="psa",1,0)
NB integer IF(TestGroup="ad",1,0)
YA integer IF((TestGroup="psa") and Converted,1,0)
YB integer IF((TestGroup="ad") and Converted,1,0)
Missing integer IF(IsNull(RowIndex) or IsNull(UserId) or IsNull(TestGroup) or IsNull(Converted) or IsNull(TotalAds) or IsNull(MostAdsDay) or IsNull(MostAdsHour),1,0)
BadGroup integer IF(IsNull(TestGroup) or not IN(TestGroup,"ad","psa"),1,0)
BadExtras integer IF((TotalAds<0) or (MostAdsHour<0) or (MostAdsHour>23) or not IN(MostAdsDay,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"),1,0)
Выполни этот запрос с finish execute и read ports [0], sample_rows 1, require_exact_numbers true. Проверь, нет ли лишнего пустого выражения Expr1.
После Калькулятора сгруппируй по Batch: Rows — количество строк, остальные семь добавленных целых полей просуммируй с сохранением имён. Прочитай полный результат группировки. Экспортируй его в summary.csv в порядке Batch, Rows, NA, NB, YA, YB, Missing, BadGroup, BadExtras, скачай CSV и сохрани сценарий.
