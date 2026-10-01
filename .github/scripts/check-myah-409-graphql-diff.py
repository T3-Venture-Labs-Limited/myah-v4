#!/usr/bin/env python3
"""Fail closed on GraphQL Inspector output; permit only MYAH-409 Creator retirement."""

import re
import sys
from pathlib import Path

# Audited against PR #193's clean Creator schema and exact PR base. Do not infer
# permission from a Creator prefix: new removals require a new explicit review.
REVIEWED_BASE = '7e1b6ed0c11ac9850ca5e04ebc8b7f0714d5be1d'
RETIRED = {
    'categories', 'creatorStatus', 'externalUrls', 'gender', 'hasBrandDeals',
    'hasLinkInBio', 'hasMerch', 'hashtagsUsed', 'instagramAvgComments',
    'instagramAvgLikes', 'instagramBio', 'instagramEngagementPercent',
    'instagramEstimatedIncomeMax', 'instagramEstimatedIncomeMin',
    'instagramFollowerCount', 'instagramLink', 'instagramMediaCount',
    'instagramMostRecentPostDate', 'instagramPostingFrequencyRecentMonths',
    'instagramReelsAvgViewCount', 'instagramReelsPercent', 'instagramUrl',
    'instagramUsername', 'linksInBio', 'niches', 'notes', 'patreonUrl',
    'profileType', 'promotesAffiliateLinks', 'tiktokAvgComments',
    'tiktokAvgDownloads', 'tiktokAvgLikes', 'tiktokBio',
    'tiktokEngagementPercent', 'tiktokFollowerCount', 'tiktokLink',
    'tiktokMostRecentPostDate', 'tiktokPlayCountMedian',
    'tiktokPostingFrequencyRecentMonths', 'tiktokUrl', 'tiktokUsername',
    'tiktokVideoCount', 'twitchDisplayName', 'twitchTotalFollowers',
    'twitchUrl', 'twitchUsername', 'twitterBio', 'twitterEngagementPercent',
    'twitterFollowerCount', 'twitterLink', 'twitterUrl', 'twitterUsername',
    'youtubeAvgStreamDuration', 'youtubeAvgStreamViews',
    'youtubeAvgViewsLong', 'youtubeAvgViewsShorts', 'youtubeCustomUrl',
    'youtubeDescription', 'youtubeEngagementPercent',
    'youtubeEstimatedIncomeMax', 'youtubeEstimatedIncomeMin',
    'youtubeLastStreamUploadDate', 'youtubeLastUploadDate', 'youtubeLink',
    'youtubePostingFrequencyRecentMonths', 'youtubeShortsPercentage',
    'youtubeSubscriberCount', 'youtubeTitle', 'youtubeTopicDetails',
    'youtubeUrl', 'youtubeVideoCount',
}
INPUTS = {
    'CreatorCreateInput', 'CreatorFilterInput', 'CreatorGroupByInput',
    'CreatorOrderByInput', 'CreatorOrderByWithGroupByInput',
    'CreatorUpdateInput',
}
# Only the derived forms actually exposed by the retired field's scalar kind.
NUMERIC = {
    'instagramAvgComments', 'instagramAvgLikes', 'instagramEngagementPercent',
    'instagramEstimatedIncomeMax', 'instagramEstimatedIncomeMin',
    'instagramFollowerCount', 'instagramMediaCount',
    'instagramPostingFrequencyRecentMonths', 'instagramReelsAvgViewCount',
    'instagramReelsPercent', 'tiktokAvgComments', 'tiktokAvgDownloads',
    'tiktokAvgLikes', 'tiktokEngagementPercent', 'tiktokFollowerCount',
    'tiktokPlayCountMedian', 'tiktokPostingFrequencyRecentMonths',
    'tiktokVideoCount', 'twitchTotalFollowers', 'twitterEngagementPercent',
    'twitterFollowerCount', 'youtubeAvgStreamDuration',
    'youtubeAvgStreamViews', 'youtubeAvgViewsLong', 'youtubeAvgViewsShorts',
    'youtubeEngagementPercent', 'youtubeEstimatedIncomeMax',
    'youtubeEstimatedIncomeMin', 'youtubePostingFrequencyRecentMonths',
    'youtubeShortsPercentage', 'youtubeSubscriberCount', 'youtubeVideoCount',
}
DATES = {
    'instagramMostRecentPostDate', 'tiktokMostRecentPostDate',
    'youtubeLastStreamUploadDate', 'youtubeLastUploadDate',
}
BOOLEANS = {'hasBrandDeals', 'hasLinkInBio', 'hasMerch', 'promotesAffiliateLinks'}
AGGREGATES = {
    'countEmpty': RETIRED, 'countNotEmpty': RETIRED,
    'countUniqueValues': RETIRED, 'percentageEmpty': RETIRED,
    'percentageNotEmpty': RETIRED,
    'avg': NUMERIC, 'sum': NUMERIC,
    'min': NUMERIC | DATES, 'max': NUMERIC | DATES,
    'countTrue': BOOLEANS, 'countFalse': BOOLEANS,
}
ENUMS = {f'Creator{name}Enum{suffix}' for name in ('CreatorStatus', 'Gender', 'ProfileType') for suffix in ('', 'Filter')}
CHANGE = re.compile(r'^\[log\] ([✖✔⚠])  (.+)$')
REMOVED = re.compile(r'^(Field|Input field) (\w+) was removed from (input object|object) type (\w+)$')
SUMMARY = re.compile(r'^Detected the following changes \((\d+)\) between schemas:$')
BREAKING = re.compile(r'^\[error\] Detected (\d+) breaking changes?$')


def permitted(message):
    match = REMOVED.fullmatch(message)
    if not match:
        return any(message == f'Type {name} was removed' for name in ENUMS)
    kind, field, object_kind, type_name = match.groups()
    if kind == 'Field' and object_kind == 'object' and type_name == 'Creator':
        return field in RETIRED
    if kind == 'Input field' and object_kind == 'input object' and type_name in INPUTS and field in RETIRED:
        return True
    aggregate_output = kind == 'Field' and object_kind == 'object' and type_name in ('CreatorConnection', 'CreatorGroupByConnection')
    # This input exposes only derived aggregate fields, never raw Creator fields.
    aggregate_input = kind == 'Input field' and object_kind == 'input object' and type_name == 'CreatorOrderByWithGroupByAggregateInput'
    return (aggregate_output or aggregate_input) and any(
        field == prefix + name[0].upper() + name[1:]
        for prefix, names in AGGREGATES.items() for name in names
    )


def check(text, exit_code, allow_creator, base_sha):
    if allow_creator and base_sha != REVIEWED_BASE:
        raise ValueError('Creator retirement exception requires its reviewed PR base')
    if exit_code not in (0, 1):
        raise ValueError(f'GraphQL Inspector failed with exit {exit_code}')
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines == ['[success] No changes detected'] and exit_code == 0:
        return 0
    summaries = [int(m.group(1)) for line in lines if (m := SUMMARY.fullmatch(line))]
    errors = [int(m.group(1)) for line in lines if (m := BREAKING.fullmatch(line))]
    changes = []
    for line in lines:
        match = CHANGE.fullmatch(line)
        if match:
            changes.append(match.groups())
        elif line in ('[log]', '[success] No breaking changes detected') or SUMMARY.fullmatch(line) or BREAKING.fullmatch(line):
            continue
        else:
            raise ValueError(f'Unrecognized GraphQL Inspector output: {line[:160]}')
    if (len(summaries) != 1 or summaries[0] != len(changes)
            or len(changes) != len(set(changes))
            or lines[:2] != ['[log]', f'Detected the following changes ({len(changes)}) between schemas:']
            or len(lines) != len(changes) + 3):
        raise ValueError('Incomplete or duplicated GraphQL diff')
    breaking = [(mark, message) for mark, message in changes if mark == '✖']
    if (len(errors) != (1 if breaking else 0)
            or (breaking and (errors[0] != len(breaking) or lines[-1] != f'[error] Detected {len(breaking)} breaking change' + ('s' if len(breaking) != 1 else '')))
            or exit_code != (1 if breaking else 0)
            or (not breaking and lines[-1] != '[success] No breaking changes detected')):
        raise ValueError('GraphQL diff count/exit disagree; possible tool error')
    if any(mark not in ('✔', '✖', '⚠') for mark, _ in changes):
        raise ValueError('Unknown GraphQL severity')
    if breaking and (not allow_creator or any(not permitted(message) for _, message in breaking)):
        raise ValueError('Unexpected GraphQL breaking change: ' + next(message for _, message in breaking if not allow_creator or not permitted(message)))
    return len(breaking)


if __name__ == '__main__':
    try:
        # CLI: core|metadata exit-code report PR-base-SHA PR-number.
        # Input is the unmodified single invocation output.
        scope, status, report, base_sha, pr_number = sys.argv[1:6]
        if scope not in ('core', 'metadata') or not re.fullmatch(r'[a-f0-9]{40}', base_sha) or not pr_number.isdecimal():
            raise ValueError('Invalid scope, PR base or PR number')
        count = check(Path(report).read_text(), int(status),
                      scope == 'core' and pr_number == '193', base_sha)
        print(f'Accepted {count} audited Creator removals' if count else 'No GraphQL breaking changes')
    except (ValueError, IndexError, OSError) as error:
        print(f'GraphQL analysis rejected: {error}', file=sys.stderr)
        sys.exit(1)
