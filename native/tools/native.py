#!/usr/bin/env python3
"""Build and run the native game; never starts Vite, Node or a browser."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

NATIVE = Path(__file__).resolve().parents[1]
ROOT = NATIVE.parent
ENV = os.environ.copy()
local_cargo = ROOT / '.tools' / 'cargo'
if (local_cargo / 'bin').is_dir():
    ENV['CARGO_HOME'] = str(local_cargo)
    ENV['RUSTUP_HOME'] = str(ROOT / '.tools' / 'rustup')
    ENV['PATH'] = str(local_cargo / 'bin') + os.pathsep + ENV.get('PATH', '')

def run(command, **kwargs):
    subprocess.run(command, cwd=NATIVE, env=ENV, check=True, **kwargs)

def godot():
    candidate = ENV.get('GODOT_BIN') or shutil.which('godot', path=ENV['PATH']) or shutil.which('godot4', path=ENV['PATH'])
    local = ROOT / '.tools/godot/Godot.app/Contents/MacOS/Godot'
    if not candidate and local.is_file():
        candidate = str(local)
    if not candidate:
        raise RuntimeError('Godot não encontrado. Instale Godot 4.6.1 e defina GODOT_BIN para o executável.')
    return candidate

def build():
    run(['cargo', 'build', '--locked', '-p', 'campo-godot'])
    name = {'darwin': 'libcampo_godot.dylib', 'win32': 'campo_godot.dll'}.get(sys.platform, 'libcampo_godot.so')
    destination = NATIVE / 'client/bin'
    destination.mkdir(exist_ok=True)
    # Replace the inode rather than overwriting a library mapped by a running
    # client (which also invalidates macOS code-signature page caches).
    with tempfile.NamedTemporaryFile(dir=destination, delete=False) as temporary:
        staged = Path(temporary.name)
    try:
        shutil.copy2(NATIVE / 'target/debug' / name, staged)
        staged.replace(destination / name)
    finally:
        staged.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['build', 'test', 'run', 'smoke', 'controls', 'athlete', 'training', 'locomotion', 'check', 'server'])
    parser.add_argument('--capture', type=Path)
    args = parser.parse_args()
    if args.command == 'test':
        run(['cargo', 'test', '--locked', '-p', 'campo-core', '-p', 'campo-server'])
    elif args.command == 'check':
        run(['cargo', 'fmt', '--all', '--', '--check'])
        run(['cargo', 'clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings'])
    elif args.command == 'server':
        run(['cargo', 'run', '--locked', '-p', 'campo-server', '--', '1200'])
    else:
        build()
        if args.command == 'build':
            return
        executable = godot()
        log_file = Path(tempfile.gettempdir()) / 'campo-godot.log'
        run([executable, '--log-file', str(log_file), '--headless', '--path', str(NATIVE / 'client'), '--editor', '--import'])
        command = [executable, '--log-file', str(log_file), '--path', str(NATIVE / 'client')]
        if args.command == 'controls':
            command += ['--headless', '--script', 'res://tests/controls.gd']
        if args.command == 'athlete':
            command += ['--headless', '--script', 'res://tests/athlete_visual.gd']
        if args.command == 'training':
            if not args.capture:
                command += ['--headless']
            command += ['--script', 'res://tests/2v1_visual.gd']
            if args.capture:
                args.capture.resolve().parent.mkdir(parents=True, exist_ok=True)
                command += ['--', '--capture=' + str(args.capture.resolve())]
        if args.command == 'locomotion':
            if not args.capture:
                command += ['--headless']
            command += ['--script', 'res://tests/locomotion_visual.gd']
            if args.capture:
                args.capture.resolve().parent.mkdir(parents=True, exist_ok=True)
                command += ['--', '--capture=' + str(args.capture.resolve())]
        if args.command == 'smoke':
            if not args.capture:
                command += ['--headless']
            command += ['--', '--smoke']
            if args.capture:
                args.capture.resolve().parent.mkdir(parents=True, exist_ok=True)
                command.append('--capture=' + str(args.capture.resolve()))
        run(command, timeout=90 if args.command in ['smoke', 'controls', 'athlete', 'training', 'locomotion'] else None)

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'CAMPO nativo: {error}', file=sys.stderr)
        sys.exit(1)
