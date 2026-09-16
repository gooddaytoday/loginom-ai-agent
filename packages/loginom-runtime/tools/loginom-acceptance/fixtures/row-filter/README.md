# Row Filter golden fixture

Ten records, including one exact duplicate. `NULL` is the explicit null marker;
the quoted empty Text at Id=4 is a non-null empty string. All fields at Id=5
except Id are null. Numeric values require more than two decimal places;
datetime values differ by seconds. Compare complete row multisets on both ports,
not only Id sets. Both ports together must reproduce the input multiset exactly.

Use explicit types Id=integer, Amount=real, Flag=boolean, When=datetime,
Text=string; delimiter `;`, decimal separator `.`, text qualifier `"`, UTF-8.
This fixture and its independent oracle are diagnostic expectations, never
instructions injected into the autonomous executor's goal.
