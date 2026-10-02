import {
  getLegacyCreatorReferenceCompatibility,
  requireSupportedLegacyCreatorReference,
} from '../legacy-creator-reference-compatibility.util';

describe('legacy Creator reference compatibility', () => {
  it.each(['FILTER', 'SORT', 'TEMPLATE', 'API'] as const)(
    'preserves %s references before the retirement cutoff',
    (kind) => {
      expect(
        getLegacyCreatorReferenceCompatibility({
          fieldName: 'instagramUsername',
          kind,
          retirementRequested: false,
        }),
      ).toEqual({ status: 'PRESERVED', fieldName: 'instagramUsername' });
    },
  );

  it('keeps retained Creator fields supported through retirement', () => {
    expect(
      getLegacyCreatorReferenceCompatibility({
        fieldName: 'email',
        kind: 'FILTER',
        retirementRequested: true,
      }),
    ).toEqual({ status: 'SUPPORTED', fieldName: 'email' });
  });

  it.each(['FILTER', 'SORT', 'TEMPLATE', 'API'] as const)(
    'requires repair instead of choosing one profile for a retired %s reference',
    (kind) => {
      const compatibility = getLegacyCreatorReferenceCompatibility({
        fieldName: 'instagramUsername',
        kind,
        retirementRequested: true,
      });

      expect(compatibility).toMatchObject({
        status: 'REPAIR_REQUIRED',
        fieldName: 'instagramUsername',
        kind,
      });
      expect(() =>
        requireSupportedLegacyCreatorReference(compatibility),
      ).toThrow(
        `Unsupported legacy Creator ${kind.toLowerCase()} reference "instagramUsername"`,
      );
    },
  );

  it('does not treat supplementary Notes preservation as equivalent structured data', () => {
    const compatibility = getLegacyCreatorReferenceCompatibility({
      fieldName: 'gender',
      kind: 'FILTER',
      retirementRequested: true,
    });

    expect(compatibility).toMatchObject({ status: 'REPAIR_REQUIRED' });
    expect(() => requireSupportedLegacyCreatorReference(compatibility)).toThrow(
      'no exact structured replacement',
    );
  });
});
