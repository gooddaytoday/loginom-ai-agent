import { EvalFailure } from "./fail"

export type ResourceBound = { scope: string; metric: string; minimum: number | null; maximum: number | null }

export function requireResourceBudgetScopes(bounds: readonly ResourceBound[], coverage: {
  paths: string[]; containers: { role: "server" | "studio"; id: string; startedAt: string }[]
}) {
  const minimums = [
    { scope: "host", metric: "memory.available_bytes", floor: 1 },
    { scope: "host", metric: "memory.swap_free_bytes", floor: 0 },
    ...coverage.paths.flatMap(file => [
      { scope: `filesystem:${file}`, metric: "available_bytes", floor: 1 },
      { scope: `filesystem:${file}`, metric: "available_inodes", floor: 1 },
    ]),
    ...coverage.containers.filter(container => container.role === "server").flatMap(container =>
      ["/workdir/UserStorage", "/workdir/SessionBackup"].flatMap(file => [
        { scope: `container:${container.id}:${container.startedAt}:filesystem:${file}`, metric: "available_bytes", floor: 1 },
        { scope: `container:${container.id}:${container.startedAt}:filesystem:${file}`, metric: "available_inodes", floor: 1 },
      ])),
  ]
  const maximums = [{ scope: "host", metric: "cpu.utilization_percent", ceiling: 100 }, ...coverage.containers.flatMap(container => [
    { scope: `container:${container.id}:${container.startedAt}`, metric: "cpu.cores", ceiling: Infinity },
    { scope: `container:${container.id}:${container.startedAt}`, metric: "memory.current_bytes", ceiling: Infinity },
  ])]
  if (minimums.some(required => !bounds.some(bound => bound.scope === required.scope && bound.metric === required.metric &&
    bound.minimum !== null && bound.minimum >= required.floor)) ||
    maximums.some(required => !bounds.some(bound => bound.scope === required.scope && bound.metric === required.metric &&
      bound.maximum !== null && bound.maximum > 0 && bound.maximum <= required.ceiling))) throw new EvalFailure("RESOURCE_BUDGET_SCOPES_INCOMPLETE", 2)
}

export function validResourceBound(value: unknown): value is ResourceBound {
  const bound = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return typeof bound.scope === "string" && Boolean(bound.scope.trim()) && typeof bound.metric === "string" && Boolean(bound.metric.trim()) &&
    [bound.minimum, bound.maximum].every(value => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0) &&
    (bound.minimum !== null || bound.maximum !== null) && (bound.minimum === null || bound.maximum === null || Number(bound.minimum) <= Number(bound.maximum))
}
