import { invalidateCampaignEmailBaselineInTransaction } from 'src/modules/messaging/message-import-manager/utils/invalidate-campaign-email-baseline.util';

it('invalidates only current generations of the reconnecting account inside its transaction, without requiring the additive schema', async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ id: 'account-id' }])
    .mockResolvedValueOnce([{ hasIncarnation: true }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ tableName: 'campaignEmailBaselineGeneration' }])
    .mockResolvedValueOnce([]);

  await invalidateCampaignEmailBaselineInTransaction(
    { query } as never,
    'workspace-id',
    'account-id',
  );

  expect(query).toHaveBeenCalledTimes(5);
  expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(query.mock.calls[2][0]).toContain('uuid_generate_v4()');
  expect(query.mock.calls[3][0]).toContain('to_regclass');
  const [sql, parameters] = query.mock.calls[4];
  expect(sql).toContain('core."campaignEmailBaselineGeneration"');
  expect(sql).toContain('"status" = \'INVALID\'');
  expect(sql).toContain('"isCurrent" = false');
  expect(sql).toContain('"isCurrent" = true');
  expect(sql).toContain('"workspaceId" = $1');
  expect(sql).toContain('"connectedAccountId" = $2');
  expect(parameters).toEqual(['workspace-id', 'account-id']);
});

it('does not query an absent optional schema', async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ id: 'account-id' }])
    .mockResolvedValueOnce([{ hasIncarnation: false }])
    .mockResolvedValueOnce([{ tableName: null }]);
  await invalidateCampaignEmailBaselineInTransaction(
    { query } as never,
    'workspace-id',
    'account-id',
  );
  expect(query).toHaveBeenCalledTimes(3);
  expect(
    query.mock.calls.every(([sql]) => !sql.trimStart().startsWith('UPDATE')),
  ).toBe(true);
});
