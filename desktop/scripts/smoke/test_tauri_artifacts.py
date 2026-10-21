#!/usr/bin/env python3
"""Verify generated installer names are normalized to the public package name."""

import importlib.util
from pathlib import Path
import tempfile

SCRIPT = Path(__file__).resolve().parents[1] / 'rename-tauri-artifacts.py'
SPEC = importlib.util.spec_from_file_location('rename_tauri_artifacts', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def main():
    cases = [
        ('AquaStar NEO_3.0.0-rc.6_amd64.AppImage', '.AppImage'),
        ('aqua-star-neo_3.0.0-rc.6_x64-setup.exe', '-setup.exe'),
    ]
    with tempfile.TemporaryDirectory(prefix='aquastar-neo-artifacts-') as scratch:
        for source_name, suffix in cases:
            folder = Path(scratch) / suffix.removeprefix('.')
            folder.mkdir()
            source = folder / source_name
            source.write_bytes(b'fixture')
            target = MODULE.rename_artifact(folder, '3.0.0-rc.6', suffix)
            assert target.name.startswith('aquastar-neo_3.0.0-rc.6_')
            assert target.read_bytes() == b'fixture'
            assert MODULE.rename_artifact(folder, '3.0.0-rc.6', suffix) == target
            assert list(folder.iterdir()) == [target]
    print('Tauri artifact naming and idempotence: passed')


if __name__ == '__main__':
    main()
