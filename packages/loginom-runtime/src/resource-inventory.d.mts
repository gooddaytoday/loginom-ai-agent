export function resourceInventory(root: string): Promise<{
  path: string
  sha256: string
  link?: string
  directory?: true
}[]>
