#!/usr/bin/env python3
"""Validate actual window PNG/MP4 capture using a synthetic game process."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--encoder', type=Path, required=True)
    parser.add_argument('--ffprobe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seconds', type=int, default=3)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['AQUASTAR_PROBE_SECONDS'] = str(args.seconds)
    if sys.platform == 'win32':
        fixture = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(Path(__file__).with_name('capture-fixture.ps1'))]
    elif sys.platform.startswith('linux'):
        fixture = ['/usr/bin/python3', str(Path(__file__).with_name('capture-fixture.py'))]
    else:
        raise RuntimeError('Native macOS capture requires an interactive permission and gameplay test; this fixture covers Linux/Windows.')
    with (args.output / 'fixture.log').open('w') as log:
        process = subprocess.Popen(fixture, env=env, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 30
            fixture_log = args.output / 'fixture.log'
            while 'AquaStar fixture ready' not in fixture_log.read_text(errors='replace'):
                if process.poll() is not None:
                    raise RuntimeError(f'Fixture exited before showing its window: {fixture_log.read_text(errors="replace")}')
                if time.monotonic() >= deadline:
                    raise RuntimeError(f'Fixture did not show its window: {fixture_log.read_text(errors="replace")}')
                time.sleep(.1)
            time.sleep(.5)
            result = subprocess.run([str(args.binary.resolve()), str(process.pid), str(args.encoder.resolve()), str(args.output.resolve())], env=env, check=False, text=True, capture_output=True, timeout=args.seconds + 60)
            (args.output / 'native.log').write_text(result.stdout + result.stderr)
            if result.returncode:
                raise RuntimeError(f'Native capture failed: {result.stdout}{result.stderr}')
        finally:
            process.terminate()
            process.wait(timeout=5)
    video = args.output / 'video.mp4'
    info = json.loads(subprocess.check_output([str(args.ffprobe), '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)], text=True))
    stream = next(item for item in info['streams'] if item['codec_type'] == 'video')
    assert stream['codec_name'] == 'h264'
    assert stream['width'] <= 1920 and stream['height'] <= 1080
    assert abs(float(info['format']['duration']) - args.seconds) < .15
    assert all(item['codec_type'] != 'audio' for item in info['streams']), 'Video must contain no audio track'
    from PIL import Image
    image = Image.open(args.output / 'screenshot.png').convert('RGB')
    assert image.width > 100 and image.height > 100
    assert len(image.getcolors(image.width * image.height) or []) > 2, 'Capture must contain the synthetic game, not a blank frame'
    (args.output / 'results.json').write_text(json.dumps(info, indent=2)+'\n')
    print(f'Native PNG and H.264 video verified ({args.seconds}s, audio=off)')

if __name__ == '__main__':
    main()
