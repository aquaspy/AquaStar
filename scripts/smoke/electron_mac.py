#!/usr/bin/env python3
"""Launch an AquaStar Electron mac x64 zip on this Mac and record how the game is sized.

The x64 zip needs Rosetta on Apple Silicon. A Retina display (or
--force-device-scale-factor=2) is where a top-level SWF collapses. Pass
--require-wrapper to fail unless the page is swf_wrapper.html and the plugin
box fills the window. Without that flag the script records the page and exits
0 when the app stayed up, so an older zip can be inspected without a red job.
"""

import argparse
import base64
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

EVALUATE = r"""(() => {
  const e = document.querySelector('object,embed');
  const r = e ? e.getBoundingClientRect() : null;
  return {
    href: location.href,
    dpr: window.devicePixelRatio,
    inner: [window.innerWidth, window.innerHeight],
    plugins: Array.from(navigator.plugins).map((p) => p.name),
    embed: r ? { w: r.width, h: r.height, t: r.top, l: r.left, tag: e.tagName } : null
  };
})()"""


def judge_metrics(metrics, require_wrapper):
    """Decide whether a page measurement is the fixed embed. Recording always passes."""
    lines = []
    if not isinstance(metrics, dict) or metrics.get("error"):
        lines.append(f"no page metrics: {metrics}")
        lines.append("fail" if require_wrapper else "recorded")
        return (not require_wrapper), lines
    href = metrics.get("href") or ""
    inner = metrics.get("inner") or [0, 0]
    embed = metrics.get("embed") if isinstance(metrics.get("embed"), dict) else None
    plugins = metrics.get("plugins") or []
    lines.append(f"href={href}")
    lines.append(
        f"dpr={metrics.get('dpr')} inner={inner} embed={embed} plugins={plugins}"
    )
    if not require_wrapper:
        lines.append("recorded")
        return True, lines
    ok = True
    if "swf_wrapper.html" not in href:
        lines.append("page is not the flash embed")
        ok = False
    height = embed.get("h") if embed else None
    inner_h = inner[1] if len(inner) > 1 else 0
    if not height or not inner_h or height < inner_h * 0.75:
        lines.append(f"embed height {height} is below 75% of {inner_h}")
        ok = False
    else:
        lines.append("embed fills the window")
    if not any("flash" in str(name).lower() or "shockwave" in str(name).lower() for name in plugins):
        lines.append("Shockwave Flash is not in navigator.plugins")
        ok = False
    lines.append("pass" if ok else "fail")
    return ok, lines


def _recvn(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise RuntimeError("devtools socket closed")
        buf += chunk
    return buf


def _ws_connect(url):
    rest = url[len("ws://") :]
    hostport, path = rest.split("/", 1)
    host, port = hostport.rsplit(":", 1)
    sock = socket.create_connection((host, int(port)), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    request = (
        f"GET /{path} HTTP/1.1\r\n"
        f"Host: {hostport}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(request.encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            raise RuntimeError("devtools handshake failed")
        buf += chunk
    return sock


def _ws_send(sock, opcode, data):
    payload = data if isinstance(data, bytes) else data.encode()
    header = bytearray([0x80 | opcode])
    length = len(payload)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header += length.to_bytes(2, "big")
    else:
        header.append(0x80 | 127)
        header += length.to_bytes(8, "big")
    mask = os.urandom(4)
    header += mask
    masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
    sock.sendall(header + masked)


def _ws_recv(sock):
    first, second = _recvn(sock, 2)
    opcode = first & 0x0F
    length = second & 0x7F
    if length == 126:
        length = int.from_bytes(_recvn(sock, 2), "big")
    elif length == 127:
        length = int.from_bytes(_recvn(sock, 8), "big")
    if second & 0x80:
        mask = _recvn(sock, 4)
        data = bytes(byte ^ mask[i % 4] for i, byte in enumerate(_recvn(sock, length)))
    else:
        data = _recvn(sock, length)
    if opcode == 8:
        raise RuntimeError("devtools closed the socket")
    if opcode == 9:
        _ws_send(sock, 0x0A, data)
        return _ws_recv(sock)
    return data.decode("utf-8", "replace")


def cdp_evaluate(ws_url, expression, timeout=8):
    sock = _ws_connect(ws_url)
    sock.settimeout(timeout)
    try:
        _ws_send(
            sock,
            0x01,
            json.dumps(
                {
                    "id": 1,
                    "method": "Runtime.evaluate",
                    "params": {"expression": expression, "returnByValue": True},
                }
            ),
        )
        deadline = time.time() + timeout
        while time.time() < deadline:
            message = json.loads(_ws_recv(sock))
            if message.get("id") != 1:
                continue
            if "error" in message:
                return {"error": str(message["error"])}
            value = message.get("result", {}).get("result", {}).get("value")
            return value if isinstance(value, dict) else {"error": f"unexpected {message}"}
        return {"error": "evaluate timed out"}
    except Exception as err:
        return {"error": str(err)}
    finally:
        sock.close()


def list_pages(port):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=3) as response:
        return json.loads(response.read().decode())


def wait_for_game_page(port, seconds):
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            pages = list_pages(port)
        except Exception:
            time.sleep(1)
            continue
        for page in pages:
            if page.get("type") != "page":
                continue
            url = page.get("url") or ""
            if ".swf" in url or "swf_wrapper.html" in url:
                return page
        time.sleep(1)
    return None


def ensure_rosetta():
    if platform.machine().lower() not in {"arm64", "aarch64"}:
        return
    if Path("/Library/Apple/usr/libexec/oah/libRosettaRuntime").exists() or Path(
        "/usr/libexec/rosetta/runtime"
    ).exists():
        print("Rosetta is already installed")
        return
    print("Installing Rosetta")
    subprocess.run(
        ["softwareupdate", "--install-rosetta", "--agree-to-license"],
        check=False,
    )


def newest_mac_zip_tag():
    raw = subprocess.check_output(
        ["gh", "api", "repos/aquaspy/AquaStar/releases?per_page=30"],
        text=True,
    )
    releases = json.loads(raw)
    for release in releases:
        tag = release.get("tag_name") or ""
        if not tag.startswith("v") or tag.startswith("lite-"):
            continue
        for asset in release.get("assets") or []:
            name = asset.get("name") or ""
            if name.startswith("AquaStar-") and name.endswith("-mac-x64.zip"):
                return tag, name
    raise RuntimeError("no AquaStar mac x64 zip on a v* release")


def download_zip(tag, dest):
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(
        [
            "gh",
            "release",
            "download",
            tag,
            "--repo",
            "aquaspy/AquaStar",
            "--pattern",
            "AquaStar-*-mac-x64.zip",
            "--dir",
            str(dest),
            "--clobber",
        ]
    )
    found = list(dest.glob("AquaStar-*-mac-x64.zip"))
    if not found:
        raise RuntimeError(f"download of {tag} produced no mac zip")
    return found[0]


def mark_executables(app):
    """Zip extraction can drop the executable bit. `arch` then refuses to start it."""
    roots = [app / "Contents" / "MacOS"]
    roots.extend(helper / "Contents" / "MacOS" for helper in app.rglob("*.app"))
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.is_file():
                path.chmod(path.stat().st_mode | 0o755)


def install_app(zip_path, dest):
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(dest)
    apps = [path for path in dest.rglob("*.app") if path.name == "AquaStar.app"]
    if not apps:
        raise RuntimeError("AquaStar.app was not in the zip")
    app = apps[0]
    mark_executables(app)
    subprocess.check_call(["xattr", "-cr", str(app)])
    subprocess.run(["codesign", "--force", "--deep", "-s", "-", str(app)], check=False)
    exe = app / "Contents" / "MacOS" / app.stem
    if not exe.is_file():
        raise RuntimeError(f"missing executable {exe}")
    if not os.access(exe, os.X_OK):
        raise RuntimeError(f"{exe} is not executable")
    return exe


def needs_rosetta_launch(exe):
    if platform.machine().lower() not in {"arm64", "aarch64"}:
        return False
    described = subprocess.check_output(["file", str(exe)], text=True)
    return "x86_64" in described and "arm64" not in described


def launch(exe, port, profile, extra):
    cmd = [str(exe), f"--remote-debugging-port={port}", f"--user-data-dir={profile}"]
    cmd.extend(extra)
    if needs_rosetta_launch(exe):
        cmd = ["arch", "-x86_64", *cmd]
    print("launch", " ".join(cmd))
    log = open(Path(profile).parent / f"{Path(profile).name}.log", "w", encoding="utf-8")
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    return proc, log


def stop(proc, log):
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, 15)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, 9)
    log.close()


def screenshot(path):
    subprocess.check_call(["screencapture", "-x", str(path)])


def probe(exe, out, name, port, extra):
    profile = out / f"profile-{name}"
    if profile.exists():
        shutil.rmtree(profile)
    profile.mkdir(parents=True)
    proc, log = launch(exe, port, profile, extra)
    metrics = {"error": "the game page did not appear"}
    try:
        page = None
        if proc.poll() is None:
            page = wait_for_game_page(port, 45)
        if page and proc.poll() is None:
            time.sleep(3)
            metrics = cdp_evaluate(page["webSocketDebuggerUrl"], EVALUATE)
        elif proc.poll() is not None:
            metrics = {"error": f"app exited {proc.returncode}"}
        shot = out / f"{name}.png"
        try:
            screenshot(shot)
        except Exception as err:
            print(f"screenshot failed: {err}")
        alive = proc.poll() is None
    finally:
        stop(proc, log)
    return metrics, alive


def write_summary(lines):
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    with open(summary, "a", encoding="utf-8") as handle:
        handle.write("#### Electron mac zip\n")
        for line in lines:
            handle.write(f"- {line}\n")
        handle.write("\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", default="")
    parser.add_argument("--tag", default="")
    parser.add_argument("--out", required=True)
    parser.add_argument("--require-wrapper", action="store_true")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if platform.system() != "Darwin":
        message = "electron mac smoke only runs on macOS"
        (out / "result.txt").write_text(message + "\nfail\n")
        write_summary([message, "fail"])
        return 1
    ensure_rosetta()
    if args.zip:
        zip_path = Path(args.zip)
        tag = args.tag or zip_path.name
    else:
        tag = args.tag or newest_mac_zip_tag()[0]
        zip_path = download_zip(tag, out / "download")
    print(f"zip {zip_path} tag {tag}")
    exe = install_app(zip_path, out / "unpacked")
    lines = [f"tag {tag}", f"exe {exe}"]
    native, native_alive = probe(exe, out, "native", 9333, [])
    (out / "native.json").write_text(json.dumps(native, indent=2) + "\n")
    native_ok, native_lines = judge_metrics(native, False)
    lines.append(f"native alive={native_alive}")
    lines.extend(f"native {line}" for line in native_lines)
    dpr = native.get("dpr") if isinstance(native, dict) else None
    need_forced = args.require_wrapper or not isinstance(dpr, (int, float)) or dpr < 1.5
    forced_ok = True
    if need_forced:
        forced, forced_alive = probe(
            exe, out, "dpr2", 9334, ["--force-device-scale-factor=2"]
        )
        (out / "dpr2.json").write_text(json.dumps(forced, indent=2) + "\n")
        forced_ok, forced_lines = judge_metrics(forced, args.require_wrapper)
        lines.append(f"dpr2 alive={forced_alive}")
        lines.extend(f"dpr2 {line}" for line in forced_lines)
        if args.require_wrapper and not forced_alive:
            forced_ok = False
            lines.append("dpr2 app was not alive")
    ok = native_alive and native_ok and forced_ok
    lines.append("pass" if ok else "fail")
    (out / "result.txt").write_text("\n".join(lines) + "\n")
    write_summary(lines)
    print("\n".join(lines))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
