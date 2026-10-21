#!/usr/bin/env python3
"""Create a checksummed makepkg recipe from this checkout, including local edits."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]


def arch_version(version):
    # Pacman's '_' sorts *after* the final release. Join rc/alpha/beta suffixes
    # directly, so e.g. 3.0.0rc.6 upgrades cleanly to 3.0.0.
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?', version):
        raise ValueError(f'Unsupported Arch version: {version}')
    return version.replace('-', '')


def prepare(output):
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Keep package output outside the source checkout')
    output.mkdir(parents=True, exist_ok=True)
    version = arch_version(json.loads((ROOT / 'desktop/src-tauri/tauri.conf.json').read_text())['version'])
    name = f'aquastar-{version}'
    archive = output / f'{name}.tar.gz'
    inventory = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT
    ).decode().split('\0')
    epoch = int(os.environ.get('SOURCE_DATE_EPOCH') or subprocess.check_output(
        ['git', 'log', '-1', '--format=%ct'], cwd=ROOT).strip())
    with archive.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=epoch) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            for relative in sorted(set(filter(None, inventory))):
                source = ROOT / relative
                if not source.is_file() and not source.is_symlink():
                    continue
                info = tar.gettarinfo(str(source), arcname=f'{name}/{relative}')
                info.uid = info.gid = 0
                info.uname = info.gname = 'root'
                info.mtime = epoch
                if info.isfile():
                    with source.open('rb') as handle:
                        tar.addfile(info, handle)
                else:
                    tar.addfile(info)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    recipe = (ROOT / 'desktop/packaging/arch/PKGBUILD.in').read_text()
    (output / 'PKGBUILD').write_text(recipe.replace('@PKGVER@', version).replace('@SOURCE_SHA256@', digest))
    info = subprocess.check_output(['makepkg', '--printsrcinfo'], cwd=output)
    (output / '.SRCINFO').write_bytes(info)
    print(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT.parent / 'AquaStar-workspace/arch')
    args = parser.parse_args()
    prepare(args.output)
