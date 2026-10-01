import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/check-upgrade-command-history.py'
SPEC = importlib.util.spec_from_file_location('upgrade_guard', SCRIPT)
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)
PREFIX = 'packages/twenty-server/src/database/commands/upgrade-version-command/'
BASE = 'bd427cced1c7a98bff7d18a8d7598a608cc79a00'
OLD = {
    PREFIX + '2-19/2-19-upgrade-version-command.module.ts': 'M',
    PREFIX + '2-19/2-19-workspace-command-1786155607568-scope-myah-creator-social-profiles.command.ts': 'A',
    PREFIX + '2-19/__tests__/2-19-workspace-command-1785240016000-synchronize-myah-creator-crm-search-metadata.command.spec.ts': 'M',
    PREFIX + '2-19/__tests__/2-19-workspace-command-1786155607568-scope-myah-creator-social-profiles.command.spec.ts': 'A',
    PREFIX + '2-19/services/__tests__/synchronize-source-controlled-myah-metadata.service.spec.ts': 'M',
}
NEW = {
    PREFIX + '2-20/2-20-instance-command-fast-1789645911010-create-creator-data-operation-receipts.ts': 'A',
    PREFIX + '2-20/2-20-workspace-command-1789645911011-migrate-myah-creator-social-profiles.command.ts': 'A',
    PREFIX + '2-20/2-20-workspace-command-1789645911012-scope-myah-creator-social-profiles-forward.command.ts': 'A',
}
MAX_PATH = PREFIX + '2-20/2-20-instance-command-fast-1790577600427-restore-instagram-v3-approval-context.ts'


class GuardTest(unittest.TestCase):
    def setUp(self):
        self.statuses = {**OLD, **NEW}
        self.contents = {path: (ROOT / path).read_bytes() for path in self.statuses}
        self.base_paths = [MAX_PATH]
        self.now_ms = 1791000000000

    def check(self, kind='version', base=BASE):
        return GUARD.check(base, self.statuses, self.contents.__getitem__,
                           '2-20', self.base_paths, self.now_ms, kind)

    def test_exact_eight_are_admitted_in_both_guards(self):
        self.check()
        self.check('timestamp')

    def test_one_byte_drift_is_denied_for_each_permitted_path(self):
        for path in self.contents:
            with self.subTest(path=path):
                original = self.contents[path]
                self.contents[path] = original + b'\n'
                with self.assertRaises(GUARD.GuardFailure):
                    self.check()
                with self.assertRaises(GUARD.GuardFailure):
                    self.check('timestamp')
                self.contents[path] = original

    def test_all_required_paths_and_statuses_must_be_present(self):
        for path in list(self.statuses):
            with self.subTest(path=path):
                status = self.statuses.pop(path)
                with self.assertRaises(GUARD.GuardFailure):
                    self.check()
                self.statuses[path] = 'D' if status == 'M' else 'R100'
                with self.assertRaises(GUARD.GuardFailure):
                    self.check('timestamp')
                self.statuses[path] = status

    def test_new_guard_on_reviewed_base_requires_snapshot_even_if_all_files_omitted(self):
        self.statuses.clear()
        with self.assertRaises(GUARD.GuardFailure):
            GUARD.check(BASE, self.statuses, self.contents.__getitem__, '2-20',
                        self.base_paths, self.now_ms, 'version', require_snapshot=True)

    def test_wrong_base_and_malformed_context_are_denied(self):
        for base in ('', 'not-a-sha', '0' * 40,
                     '7e1b6ed0c11ac9850ca5e04ebc8b7f0714d5be1d'):
            with self.subTest(base=base), self.assertRaises(GUARD.GuardFailure):
                self.check(base=base)
        with self.assertRaises(GUARD.GuardFailure):
            GUARD.check(BASE, self.statuses, self.contents.__getitem__, '', self.base_paths,
                        self.now_ms, 'version')

    def test_unrelated_old_directory_addition_or_modification_denied(self):
        for status in ('A', 'M'):
            extra = PREFIX + '2-19/2-19-workspace-command-1791000000000-extra.command.ts'
            self.statuses[extra] = status
            self.contents[extra] = b'extra'
            with self.assertRaises(GUARD.GuardFailure):
                self.check()
            self.statuses.pop(extra)
            self.contents.pop(extra)

    def test_renaming_unrelated_old_file_into_current_directory_is_denied(self):
        source = PREFIX + '2-19/2-19-workspace-command-1781000000000-unrelated.command.ts'
        destination = PREFIX + '2-20/2-20-workspace-command-1791000000001-unrelated.command.ts'
        self.statuses[source] = 'D'
        self.statuses[destination] = 'A'
        self.contents[destination] = b'unrelated'
        with self.assertRaises(GUARD.GuardFailure):
            GUARD.check(BASE, self.statuses, self.contents.__getitem__, '2-20',
                        self.base_paths, self.now_ms, 'version', [(source, destination)])

    def test_deleting_a_registered_old_command_is_denied_by_both_guards(self):
        old_command = PREFIX + '2-7/2-7-workspace-command-1798000030000-drop-favorite-objects.command.ts'
        self.base_paths.append(old_command)
        self.statuses[old_command] = 'D'
        with self.assertRaises(GUARD.GuardFailure):
            self.check()
        with self.assertRaises(GUARD.GuardFailure):
            self.check('timestamp')

    def test_unrelated_old_timestamp_is_not_exempt(self):
        extra = PREFIX + '2-20/2-20-workspace-command-1789645911013-unrelated.command.ts'
        self.statuses[extra] = 'A'
        self.contents[extra] = b'unrelated'
        with self.assertRaises(GUARD.GuardFailure):
            self.check('timestamp')

    def test_normal_addition_still_requires_age_and_append_order(self):
        self.statuses.clear()
        self.contents.clear()
        recent = PREFIX + '2-20/2-20-workspace-command-1791000000001-normal.command.ts'
        self.statuses[recent] = 'A'
        self.contents[recent] = b'normal'
        self.check()
        self.check('timestamp')
        self.base_paths.append(PREFIX + '2-20/__tests__/2-20-workspace-command-1791999999999-test.command.spec.ts')
        self.check('timestamp')  # Spec filenames do not set the base command maximum.
        for timestamp in (1789645911013, 1792000000000):
            bad = PREFIX + f'2-20/2-20-workspace-command-{timestamp}-normal.command.ts'
            self.statuses = {bad: 'A'}
            self.contents = {bad: b'normal'}
            with self.assertRaises(GUARD.GuardFailure):
                self.check('timestamp')

    def test_rename_of_permitted_path_is_denied(self):
        source = next(iter(OLD))
        self.statuses.pop(source)
        renamed = source + '.renamed'
        self.statuses[renamed] = 'A'
        self.contents[renamed] = self.contents[source]
        with self.assertRaises(GUARD.GuardFailure):
            self.check()
        with self.assertRaises(GUARD.GuardFailure):
            GUARD.check(BASE, self.statuses, self.contents.__getitem__, '2-20',
                        self.base_paths, self.now_ms, 'timestamp', [(source, renamed)])

    def test_workflow_always_runs_both_guards_even_with_policy_labels(self):
        workflow = (ROOT / '.github/workflows/ci-server.yaml').read_text()
        section = workflow.split('  server-previous-version-upgrade-mutation-guard:', 1)[1].split('  server-validation:', 1)[0]
        self.assertNotIn('ci:allow-previous-version-upgrade-mutation', section)
        self.assertNotIn('ci:allow-upgrade-command-timestamp-exception', section)
        filters = section.split('          files: |\n', 1)[1].split('      - name:', 1)[0].splitlines()
        filters = {line.strip() for line in filters}
        for policy_only in ('.github/workflows/ci-server.yaml',
                            '.github/scripts/check-upgrade-command-history.py',
                            '.github/scripts/test-check-upgrade-command-history.py'):
            with self.subTest(policy_only=policy_only):
                self.assertIn(policy_only, filters)
        self.assertEqual(section.count("if: steps.changed-files.outputs.any_changed == 'true'"), 3)
        self.assertIn('python3 .github/scripts/test-check-upgrade-command-history.py', section)
        self.assertIn('--check version', section)
        self.assertIn('--check timestamp', section)


if __name__ == '__main__':
    unittest.main()
