-- SQLite fixture for imports-database stage 1 (LAB-1544).
-- Declared types are SQLite affinities; Loginom's type mapping is observed, not assumed.
PRAGMA encoding = 'UTF-8';
CREATE TABLE People (
  Id INTEGER PRIMARY KEY,
  Label TEXT,
  Amount REAL,
  Active BOOLEAN,
  Occurred DATETIME
);
INSERT INTO People (Id, Label, Amount, Active, Occurred) VALUES
  (1, 'А',         10.5,  1,    '2024-02-29 12:30:01'),
  (2, 'А',         20,    0,    '2024-03-01 00:00:00'),
  (3, NULL,        NULL,  NULL, NULL),
  (4, '',          -5.25, 1,    '2023-12-31 23:59:59'),
  (5, 'Кириллица', 0,     0,    '2024-01-15 08:05:09'),
  (6, 'Б',         30,    1,    '2024-02-29 12:30:01');
CREATE VIEW PeopleView AS SELECT Id, Label, Amount, Active, Occurred FROM People;
