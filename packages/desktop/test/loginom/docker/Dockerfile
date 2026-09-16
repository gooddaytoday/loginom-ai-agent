ARG BASE=ubuntu:22.04
FROM ${BASE}
ENV DEBIAN_FRONTEND=noninteractive
COPY loginom-ai-agent-linux-amd64.deb /tmp/agent.deb
RUN apt-get update && apt-get -o Dpkg::Options::="--force-unsafe-io" install -y --no-install-recommends /tmp/agent.deb xvfb xauth dbus fonts-liberation ca-certificates && rm /tmp/agent.deb && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 1200 tester
USER tester
WORKDIR /home/tester
ENV HOME=/home/tester
CMD ["xvfb-run", "-a", "/opt/Loginom AI Agent/resources/loginom/bin/node", "/test/installed-smoke.mjs"]
