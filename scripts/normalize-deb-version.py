#!/usr/bin/env python3
"""Encode SemVer candidates so Debian orders them before their stable release."""

import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def field(path, name):
    return subprocess.check_output(['dpkg-deb', '--field', str(path), name], text=True).strip()


def normalize(path):
    path = path.resolve(strict=True)
    version = field(path, 'Version')
    match = re.fullmatch(r'(\d+\.\d+\.\d+)-(alpha|beta|rc)([.0-9A-Za-z+-]*)', version)
    if not match:
        print(f'{path.name}: Version {version} unchanged')
        return
    normalized = version.replace('-', '~', 1)
    subprocess.run(['dpkg', '--compare-versions', normalized, 'lt', match[1]], check=True)
    identity = (field(path, 'Package'), field(path, 'Architecture'))
    with tempfile.TemporaryDirectory(prefix='.aquastar-deb-', dir=path.parent) as scratch:
        tree = Path(scratch) / 'package'
        result = Path(scratch) / path.name
        subprocess.run(['dpkg-deb', '--raw-extract', str(path), str(tree)], check=True)
        control = tree / 'DEBIAN/control'
        text, changed = re.subn(r'^Version:.*$', 'Version: ' + normalized, control.read_text(), flags=re.MULTILINE)
        if changed != 1:
            raise ValueError(f'{path}: expected one Version field')
        control.write_text(text)
        subprocess.run(['dpkg-deb', '--build', '--root-owner-group', str(tree), str(result)], check=True,
                       stdout=subprocess.DEVNULL)
        if field(result, 'Version') != normalized or (field(result, 'Package'), field(result, 'Architecture')) != identity:
            raise ValueError(f'{path}: package identity changed during normalization')
        result.chmod(path.stat().st_mode & 0o777)
        os.replace(result, path)
    print(f'{path.name}: Version {version} -> {normalized}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('Usage: normalize-deb-version.py PACKAGE.deb [PACKAGE.deb ...]')
    for argument in sys.argv[1:]:
        normalize(Path(argument))
