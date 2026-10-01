# DataPartition: предлагаемая интеграция cold harness

Статус: APPROVED_SCOPE / IMPLEMENTED_SOURCE, native cold NOT_RUN, не PASS.
Interaction: 3c0080b6-e8cc-4172-9076-35015885781c.
Исследованный source SHA: 270098e12bcb466bfb27bc29df757d8658cfc777.

## Точная причина

`cold-contract.mjs` имеет закрытый список settings kinds import/grouping/crosstable;
`cold-check.mjs` не dispatch readDataPartition.
`multi-output-oracle.mjs` допускает только invariant partition с одинаковыми
schemas, source occurrence ID и exhaustive source; combined DataPartition имеет
служебный boolean, а training+test могут отобрать меньше исходного N.
Native random outputs нельзя записывать как independent expected.

## Минимальный предлагаемый scope

- В cold-contract добавить только `data-partition-ui-v1` settings kind.
  Сравнивать verified native mode/parameters и input field identities; не record IDs.
- В cold-check добавить only DataPartition observation dispatch и readiness;
  штатно open → read → close с settings_applied=false, затем существующий fresh
  owned execution, все три ports, precision/complete schemas, links и cleanup.
- В multi-output-oracle добавить only `partition-selected` invariant с тремя
  fixed semantic roles, независимыми source occurrences, отдельным boolean
  membership и exact declared output counts. Occurrences bound by source payload;
  combined multiplicity equals training+test; replacement policy explicit.
  Не требовать exhaustive source, не копировать PRNG.
- Node-specific квоты/order/size math фиксируются независимыми expected после
  различающих экспериментов. Новый invariant не разрешает альтернативные rounding.
- Адресные positive/negative controls: NULL/value/port/schema/occurrence,
  same-count substitution, cached/stale/filtered/partial reads и membership.

Legacy behavior, guards, owner/SHA/links, lifecycle, formats restoration и другие
handlers сохраняются. Никаких сервисов, discovery механизмов, release или merge.
Собственная registry entry/hash/generated inventory разрешены plan от 14:36; readiness не повышается.
