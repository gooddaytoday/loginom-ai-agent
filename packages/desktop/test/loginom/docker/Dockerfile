ARG BASE=ubuntu:22.04
FROM ${BASE}
ENV DEBIAN_FRONTEND=noninteractive
# The context holds the DEB of the run, or for an AppImage only the DEB's `Depends`: the same system libraries, while the
# AppImage itself is mounted at run time, as a file the user downloaded. x11-utils lists the application's X windows.
COPY . /tmp/context
RUN apt-get update && if [ -f /tmp/context/agent.deb ]; then set -- /tmp/context/agent.deb; else apt-get -o Dpkg::Options::="--force-unsafe-io" satisfy -y --no-install-recommends "$(cat /tmp/context/depends)"; set --; fi && apt-get -o Dpkg::Options::="--force-unsafe-io" install -y --no-install-recommends "$@" xvfb xauth x11-utils dbus fonts-liberation ca-certificates && rm -rf /tmp/context /var/lib/apt/lists/*
RUN useradd --create-home --uid 1200 test-user
USER test-user
WORKDIR /home/test-user
ENV HOME=/home/test-user
