/**
 * Read-only snapshot for an existing conversation. Null means unavailable
 * for open/modified, and no known path for a draft. Timestamps are Unix
 * milliseconds for detection and confirmation, respectively.
 * A non-null staleForSeconds gives the age of a cached package observation.
 */
export const packageStateRpc = {
  id: "loginom.package-state",
  methods: {
    snapshot: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string", minLength: 1 } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      errors: { invalid_session: { type: "object", additionalProperties: false } },
      output: {
        type: "object",
        properties: {
          open: { type: ["boolean", "null"] },
          path: { type: ["string", "null"] },
          modified: { type: ["boolean", "null"] },
          modifiedDetectedAt: { type: ["integer", "null"] },
          staleForSeconds: { type: ["integer", "null"], minimum: 0 },
          lastSave: {
            type: ["object", "null"],
            properties: { path: { type: "string" }, confirmedAt: { type: "integer" } },
            required: ["path", "confirmedAt"],
            additionalProperties: false,
          },
        },
        required: ["open", "path", "modified", "modifiedDetectedAt", "lastSave", "staleForSeconds"],
        additionalProperties: false,
      },
    },
  },
  events: {},
} as const
