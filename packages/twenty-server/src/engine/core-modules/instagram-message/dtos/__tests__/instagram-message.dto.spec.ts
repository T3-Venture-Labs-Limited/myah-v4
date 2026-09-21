import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { SaveInstagramMessageDraftInput } from 'src/engine/core-modules/instagram-message/dtos/instagram-message.dto';

const baseInput = {
  draftId: '00000000-0000-4000-8000-000000000003',
  expectedRevision: 1,
  kind: 'REPLY' as const,
  body: 'hello',
  creatorRecordId: null,
  conversationRecordId: null,
};

const buildErrors = (body: string) =>
  validateSync(
    plainToInstance(SaveInstagramMessageDraftInput, { ...baseInput, body }),
    { whitelist: true },
  );

describe('SaveInstagramMessageDraftInput body length validation', () => {
  it.each([999, 1000])('accepts a body of %i UTF-8 bytes', (byteLength) => {
    expect(buildErrors('a'.repeat(byteLength))).toHaveLength(0);
  });

  it('rejects a body of 1001 UTF-8 bytes', () => {
    const body = 'a'.repeat(1001);
    const errors = buildErrors(body);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxUtf8ByteLength: expect.stringContaining('1000 UTF-8 bytes'),
      }),
    );
  });

  it('rejects a body whose UTF-8 byte length exceeds 1000 even though its JS .length does not', () => {
    // Each 'é' is 1 JS char but 2 UTF-8 bytes -> 501 chars is 1002 bytes
    const body = 'é'.repeat(501);

    expect(body.length).toBeLessThan(1000);
    expect(buildErrors(body)).toHaveLength(1);
  });

  it('measures the trimmed body, matching non-empty validation elsewhere in the stack', () => {
    const body = `  ${'a'.repeat(1000)}  `;

    expect(buildErrors(body)).toHaveLength(0);
  });
});
