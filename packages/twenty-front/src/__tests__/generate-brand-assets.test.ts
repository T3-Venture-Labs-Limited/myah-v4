import { getManifestAssetSpecifications } from '../../scripts/generate-brand-assets';

describe('getManifestAssetSpecifications', () => {
  it('keeps the manifest platform output contract intact', () => {
    const assetSpecifications = getManifestAssetSpecifications();

    expect(assetSpecifications).toHaveLength(112);
    expect(
      assetSpecifications.filter(({ platform }) => platform === 'windows'),
    ).toHaveLength(80);
    expect(
      assetSpecifications.filter(({ platform }) => platform === 'android'),
    ).toHaveLength(6);
    expect(
      assetSpecifications.filter(({ platform }) => platform === 'ios'),
    ).toHaveLength(26);
  });
});
