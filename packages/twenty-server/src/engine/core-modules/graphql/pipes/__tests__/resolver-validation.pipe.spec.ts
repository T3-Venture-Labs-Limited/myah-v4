import { IsUUID } from 'class-validator';

import { type ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

class OccurrenceInput {
  @IsUUID()
  occurrenceId!: string;
}

describe('ResolverValidationPipe', () => {
  const metadata = { type: 'body' as const, metatype: OccurrenceInput };

  const pipeWithCapture = () => {
    const captureExceptions = jest.fn();
    const pipe = new ResolverValidationPipe({
      captureExceptions,
    } as unknown as ExceptionHandlerService);

    return { pipe, captureExceptions };
  };

  it('rejects invalid arguments and reports them, because the app sent them', async () => {
    const { pipe, captureExceptions } = pipeWithCapture();

    await expect(
      pipe.transform({ occurrenceId: 'not-a-uuid' }, metadata),
    ).rejects.toThrow(UserInputError);

    expect(captureExceptions).toHaveBeenCalledTimes(1);
    expect(captureExceptions.mock.calls[0][0][0].message).toBe(
      'occurrenceId must be a UUID',
    );
  });

  it('does not report valid arguments', async () => {
    const { pipe, captureExceptions } = pipeWithCapture();
    const value = { occurrenceId: '6a3f7c2e-8b1d-4e5a-9c7f-2d4b6e8a1c3f' };

    await expect(pipe.transform(value, metadata)).resolves.toBe(value);
    expect(captureExceptions).not.toHaveBeenCalled();
  });
});
