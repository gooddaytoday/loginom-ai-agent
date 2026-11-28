import { Project } from "@opencode/schema/project"
import { Schema, SchemaGetter, Struct } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { InvalidRequestError, ProjectNotFoundError } from "../errors.js"

const root = "/api/project"
const experimental = "/api/experimental/project"
const UpdatePayload = Schema.Struct(Struct.omit(Project.UpdateInput.fields, ["projectID"]))
const BooleanFromString = Schema.Literals(["true", "false"]).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value === "true"),
    encode: SchemaGetter.transform((value): "true" | "false" => (value ? "true" : "false")),
  }),
)

export const ProjectGroup = HttpApiGroup.make("server.project")
  .add(
    HttpApiEndpoint.get("project.list", root, {
      query: Schema.Struct({ archived: BooleanFromString.pipe(Schema.optional) }),
      success: Schema.Array(Project.Info),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "project.list",
        summary: "List projects",
        description: "List known projects. Archived projects are excluded unless archived=true.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.patch("project.update", `${root}/:projectID`, {
      params: { projectID: Project.ID },
      payload: UpdatePayload,
      success: Project.Info,
      error: ProjectNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "project.update",
        summary: "Update project",
        description: "Update the project canonical directory, display metadata, and workspace commands.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "project",
      description: "Project routes.",
    }),
  )

export const ExperimentalProjectEndpoints = [
  HttpApiEndpoint.get("project.experimental.list", experimental, {
    success: Schema.Array(Project.Info),
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "experimental.project.list",
      summary: "List projects including hidden projects",
      description:
        "List known projects including hidden projects. Experimental: may change without compatibility guarantees.",
    }),
  ),
  HttpApiEndpoint.post("project.experimental.register", experimental, {
    payload: Project.RegisterInput,
    success: Project.Info,
    error: InvalidRequestError,
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "experimental.project.register",
      summary: "Register project",
      description:
        "Register a directory with display metadata. Experimental: may change without compatibility guarantees.",
    }),
  ),
  HttpApiEndpoint.delete("project.experimental.forget", `${experimental}/:projectID`, {
    params: { projectID: Project.ID },
    success: HttpApiSchema.NoContent,
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "experimental.project.forget",
      summary: "Forget a missing hidden project without sessions",
      description:
        "Forget a hidden project with no directory or sessions. Experimental: may change without compatibility guarantees.",
    }),
  ),
] as const
