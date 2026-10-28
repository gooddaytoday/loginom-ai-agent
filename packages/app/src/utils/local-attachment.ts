// Browser-safe native picker descriptor; no File or Blob is allocated for it.
export type LocalAttachmentReference = {
  kind: "local_reference"
  sourcePath: string
  filename: string
  size: number
  lastModified: number
  mime: string
  receipt: string
}
