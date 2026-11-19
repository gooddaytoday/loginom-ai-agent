export type DashboardStorageOperation = "dashboardRead" | "dashboardPublish" | "dashboardVersions" | "dashboardDelete"

export function dashboardRequest(input: unknown, operation?: DashboardStorageOperation): { directory: string }
export function validPublicationSet(refs: unknown): boolean
