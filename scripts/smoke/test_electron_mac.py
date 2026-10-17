#!/usr/bin/env python3
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import electron_mac


def check(name, cond):
    if not cond:
        raise SystemExit(f"fail: {name}")
    print(f"ok {name}")


def main():
    tiny = {
        "href": "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b",
        "dpr": 2,
        "inner": [960, 530],
        "embed": {"w": 960, "h": 132, "t": 0, "l": 0},
        "plugins": ["Shockwave Flash"],
    }
    ok, _lines = electron_mac.judge_metrics(tiny, False)
    check("an old top-level SWF is recorded", ok)
    ok, lines = electron_mac.judge_metrics(tiny, True)
    check("a short embed fails the wrapper requirement", not ok)
    check("the failure names the height", any("below 75%" in line for line in lines))
    full = dict(tiny)
    full["href"] = "file:///Applications/AquaStar.app/Contents/Resources/app/res/swf_wrapper.html?swf=x"
    full["embed"] = {"w": 960, "h": 530, "t": 0, "l": 0}
    ok, lines = electron_mac.judge_metrics(full, True)
    check("a full embed passes", ok and "pass" in lines)
    missing = dict(full)
    missing["plugins"] = ["Chromium PDF Viewer"]
    ok, _lines = electron_mac.judge_metrics(missing, True)
    check("flash has to be the plugin", not ok)
    ok, _lines = electron_mac.judge_metrics({"error": "timed out"}, False)
    check("a missed measurement is still recorded", ok)
    ok, _lines = electron_mac.judge_metrics({"error": "timed out"}, True)
    check("a missed measurement fails the requirement", not ok)
    scratch = Path(tempfile.mkdtemp())
    try:
        app = scratch / "AquaStar.app"
        macos = app / "Contents" / "MacOS"
        helper = app / "Contents" / "Frameworks" / "Electron Helper.app" / "Contents" / "MacOS"
        macos.mkdir(parents=True)
        helper.mkdir(parents=True)
        binary = macos / "AquaStar"
        nested = helper / "Electron Helper"
        binary.write_text("bin")
        nested.write_text("helper")
        binary.chmod(0o644)
        nested.chmod(0o644)
        electron_mac.mark_executables(app)
        check("the main binary becomes executable", os.access(binary, os.X_OK))
        check("a helper binary becomes executable", os.access(nested, os.X_OK))
    finally:
        shutil.rmtree(scratch)

    scratch = Path(tempfile.mkdtemp())
    try:
        zip_path = scratch / "app.zip"
        with zipfile.ZipFile(zip_path, "w") as archive:
            link = zipfile.ZipInfo(
                "AquaStar.app/Contents/Frameworks/Electron Framework.framework/Electron Framework"
            )
            link.create_system = 3
            link.external_attr = 0o120755 << 16
            archive.writestr(link, b"Versions/Current/Electron Framework")
            current = zipfile.ZipInfo(
                "AquaStar.app/Contents/Frameworks/Electron Framework.framework/Versions/Current"
            )
            current.create_system = 3
            current.external_attr = 0o120755 << 16
            archive.writestr(current, b"A")
            binary = zipfile.ZipInfo("AquaStar.app/Contents/MacOS/AquaStar")
            binary.create_system = 3
            binary.external_attr = 0o100755 << 16
            archive.writestr(binary, b"bin")
        dest = scratch / "out"
        electron_mac.extract_zip(zip_path, dest)
        framework = (
            dest
            / "AquaStar.app/Contents/Frameworks/Electron Framework.framework/Electron Framework"
        )
        check("a framework entry stays a symlink", framework.is_symlink())
        check(
            "the framework link points at the versioned binary",
            os.readlink(framework) == "Versions/Current/Electron Framework",
        )
        check(
            "Versions/Current stays a symlink",
            (
                dest
                / "AquaStar.app/Contents/Frameworks/Electron Framework.framework/Versions/Current"
            ).is_symlink(),
        )
        exe = dest / "AquaStar.app/Contents/MacOS/AquaStar"
        check("the zip mode keeps the executable bit", os.access(exe, os.X_OK))
    finally:
        shutil.rmtree(scratch)


if __name__ == "__main__":
    main()
