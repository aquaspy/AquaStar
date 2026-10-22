#!/usr/bin/env python3
"""The media build cache is the sibling directory Capture Check probes."""

import importlib.util
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / 'scripts' / 'build-media.py'
SPEC = importlib.util.spec_from_file_location('build_media', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def main():
    repo = Path('/home/runner/work/AquaStar/AquaStar')
    cache = MODULE.media_cache(repo)
    sibling = repo.parent / 'AquaStar-workspace' / 'builds' / 'media'
    assert cache == sibling, cache
    capture = (REPO / '.github/workflows/capture-check.yml').read_text()
    release = (REPO / '.github/workflows/desktop-release.yml').read_text()
    for needle in (
        '../AquaStar-workspace/builds/media/linux-x86_64/ffmpeg-8.1.3/ffprobe',
        '../AquaStar-workspace/builds/media/windows-x86_64/ffmpeg-8.1.3/ffprobe.exe',
    ):
        assert needle in capture, needle
    assert '../AquaStar-workspace/builds/media/AquaStar-media-sources.tar.xz' in release
    print('media cache matches the Capture Check and release paths')


if __name__ == '__main__':
    main()
