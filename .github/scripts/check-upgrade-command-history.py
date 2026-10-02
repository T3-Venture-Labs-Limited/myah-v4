#!/usr/bin/env python3
"""Keep upgrade history immutable except the exact MYAH-409 preserved migration snapshot.

The one-time exception is bound to the PR base, path, diff status and candidate SHA-256.
It cannot be reused for another base, a subset, a rename or changed command bytes.
"""

import argparse
import hashlib
import pathlib
import re
import subprocess
import sys
import time

ROOT = 'packages/twenty-server/src/database/commands/upgrade-version-command/'
PRESERVED_BASES = frozenset({
    'bd427cced1c7a98bff7d18a8d7598a608cc79a00',
    'f184fc6e83cff47d9a0b0f3d328326c33d5effd8',
})
# On both reviewed PR bases the eight preserved paths have identical diff
# statuses and candidate bytes; every path and digest remains required.
PRESERVED = {
    ROOT + '2-19/2-19-upgrade-version-command.module.ts': ('M', 'a19c0e592960854b58c4aa0021cf00e7023eec3b2c37d875efee5cd0b2789e00'),
    ROOT + '2-19/2-19-workspace-command-1786155607568-scope-myah-creator-social-profiles.command.ts': ('A', 'd234deaf6a53cfb86a692901f808bf969240116fde5aa703e4abc33693e16500'),
    ROOT + '2-19/__tests__/2-19-workspace-command-1785240016000-synchronize-myah-creator-crm-search-metadata.command.spec.ts': ('M', '15c3de8273e29a40e0caf9fc9cc8ef960b8fddd338e6ee1f50fba071bee49d24'),
    ROOT + '2-19/__tests__/2-19-workspace-command-1786155607568-scope-myah-creator-social-profiles.command.spec.ts': ('A', 'ea4ab9d673359f7904aa47ba9dc5009cb76b14b98ea63388829a7281040cdd11'),
    ROOT + '2-19/services/__tests__/synchronize-source-controlled-myah-metadata.service.spec.ts': ('M', '40e6e3681da48d4bbfb190ef7096bd197c0ec708e913c70e4e762049bea871e7'),
    ROOT + '2-20/2-20-instance-command-fast-1789645911010-create-creator-data-operation-receipts.ts': ('A', 'e8bce218accf1fc18b14035590c3ecd434ce6aeea912cc3007a8c05af8e2af28'),
    ROOT + '2-20/2-20-workspace-command-1789645911011-migrate-myah-creator-social-profiles.command.ts': ('A', '635cc29edf9c36c75664feddc3d39a80fed4ebbf6313736080948fbb625a7316'),
    ROOT + '2-20/2-20-workspace-command-1789645911012-scope-myah-creator-social-profiles-forward.command.ts': ('A', 'ee49ae87b3699d9e300523e8a80ac9d490588443b11d8116cc6c8e83ef0c5ee8'),
}
COMMAND_TS = re.compile(r'-(?:instance-command-(?:fast|slow)|workspace-command)-(\d{13})-')
VERSION_DIR = re.compile(r'^' + re.escape(ROOT) + r'(\d+-\d+)/')


class GuardFailure(Exception):
    pass


def check(base, statuses, read_file, current_dir, base_paths, now_ms, kind,
          renames=(), require_snapshot=False):
    if not re.fullmatch(r'[a-f0-9]{40}', base or '') or not re.fullmatch(r'\d+-\d+', current_dir or ''):
        raise GuardFailure('Missing or malformed base SHA/current version')
    if kind not in ('version', 'timestamp'):
        raise GuardFailure('Unknown check')
    if any(path in PRESERVED for pair in renames for path in pair):
        raise GuardFailure('A preserved migration path was renamed')
    historical_commands = {
        path for path in base_paths
        if COMMAND_TS.search(pathlib.PurePosixPath(path).name) and not path.endswith('.spec.ts')
    }
    if any(status == 'D' and path in historical_commands for path, status in statuses.items()) or any(
        source in historical_commands for source, _ in renames
    ):
        raise GuardFailure('A registered upgrade command was deleted or renamed')

    if require_snapshot or PRESERVED.keys() & statuses.keys():
        if base not in PRESERVED_BASES:
            raise GuardFailure('Preserved migration exception is bound to a reviewed PR base')
        for path, (expected_status, expected_digest) in PRESERVED.items():
            if statuses.get(path) != expected_status:
                raise GuardFailure(f'Missing or different preserved migration status: {path}')
            try:
                digest = hashlib.sha256(read_file(path)).hexdigest()
            except (OSError, KeyError, subprocess.CalledProcessError) as error:
                raise GuardFailure(f'Missing preserved migration file: {path}') from error
            if digest != expected_digest:
                raise GuardFailure(f'Preserved migration bytes differ: {path}')

    if kind == 'version':
        for source, _ in renames:
            match = VERSION_DIR.match(source)
            if match and match.group(1) != current_dir:
                raise GuardFailure(f'Upgrade file renamed out of an older version: {source}')
        for path, status in statuses.items():
            match = VERSION_DIR.match(path)
            if match and match.group(1) != current_dir and status in ('A', 'M') and path not in PRESERVED:
                raise GuardFailure(f'Upgrade file outside current version: {path}')
        return

    gone = {path for path, status in statuses.items() if status == 'D'}
    gone.update(source for source, _ in renames)
    for path, status in statuses.items():
        if status != 'A' or path in PRESERVED or path.endswith('.spec.ts'):
            continue
        match = COMMAND_TS.search(pathlib.PurePosixPath(path).name)
        if not match:
            continue  # Non-command files remain governed by the version check.
        timestamp = int(match.group(1))
        if not now_ms - 60 * 24 * 3600 * 1000 <= timestamp <= now_ms + 2 * 24 * 3600 * 1000:
            raise GuardFailure(f'Upgrade command timestamp outside authoring window: {path}')
        directory = str(pathlib.PurePosixPath(path).parent) + '/'
        maximum = max((int(m.group(1)) for old in base_paths
                       if old.startswith(directory) and old not in gone and not old.endswith('.spec.ts')
                       if (m := COMMAND_TS.search(pathlib.PurePosixPath(old).name))), default=0)
        if timestamp <= maximum:
            raise GuardFailure(f'Upgrade command timestamp not append-only: {path} <= {maximum}')


def git(*args):
    return subprocess.check_output(('git', *args))


def changed_files(base, target):
    chunks = git('diff', '--name-status', '-z', '--find-renames', base,
                 *((target,) if target != 'working' else ()), '--', ROOT).split(b'\0')
    statuses, renames = {}, []
    index = 0
    while index < len(chunks) - 1:
        status = chunks[index].decode('ascii')
        index += 1
        if not re.fullmatch(r'[AMDRC](?:\d+)?', status):
            raise GuardFailure('Unrecognized upgrade diff status')
        path = chunks[index].decode('utf-8')
        index += 1
        if status[0] in 'RC':
            destination = chunks[index].decode('utf-8')
            index += 1
            renames.append((path, destination))
            if status[0] == 'R':
                statuses[path] = 'D'
            statuses[destination] = 'A'
        else:
            statuses[path] = status
    if target == 'working':
        for path in git('ls-files', '--others', '--exclude-standard', '-z', '--', ROOT).split(b'\0'):
            if path:
                statuses[path.decode('utf-8')] = 'A'
    return statuses, renames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    parser.add_argument('--target', choices=('HEAD', 'working'), default='HEAD')
    parser.add_argument('--check', choices=('version', 'timestamp'), required=True)
    args = parser.parse_args()
    try:
        if not re.fullmatch(r'[a-f0-9]{40}', args.base):
            raise GuardFailure('Missing or malformed PR base SHA')
        git('cat-file', '-e', f'{args.base}^{{commit}}')
        version_file = 'packages/twenty-server/src/engine/core-modules/upgrade/constants/twenty-current-version.constant.ts'
        source = (pathlib.Path(version_file).read_text() if args.target == 'working'
                  else git('show', f'HEAD:{version_file}').decode())
        match = re.search(r"TWENTY_CURRENT_VERSION = '(\d+)\.(\d+)\.\d+'", source)
        if not match:
            raise GuardFailure('Could not extract current version')
        statuses, renames = changed_files(args.base, args.target)
        # A newly introduced guard on the reviewed base must see the full snapshot,
        # even if all eight migrations were omitted from the candidate.
        script_path = '.github/scripts/check-upgrade-command-history.py'
        script_diff = git('diff', '--name-status', '-z', args.base,
                          *((args.target,) if args.target != 'working' else ()),
                          '--', script_path).split(b'\0')
        script_added = script_diff[:2] == [b'A', script_path.encode()]
        if args.target == 'working' and not script_added:
            script_added = script_path.encode() in git(
                'ls-files', '--others', '--exclude-standard', '-z', '--', script_path).split(b'\0')
        base_paths = [p.decode() for p in git('ls-tree', '-r', '--name-only', '-z', args.base, '--', ROOT).split(b'\0') if p]
        read_file = (lambda p: pathlib.Path(p).read_bytes()) if args.target == 'working' else (lambda p: git('show', f'HEAD:{p}'))
        check(args.base, statuses, read_file, '-'.join(match.groups()), base_paths,
              int(time.time() * 1000), args.check, renames,
              require_snapshot=script_added and args.base in PRESERVED_BASES)
        print(f'Upgrade {args.check} guard passed ({len(statuses)} changed paths)')
    except (GuardFailure, OSError, subprocess.CalledProcessError, UnicodeError, IndexError) as error:
        print(f'::error::Upgrade {args.check} guard failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
