#!/usr/bin/env python3
import re
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github' / 'workflows'

BASH_MARKERS = (
    re.compile(r'set -euo'),
    re.compile(r'\[\[') ,
    re.compile(r'(?m)^\s*fi\s*$'),
    re.compile(r'(?m)^\s*esac\s*$'),
    re.compile(r'\bif \['),
    re.compile(r'\belif \['),
    re.compile(r'\$\{[^}]*:-'),
    re.compile(r'\bsource\b'),
    re.compile(r'done <'),
)
PWSH_MARKERS = (
    re.compile(r'\bGet-Content\b'),
    re.compile(r'\bTest-Path\b'),
    re.compile(r'\bJoin-Path\b'),
    re.compile(r'\bConvertFrom-Json\b'),
    re.compile(r'\bOut-Null\b'),
    re.compile(r'\$env:'),
)


class ActionsLoader(yaml.SafeLoader):
    pass


for first, resolvers in list(ActionsLoader.yaml_implicit_resolvers.items()):
    ActionsLoader.yaml_implicit_resolvers[first] = [
        (tag, pattern)
        for tag, pattern in resolvers
        if tag != 'tag:yaml.org,2002:bool'
    ]


def load_actions(text):
    return yaml.load(text, Loader=ActionsLoader)


def windows_job(job):
    runs_on = str(job.get('runs-on') or '')
    if 'windows' in runs_on.lower():
        return True
    matrix = (job.get('strategy') or {}).get('matrix') or {}
    values = []
    for key in ('os', 'platform'):
        entry = matrix.get(key)
        if isinstance(entry, list):
            values.extend(str(item) for item in entry)
    for row in matrix.get('include') or []:
        if isinstance(row, dict):
            values.extend(str(row.get(key) or '') for key in ('os', 'platform'))
    return any('windows' in value.lower() for value in values)


def skips_windows(condition):
    text = condition or ''
    needles = (
        "runner.os != 'Windows'",
        'runner.os != "Windows"',
        "runner.os == 'Linux'",
        "runner.os == 'macOS'",
        "matrix.platform == 'ubuntu-22.04'",
        "matrix.platform == 'macos-latest'",
        "matrix.platform != 'windows-latest'",
    )
    return any(needle in text for needle in needles)


def shell_family(shell):
    text = (shell or '').strip().lower()
    if text.startswith('bash') or text.startswith('msys2') or text.startswith('sh '):
        return 'bash'
    if text.startswith('pwsh') or text.startswith('powershell'):
        return 'pwsh'
    return ''


def lint_jobs(jobs, filename):
    errors = []
    for job_name, job in (jobs or {}).items():
        if not isinstance(job, dict) or not windows_job(job):
            continue
        for index, step in enumerate(job.get('steps') or [], start=1):
            if not isinstance(step, dict) or 'run' not in step:
                continue
            if skips_windows(str(step.get('if') or '')):
                continue
            script = step['run']
            if not isinstance(script, str):
                continue
            family = shell_family(str(step.get('shell') or ''))
            label = step.get('name') or f'step {index}'
            where = f'{filename}: job {job_name!r} step {label!r}'
            if family == 'bash' and any(marker.search(script) for marker in PWSH_MARKERS):
                errors.append(f'{where} uses PowerShell syntax under shell: {step.get("shell")}')
            github_windows_shell = 'pwsh'
            shell_on_windows = family or github_windows_shell
            if shell_on_windows == 'pwsh' and any(marker.search(script) for marker in BASH_MARKERS):
                errors.append(
                    f'{where} uses bash syntax on a Windows runner without shell: bash'
                )
    return errors


def lint_text(text, filename='<memory>'):
    document = load_actions(text) or {}
    return lint_jobs(document.get('jobs'), filename)


def self_check():
    broken = """
jobs:
  build:
    runs-on: windows-latest
    steps:
      - name: Keep this upload off Latest
        run: |
          if [ "$KIND" = "stable" ]; then
            echo ok
          fi
"""
    fixed = broken.replace('run: |', 'shell: bash\n        run: |', 1)
    linux_only = """
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-22.04, windows-latest]
    steps:
      - name: Linux only
        if: runner.os == 'Linux'
        run: |
          if [ -f missing ]; then
            echo no
          fi
"""
    problems = []
    if not lint_text(broken):
        problems.append('the bash-on-pwsh sample was accepted')
    if lint_text(fixed):
        problems.append('an explicit bash shell was rejected')
    if lint_text(linux_only):
        problems.append('a Linux-only bash step was rejected')
    return problems


def main():
    problems = self_check()
    for path in sorted(WORKFLOWS.glob('*.yml')):
        problems.extend(lint_text(path.read_text(), path.relative_to(ROOT).as_posix()))
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    print(f'workflow shell check ok ({len(list(WORKFLOWS.glob("*.yml")))} files)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
