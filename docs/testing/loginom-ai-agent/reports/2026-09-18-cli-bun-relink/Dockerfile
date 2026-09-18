FROM ubuntu@sha256:cd21a4f68a617580279d4b091cb18e3af9fa8a87500665f0ae5f7f757d17d367
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git build-essential clang-21 lld-21 llvm-21 \
    cmake ninja-build nasm perl python3 ruby pkg-config libicu-dev \
    rustup unzip xz-utils && rm -rf /var/lib/apt/lists/*
ENV PATH=/usr/lib/llvm-21/bin:/opt/cargo/bin:$PATH \
    CARGO_HOME=/opt/cargo RUSTUP_HOME=/opt/rustup \
    RUSTUP_TOOLCHAIN=nightly-2025-12-10 \
    CARGO_BUILD_JOBS=2 CMAKE_BUILD_PARALLEL_LEVEL=2
RUN rustup toolchain install nightly-2025-12-10 --profile minimal --component rust-src && \
    rustup default nightly-2025-12-10 && clang --version && cargo --version && rustc --version
WORKDIR /work
