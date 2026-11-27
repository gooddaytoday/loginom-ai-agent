import { Project } from "@opencode/schema/project"
import { Schema, SchemaGetter, Struct } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestError, ProjectNotFoundError } from "../errors.js"

const root = "/api/project"
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
      query: Schema.Struct({
        archived: BooleanFromString.pipe(Schema.optional),
        includeHidden: BooleanFromString.pipe(Schema.optional),
      }),
      success: Schema.Array(Project.Info),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "project.list",
        summary: "List projects",
        description: "List known projects. Include archived or hidden projects with archived=true or includeHidden=true.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("project.register", root, {
      payload: Project.RegisterInput,
      success: Project.Info,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "project.register",
        summary: "Register project",
        description: "Resolve a project directory and register it with optional display metadata and visibility.",
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
