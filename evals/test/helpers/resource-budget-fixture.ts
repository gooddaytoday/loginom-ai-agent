import type { ResourceBound } from "../../src/parallel-resource-budget"

// Declared-only test thresholds; these do not select or qualify any live budget.
export function resourceBudgetFixture(paths: string[], containers: { role: "server" | "studio"; id: string; startedAt: string }[]): ResourceBound[] {
  return [
    { scope: "host", metric: "cpu.utilization_percent", minimum: null, maximum: 100 },
    { scope: "host", metric: "memory.available_bytes", minimum: 1, maximum: null },
    { scope: "host", metric: "memory.swap_free_bytes", minimum: 0, maximum: null },
    ...paths.flatMap(file => [
      { scope: `filesystem:${file}`, metric: "available_bytes", minimum: 1, maximum: null },
      { scope: `filesystem:${file}`, metric: "available_inodes", minimum: 1, maximum: null },
    ]),
    ...containers.flatMap(container => [
      { scope: `container:${container.id}:${container.startedAt}`, metric: "cpu.cores", minimum: null, maximum: 4 },
      { scope: `container:${container.id}:${container.startedAt}`, metric: "memory.current_bytes", minimum: null, maximum: 1024 ** 3 },
      ...container.role === "server" ? ["/workdir/UserStorage", "/workdir/SessionBackup"].flatMap(file => [
        { scope: `container:${container.id}:${container.startedAt}:filesystem:${file}`, metric: "available_bytes", minimum: 1, maximum: null },
        { scope: `container:${container.id}:${container.startedAt}:filesystem:${file}`, metric: "available_inodes", minimum: 1, maximum: null },
      ]) : [],
    ]),
  ]
}
