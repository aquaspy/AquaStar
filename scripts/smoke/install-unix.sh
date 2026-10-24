#!/usr/bin/env bash
# Install the downloaded desktop package and, on Linux, a virtual display.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/one-match.sh"

pkg="${PACKAGE:?}"
bin=""

case "$(uname -s)" in
  Linux)
    sudo apt-get update
    gtk=libgtk2.0-0
    if apt-cache show libgtk2.0-0t64 >/dev/null 2>&1; then
      gtk=libgtk2.0-0t64
    fi
    # libegl1 is the host GL loader. The AppImage does not bundle it, and a
    # desktop already has it. libxkbcommon-x11-0 is what Ruffle dlopens for an
    # X11 window. rc.9's deb does not depend on it. Later debs do.
    alsa=libasound2
    if apt-cache show libasound2t64 >/dev/null 2>&1; then
      alsa=libasound2t64
    fi
    pipewire=libpipewire-0.3-0
    if apt-cache show libpipewire-0.3-0t64 >/dev/null 2>&1; then
      pipewire=libpipewire-0.3-0t64
    fi
    sudo apt-get install -y xvfb openbox scrot xdotool "$gtk" libnss3 libegl1 libxkbcommon-x11-0 libgl1-mesa-dri fonts-liberation libssl3 "$alsa" "$pipewire" libfontconfig1 zlib1g libudev1
    if [ "$pkg" = deb ]; then
      sudo apt-get install -y ./dist/*.deb
      bin=$(command -v aquastar-neo)
    elif [ "$pkg" = appimage ]; then
      bin=$(one_match "$PWD"/dist/*.AppImage)
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
    export DISPLAY=:99
    # The runner has no GPU. Ruffle's default on Linux is OpenGL, so use llvmpipe.
    export LIBGL_ALWAYS_SOFTWARE=1
    echo "DISPLAY=:99" >> "$GITHUB_ENV"
    echo "LIBGL_ALWAYS_SOFTWARE=1" >> "$GITHUB_ENV"
    # The deb depends on xdg-desktop-portal. systemd starts that unit without
    # this job's DISPLAY, the GTK backend exits ("cannot open display"), and
    # the unit stays activating. The published launcher waits on that bus name
    # before it maps a window. Hand the user manager the display, then start
    # the portal, so registration returns.
    if systemctl --user show-environment >/dev/null 2>&1; then
      systemctl --user import-environment DISPLAY LIBGL_ALWAYS_SOFTWARE
      echo "imported DISPLAY=$DISPLAY into the systemd user session"
      if timeout 20 systemctl --user start xdg-desktop-portal.service; then
        echo "xdg-desktop-portal is active"
      else
        echo "xdg-desktop-portal did not become active before launch" >&2
      fi
    fi
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
    app=$(find "$mount" -maxdepth 2 -name 'AquaStar NEO.app' -print -quit)
    if [ -z "$app" ]; then
      echo "no AquaStar NEO.app in the disk image" >&2
      ls -la "$mount" >&2
      exit 1
    fi
    rm -rf "$HOME/AquaStar NEO.app"
    cp -R "$app" "$HOME/AquaStar NEO.app"
    hdiutil detach "$mount"
    xattr -cr "$HOME/AquaStar NEO.app"
    bin="$HOME/AquaStar NEO.app/Contents/MacOS/aquastar-neo"
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
