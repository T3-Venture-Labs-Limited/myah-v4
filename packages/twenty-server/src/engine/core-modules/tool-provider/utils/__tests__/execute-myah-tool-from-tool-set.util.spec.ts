import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ToolCategory } from 'twenty-shared/ai';

import { executeMyahToolFromToolSet } from 'src/engine/core-modules/tool-provider/utils/execute-myah-tool-from-tool-set.util';

const toolSetWith = (execute: jest.Mock) => ({
  myah_tool: {
    name: 'myah_tool',
    inputSchema: {},
    execute,
  },
});

describe('executeMyahToolFromToolSet', () => {
  it('wraps a successful domain result in a stable outcome', async () => {
    const result = { addedCount: 1 };

    await expect(
      executeMyahToolFromToolSet(
        toolSetWith(jest.fn().mockResolvedValue(result)) as never,
        'myah_tool',
        {},
        ToolCategory.MYAH_CREATOR_OPS,
      ),
    ).resolves.toEqual({
      success: true,
      category: 'SUCCESS',
      message: 'Myah action completed',
      result,
    });
  });

  it.each([
    [new ForbiddenException('private details'), 'NOT_FOUND'],
    [
      new BadRequestException('internal validation details'),
      'VALIDATION_FAILED',
    ],
  ] as const)(
    'maps %p to %s without exposing its message',
    async (error, category) => {
      const output = await executeMyahToolFromToolSet(
        toolSetWith(jest.fn().mockRejectedValue(error)) as never,
        'myah_tool',
        {},
        ToolCategory.MYAH_CREATOR_OPS,
      );

      expect(output).toMatchObject({
        success: false,
        category,
        error: category,
      });
      expect(JSON.stringify(output)).not.toContain(error.message);
    },
  );

  it('promotes a nested draft conflict to the top-level outcome', async () => {
    const result = {
      success: true,
      message: 'Saved Myah Inbox reply draft',
      result: {
        status: 'CONFLICT',
        revision: 7,
        body: { markdown: 'Current draft', blocknote: null },
      },
    };

    await expect(
      executeMyahToolFromToolSet(
        toolSetWith(jest.fn().mockResolvedValue(result)) as never,
        'myah_tool',
        {},
        ToolCategory.MYAH_INBOX,
      ),
    ).resolves.toEqual({
      success: false,
      category: 'CONFLICT',
      message: 'The Myah record changed before this action completed.',
      error: 'CONFLICT',
      result: result.result,
    });
  });

  it('maps a hidden-target domain error to NOT_FOUND without exposing it', async () => {
    const error = new Error('Campaign not found or inaccessible');
    const output = await executeMyahToolFromToolSet(
      toolSetWith(jest.fn().mockRejectedValue(error)) as never,
      'myah_tool',
      {},
      ToolCategory.MYAH_CAMPAIGN_OUTREACH,
    );

    expect(output).toMatchObject({
      success: false,
      category: 'NOT_FOUND',
      error: 'NOT_FOUND',
    });
    expect(JSON.stringify(output)).not.toContain(error.message);
  });

  it('fails an unknown exception without exposing raw storage details', async () => {
    const error = new Error('SELECT secret FROM private_table');
    const output = await executeMyahToolFromToolSet(
      toolSetWith(jest.fn().mockRejectedValue(error)) as never,
      'myah_tool',
      {},
      ToolCategory.MYAH_CREATOR_OPS,
    );

    expect(output).toEqual({
      success: false,
      category: 'FAILED',
      message: 'The requested Myah action could not be completed.',
      error: 'FAILED',
    });
    expect(JSON.stringify(output)).not.toContain(error.message);
  });
});
