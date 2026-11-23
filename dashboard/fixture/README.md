`campaign.lgp` — копия эталона `evals/tasks/analytic/campaign-roi-by-channel/reference.lgp` из ветки `analytics-expansion`, сохранённая Loginom master. Рядом лежит оригинальный `data/dataset.csv` из того же задания.

Скопируйте оба файла в `/user/dashboard-roi/` на стенде. Узел «Порог бюджета» перед группировкой оставляет строки `budget >= MinBudget`. Его управляющий порт подключён к переменной сценария `MinBudget`. Dashboard открывается у итогового узла «По убыванию ROI».
