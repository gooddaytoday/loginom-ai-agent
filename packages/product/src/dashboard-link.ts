export const dashboardLinkEvent = "loginom:dashboard-link"

export type DashboardLinkResult = { readonly id: string } & (
  | { readonly code: string }
  | {
      readonly directory: string
      readonly nodeName: string
      readonly action: "create" | "edit"
      readonly notice?: { readonly kind: string }
    }
)

declare global {
  interface Window {
    loginomDashboardLinks?: DashboardLinkResult[]
  }
}
