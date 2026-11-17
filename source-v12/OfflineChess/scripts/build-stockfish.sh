#!/usr/bin/env bash
# Run from project root on Linux/macOS with Android NDK and internet access.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME to Android NDK r27c+ directory}"
HOST=linux-x86_64
if [[ "$(uname -s)" == Darwin ]]; then HOST=darwin-x86_64; fi
export PATH="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST/bin:$PATH"
command -v aarch64-linux-android29-clang++ >/dev/null || { echo 'Android NDK compiler not found'; exit 1; }
mkdir -p "$ROOT/.stockfish-build"
if [[ ! -d "$ROOT/.stockfish-build/Stockfish/.git" ]]; then
  git clone --depth 1 https://github.com/official-stockfish/Stockfish.git "$ROOT/.stockfish-build/Stockfish"
fi
cd "$ROOT/.stockfish-build/Stockfish/src"
make net
make -j"$(getconf _NPROCESSORS_ONLN || echo 4)" build ARCH=armv8 COMP=ndk
# Android allows executing ELF binaries from the extracted native library directory.
install -m 755 stockfish "$ROOT/app/src/main/jniLibs/arm64-v8a/libstockfish.so"
printf 'Stockfish Android binary: %s\n' "$ROOT/app/src/main/jniLibs/arm64-v8a/libstockfish.so"
cd "$ROOT"
git -C .stockfish-build/Stockfish rev-parse HEAD > STOCKFISH_COMMIT.txt
