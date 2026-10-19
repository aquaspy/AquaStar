#!/usr/bin/env python3
"""Build the offline recording sidecar from pinned, minimal LGPL/BSD sources."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import urllib.request

SOURCES = {
    'ffmpeg': ('8.1.3', 'https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz', '7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3'),
    'openh264': ('2.6.0', 'https://codeload.github.com/cisco/openh264/tar.gz/refs/tags/v2.6.0', '558544ad358283a7ab2930d69a9ceddf913f4a51ee9bf1bfb9e377322af81a69'),
}
ROOT = Path(__file__).resolve().parents[1]

def run(args, cwd, env):
    subprocess.run([str(a) for a in args], cwd=cwd, env=env, check=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, default=ROOT.parent.parent / 'AquaStar-workspace/builds/media')
    parser.add_argument('--source-bundle', action='store_true', help='Archive corresponding sources, notices and the build recipe beside the build cache')
    parser.add_argument('--arch', choices=['x86_64', 'aarch64'], default='aarch64' if platform.machine().lower() in ('arm64','aarch64') else 'x86_64')
    args = parser.parse_args()
    host = {'Linux':'linux', 'Darwin':'macos', 'Windows':'windows'}.get(platform.system())
    if host is None:
        raise RuntimeError('Unsupported media build platform')
    tag = f'{host}-{args.arch}'
    work = args.work.resolve() / tag
    work.mkdir(parents=True, exist_ok=True)
    print(f'Preparing offline recording component for {tag}', flush=True)
    env = os.environ.copy()
    prefix = work / 'install'
    env['PKG_CONFIG_PATH'] = (prefix / 'lib/pkgconfig').as_posix()
    env.pop('PKG_CONFIG_SYSROOT_DIR', None)
    sources = {}
    for name, (version, url, digest) in SOURCES.items():
        archive = work / (f'{name}-{version}.tar.xz' if name == 'ffmpeg' else f'{name}-{version}.tar.gz')
        if not archive.exists():
            print(f'Downloading {name} {version} source…', flush=True)
            urllib.request.urlretrieve(url, archive)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f'{name} source checksum mismatch')
        tree = work / f'{name}-{version}'
        if not tree.exists():
            with tarfile.open(archive) as handle:
                handle.extractall(work, filter='data')
        sources[name] = tree
    jobs = str(min(os.cpu_count() or 2, 8))
    arch = 'arm64' if args.arch == 'aarch64' and host == 'macos' else args.arch
    make_args = [f'PREFIX={prefix.as_posix()}', f'ARCH={arch}', 'BUILDTYPE=Release']
    if shutil.which('nasm', path=env.get('PATH')) is None:
        make_args.append('USE_ASM=No')
    if host == 'macos':
        env['MACOSX_DEPLOYMENT_TARGET'] = '11.0'
        env['CC'] = f'clang -arch {arch}'
        env['CXX'] = f'clang++ -arch {arch}'
        make_args += [f'CC={env["CC"]}',f'CXX={env["CXX"]}', 'OS=darwin']
    elif host == 'windows':
        make_args += ['OS=mingw_nt', 'CC=gcc', 'CXX=g++']
    run(['make','-j'+jobs,*make_args,'libraries'],sources['openh264'],env)
    run(['make',*make_args,'install-static'],sources['openh264'],env)
    options = [f'--prefix={prefix.as_posix()}', '--disable-everything','--disable-autodetect','--disable-network',
        '--disable-doc','--disable-debug','--enable-small','--disable-shared','--enable-static',
        '--enable-ffmpeg','--enable-ffprobe','--enable-protocol=file,pipe','--enable-demuxer=rawvideo,pcm_f32le,mov',
        '--enable-muxer=mp4,ipod','--enable-decoder=rawvideo,pcm_f32le,aac,h264',
        '--enable-encoder=libopenh264,aac','--enable-parser=h264,aac',
        '--enable-filter=format,scale,aresample,aformat,anull,null','--enable-swscale','--enable-swresample',
        '--enable-libopenh264', f'--extra-cflags=-I{(prefix / "include").as_posix()}', f'--extra-ldflags=-L{(prefix / "lib").as_posix()}',
        '--extra-libs=-lc++' if host == 'macos' else '--extra-libs=-lstdc++']
    if shutil.which('nasm', path=env.get('PATH')) is None:
        options.append('--disable-x86asm')
    if host == 'macos':
        options += [f'--arch={arch}',f'--cc=clang -arch {arch}',f'--cxx=clang++ -arch {arch}', '--enable-cross-compile', '--target-os=darwin']
    if host == 'windows':
        options += ['--target-os=mingw32', '--extra-ldexeflags=-static']
    run(['bash','configure',*options],sources['ffmpeg'],env)
    run(['make','-j'+jobs],sources['ffmpeg'],env)
    destination = ROOT / 'src-tauri/media'
    destination.mkdir(exist_ok=True)
    suffix = '.exe' if host == 'windows' else ''
    binary = destination / f'ffmpeg-{tag}{suffix}'
    shutil.copy2(sources['ffmpeg'] / f'ffmpeg{suffix}', binary)
    binary.chmod(0o755)
    if host == 'macos':
        helper = destination / f'capture-{tag}'
        run(['swiftc', '-O', '-target', f'{arch}-apple-macosx11.0', '-Xlinker', '-weak_framework', '-Xlinker', 'ScreenCaptureKit', ROOT / 'native/capture-macos.swift', '-o', helper], work, env)
        run(['codesign','--force','--sign','-',helper],work,env)
    notices = destination / f'licenses-{tag}' 
    notices.mkdir(exist_ok=True)
    shutil.copy2(sources['ffmpeg'] / 'COPYING.LGPLv2.1', notices / 'FFmpeg-LGPL-2.1.txt')
    shutil.copy2(sources['openh264'] / 'LICENSE', notices / 'OpenH264-BSD.txt')
    manifest = {'sources': SOURCES, 'configure': options, 'binarySha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
    (notices / 'build.json').write_text(json.dumps(manifest, indent=2)+'\n')
    if args.source_bundle:
        bundle = args.work.resolve() / 'AquaStar-media-sources.tar.xz'
        with tarfile.open(bundle, 'w:xz') as archive:
            for name, (version, _, _) in SOURCES.items():
                source = work / (f'{name}-{version}.tar.xz' if name == 'ffmpeg' else f'{name}-{version}.tar.gz')
                archive.add(source, arcname=source.name)
            archive.add(Path(__file__), arcname='build-media.py')
            archive.add(notices, arcname='licenses-and-build')
        print(f'Corresponding sources: {bundle}')
    machine_arch = 'aarch64' if platform.machine().lower() in ('arm64','aarch64') else 'x86_64'
    if machine_arch == args.arch:
        run([binary,'-hide_banner','-encoders'],work,env)
    else:
        print('Cross-architecture component built; runtime validation requires its target architecture.')
    print(f'Bundled media: {binary} ({binary.stat().st_size} bytes)')

if __name__ == '__main__':
    main()
