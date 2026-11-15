ARG BASE_IMAGE=debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
FROM ${BASE_IMAGE}
COPY node-runtime/ /opt/node/
COPY template/ /opt/dashboard/template/
COPY npm-cache/ /tmp/npm-cache/
ENV PATH="/opt/node/bin:$PATH"
RUN cd /opt/dashboard/template && node /opt/node/lib/node_modules/npm/bin/npm-cli.js ci --offline --cache=/tmp/npm-cache --ignore-scripts --no-audit --fund=false --workspaces=false && rm -rf node_modules/.bin /tmp/npm-cache /root/.npm
COPY server.mjs /opt/dashboard/server.mjs
ENTRYPOINT ["/opt/node/bin/node", "/opt/dashboard/server.mjs"]
