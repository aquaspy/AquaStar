#!/usr/bin/env python3
"""Encode SemVer candidates so Debian orders them before their stable release."""

import os
from pathlib import Path
import re
import subprocess
import argparse
import tempfile


def field(path, name):
    return subprocess.check_output(['dpkg-deb', '--field', str(path), name], text=True).strip()


def normalize(path, package_name=None):
    path = path.resolve(strict=True)
    version = field(path, 'Version')
    candidate = version.replace('~', '-', 1)
    match = re.fullmatch(r'(\d+\.\d+\.\d+)-(alpha|beta|rc)([.0-9A-Za-z+-]*)', candidate)
    normalized = candidate.replace('-', '~', 1) if match else version
    if match:
        subprocess.run(['dpkg', '--compare-versions', normalized, 'lt', match[1]], check=True)
    else:
        print(f'{path.name}: Version {version} unchanged')

    current_package = field(path, 'Package')
    target_package = package_name or current_package
    if not re.fullmatch(r'[a-z0-9][a-z0-9+.-]+', target_package):
        raise ValueError(f'Invalid Debian package name: {target_package}')
    architecture = field(path, 'Architecture')
    target_filename = f'{target_package}_{normalized}_{architecture}.deb' if package_name else path.name
    target_path = path.with_name(target_filename)
    members = subprocess.check_output(['ar', 't', str(path)], text=True).splitlines()
    needs_rebuild = (
        normalized != version
        or target_package != current_package
        or 'control.tar.gz' not in members
        or 'data.tar.xz' not in members
    )
    if not needs_rebuild:
        if target_path != path:
            os.replace(path, target_path)
            print(f'{path.name}: renamed to {target_path.name}')
        else:
            print(f'{path.name}: Version {version} and package identity unchanged')
        return

    identity = (target_package, architecture)
    with tempfile.TemporaryDirectory(prefix='.aquastar-deb-', dir=path.parent) as scratch:
        tree = Path(scratch) / 'package'
        result = Path(scratch) / path.name
        subprocess.run(['dpkg-deb', '--raw-extract', str(path), str(tree)], check=True)
        control = tree / 'DEBIAN/control'
        control_text = control.read_text()
        control_text, version_changed = re.subn(
            r'^Version:.*$', 'Version: ' + normalized, control_text, flags=re.MULTILINE
        )
        if version_changed != 1:
            raise ValueError(f'{path}: expected one Version field')
        if target_package != current_package:
            control_text, package_changed = re.subn(
                r'^Package:.*$', 'Package: ' + target_package, control_text, flags=re.MULTILINE
            )
            if package_changed != 1:
                raise ValueError(f'{path}: expected one Package field')
        control.write_text(control_text)
        subprocess.run(['dpkg-deb', '--build', '--root-owner-group', '--no-uniform-compression', '-Zxz', '-z6', str(tree), str(result)], check=True,
                       stdout=subprocess.DEVNULL)
        if field(result, 'Version') != normalized or (field(result, 'Package'), field(result, 'Architecture')) != identity:
            raise ValueError(f'{path}: package identity changed during normalization')
        result.chmod(path.stat().st_mode & 0o777)
        os.replace(result, target_path)
    if target_path != path:
        path.unlink()
    print(f'{path.name}: Package {current_package} -> {target_package}; Version {version} -> {normalized}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-name', help='also set the package identity and use it in the output filename')
    parser.add_argument('packages', nargs='+', type=Path)
    args = parser.parse_args()
    for package in args.packages:
        normalize(package, args.package_name)
