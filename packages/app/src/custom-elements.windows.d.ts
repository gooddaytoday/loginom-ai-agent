import { DIFFS_TAG_NAME } from "@pierre/diffs"

/**
 * Regular-file counterpart of custom-elements.d.ts for Windows Git checkouts
 * where repository symlinks are materialized as their link text.
 */
declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      [DIFFS_TAG_NAME]: HTMLAttributes<HTMLElement>
    }
  }
}

export {}
