# Панель вывода сообщений

В панели Вывод окна [Предпросмотра](../../../visualization/preview/preview.md) отображаются сообщения стандартного вывода (`sys.stdout`) и стандартного вывода ошибок (`sys.stderr`). По умолчанию панель свернута. Для ее отображения/сворачивания используются кнопки и .

## Примеры

```python
import sys, warnings

#вывод в stdout
print(sys.path[0])
sys.stdout.write(str(99) + '\n')

#вывод в stderr
warnings.warn("Ошибка!")
try:
    а = 10 / 0
except ZeroDivisionError as err:
    sys.stderr.write(str(ZeroDivisionError))
```
