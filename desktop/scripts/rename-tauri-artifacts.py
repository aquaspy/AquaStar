#!/usr/bin/env python3
"""Give Tauri's generated installer files AquaStar NEO's package name."""

import argparse
from pathlib import Path
import os


def rename_artifact(bundle_dir: Path, version: str, suffix: str) -> Path:
    bundle_dir = bundle_dir.resolve()
    target_prefix = f'aquastar-neo_{version}_'
    source_prefixes = (
        f'AquaStar NEO_{version}_',
        f'aqua-star-neo_{version}_',
    )
    sources = sorted(path for path in bundle_dir.glob(f'*{suffix}')
                     if any(path.name.startswith(prefix) for prefix in source_prefixes))
    if not sources:
        already_named = sorted(
            path for path in bundle_dir.glob(f'{target_prefix}*{suffix}') if path.is_file()
        )
        if len(already_named) == 1:
            return already_named[0]
        raise FileNotFoundError(f'No AquaStar NEO {suffix} bundle found in {bundle_dir}')
    if len(sources) != 1:
        raise RuntimeError(f'Expected one {suffix} bundle in {bundle_dir}, found {len(sources)}')
    source = sources[0]
    source_prefix = next(prefix for prefix in source_prefixes if source.name.startswith(prefix))
    target = source.with_name(target_prefix + source.name[len(source_prefix):])
    os.replace(source, target)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle-dir', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--platform', choices=('linux', 'windows'), required=True)
    args = parser.parse_args()
    suffix = '.AppImage' if args.platform == 'linux' else '-setup.exe'
    print(rename_artifact(args.bundle_dir, args.version, suffix))


if __name__ == '__main__':
    main()
