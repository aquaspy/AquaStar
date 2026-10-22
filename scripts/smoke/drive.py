#!/usr/bin/env python3
"""Launch one AquaStar player from a release build and record the screen.

Pass/fail is the process. rc.9 ignores AQUASTAR_LITE_SMOKE, so this clicks the
Play button when the player does not appear on its own. A later build that
honors the variable starts the player before the click.
"""

import argparse
import os
import platform
import re
import subprocess
import sys
import time
from pathlib import Path

from buttons import BLUE, ORANGE, find_button

COLORS = {"flash": BLUE, "ruffle": ORANGE}
HOOK_WAIT = 8
CLICK_WAIT = 45
SOAK_SECONDS = 40
PLAYER_NAMES = {
    ("Windows", "flash"): ["flashplayer_32_sa.exe"],
    ("Windows", "ruffle"): ["Artix Games Launcher.exe"],
    ("Darwin", "flash"): ["Flash Player"],
    ("Darwin", "ruffle"): ["Artix Games Launcher · Ruffle"],
    ("Linux", "flash"): ["flashplayer"],
    ("Linux", "ruffle"): ["ruffle_desktop"],
}
LAUNCHER_NAMES = {
    "Windows": ["aquastar-neo.exe"],
    "Darwin": ["aquastar-neo"],
    "Linux": ["aquastar-neo"],
}


def player_names(engine):
    return PLAYER_NAMES[(platform.system(), engine)]


def run(cmd, check=False):
    return subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=check,
    )


def command_of(pid):
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "command="],
        capture_output=True,
        text=True,
        errors="replace",
    )
    return result.stdout or ""


def pids_named(names):
    """Process ids whose image name is exactly one of `names`."""
    system = platform.system()
    found = []
    if system == "Windows":
        listed = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            errors="replace",
        )
        wanted = {name.lower() for name in names}
        for line in listed.stdout.splitlines():
            if not line.startswith('"'):
                continue
            parts = line.split('","')
            image = parts[0].strip('"')
            if image.lower() in wanted and len(parts) > 1:
                found.append(parts[1].strip('"'))
        return found
    for name in names:
        listed = subprocess.run(
            ["pgrep", "-x", name],
            capture_output=True,
            text=True,
            errors="replace",
        )
        if listed.returncode == 0:
            found.extend(pid for pid in listed.stdout.split() if pid)
    if found:
        return found
    for name in names:
        listed = subprocess.run(
            ["pgrep", "-f", name],
            capture_output=True,
            text=True,
            errors="replace",
        )
        for pid in listed.stdout.split():
            if "drive.py" in command_of(pid):
                continue
            found.append(pid)
    return found


def kill_named(names):
    if platform.system() == "Windows":
        for name in names:
            run(["taskkill", "/F", "/IM", name])
        return
    for name in names:
        run(["pkill", "-x", name])


def cleanup_players():
    names = []
    for group in PLAYER_NAMES.values():
        names.extend(group)
    names.extend(LAUNCHER_NAMES.get(platform.system(), []))
    kill_named(names)
    time.sleep(1)


def screenshot(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    system = platform.system()
    if system == "Linux":
        subprocess.run(["scrot", str(path)], check=True)
    elif system == "Darwin":
        subprocess.run(["screencapture", "-x", str(path)], check=True)
    else:
        import ctypes

        ctypes.windll.user32.SetProcessDPIAware()
        from PIL import ImageGrab

        ImageGrab.grab().save(path)
    from PIL import Image

    return Image.open(path)


def click_at(x, y):
    system = platform.system()
    print(f"click {x},{y}")
    if system == "Linux":
        subprocess.run(
            ["xdotool", "mousemove", str(x), str(y), "click", "1"],
            check=True,
        )
    elif system == "Darwin":
        subprocess.run(["cliclick", f"c:{int(x)},{int(y)}"], check=True)
    else:
        import ctypes

        user32 = ctypes.windll.user32
        user32.SetProcessDPIAware()
        user32.SetCursorPos(int(x), int(y))
        user32.mouse_event(0x0002, 0, 0, 0, 0)
        time.sleep(0.05)
        user32.mouse_event(0x0004, 0, 0, 0, 0)


def mac_scales(image_width):
    try:
        profile = subprocess.check_output(
            ["system_profiler", "SPDisplaysDataType"],
            text=True,
            errors="replace",
        )
    except (OSError, subprocess.CalledProcessError) as err:
        print(f"display profile unavailable: {err}")
        return [1]
    print(profile)
    logical = None
    looks = re.search(r"UI Looks like:\s*(\d+)\s*x\s*(\d+)", profile)
    if looks:
        logical = int(looks.group(1))
    else:
        resolution = re.search(r"Resolution:\s*(\d+)\s*x\s*(\d+)", profile)
        if resolution:
            logical = int(resolution.group(1))
    if not logical:
        return [1, 2]
    scale = max(1, round(image_width / logical))
    print(f"screenshot width {image_width}, logical width {logical}, scale {scale}")
    scales = [scale]
    if 1 not in scales:
        scales.append(1)
    return scales


def raise_player(engine):
    pids = pids_named(player_names(engine))
    if not pids:
        return
    pid = pids[0]
    system = platform.system()
    if system == "Linux":
        run(["xdotool", "search", "--pid", pid, "windowactivate"])
    elif system == "Darwin":
        run(
            [
                "osascript",
                "-e",
                f'tell application "System Events" to set frontmost of the first process whose unix id is {pid} to true',
            ]
        )
    else:
        raise_windows_pid(int(pid))


def raise_windows_pid(pid):
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    found = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def visit(hwnd, _lparam):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == pid and user32.IsWindowVisible(hwnd):
            found.append(hwnd)
        return True

    user32.EnumWindows(visit, 0)
    if not found:
        return
    user32.ShowWindow(found[0], 9)
    user32.SetForegroundWindow(found[0])


def read_log(path):
    try:
        return Path(path).read_text(errors="replace")
    except OSError as err:
        return f"(could not read log: {err})"


def write_summary(engine, lines):
    print(f"== {engine} ==")
    for line in lines:
        print(line)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    with open(summary, "a", encoding="utf-8") as handle:
        handle.write(f"#### {engine}\n")
        for line in lines:
            handle.write(f"- {line}\n")
        handle.write("\n")


def launch(binary, engine, arch, log_path):
    cmd = [binary]
    machine = platform.machine().lower()
    if arch == "x86_64" and machine in {"arm64", "aarch64"}:
        cmd = ["arch", "-x86_64", binary]
    env = os.environ.copy()
    env["AQUASTAR_LITE_SMOKE"] = engine
    print("launch", " ".join(cmd))
    log_handle = open(log_path, "w", encoding="utf-8", errors="replace")
    proc = subprocess.Popen(
        cmd,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    return proc, log_handle


def wait_for(predicate, seconds, launcher):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if launcher.poll() is not None:
            return False
        if predicate():
            return True
        time.sleep(1)
    return launcher.poll() is None and predicate()


def remain_for(seconds, launcher, engine):
    """True when the player is still alive at the end of the full wait."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        if launcher.poll() is not None or not pids_named(player_names(engine)):
            return False
        left = int(deadline - time.time())
        print(f"{engine} still alive, {left}s left in the wait")
        time.sleep(5)
    return launcher.poll() is None and bool(pids_named(player_names(engine)))


def focus_launcher(launcher):
    if launcher.poll() is not None:
        return
    system = platform.system()
    if system == "Linux":
        run(["xdotool", "search", "--name", "^AquaStar NEO$", "windowactivate"])
    elif system == "Darwin":
        run(
            [
                "osascript",
                "-e",
                'tell application "System Events" to set frontmost of first process whose name is "aquastar-neo" to true',
            ]
        )
    else:
        raise_windows_pid(launcher.pid)


def click_scales(image):
    if platform.system() != "Darwin":
        return [1]
    if not hasattr(click_scales, "cached"):
        click_scales.cached = mac_scales(image.width)
    return click_scales.cached


def click_play(engine, out_dir, launcher, seconds):
    """Click Play until the player appears. The WebKit window can stay black for a while."""
    names = player_names(engine)
    deadline = time.time() + seconds
    while time.time() < deadline and launcher.poll() is None:
        if pids_named(names):
            return True
        focus_launcher(launcher)
        image = screenshot(out_dir / "launcher.png")
        hit = find_button(image, COLORS[engine])
        if hit is None:
            print(f"no {engine} button yet in {image.size}")
            time.sleep(3)
            continue
        x, y = hit
        for scale in click_scales(image):
            focus_launcher(launcher)
            click_at(x // scale, y // scale)
            if wait_for(lambda: bool(pids_named(names)), 4, launcher):
                return True
    return bool(pids_named(names))


def judge(engine, launcher, log_path, player_up):
    lines = []
    ok = True
    code = launcher.poll()
    if code is None:
        lines.append("launcher stayed up")
    else:
        lines.append(f"launcher exited {code}")
        ok = False
    if player_up and pids_named(player_names(engine)):
        lines.append(f"{engine} process still alive after {SOAK_SECONDS}s")
    else:
        lines.append(f"{engine} process was not alive after the wait")
        ok = False
    log = read_log(log_path)
    if "exit 127" in log or (code == 127):
        lines.append("log reports exit 127")
        ok = False
    if "exited immediately" in log:
        lines.append("log reports the player exited immediately")
        ok = False
    if engine == "flash":
        if "launching Flash" in log:
            lines.append("log contains the launching Flash line")
        else:
            lines.append("log does not contain the launching Flash line")
    if os.environ.get("LIBGL_ALWAYS_SOFTWARE") == "1":
        lines.append("OpenGL is software (llvmpipe) because this runner has no GPU")
    lines.append("pass" if ok else "fail")
    tail = "\n".join(log.splitlines()[-30:])
    if tail:
        lines.append("log tail:")
        lines.extend(tail.splitlines())
    return ok, lines


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=("flash", "ruffle"), required=True)
    parser.add_argument("--binary", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--arch", default="")
    args = parser.parse_args()
    engine = args.engine
    binary = args.binary
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "log.txt"

    if not binary or not os.path.exists(binary):
        write_summary(engine, [f"launcher binary is missing: {binary}", "fail"])
        (out_dir / "result.txt").write_text(f"launcher binary is missing: {binary}\nfail\n")
        return 1

    cleanup_players()
    ok = False
    lines = ["smoke driver did not finish", "fail"]
    log_handle = None
    try:
        launcher, log_handle = launch(binary, engine, args.arch.strip(), log_path)
        appeared = wait_for(lambda: bool(pids_named(player_names(engine))), HOOK_WAIT, launcher)
        if not appeared and launcher.poll() is None:
            print(f"{engine} did not start from the env hook; clicking Play")
            appeared = click_play(engine, out_dir, launcher, CLICK_WAIT)
        player_up = False
        if appeared:
            raise_player(engine)
            player_up = remain_for(SOAK_SECONDS, launcher, engine)
        try:
            screenshot(out_dir / "screenshot.png")
        except Exception as err:
            print(f"screenshot failed: {err}")
        log_handle.flush()
        ok, lines = judge(engine, launcher, log_path, player_up)
    except Exception as err:
        lines = [f"smoke driver error: {err}", "fail"]
        ok = False
    finally:
        if log_handle is not None:
            log_handle.close()
        cleanup_players()
    (out_dir / "result.txt").write_text("\n".join(lines) + "\n")
    write_summary(engine, lines)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
