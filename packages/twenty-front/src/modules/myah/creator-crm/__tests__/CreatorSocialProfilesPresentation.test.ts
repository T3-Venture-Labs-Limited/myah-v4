import { getRecordChipGenerators } from '@/object-record/utils/getRecordChipGenerators';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const objectMetadataItems = [
  {
    id: 'creator-object',
    nameSingular: 'creator',
    labelIdentifierFieldMetadataId: 'creator-name',
    imageIdentifierFieldMetadataId: null,
    fields: [
      { id: 'creator-name', name: 'name', type: FieldMetadataType.TEXT },
      {
        id: 'creator-social-profiles',
        name: 'socialProfiles',
        type: FieldMetadataType.RELATION,
        relation: {
          targetObjectMetadata: {
            id: 'social-profile-object',
            nameSingular: 'socialProfile',
          },
        },
      },
    ],
  },
  {
    id: 'social-profile-object',
    nameSingular: 'socialProfile',
    labelIdentifierFieldMetadataId: 'social-profile-name',
    imageIdentifierFieldMetadataId: null,
    fields: [
      {
        id: 'social-profile-name',
        name: 'name',
        type: FieldMetadataType.TEXT,
      },
    ],
  },
] as never;

const profiles = [
  { id: 'instagram-main', name: '@ada on INSTAGRAM' },
  { id: 'instagram-studio', name: '@ada.studio on INSTAGRAM' },
  { id: 'tiktok-main', name: '@ada on TIKTOK' },
];

describe('Creator SocialProfiles native presentation', () => {
  it.each(['desktop', 'mobile'])(
    'keeps multiple same-platform profiles and TikTok visible on %s',
    () => {
      const generator =
        getRecordChipGenerators(objectMetadataItems)
          .chipGeneratorPerObjectPerField.creator?.socialProfiles;

      expect(profiles.map((profile) => generator?.(profile as never))).toEqual(
        profiles.map((profile) =>
          expect.objectContaining({
            recordId: profile.id,
            name: profile.name,
            objectNameSingular: 'socialProfile',
          }),
        ),
      );
    },
  );

  it.each([
    ['email-only', []],
    ['TikTok-only', [profiles[2]]],
  ])('supports the %s Creator fixture', (_fixture, fixtureProfiles) => {
    const generator =
      getRecordChipGenerators(objectMetadataItems)
        .chipGeneratorPerObjectPerField.creator?.socialProfiles;

    expect(
      fixtureProfiles.map((profile) => generator?.(profile as never)),
    ).toHaveLength(fixtureProfiles.length);
  });
});
