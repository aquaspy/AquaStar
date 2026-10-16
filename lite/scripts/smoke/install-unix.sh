#!/usr/bin/env bash
# Install the downloaded Lite package and, on Linux, a virtual display.
set -euo pipefail

pkg="${PACKAGE:?}"
bin=""

case "$(uname -s)" in
  Linux)
    sudo apt-get update
    gtk=libgtk2.0-0
    if apt-cache show libgtk2.0-0t64 >/dev/null 2>&1; then
      gtk=libgtk2.0-0t64
    fi
    sudo apt-get install -y xvfb openbox scrot xdotool "$gtk" libnss3 libgl1-mesa-dri fonts-liberation
    if [ "$pkg" = deb ]; then
      sudo apt-get install -y ./dist/*.deb
      bin=$(command -v aquastar-lite)
    elif [ "$pkg" = appimage ]; then
      bin=$(echo "$PWD"/dist/*.AppImage)
      chmod +x "$bin"
      echo "APPIMAGE_EXTRACT_AND_RUN=1" >> "$GITHUB_ENV"
    else
      echo "unexpected package $pkg on Linux" >&2
      exit 1
    fi
    Xvfb :99 -screen 0 1440x900x24 +extension GLX >/tmp/xvfb.log 2>&1 &
    ready=0
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if DISPLAY=:99 xdotool getdisplaygeometry >/dev/null 2>&1; then
        ready=1
        break
      fi
      sleep 1
    done
    if [ "$ready" != 1 ]; then
      echo "Xvfb did not come up" >&2
      cat /tmp/xvfb.log >&2 || true
      exit 1
    fi
    DISPLAY=:99 openbox >/tmp/openbox.log 2>&1 &
    sleep 1
    echo "DISPLAY=:99" >> "$GITHUB_ENV"
    # The runner has no GPU. Ruffle's default on Linux is OpenGL, so use llvmpipe.
    echo "LIBGL_ALWAYS_SOFTWARE=1" >> "$GITHUB_ENV"
    ;;
  Darwin)
    brew install cliclick
    if [ "$(uname -m)" = arm64 ]; then
      softwareupdate --install-rosetta --agree-to-license || echo "rosetta install returned non-zero"
    fi
    mount=/tmp/lite-dmg
    rm -rf "$mount"
    mkdir -p "$mount"
    hdiutil attach dist/*.dmg -nobrowse -mountpoint "$mount"
    app=$(find "$mount" -maxdepth 2 -name 'aquastar-lite.app' -print -quit)
    if [ -z "$app" ]; then
      echo "no aquastar-lite.app in the disk image" >&2
      ls -la "$mount" >&2
      exit 1
    fi
    rm -rf "$HOME/aquastar-lite.app"
    cp -R "$app" "$HOME/aquastar-lite.app"
    hdiutil detach "$mount"
    xattr -cr "$HOME/aquastar-lite.app"
    bin="$HOME/aquastar-lite.app/Contents/MacOS/aquastar-lite"
    ;;
  *)
    echo "install-unix.sh does not install on $(uname -s)" >&2
    exit 1
    ;;
esac

if [ ! -x "$bin" ]; then
  echo "launcher is missing or not executable: $bin" >&2
  exit 1
fi
echo "launcher: $bin"
echo "AQUASTAR_LITE_BIN=$bin" >> "$GITHUB_ENV"
