# REST request (`integration.rest_request`)

Stage-0 proposal only. Enable each capability only after its implementation and
owner-approved acceptance. The installed handler currently supports GET only.
Keep mode `request`; select the HTTP verb in `connection.method`.

Read `dock_action_describe({node_types:["integration.rest_request"]})` first.
Omitted existing settings must be preserved. New connections default to GET,
query URL parameters, application/json response, verified TLS and no auth.
Use a new connection name when the URL, ordered parameter definitions, method
or authentication changes; connections may be shared by several REST nodes.
Never modify another node's shared connection implicitly.

POST/PUT/PATCH use `body_field` naming a string input field; its UTF-8 contents
are sent unchanged. Do not URL-encode the body. DELETE has no body control in
the observed UI. Set the request media type with
`connection.request_content_type`; the observed UI defaults to text/plain and
appends charset=UTF-8 on the wire. JSON syntax and media type are separate.
The optional table input is `inputs` input 0; without a table one request runs.
An empty table and a missing table are different cases requiring live acceptance.

Keep `query_parameters` in requested order. Pass raw string field values;
the handler owns one encoding pass. Query, added path segments and replacement
templates have different URL placement rules. Preserve Body and other columns
through any automatic query encoder; do not encode those columns.
Reject unresolved templates and ambiguous parameter bindings before mutation.

`headers` replaces the explicit custom header list. Each item has `name` and
either a literal `value` or `value:{variable:"Cycle"}` after the variable cycle
is enabled. Do not put credentials in headers. Reject duplicate names ignoring
case and CR/LF. Preserve saved headers if the property is omitted; `[]` clears
only the custom header list. Do not invent retry headers or idempotency keys.

Response media type is independent from the request media type. Set
`connection.response_content_type` to the expected type or explicit */*.
Output 0 is RequestID (integer), Response (string). Response may contain JSON,
plain text or XML: parse according to the user task rather than assuming JSON.
Output 1 is RequestID (integer), ErrorCode (integer), ErrorDesc (string),
HttpStatusCode (integer). Join by RequestID.
`produce_error_descriptions:false` removes ErrorDesc from native port 1;
read the remaining three fields in order. Omission preserves the saved flag.
Use true for descriptions (the new-node default). The port count stays two.
ErrorCode != 0 denotes a failed
request even if node execution completed. HTTP >=400 can yield ErrorCode=6.
HTTP 200 alone does not prove a usable body; MIME validation may fail at 200.
Read port 1 for status-only tasks and port 0 when the body is needed.
If the body is missing on error, report REST_RESPONSE_BODY_MISSING and suggest
a smaller response or a user-authorized retry. Do not retry independently.

`connection.connect_timeout_ms` is milliseconds; `timeout_seconds` is seconds.
`retries` counts native repeated requests after an error; `retry_delay_ms` is
enabled only when repeats are nonzero. `request_delay_ms` separates row requests.
Do not add a recovery HTTP retry. A timeout after a mutation leaves the external
effect unknown. Output tables alone cannot prove the number or timing of attempts.
Exact attempts require a separate owner decision; no ledger is introduced here.

`simulation.response_file` is a delivered server-side file. Simulation returns
that fixture instead of a transport response. It proves parsing of the simulated
result; it does not establish live transport success. Keep real secrets out of
response fixtures and request dumps. Save/reopen must preserve the file binding.
Use `simulation:null` to disable an explicit saved simulation.

`request_dump.directory` enables native request files in an operator-prepared
empty private folder; null disables dumping. Never dump real credentials.
Echo CSV does not prove those files: their acceptance requires an owner-approved
file audit and an observed native format. Do not claim that gate is implemented.

Auth proposal: reuse operator-prepared named connections with saved Basic or
Bearer credentials. Never return passwords, tokens, Authorization values or
certificate private keys in readback, descriptions, receipts or exports.
Creation/rotation of secrets through the model is outside this additive proposal.
Keep certificate verification enabled. Disabling it requires an explicit user
instruction and owner-approved acceptance; never use it as recovery. Client
certificate files/store need operator-provided fixtures and an accessible peer.

Variable bindings use the native variables input separately from table input 0.
Change the variable source and execute the SAME REST without rewriting literals.
Module connection variables and node variables have different owners/scopes;
do not silently substitute one for the other. Deferred scopes are unsupported.

Save after the requested exports. Cold acceptance opens the saved package in
a new profile and executes its saved configuration without reconstructing it.
