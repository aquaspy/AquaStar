#!/usr/bin/env python3
import sys
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


if __name__ == "__main__":
    main()
