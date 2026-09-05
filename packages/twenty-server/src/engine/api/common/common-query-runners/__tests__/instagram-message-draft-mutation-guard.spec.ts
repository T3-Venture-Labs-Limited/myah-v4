import { isProtectedInstagramDraftMutation } from 'src/engine/api/common/common-query-runners/common-base-query-runner.service';
import { CommonQueryNames } from 'src/engine/api/common/types/common-query-args.type';

const draftObjectUniversalIdentifier = '85762d24-541b-407f-9d6a-cdf89552c665';

describe('isProtectedInstagramDraftMutation', () => {
  it.each([
    CommonQueryNames.CREATE_ONE,
    CommonQueryNames.CREATE_MANY,
    CommonQueryNames.UPDATE_ONE,
    CommonQueryNames.UPDATE_MANY,
    CommonQueryNames.DELETE_ONE,
    CommonQueryNames.DELETE_MANY,
    CommonQueryNames.DESTROY_ONE,
    CommonQueryNames.DESTROY_MANY,
    CommonQueryNames.RESTORE_ONE,
    CommonQueryNames.RESTORE_MANY,
    CommonQueryNames.MERGE_MANY,
  ])(
    'blocks generated %s mutations for the authority draft object',
    (operation) => {
      expect(
        isProtectedInstagramDraftMutation(
          operation,
          draftObjectUniversalIdentifier,
        ),
      ).toBe(true);
    },
  );

  it.each([
    CommonQueryNames.FIND_ONE,
    CommonQueryNames.FIND_MANY,
    CommonQueryNames.FIND_DUPLICATES,
    CommonQueryNames.GROUP_BY,
  ])('preserves generated %s reads for historical evidence', (operation) => {
    expect(
      isProtectedInstagramDraftMutation(
        operation,
        draftObjectUniversalIdentifier,
      ),
    ).toBe(false);
  });

  it('does not affect mutations for unrelated objects', () => {
    expect(
      isProtectedInstagramDraftMutation(
        CommonQueryNames.UPDATE_ONE,
        '00000000-0000-4000-8000-000000000001',
      ),
    ).toBe(false);
  });
});
