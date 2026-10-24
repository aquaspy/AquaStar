#!/usr/bin/env python3
"""Run the pinned Artix Ruffle binary and record how it answers CLI flags.

The macOS 3.0.0 zip publishes one universal binary and no ruffle_desktop file.
This probe checks that --version, --help, and --no-gui are handled by that
binary (and by the Linux and Windows binaries) instead of by a launcher that
ignores arguments. The --no-gui result is printed either way. A missing flag
or a --version that does not exit fails the job.
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAYERS = ROOT / "src-tauri" / "players"
NAMES = {
    "ruffle_desktop",
    "ruffle_desktop.exe",
    "Artix Games Launcher.exe",
    "Artix Games Launcher · Ruffle",
}
REQUIRED_HELP = [
    "--no-gui",
    "--title",
    "--graphics",
    "--quality",
    "--tcp-connections",
    "--letterbox",
    "--save-directory",
    "--companion",
]


def find_binary() -> Path:
    found = []
    if PLAYERS.is_dir():
        for path in PLAYERS.rglob("*"):
            if path.is_file() and path.name in NAMES and "ruffle-artix" in path.as_posix():
                found.append(path)
    if len(found) != 1:
        raise SystemExit(f"expected one Artix Ruffle binary under {PLAYERS}, found {found}")
    return found[0]


def run(cmd, seconds):
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        out, err = process.communicate(timeout=seconds)
        return process.returncode, out, err, False
    except subprocess.TimeoutExpired:
        process.kill()
        out, err = process.communicate()
        return 124, out, err, True


def clip(data: bytes) -> str:
    text = data.decode("utf-8", "replace").strip()
    if len(text) > 1200:
        return text[:1200] + "\n…"
    return text


def summary(lines):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    text = "\n".join(lines) + "\n"
    print(text)
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(text)


def main() -> int:
    binary = find_binary()
    binary.chmod(binary.stat().st_mode | 0o111)
    lines = [f"### Artix Ruffle probe", f"Binary `{binary}`."]
    failed = False

    code, out, err, timed_out = run([str(binary), "--version"], 20)
    version = clip(out) or clip(err)
    lines.append(f"`--version` exit {code} timeout={timed_out}")
    lines.append("```")
    lines.append(version or "(no output)")
    lines.append("```")
    if timed_out or code != 0 or "Ruffle" not in version:
        failed = True
        lines.append("`--version` did not print Ruffle and exit.")

    code, out, err, timed_out = run([str(binary), "--help"], 20)
    help_text = (out + b"\n" + err).decode("utf-8", "replace")
    missing = [flag for flag in REQUIRED_HELP if flag not in help_text]
    lines.append(f"`--help` exit {code} timeout={timed_out}")
    if missing or timed_out:
        failed = True
        lines.append("Missing help flags: " + ", ".join(missing or ["(help timed out)"]))
    else:
        lines.append("Help still lists the flags AquaStar NEO passes.")
    mode = ""
    for line in help_text.splitlines():
        if "--performance-mode" in line:
            mode = line.strip()
            break
    if mode:
        lines.append(f"Performance mode help: `{mode}`")

    swf = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "aquastar-probe.swf"
    swf.write_bytes(bytes.fromhex("465753093000000078005c00000fa000000c0100430200000000"))
    code, out, err, timed_out = run(
        [str(binary), "--no-gui", "--title", "AquaStar NEO probe", str(swf)],
        12,
    )
    lines.append(f"`--no-gui` exit {code} timeout={timed_out} (timeout means the process was still running)")
    nogui = clip(out) or clip(err)
    if nogui:
        lines.append("```")
        lines.append(nogui)
        lines.append("```")
    lowered = (out + err).decode("utf-8", "replace").lower()
    rejected = any(
        phrase in lowered
        for phrase in (
            "unrecognized argument",
            "unexpected argument",
            "unrecognized option",
            "unknown argument",
        )
    )
    reached_player = "ruffle" in lowered
    if timed_out:
        lines.append("The binary stayed up under `--no-gui`, so the arguments reached a player process.")
    elif rejected:
        failed = True
        lines.append("`--no-gui` was rejected. The binary did not take the player arguments.")
    elif code == 0 or reached_player:
        lines.append("`--no-gui` reached the player. The output above is the launch result.")
    else:
        failed = True
        lines.append("`--no-gui` exited without a player log.")

    summary(lines)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
