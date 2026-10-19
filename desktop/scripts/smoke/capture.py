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
    parser.add_argument('--audio', action='store_true')
    parser.add_argument('--seconds', type=int, default=3)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    if args.audio:
        env['AQUASTAR_PROBE_AUDIO'] = '1'
    else:
        env.pop('AQUASTAR_PROBE_AUDIO', None)
    env['AQUASTAR_PROBE_SECONDS'] = str(args.seconds)
    if sys.platform == 'win32':
        fixture = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(Path(__file__).with_name('capture-fixture.ps1'))]
    elif sys.platform.startswith('linux'):
        fixture = ['/usr/bin/python3', str(Path(__file__).with_name('capture-fixture.py'))]
        if args.audio:
            fixture.append('--audio')
    else:
        raise RuntimeError('Native macOS capture requires an interactive permission and gameplay test; this fixture covers Linux/Windows.')
    with (args.output / 'fixture.log').open('w') as log:
        process = subprocess.Popen(fixture, env=env, stdout=log, stderr=log)
        try:
            time.sleep(2)
            result = subprocess.run([str(args.binary.resolve()), str(process.pid), str(args.encoder.resolve()), str(args.output.resolve())], env=env, check=True, text=True, capture_output=True, timeout=args.seconds + 60)
            (args.output / 'native.log').write_text(result.stdout + result.stderr)
        finally:
            process.terminate()
            process.wait(timeout=5)
    video = args.output / ('recording.mp4' if args.audio else 'video.mp4')
    info = json.loads(subprocess.check_output([str(args.ffprobe), '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)], text=True))
    stream = next(item for item in info['streams'] if item['codec_type'] == 'video')
    assert stream['codec_name'] == 'h264'
    assert stream['width'] <= 1920 and stream['height'] <= 1080
    assert abs(float(info['format']['duration']) - args.seconds) < .15
    if args.audio:
        audio = next(item for item in info['streams'] if item['codec_type'] == 'audio')
        assert audio['codec_name'] == 'aac' and audio['sample_rate'] == '48000' and audio['channels'] == 2
    from PIL import Image
    image = Image.open(args.output / 'screenshot.png').convert('RGB')
    assert image.width > 100 and image.height > 100
    assert len(image.getcolors(image.width * image.height) or []) > 2, 'Capture must contain the synthetic game, not a blank frame'
    (args.output / 'results.json').write_text(json.dumps(info, indent=2)+'\n')
    print(f'Native PNG and H.264 video verified ({args.seconds}s, audio={args.audio})')

if __name__ == '__main__':
    main()
