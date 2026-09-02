let shouldRejectModuleTranslation = false;

const mockT = jest.fn(() => {
  if (shouldRejectModuleTranslation) {
    throw new Error(
      'Translations must not run while a campaign settings module evaluates',
    );
  }

  return 'translated during component render';
});

jest.mock('@lingui/core/macro', () => ({ t: mockT }));

jest.mock('@/page-layout/components/MyahCampaignRichTextSettings', () => ({
  MyahCampaignRichTextSettings: () => null,
}));

jest.mock('@/page-layout/widgets/fields/components/FieldsWidget', () => ({
  FieldsWidget: () => null,
}));

const requireWithoutModuleTranslation = (modulePath: string) => {
  shouldRejectModuleTranslation = true;

  try {
    jest.isolateModules(() => {
      jest.requireActual(modulePath);
    });
  } finally {
    shouldRejectModuleTranslation = false;
  }
};

describe('Myah campaign settings adapter localization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    shouldRejectModuleTranslation = false;
  });

  it('does not translate while the Agent adapter module evaluates', () => {
    expect(() => {
      requireWithoutModuleTranslation(
        '@/page-layout/components/MyahCampaignAgent',
      );
    }).not.toThrow();

    expect(mockT).not.toHaveBeenCalled();
  });

  it('does not translate while the Operations adapter module evaluates', () => {
    expect(() => {
      requireWithoutModuleTranslation(
        '@/page-layout/components/MyahCampaignOperations',
      );
    }).not.toThrow();

    expect(mockT).not.toHaveBeenCalled();
  });
});
