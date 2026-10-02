#!/usr/bin/env python3
"""Deterministic CI policy fixtures; optionally check the prior-base PR report."""

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('policy', Path(__file__).with_name('check-myah-409-graphql-diff.py'))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)
BASE = 'bd427cced1c7a98bff7d18a8d7598a608cc79a00'
CURRENT_BASE = 'f184fc6e83cff47d9a0b0f3d328326c33d5effd8'


def check(text, code, allow_creator, base=BASE, pr=193):
    return policy.check(text, code, allow_creator and pr == 193, base)


def diff(*changes):
    lines = ['[log]', f'Detected the following changes ({len(changes)}) between schemas:']
    lines += [f'[log] {severity}  {description}' for severity, description in changes]
    count = sum(severity == '✖' for severity, _ in changes)
    if count:
        lines.append(f'[error] Detected {count} breaking change' + ('s' if count != 1 else ''))
    else:
        lines.append('[success] No breaking changes detected')
    return '\n'.join(lines)


class PolicyTest(unittest.TestCase):
    def test_workflow_uses_policy(self):
        workflow = (ROOT / '.github/workflows/ci-breaking-changes.yaml').read_text()
        self.assertIn('check-myah-409-graphql-diff.py \\', workflow)
        self.assertIn('check_graphql core ', workflow)
        self.assertIn('check_graphql metadata ', workflow)
        self.assertIn('PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}', workflow)
        self.assertIn('PR_NUMBER: ${{ github.event.pull_request.number }}', workflow)
        self.assertIn('git fetch --no-tags origin "$PR_BASE_SHA"', workflow)
        self.assertIn('git merge "$PR_BASE_SHA"', workflow)
        self.assertIn('git checkout --detach "$PR_BASE_SHA"', workflow)
        self.assertNotIn('git checkout origin/main', workflow)
        changed_files = workflow.split('  changed-files-check:', 1)[1].split('  api-breaking-changes:', 1)[0]
        self.assertIn('        .github/scripts/check-myah-409-graphql-diff.py\n', changed_files)
        self.assertIn('        .github/scripts/test-check-myah-409-graphql-diff.py\n', changed_files)

    def test_retired_and_derived_are_allowed(self):
        changes = [
            ('✖', 'Field instagramUsername was removed from object type Creator'),
            ('✖', 'Input field instagramUsername was removed from input object type CreatorFilterInput'),
            ('✖', 'Input field countEmptyInstagramFollowerCount was removed from input object type CreatorOrderByWithGroupByAggregateInput'),
            ('✖', 'Field avgInstagramFollowerCount was removed from object type CreatorGroupByConnection'),
            ('✖', 'Type CreatorGenderEnumFilter was removed'),
            ('✔', 'Type SocialProfile was added'),
            ('⚠', 'Enum value TWO was added to enum SocialProfilePlatformEnum'),
        ]
        for base in (BASE, CURRENT_BASE):
            with self.subTest(base=base):
                self.assertEqual(check(diff(*changes), 1, True, base=base), 5)
                with self.assertRaises(ValueError):
                    check(diff(*changes), 1, False, base=base)

    def test_unaudited_raw_aggregate_input_removal_is_rejected(self):
        description = ('Input field categories was removed from input object type '
                       'CreatorOrderByWithGroupByAggregateInput')
        with self.assertRaises(ValueError):
            check(diff(('✖', description)), 1, True)

    def test_wrong_base_and_other_pr_cannot_use_creator_exception(self):
        retirement = diff(('✖', 'Field instagramUsername was removed from object type Creator'))
        for base in ('0' * 40, '7e1b6ed0c11ac9850ca5e04ebc8b7f0714d5be1d'):
            with self.subTest(base=base), self.assertRaises(ValueError):
                check(retirement, 1, True, base=base)
        with self.assertRaises(ValueError):
            check(retirement, 1, True, pr=194)

    def test_unrelated_creator_field_or_other_type_is_rejected(self):
        for description in (
            'Field email was removed from object type Creator',
            'Field instagramUsername was removed from object type Person',
            'Field avgEmail was removed from object type CreatorConnection',
            'Field avgHasMerch was removed from object type CreatorConnection',
            'Input field avgInstagramFollowerCount was removed from input object type CreatorFilterInput',
            'Type CreatorUnknownEnum was removed',
            'Field createSocialProfile was removed from object type Mutation',
        ):
            for base in (BASE, CURRENT_BASE):
                with self.subTest(base=base, description=description), self.assertRaises(ValueError):
                    check(diff(('✖', description)), 1, True, base=base)

    def test_invalid_or_failed_analysis_is_rejected(self):
        allowed = diff(('✖', 'Field instagramUsername was removed from object type Creator'))
        for text, code in ((allowed, 2), (allowed + '\nError generating diff', 1),
                           (allowed.replace('(1)', '(2000)'), 1), ('not introspection', 0),
                           (allowed, 0), (allowed.replace('✖', '?'), 1)):
            with self.subTest(text=text[-40:], code=code), self.assertRaises(ValueError):
                check(text, code, True)
        self.assertEqual(check(diff(('✔', 'Type SocialProfile was added')), 0, False), 0)
        self.assertEqual(check('[success] No changes detected', 0, False), 0)
        self.assertEqual(check(diff(('⚠', 'Enum value TWO was added to enum A')), 0, False), 0)

    @unittest.skipUnless(len(sys.argv) > 1, 'pass the prior-base PR report as a parser fixture')
    def test_prior_base_pr_report_parser_fixture(self):
        report = Path(sys.argv[1]).read_text().splitlines()
        first = next(i for i, line in enumerate(report) if line.startswith('Detected the following changes'))
        end = next(i for i, line in enumerate(report[first:], first) if line.startswith('[error] Detected'))
        output = '\n'.join(report[first - 1:end + 1])
        for base in (BASE, CURRENT_BASE):
            with self.subTest(base=base):
                self.assertEqual(check(output, 1, True, base=base), 2000)
        audited = {match.group(2) for line in output.splitlines()
                   if (match := policy.CHANGE.fullmatch(line.strip())) and match.group(1) == '✖'}
        candidates = {
            f'Field {field} was removed from object type Creator' for field in policy.RETIRED
        } | {
            f'Input field {field} was removed from input object type {name}'
            for field in policy.RETIRED for name in policy.INPUTS
        } | {
            f'{kind} {prefix}{field[0].upper()}{field[1:]} was removed from {object_kind} type {name}'
            for prefix, fields in policy.AGGREGATES.items() for field in fields
            for kind, object_kind, name in (
                ('Field', 'object', 'CreatorConnection'),
                ('Field', 'object', 'CreatorGroupByConnection'),
                ('Input field', 'input object', 'CreatorOrderByWithGroupByAggregateInput'),
            )
        } | {f'Type {name} was removed' for name in policy.ENUMS}
        self.assertEqual({message for message in candidates if policy.permitted(message)}, audited)
        with self.assertRaises(ValueError):
            check(output.replace('object type Creator\n', 'object type Person\n', 1), 1, True)
        with self.assertRaises(ValueError):
            check(output + '\n[error] Tool error', 1, True)


if __name__ == '__main__':
    # Keep unittest from interpreting the optional private artifact as a test selector.
    unittest.main(argv=[sys.argv[0]])
