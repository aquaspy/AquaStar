#!/usr/bin/env python3
"""The media build cache is the sibling directory Capture Check probes."""

import importlib.util
import tempfile
import urllib.error
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
    with tempfile.TemporaryDirectory() as directory:
        archive = Path(directory) / 'ffmpeg.tar.xz'
        calls = {'n': 0}
        def retrieve(url, destination):
            calls['n'] += 1
            assert url == 'https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz'
            if calls['n'] < 3:
                Path(destination).write_bytes(b'partial')
                raise urllib.error.URLError('timed out')
            Path(destination).write_bytes(b'archive')
        original = MODULE.urllib.request.urlretrieve
        MODULE.urllib.request.urlretrieve = retrieve
        MODULE.time.sleep = lambda _seconds: None
        try:
            MODULE.fetch('https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz', archive)
        finally:
            MODULE.urllib.request.urlretrieve = original
        assert calls['n'] == 3
        assert archive.read_bytes() == b'archive'
    print('media cache matches the Capture Check and release paths')


if __name__ == '__main__':
    main()
