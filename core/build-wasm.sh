#!/bin/bash
# Build the core for the browser: one ES module (rigidcraft_core.js + rigidcraft_core.wasm) in core/pkg.
# Needs only Docker (on Windows: inside WSL 2). The toolchain is the image of core/Dockerfile; crates are cached in the
# volume rigidcraft-cargo and build output in core/target-docker. Source paths in the module are rewritten to
# crates/… and core/… so it does not depend on where it was built.
set -euo pipefail
cd "$(dirname "$0")"
docker build -q -t rigidcraft-core-build . >/dev/null
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/src -v rigidcraft-cargo:/opt/cargo/registry \
  rigidcraft-core-build \
  cargo build --release --locked --target wasm32-unknown-emscripten --bin rigidcraft_core --target-dir target-docker \
    --config 'target.wasm32-unknown-emscripten.rustflags=["--remap-path-prefix=/opt/cargo/registry/src=crates", "--remap-path-prefix=/src=core"]'
out=target-docker/wasm32-unknown-emscripten/release
mkdir -p pkg
cp "$out/rigidcraft_core.js" "$out/rigidcraft_core.wasm" pkg/
ls -l pkg
