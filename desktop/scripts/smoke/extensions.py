#!/usr/bin/env python3
"""Exercise the actual extension WebViews and Tauri ACL with isolated test data."""

import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile


PROBE = r"""(async () => {
  const results = [];
  const check = (name, value, extra = '') => results.push({ name, passed: !!value, extra });
  const call = (command, args = {}) => window.__TAURI_INTERNALS__.invoke(command, args);
  const denied = async (name, operation) => {
    try { await operation(); check(name, false, 'unexpected success'); }
    catch (error) { check(name, true, String(error)); }
  };
  try {
    const info = await window.aquastar.host.info();
    check('caller-bound SDK', info.pluginId === document.body.dataset.id);
    check('account local storage unavailable', localStorage.getItem('aquastar-account-secret') === null);
    check('account cookies unavailable', !document.cookie.includes('aquastar-account-secret'));
    localStorage.setItem('plugin-marker', info.pluginId);
    await new Promise(resolve => setTimeout(resolve, 250));
    check('simultaneous plugin storage isolated', localStorage.getItem('plugin-marker') === info.pluginId);
    await denied('inventory command denied', () => call('get_inventory'));
    await denied('player command denied', () => call('play'));
    await denied('capture capabilities denied', () => call('capture_info'));
    await denied('capture start denied', () => call('capture_start'));
    await denied('capture authorization denied', () => call('capture_set_remember_authorization', {enabled: true}));
    await denied('unlisted application command denied', () => call('probe_secret'));
    await denied('native window creation denied', () => call('plugin:window|create', { options: { label: 'evil' } }));
    await denied('event listeners denied', () => call('plugin:event|listen', { event: 'inventory', target: { kind: 'Any' }, handler: 123 }));
    await denied('browser HTTPS denied', () => fetch('https://example.com/'));
    await denied('browser localhost denied', () => fetch('http://127.0.0.1/'));
    await denied('local files denied', () => fetch('file:///etc/passwd'));
    await denied('application assets denied', () => fetch('tauri://localhost/features/settings/settings.html'));
    await denied('unknown bridge method denied', () => call('extension_invoke', { method: 'get_inventory', args: {} }));
    check('popups denied', window.open('https://example.com/') === null);
    const original = location.href;
    location.href = 'tauri://localhost/features/settings/settings.html';
    await new Promise(resolve => setTimeout(resolve, 300));
    check('navigation restricted to plugin', location.href === original);
  } catch (error) { check('probe completed', false, String(error)); }
  await call('extension_invoke', {
    method: 'host.info', args: { results: { ok: results.every(result => result.passed), tests: results } }
  });
})();"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()
    base = args.output or Path(tempfile.mkdtemp(prefix="aquastar-extension-smoke-"))
    base.mkdir(parents=True, exist_ok=True)
    base = base.resolve()
    for plugin_id in ("probe-one", "probe-two"):
        package = base / plugin_id
        package.mkdir(exist_ok=True)
        (package / "index.html").write_text(
            '<!doctype html><html><body data-id="' + plugin_id
            + '"><script src="probe.js"></script></body></html>', encoding="utf-8"
        )
        (package / "probe.js").write_text(PROBE, encoding="utf-8")
    seed = base / "probe-one"
    (seed / "seed.html").write_text(
        '<!doctype html><html><body><script src="seed.js"></script></body></html>', encoding="utf-8"
    )
    (seed / "seed.js").write_text(
        "localStorage.setItem('aquastar-account-secret','private-account-data');"
        "document.cookie='aquastar-account-secret=private-account-data; path=/';"
        "window.__TAURI_INTERNALS__.invoke('extension_invoke',"
        "{method:'host.info',args:{seeded:true}});", encoding="utf-8"
    )
    env = os.environ.copy()
    for key, directory in (
        ("XDG_CONFIG_HOME", "config"), ("XDG_DATA_HOME", "data"),
        ("XDG_CACHE_HOME", "cache"), ("APPDATA", "roaming"), ("LOCALAPPDATA", "local"),
    ):
        env[key] = str(base / "profile" / directory)
        Path(env[key]).mkdir(parents=True, exist_ok=True)
    env["AQUASTAR_PROBE_PACKAGES"] = str(base)
    env["AQUASTAR_PROBE_REPORT"] = str(base / "results.json")
    (base / "results.json").unlink(missing_ok=True)
    # Production portable mode and player smoke must never affect this test.
    env.pop("AQUASTAR_LITE_SMOKE", None)
    process = None
    try:
        with (base / "native.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                [str(args.binary.resolve())], env=env, stdout=log, stderr=log,
                start_new_session=os.name != "nt",
            )
            status = process.wait(timeout=args.timeout)
        if not (base / "results.json").exists():
            raise RuntimeError(f"Native probe exited {status} (0x{status & 0xffffffff:08x}) without a report; see {base / 'native.log'}")
        report = json.loads((base / "results.json").read_text(encoding="utf-8"))
        if set(report) != {"probe-one", "probe-two"}:
            raise RuntimeError("Both simultaneous plugin tools must report")
        failures = [f'{plugin}: {test["name"]}: {test["extra"]}'
                    for plugin, result in report.items() for test in result["tests"]
                    if not test["passed"]]
        if status != 0 or failures or not all(result["ok"] for result in report.values()):
            raise RuntimeError("\n".join(failures) or f"Native probe exited {status}")
        count = sum(len(result["tests"]) for result in report.values())
        print(f"Passed {count} native WebView assertions; report: {base / 'results.json'}")
    finally:
        if process is not None and process.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], check=False)
            else:
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        print(f"Native probe artifacts: {base}")


if __name__ == "__main__":
    main()
