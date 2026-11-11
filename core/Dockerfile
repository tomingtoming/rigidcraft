# The toolchain that builds core/pkg (see build-wasm.sh): Emscripten and Rust at fixed versions, so every machine
# produces the same module. Bump both here, rebuild, and commit the new core/pkg.
FROM emscripten/emsdk:6.0.13
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.93.0 --target wasm32-unknown-emscripten \
 && mkdir -p /opt/cargo/registry && chmod -R a+rwX /opt/cargo
WORKDIR /src
