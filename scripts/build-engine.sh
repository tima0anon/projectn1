#!/usr/bin/env bash
set -euo pipefail
root="$(pwd)"
ndk="$ANDROID_HOME/ndk/27.2.12479018"
export PATH="$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH"
if [ ! -d engine/Stockfish ]; then
  mkdir -p engine
  curl --fail --location --retry 3 https://github.com/official-stockfish/Stockfish/archive/e67cc979fd2c0e66dfc2b2f2daa0117458cfc462.tar.gz -o engine/stockfish.tar.gz
  tar -xzf engine/stockfish.tar.gz -C engine
  mv engine/Stockfish-e67cc979fd2c0e66dfc2b2f2daa0117458cfc462 engine/Stockfish
fi
cd engine/Stockfish/src
make net
for pair in "arm64-v8a armv8" "x86_64 x86-64"; do
  read -r abi arch <<< "$pair"
  make objclean
  make -j2 build ARCH="$arch" COMP=ndk EXTRALDFLAGS="-Wl,-z,max-page-size=16384"
  llvm-strip stockfish
  mkdir -p "$root/app/src/main/jniLibs/$abi"
  cp stockfish "$root/app/src/main/jniLibs/$abi/libstockfish.so"
  llvm-readelf -h stockfish
done
make objclean
