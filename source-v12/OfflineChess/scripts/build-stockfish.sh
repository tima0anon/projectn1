#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME to Android NDK r27c+ directory}"
HOST=linux-x86_64
if [[ "$(uname -s)" == Darwin ]]; then HOST=darwin-x86_64; fi
export PATH="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST/bin:$PATH"
PIN="5d03b6e578a5eedc822e4563bdbb89e762fc2a59"
mkdir -p "$ROOT/.stockfish-build"
if [[ ! -d "$ROOT/.stockfish-build/Stockfish/.git" ]]; then
  git clone --no-checkout --depth 1 https://github.com/official-stockfish/Stockfish.git "$ROOT/.stockfish-build/Stockfish"
fi
git -C "$ROOT/.stockfish-build/Stockfish" fetch --depth 1 origin "$PIN"
git -C "$ROOT/.stockfish-build/Stockfish" checkout --detach "$PIN"
cd "$ROOT/.stockfish-build/Stockfish/src"
make net
for spec in "arm64-v8a armv8 aarch64-linux-android26-clang++" "x86_64 x86-64 x86_64-linux-android26-clang++"; do
  read -r abi arch compiler <<< "$spec"
  command -v "$compiler" >/dev/null
  make objclean
  make -j2 build ARCH="$arch" COMP=ndk COMPCXX="$compiler" EXTRALDFLAGS="-Wl,-z,max-page-size=16384"
  llvm-strip stockfish
  install -d "$ROOT/app/src/main/jniLibs/$abi"
  install -m 755 stockfish "$ROOT/app/src/main/jniLibs/$abi/libstockfish.so"
done
make objclean
cd "$ROOT"
git -C .stockfish-build/Stockfish rev-parse HEAD > STOCKFISH_COMMIT.txt
mkdir -p app/src/main/assets/licenses
cp .stockfish-build/Stockfish/Copying.txt app/src/main/assets/licenses/Stockfish-GPL-3.0.txt
cp STOCKFISH_COMMIT.txt app/src/main/assets/licenses/
if [ -f DEJAVU_LICENSE.txt ]; then cp DEJAVU_LICENSE.txt app/src/main/assets/licenses/; fi
if [ -f LICENSE.GPLv3 ]; then cp LICENSE.GPLv3 app/src/main/assets/licenses/; fi
