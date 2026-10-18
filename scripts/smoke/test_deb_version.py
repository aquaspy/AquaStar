#!/usr/bin/env python3
"""Verify candidate ordering and payload preservation with real Debian archives."""

import hashlib
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile

SCRIPT = Path(__file__).resolve().parents[1] / 'normalize-deb-version.py'


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def payload(path):
    data = subprocess.check_output(['dpkg-deb', '--fsys-tarfile', str(path)])
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        return {item.name: (item.mode, item.type, item.linkname,
                hashlib.sha256(archive.extractfile(item).read()).hexdigest() if item.isfile() else None)
                for item in archive}


def main():
    with tempfile.TemporaryDirectory(prefix='aquastar-deb-test-') as scratch:
        for version, expected in [('3.0.0-rc.3', '3.0.0~rc.3'), ('2.1.1-rc.9', '2.1.1~rc.9'), ('3.0.0', '3.0.0')]:
            root = Path(scratch) / version
            (root / 'DEBIAN').mkdir(parents=True)
            (root / 'usr/bin').mkdir(parents=True)
            (root / 'DEBIAN/control').write_text(f'Package: aquastar-test\nVersion: {version}\nArchitecture: amd64\nMaintainer: AquaStar\nDescription: Version normalization fixture\n')
            binary = root / 'usr/bin/fixture'
            binary.write_bytes(b'unchanged game payload\n')
            binary.chmod(0o755)
            package = Path(scratch) / f'AquaStar_{version}_amd64.deb'
            command('dpkg-deb', '--build', '--root-owner-group', str(root), str(package))
            original = payload(package)
            command('python3', str(SCRIPT), str(package))
            assert command('dpkg-deb', '--field', str(package), 'Version') == expected
            assert command('dpkg-deb', '--field', str(package), 'Package') == 'aquastar-test'
            assert command('dpkg-deb', '--field', str(package), 'Architecture') == 'amd64'
            assert payload(package) == original
            digest = hashlib.sha256(package.read_bytes()).hexdigest()
            command('python3', str(SCRIPT), str(package))
            assert hashlib.sha256(package.read_bytes()).hexdigest() == digest
            if '~' in expected:
                members = command('ar', 't', str(package)).splitlines()
                assert 'control.tar.gz' in members and 'data.tar.xz' in members
                subprocess.run(['dpkg', '--compare-versions', expected, 'lt', expected.split('~')[0]], check=True)
    print('Debian candidate ordering, identity, payload, stable versions and idempotence: passed')


if __name__ == '__main__':
    main()
