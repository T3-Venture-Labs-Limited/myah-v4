type StandardObjectDefinition = {
  universalIdentifier: string;
  fields: Record<string, { universalIdentifier: string }>;
  indexes: Record<string, { universalIdentifier: string }>;
  views: Record<
    string,
    {
      universalIdentifier: string;
      viewFields: Record<string, { universalIdentifier: string }>;
      viewFieldGroups?: Record<string, { universalIdentifier: string }>;
      viewFilters?: Record<string, { universalIdentifier: string }>;
      viewGroups?: Record<string, { universalIdentifier: string }>;
    }
  >;
};

export const MYAH_STANDARD_OBJECTS = {
  brandBrainLink: {
    universalIdentifier: 'f99ff6bc-3b56-4600-beb3-cfc2c23364f6',
    fields: {
      id: { universalIdentifier: '04023146-c615-4867-99ee-3c6ca8fa6a26' },
      createdAt: {
        universalIdentifier: '6adda678-1b61-4bf0-ab2c-1a04e4e75d35',
      },
      updatedAt: {
        universalIdentifier: '737b32e1-db46-422f-905f-25ab4f13340c',
      },
      deletedAt: {
        universalIdentifier: 'e1bd519d-820a-4892-8122-6471f24b6701',
      },
      position: { universalIdentifier: '208de3b6-5b73-4cfc-89f3-a7346c875740' },
      createdBy: {
        universalIdentifier: '96f50494-f01a-4c36-ad19-57849f443986',
      },
      updatedBy: {
        universalIdentifier: '9cc33de6-6c97-435e-98a8-473f1ed85e28',
      },
      searchVector: {
        universalIdentifier: 'd4657984-fbd2-4226-9ac9-f06624388fdf',
      },
      name: { universalIdentifier: '56a8c222-bc15-48e2-a608-4c40a791ac4b' },
      linkType: { universalIdentifier: '806a4b82-1fc8-43c4-b965-e5271c73b7bb' },
      description: {
        universalIdentifier: '9688a814-290f-460f-9604-d5ffea3c78ac',
      },
      sourcePage: {
        universalIdentifier: '94d2f0e6-0915-40e3-bc40-b1a6336dc16a',
      },
      targetPage: {
        universalIdentifier: '93ed2052-7d48-4a60-b43f-f0a07ccdf1ff',
      },
    },
    indexes: {},
    views: {},
  },
  brandBrainPage: {
    universalIdentifier: '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
    fields: {
      id: { universalIdentifier: '400c31ba-d88a-4c05-9526-c0513f64269a' },
      createdAt: {
        universalIdentifier: '06688838-ecd1-4d3f-912e-40094f006eab',
      },
      updatedAt: {
        universalIdentifier: '92d77bb3-0ea1-46c8-b4df-c8f42518d121',
      },
      deletedAt: {
        universalIdentifier: '39da9374-809c-4b08-9d4c-c0bd720e8af6',
      },
      position: { universalIdentifier: '493ca2bb-ece0-4915-a186-d748a27ef019' },
      createdBy: {
        universalIdentifier: 'a5c7a0ad-ab7e-459d-b3a1-664a5fac9d09',
      },
      updatedBy: {
        universalIdentifier: 'e789d775-899c-4ba0-98a9-6399ce900739',
      },
      searchVector: {
        universalIdentifier: '003d2590-4073-4cbe-af9f-d74d7365c68c',
      },
      title: { universalIdentifier: 'e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d' },
      slug: { universalIdentifier: '8e9bbffa-807a-4e0d-9fb1-f3deec6183cf' },
      canonicalPath: {
        universalIdentifier: '4452d201-44a5-46fc-bf11-e26fa85cc3b2',
      },
      idPath: { universalIdentifier: '3b78e6d5-d9ed-432f-b3f6-d5d6bdb82d99' },
      pageType: { universalIdentifier: 'b044e1f3-94f4-4d65-93a3-5082e317f5e1' },
      status: { universalIdentifier: '531d9732-7614-472c-ae02-8fc806d92c0a' },
      body: { universalIdentifier: 'f9194806-a2c6-4f03-a351-09b4546ce2ed' },
      summary: { universalIdentifier: '7f963c23-90c8-44b3-b488-b137e6e358a9' },
      tags: { universalIdentifier: '322e4f8d-a9b7-4293-a596-5df62e3961e9' },
      sortOrder: {
        universalIdentifier: '0a3cd691-7971-45c3-8e8d-996d9b631c84',
      },
      aliases: { universalIdentifier: '24d415b8-fc54-4c18-8cd8-0b5575d39e88' },
      childPages: {
        universalIdentifier: '0bbf483c-9c52-4286-9427-a14058456611',
      },
      parentPage: {
        universalIdentifier: '62f3e27e-3c6c-4449-9d81-2b24501f5e3f',
      },
      sourcePageLinks: {
        universalIdentifier: '776301dc-08a6-4692-b9b8-f427f040085b',
      },
      targetPageLinks: {
        universalIdentifier: '3cb59cb6-8ef0-4608-bc1a-872e888a60ed',
      },
      updateProposals: {
        universalIdentifier: '4fd149a3-b506-45f8-94c4-970a3106eccf',
      },
      noteTargets: {
        universalIdentifier: '207812af-12b3-4953-87fb-a7b7eecd7359',
      },
      taskTargets: {
        universalIdentifier: 'ef3cfe0a-a1c9-4e8d-bf00-c8e63a0e140e',
      },
    },
    indexes: {
      canonicalPath: {
        universalIdentifier: 'b75fa72e-7365-4da0-a910-b6ef96f306c2',
      },
    },
    views: {
      view2774101b: {
        universalIdentifier: '2774101b-3c0b-485b-91f5-b92d30bdcb6e',
        viewFields: {
          title: {
            universalIdentifier: 'cecbfcb2-318d-48b0-ab64-59a25fb213e5',
          },
          slug: { universalIdentifier: 'cb99eb49-2960-4b98-b4f0-ef70add64f79' },
          canonicalPath: {
            universalIdentifier: '668d5313-ddc4-4815-93f9-d8f60b4fa550',
          },
          idPath: {
            universalIdentifier: 'c42cf06d-eaae-4bfe-8108-20887dd0d8c4',
          },
          pageType: {
            universalIdentifier: 'f0b70304-4119-4a91-aef6-9d7108a332fe',
          },
          summary: {
            universalIdentifier: '5658f977-d711-46ce-8563-a73dbe6a8d0b',
          },
          body: { universalIdentifier: '79c4d8b0-f4bb-43ff-bb06-c4d374be9130' },
          parentPage: {
            universalIdentifier: 'c3bde970-bc8e-41d5-bad0-b710c548496d',
          },
          childPages: {
            universalIdentifier: '16f5c397-468a-47c0-b704-a850d11e87a0',
          },
          sourceLinks: {
            universalIdentifier: 'cbdac244-5a78-4ff0-a28a-011b444b9412',
          },
          targetLinks: {
            universalIdentifier: '4f02dd57-6875-449b-a0c5-e6ca23f8f53b',
          },
        },
      },
      view914bd2ad: {
        universalIdentifier: '914bd2ad-17e0-48f2-a6da-38f94b92be9d',
        viewFields: {
          title: {
            universalIdentifier: '7c821735-92b0-417a-a4c6-b1c2d940a813',
          },
          canonicalPath: {
            universalIdentifier: 'fa092416-394c-4d01-8252-452249e445c2',
          },
          pageType: {
            universalIdentifier: 'b57ef565-d393-4777-921c-5aa0a2166033',
          },
          summary: {
            universalIdentifier: '3a621e09-bc66-4881-aa7c-d1ed0086de82',
          },
        },
      },
    },
  },
  brandBrainUpdateProposal: {
    universalIdentifier: 'facac4a1-0a2f-469f-9f1f-81ef01f06578',
    fields: {
      id: { universalIdentifier: '94bb2f6f-cb77-423d-a1a9-a7a87df3be4c' },
      createdAt: {
        universalIdentifier: '3032e66a-d88e-4b11-b3d1-a5bdb3bc90a7',
      },
      updatedAt: {
        universalIdentifier: '6c51273c-f855-4da0-9af9-aaeb4743027a',
      },
      deletedAt: {
        universalIdentifier: '427ce27d-07da-4473-854a-138d062278f6',
      },
      position: { universalIdentifier: 'c153e21f-0746-4923-8d96-e39d3581594d' },
      createdBy: {
        universalIdentifier: 'baef9a83-923f-46d4-a473-38b5400da2b0',
      },
      updatedBy: {
        universalIdentifier: '30e3ab42-97e1-47dc-9221-e0b866df4d08',
      },
      searchVector: {
        universalIdentifier: 'a15bb3fc-fd9a-4938-abc6-f0524cf634a0',
      },
      title: { universalIdentifier: 'e4418f8c-6f74-4d03-8c61-93c17848c2dc' },
      proposalType: {
        universalIdentifier: '5601c017-6a85-4211-b2b2-9fda0bf9f0c6',
      },
      status: { universalIdentifier: '5d00b029-7a0d-4320-acf4-036a634a44ab' },
      reason: { universalIdentifier: '6a5f0131-32c8-41a2-968c-1dd429071f18' },
      proposedPatch: {
        universalIdentifier: 'cf1caf3f-e423-43e6-bd47-62a27bb513e2',
      },
      sourceSummary: {
        universalIdentifier: '31fe27f7-a5cb-4590-95a0-f9247f490bb2',
      },
      targetPage: {
        universalIdentifier: 'da4861d8-2d29-498d-8a70-62461022dbfd',
      },
    },
    indexes: {},
    views: {
      view25d4c1a3: {
        universalIdentifier: '25d4c1a3-b315-4c2c-b95e-04f3bcb90807',
        viewFields: {
          title: {
            universalIdentifier: '64c4da41-f1a4-43a8-9f03-a155fa3963bf',
          },
          proposalType: {
            universalIdentifier: '600ea605-7496-4602-a2cb-ddb38c230fd6',
          },
          status: {
            universalIdentifier: '9a3bd420-c63d-479d-bb86-d4d25f7a9832',
          },
          reason: {
            universalIdentifier: 'f078acbb-e143-46f4-9b27-926315811539',
          },
          proposedPatch: {
            universalIdentifier: '1118b32e-5e02-4955-9bff-86cc6e3884d3',
          },
        },
        viewFilters: {
          status: {
            universalIdentifier: 'bb759248-7330-4730-b4a8-0752df10ab14',
          },
        },
      },
    },
  },
  offer: {
    universalIdentifier: 'fd8a37b8-72db-5069-902a-a1763ddc63f7',
    fields: {
      id: { universalIdentifier: '6a7a3264-e5d7-4e41-bcf4-1f58cf9b55cf' },
      createdAt: {
        universalIdentifier: 'c299bd81-c6fb-44b2-9c9f-4400fe9ddc53',
      },
      updatedAt: {
        universalIdentifier: '843a5f90-2bd3-4bbc-a179-18f85be26d81',
      },
      deletedAt: {
        universalIdentifier: '0d166b8b-c3f3-4bef-9834-eb2b99eead13',
      },
      position: { universalIdentifier: 'efe17aca-6bc1-443a-a3e3-23f16348813d' },
      createdBy: {
        universalIdentifier: '7d1af2e5-13ac-47b6-884c-e3964d267acb',
      },
      updatedBy: {
        universalIdentifier: '2143beab-ba62-47ef-80eb-3de685c14dbb',
      },
      searchVector: {
        universalIdentifier: '63736552-d1f9-4851-abf5-fa8ea1520738',
      },
      name: { universalIdentifier: 'b7706308-8a6a-5613-ac37-d5e8ce848be2' },
      campaign: { universalIdentifier: 'f8ea43b0-33f8-5071-9e6d-5b787fb4e043' },
      promotedAsset: {
        universalIdentifier: '00c95791-84b2-50cc-89aa-68faf18011eb',
      },
      termsSummary: {
        universalIdentifier: '0923fd4e-7f50-587b-af7f-f2cebf5293ec',
      },
      commissionRate: {
        universalIdentifier: '45e45dbb-b54a-57bf-a901-215aa193b42c',
      },
      fixedFee: { universalIdentifier: 'ee119d6e-9d38-5ab8-9382-70498edc9688' },
      cpaAmount: {
        universalIdentifier: '05ca2ea3-5833-5192-a2f2-9dc7b53ca89f',
      },
      giftedProductNotes: {
        universalIdentifier: '5fcb14fe-bed2-513d-9cd8-7c6ecb15bf0b',
      },
      usageRightsNotes: {
        universalIdentifier: '8044d22e-fba7-5af4-9b9f-28ccc0779801',
      },
    },
    indexes: {},
    views: {},
  },
  outreachAction: {
    universalIdentifier: 'b4459926-2c01-560a-8432-fa1974168439',
    fields: {
      id: { universalIdentifier: 'd073f527-cb35-4189-b63d-c158eaed9a0b' },
      createdAt: {
        universalIdentifier: 'efe63d78-15a1-4b8d-9715-a4fdcafe3425',
      },
      updatedAt: {
        universalIdentifier: 'aa5b957a-9b31-47e5-af5d-14f0e10fd455',
      },
      deletedAt: {
        universalIdentifier: '4ebe16db-8e61-47c3-b914-847150ad6e88',
      },
      position: { universalIdentifier: 'a80e86ce-f57f-4f92-8016-b78ae72ec09c' },
      createdBy: {
        universalIdentifier: 'be0f6404-a210-495c-b7a5-97451dbb45d9',
      },
      updatedBy: {
        universalIdentifier: '04ad258c-a533-47b3-8d45-6ab6ca0e9442',
      },
      searchVector: {
        universalIdentifier: '343f4120-4f63-494d-83e9-7f475433b379',
      },
      name: { universalIdentifier: 'e3165e19-e1b8-51d2-9451-5caa4c398bd6' },
      campaignCreator: {
        universalIdentifier: '64617f40-1f95-54cf-be64-ff57c72df280',
      },
      outreachStep: {
        universalIdentifier: '09c835f8-9137-5b97-bc2c-a76139fd270c',
      },
      channel: { universalIdentifier: 'f1c1b41f-a1be-548b-a7b2-9d4c8863f74b' },
      status: { universalIdentifier: 'f41a5820-bb50-537d-ae28-e2824cd7aa36' },
      scheduledAt: {
        universalIdentifier: 'd11e908c-0cad-54c2-8326-56187dd177f5',
      },
      completedAt: {
        universalIdentifier: '04638c8a-b191-5030-ad00-810bbca02bbe',
      },
      resultSummary: {
        universalIdentifier: 'a461116c-dab8-525c-bdd9-4708dcebf433',
      },
    },
    indexes: {},
    views: {},
  },
  outreachSequence: {
    universalIdentifier: '0446497e-3240-5a78-a02f-e08594e5c2af',
    fields: {
      id: { universalIdentifier: '7f68baf4-e4c8-4b0f-83f7-676986d2f331' },
      createdAt: {
        universalIdentifier: 'b11a5db0-c8f1-42cb-814b-69c0f4c7aceb',
      },
      updatedAt: {
        universalIdentifier: '994204ab-b57c-469d-b449-1b0b95c51e2b',
      },
      deletedAt: {
        universalIdentifier: '176787b5-10e5-474c-8c90-3877069bca77',
      },
      position: { universalIdentifier: '887af7f3-7d82-494c-bdb7-7693f06d3b27' },
      createdBy: {
        universalIdentifier: 'cf36f26a-5572-45f2-b84f-88e1e45e4aea',
      },
      updatedBy: {
        universalIdentifier: 'afc124e1-ed64-4d99-8c73-5e4d5135c482',
      },
      searchVector: {
        universalIdentifier: 'ea083f84-3873-4049-a1e6-6c4f785fe449',
      },
      name: { universalIdentifier: '3f5fd643-d5ba-5db2-8cad-528b51189994' },
      campaign: { universalIdentifier: '75b56b0d-b69d-50fd-8f36-bfd3fa8d9237' },
      status: { universalIdentifier: '4298980f-fa5b-5e2a-8f80-1790cc7ec1da' },
      description: {
        universalIdentifier: '3278eed0-5897-54e0-a58d-fc237d64f4ea',
      },
      steps: { universalIdentifier: '79efc6cb-48f5-5569-9759-255825e287e0' },
    },
    indexes: {},
    views: {},
  },
  outreachStep: {
    universalIdentifier: 'c25bfef3-4636-5864-a777-705238c91326',
    fields: {
      id: { universalIdentifier: '2f66be74-da02-40e4-8bdf-a6936ef66f36' },
      createdAt: {
        universalIdentifier: '9e0aef9e-58ae-4580-9a24-f1c80f0a29d8',
      },
      updatedAt: {
        universalIdentifier: 'b7096120-cb60-4cd6-81cc-1a5ed8aca0a6',
      },
      deletedAt: {
        universalIdentifier: 'edd38181-2da8-4767-af5b-d1b231d1f02f',
      },
      position: { universalIdentifier: '7c62e01a-b62f-4fc8-94e8-d76d9dbc39f9' },
      createdBy: {
        universalIdentifier: 'b5aa004b-e083-4c90-a406-ee8634775ee6',
      },
      updatedBy: {
        universalIdentifier: '02eb7f64-494b-4513-9903-708c76231b9b',
      },
      searchVector: {
        universalIdentifier: 'ae13d941-4bc4-4e8b-826c-d9e74c1b025b',
      },
      name: { universalIdentifier: 'f9a7ec56-5aa0-5341-830a-5ab108c6b73c' },
      outreachSequence: {
        universalIdentifier: '9fd2575c-ca82-59bb-8f10-4907b104e6cb',
      },
      stepPosition: {
        universalIdentifier: 'a9469f6f-7cb8-5ed9-b171-15d65d7a47ea',
      },
      trigger: { universalIdentifier: 'b5fe44f8-8d01-573f-a3bb-920399c8f9bb' },
      channel: { universalIdentifier: '8bef3b6c-0347-5389-98d2-263ab99f2377' },
      delayDays: {
        universalIdentifier: '7b114005-6089-5a22-b172-f74bc93ef9b9',
      },
      templateSummary: {
        universalIdentifier: '766d505d-d6ac-54d2-940d-201a47e29c3a',
      },
      actions: { universalIdentifier: 'd68a67a8-b5b3-5dd0-a1a5-82ed7561eb4e' },
    },
    indexes: {},
    views: {},
  },
  promotedAsset: {
    universalIdentifier: '843aa6c8-36af-5906-8241-4017c4188df7',
    fields: {
      id: { universalIdentifier: 'a06cfc17-3518-4917-8a2a-ee774a2d1672' },
      createdAt: {
        universalIdentifier: '5bfbb5a8-ab5f-4bc7-8d76-6cabc39b842f',
      },
      updatedAt: {
        universalIdentifier: 'bbe18fbb-366f-4924-8b1e-fc11ccfbb301',
      },
      deletedAt: {
        universalIdentifier: '1ecce2cc-6089-4452-9006-5bea940ef8e4',
      },
      position: { universalIdentifier: '256b2670-17a6-44da-a028-45ca47ff3297' },
      createdBy: {
        universalIdentifier: 'b643c7d8-3eed-45d1-9826-06ee83872ea5',
      },
      updatedBy: {
        universalIdentifier: 'dfd1adb7-a543-4564-a561-b2a11cc62b11',
      },
      searchVector: {
        universalIdentifier: '7e14bd88-bb9d-44cb-bf6b-22d0c6b265ce',
      },
      name: { universalIdentifier: '3891a76c-3119-52cc-84cd-abce75920db7' },
      assetType: {
        universalIdentifier: '3c7bb78a-3a42-590a-aca9-f4d966fd691f',
      },
      url: { universalIdentifier: 'f90326b9-e045-578b-8d76-c513bb3c1890' },
      description: {
        universalIdentifier: '38cf3b6d-bce8-5eca-9db0-232ebe8ea702',
      },
      offers: { universalIdentifier: '809800a3-fa41-591e-8d4e-7e9fd0daf322' },
    },
    indexes: {},
    views: {},
  },
  campaignCreator: {
    universalIdentifier: 'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a',
    fields: {
      id: { universalIdentifier: '12a47afe-9cc2-4a05-8ff6-6a269e4367c2' },
      createdAt: {
        universalIdentifier: 'd1bd77e6-f7ff-4b5e-b5be-015d667a4de7',
      },
      updatedAt: {
        universalIdentifier: 'f0641751-97ea-4a04-bc52-fb69bd3ec020',
      },
      deletedAt: {
        universalIdentifier: 'f786daca-ca2c-4394-b03b-657575dea2d3',
      },
      position: { universalIdentifier: 'fbf2adca-5ee3-4441-a54c-a4a8a0777b05' },
      createdBy: {
        universalIdentifier: 'ce7cdca9-b83f-45ed-9de1-750b3b0dc622',
      },
      updatedBy: {
        universalIdentifier: '2428e4e5-594a-43c7-82c5-f4647e3fcf07',
      },
      searchVector: {
        universalIdentifier: '7ba746a4-b891-4e6d-b825-65875d7d2505',
      },
      name: { universalIdentifier: '31b163a4-99d9-5015-bcee-dc8ae5229ee3' },
      creator: { universalIdentifier: '730b323f-fae3-57e2-8e2e-62963106850a' },
      campaign: { universalIdentifier: '27ecf86e-08a4-5084-91d7-d305ab3363e1' },
      stage: { universalIdentifier: '427aad82-7fe4-516d-99b3-8d00161534f6' },
      selectedContactMethod: {
        universalIdentifier: 'b002caa0-6fb6-54a3-8111-a6dadf09e4ca',
      },
      nextActionAt: {
        universalIdentifier: '3d5adbfb-9e02-5583-95ea-bfe72e65106f',
      },
      selectionReason: {
        universalIdentifier: '6f38f371-8915-55be-a96c-a94e4fc293af',
      },
      dealSummary: {
        universalIdentifier: '12b6b77e-31a8-508f-bf3c-f7b3077dcbd3',
      },
      outcomeSummary: {
        universalIdentifier: '640d0d05-246d-5005-b592-a28889852fbd',
      },
      outreachActions: {
        universalIdentifier: 'e9b9d246-f49e-5200-9819-0a4c9cd0d19a',
      },
    },
    indexes: {
      creatorCampaignUniqueIndex: {
        universalIdentifier: '6a1b09a7-0f81-4eb6-a5d2-3ba7951fac0d',
      },
    },
    views: {},
  },
  campaign: {
    universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
    fields: {
      id: { universalIdentifier: 'eed0f58d-3a0f-4f29-8746-01507e6a0fe2' },
      createdAt: {
        universalIdentifier: '524dbf41-8e81-42bb-98d4-c10cc3f3e9b8',
      },
      updatedAt: {
        universalIdentifier: 'ca14d8c5-1638-48a5-af2d-0a6829cf4664',
      },
      deletedAt: {
        universalIdentifier: 'f228a750-5c65-4ad5-9b92-2a42d4a2d2c4',
      },
      position: { universalIdentifier: '07cfea7f-bd1e-4b5d-bdab-279fff63b02e' },
      createdBy: {
        universalIdentifier: 'fc5af07b-c053-4094-aeeb-5a5b4134d68e',
      },
      updatedBy: {
        universalIdentifier: '1a0d5cad-42a2-458e-87b6-fad0afdf8b13',
      },
      searchVector: {
        universalIdentifier: '5cbc6517-bc12-46b3-8d52-8eae1bb07ad4',
      },
      name: { universalIdentifier: '63c56aea-35db-5733-9d3a-d062544ac897' },
      status: { universalIdentifier: '9d3c6d96-896d-51d1-b6d2-5d6b2e333e87' },
      objective: {
        universalIdentifier: 'e22687bb-2633-573f-bd80-c4b13e80d966',
      },
      targetPlatforms: {
        universalIdentifier: '877f9622-775c-52c1-9869-4abf14161de0',
      },
      targetDemographics: {
        universalIdentifier: '3e4bc999-fad4-59c2-9e38-046c33e26f2b',
      },
      icpGoal: { universalIdentifier: '86ac6e3d-ef0e-5ee3-a8b6-e8a22756f81c' },
      budgetNotes: {
        universalIdentifier: '97377e2b-ec51-5fef-891e-b2202cc69512',
      },
      campaignCreators: {
        universalIdentifier: '894c80f2-a478-5680-8c20-c7a86aa24fde',
      },
      offers: { universalIdentifier: '1d33699f-76f3-5247-98b3-2de588543364' },
      outreachSequences: {
        universalIdentifier: '40b7c827-4699-5f99-bdb8-d8906dd948f5',
      },
      noteTargets: {
        universalIdentifier: '4ee4e053-555c-431c-a440-e8a0e5725d77',
      },
      taskTargets: {
        universalIdentifier: '0d27b024-e6c3-4b61-9d7f-f9c4c69760b7',
      },
    },
    indexes: {},
    views: {
      view5865bdbf: {
        universalIdentifier: '5865bdbf-be33-5457-9d91-184885276b94',
        viewFields: {
          name: { universalIdentifier: 'ead80d6b-300a-5edc-b03e-7cce7f3fecc4' },
          status: {
            universalIdentifier: '8ce2c107-f484-5525-8f45-b7f4c9d32683',
          },
          objective: {
            universalIdentifier: '4d438e45-9995-5b0f-b9eb-ed916870f280',
          },
          targetPlatforms: {
            universalIdentifier: '66f84b3e-c870-5180-b345-490897ce4cd2',
          },
          icpGoal: {
            universalIdentifier: 'dacf7682-7297-5319-b86d-6cb137f9ddb2',
          },
        },
      },
    },
  },
  creatorListMember: {
    universalIdentifier: 'e004c4b4-b1e1-59d9-b096-9fc57875d47f',
    fields: {
      id: { universalIdentifier: 'e3e78195-2ccd-4b9d-8fad-7dd4f267f666' },
      createdAt: {
        universalIdentifier: '7c8199ef-53f7-439f-8509-412e37b08a38',
      },
      updatedAt: {
        universalIdentifier: 'db0a9c67-4a4a-4a04-a23b-b044fa2dce27',
      },
      deletedAt: {
        universalIdentifier: '0393d154-5cd6-4d48-8ca7-c98815d967c4',
      },
      position: { universalIdentifier: '0a0c9748-943e-4468-be40-a44892ab0cf2' },
      createdBy: {
        universalIdentifier: '2aac354a-124f-4341-9840-9997e63dd4b4',
      },
      updatedBy: {
        universalIdentifier: '4ece6e13-703b-41ad-b3f4-14e2f9c304c8',
      },
      searchVector: {
        universalIdentifier: '404d09cb-2fdd-471c-8dfc-6d37ca437354',
      },
      name: { universalIdentifier: '7924764c-9378-5299-8b68-7757e6af35c2' },
      creator: { universalIdentifier: 'a8014e8c-e50a-547a-9f01-973d685314ec' },
      creatorList: {
        universalIdentifier: 'c84e31a5-ba66-5773-a2da-2b1c357257c5',
      },
      source: { universalIdentifier: 'cec1e32c-db2c-53fa-b0ad-4bbbce951ae2' },
      notes: { universalIdentifier: 'bb1651d8-de78-5a22-8ac3-7c1f4d631819' },
    },
    indexes: {
      creatorListUniqueIndex: {
        universalIdentifier: '6fd4b1ae-5a6c-4bf6-9cf9-bad4a3eaf9a1',
      },
    },
    views: {},
  },
  creatorList: {
    universalIdentifier: 'd51f2758-055b-5367-8250-859cb3f58631',
    fields: {
      id: { universalIdentifier: 'a4d3f96b-23aa-41a6-afc9-f031dca9daff' },
      createdAt: {
        universalIdentifier: '44741ab3-3321-4ee1-826b-eb1cf6aec05b',
      },
      updatedAt: {
        universalIdentifier: '3ab06e08-4011-4e2c-b0c0-914db800eb64',
      },
      deletedAt: {
        universalIdentifier: '40698413-80fb-41de-bcbd-7a79d48a2330',
      },
      position: { universalIdentifier: '719e6b70-2f8a-4a78-addc-d82093b7c9ed' },
      createdBy: {
        universalIdentifier: 'b79a32fd-200a-4a86-92cd-814ed208af11',
      },
      updatedBy: {
        universalIdentifier: '51baf29e-2aa9-4221-a17b-bab7ea27e5dd',
      },
      searchVector: {
        universalIdentifier: 'c9f5ee65-7c27-413d-9b7d-087bfa9e5980',
      },
      name: { universalIdentifier: 'e19694f0-0c78-566e-ab95-63f0488848f3' },
      source: { universalIdentifier: '1b27dc7c-0f11-5b2a-b81f-708dc785b6fa' },
      description: {
        universalIdentifier: '1a4485a2-1e44-51af-bfdc-666cdcf17223',
      },
      members: { universalIdentifier: 'ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df' },
    },
    indexes: {},
    views: {
      view1bc58554: {
        universalIdentifier: '1bc58554-efb5-52e4-8e2a-7f522a1c453c',
        viewFields: {
          name: { universalIdentifier: '8b68fcb0-490d-5414-9b67-abf9e858908b' },
          source: {
            universalIdentifier: 'ce532f04-7846-52b2-9d6b-cd9305f767e2',
          },
          description: {
            universalIdentifier: 'a9084da4-53a4-5af9-b078-480a6878d74c',
          },
        },
      },
    },
  },
  creator: {
    universalIdentifier: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
    fields: {
      id: { universalIdentifier: 'd2dbbc0d-4da8-4aa5-901b-8515f62513ae' },
      createdAt: {
        universalIdentifier: '78ea755c-d220-4955-8756-87873f33f67a',
      },
      updatedAt: {
        universalIdentifier: 'c8078ddd-8399-4aba-a38b-63bcd5b48e50',
      },
      deletedAt: {
        universalIdentifier: '701fc80b-0101-4677-8b21-548b67b6dcf7',
      },
      position: { universalIdentifier: 'cb75cfdd-6a07-4d99-971b-8171c156823c' },
      createdBy: {
        universalIdentifier: 'd30140d9-88a9-4a0e-9780-c9409293d809',
      },
      updatedBy: {
        universalIdentifier: '01a0efa7-6cfb-4dec-92bc-0ff58991537f',
      },
      searchVector: {
        universalIdentifier: '8536e00a-693b-4071-a926-c302b42709f9',
      },
      name: { universalIdentifier: 'c3d4cafc-73ec-5d13-8fe9-cbcbd0eca899' },
      email: { universalIdentifier: 'c4bccf25-cfd1-5648-918e-bf20b32ed375' },
      phone: { universalIdentifier: 'ccdc5be6-6c2b-5920-acd8-fa0ad52eeb29' },
      location: { universalIdentifier: '48ea973f-0a2b-5650-910b-6e0c5b4b34ce' },
      language: { universalIdentifier: '54971f3a-9443-51e1-94d7-ca76e9889f08' },
      profileType: {
        universalIdentifier: 'ec240f13-8462-54ad-be55-b27275f0f58a',
      },
      creatorStatus: {
        universalIdentifier: 'b887feac-6623-5e8f-b84e-bd502abb8972',
      },
      owner: { universalIdentifier: '654e0df0-0c1f-4083-bc30-f85252269092' },
      source: { universalIdentifier: '22ad8e62-9b3c-5321-b1a1-8120a7566cd4' },
      sourceUrl: {
        universalIdentifier: 'e1f69ece-5d51-5819-82d0-eff0eb752396',
      },
      importSource: {
        universalIdentifier: '7ad7da3b-3d4f-5ebb-9f40-e4eaf5d01b5b',
      },
      lastImportedAt: {
        universalIdentifier: '364b7d34-15e8-54f5-896c-c7d871dc3626',
      },
      hasLinkInBio: {
        universalIdentifier: 'c6e8a5e1-5efd-5c91-a5ba-e5d0a30c7bbc',
      },
      hasBrandDeals: {
        universalIdentifier: 'c4493bec-5da6-57bc-8a5c-bcad9d57cc86',
      },
      promotesAffiliateLinks: {
        universalIdentifier: 'c9e348e1-803d-5e62-bd76-d3fe4f371b1e',
      },
      hasMerch: { universalIdentifier: 'e0ec78f5-8453-58ef-ba4d-c6ff1c2dae76' },
      linksInBio: {
        universalIdentifier: '5f918fd0-dbea-5c96-ac19-8cf69e358ae5',
      },
      externalUrls: {
        universalIdentifier: '27e916a0-3331-5239-8e46-2aa0461fc9f8',
      },
      hashtagsUsed: {
        universalIdentifier: 'f06e2a81-794f-5afd-ae94-f02df347b5a0',
      },
      categories: {
        universalIdentifier: 'f2b6b04b-c3a7-5440-9915-52deef3d0f17',
      },
      niches: { universalIdentifier: '825176a0-bedd-54a5-8fd7-b98b5a81e3d0' },
      notes: { universalIdentifier: '465d4f65-450f-507c-82b3-be142f608885' },
      instagramUrl: {
        universalIdentifier: '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b',
      },
      instagramUsername: {
        universalIdentifier: '1186d5b4-385f-5566-a4ba-87b8f65cdee5',
      },
      instagramBio: {
        universalIdentifier: 'd383c2c2-9617-548f-a0ab-266b7dbe0789',
      },
      instagramFollowerCount: {
        universalIdentifier: '8b74efdb-518f-5826-bacf-a0fdc34e19ff',
      },
      instagramEngagementPercent: {
        universalIdentifier: 'b2eaec35-b0ef-57cf-8010-e6c51ee3caba',
      },
      instagramMostRecentPostDate: {
        universalIdentifier: '6f73e724-4e44-5663-a0f7-596cb363ad9b',
      },
      instagramMediaCount: {
        universalIdentifier: '3d47e3bd-dbcb-5204-b5f0-a42b002ac95c',
      },
      instagramAvgLikes: {
        universalIdentifier: '3574c8db-eb8f-58af-853e-fdc6e049a0d3',
      },
      instagramAvgComments: {
        universalIdentifier: '663c7e77-5a0b-5aa5-877b-def51bcc81dc',
      },
      instagramReelsPercent: {
        universalIdentifier: '1be6555f-4544-53cc-95bb-d196fa6cf820',
      },
      instagramReelsAvgViewCount: {
        universalIdentifier: '53db1f45-e030-5dbd-8f87-e124dcbe3786',
      },
      instagramPostingFrequencyRecentMonths: {
        universalIdentifier: 'e7525fa2-b583-5602-bafb-d93f68257a3c',
      },
      instagramEstimatedIncomeMin: {
        universalIdentifier: '8568c880-be20-52fb-ae4d-d93520f77fc2',
      },
      instagramEstimatedIncomeMax: {
        universalIdentifier: '5b4b9184-7df7-54e6-8b10-2b706d6cec26',
      },
      tiktokUrl: {
        universalIdentifier: 'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31',
      },
      tiktokUsername: {
        universalIdentifier: '3db5e356-13b9-539d-8320-7c6606e3c574',
      },
      tiktokBio: {
        universalIdentifier: '52162ce6-20b6-536d-b6b1-c21271c96006',
      },
      tiktokFollowerCount: {
        universalIdentifier: '37078d35-ad1a-5804-bd6c-b7b6b7a332f7',
      },
      tiktokMostRecentPostDate: {
        universalIdentifier: '4d1c28ec-c011-5aea-a13e-3d75ac6c6447',
      },
      tiktokEngagementPercent: {
        universalIdentifier: 'e56f72b8-cf14-5549-9d5c-9f9ff8c8bc02',
      },
      tiktokVideoCount: {
        universalIdentifier: 'b4d417cb-9a24-50fb-b0f5-8d98732f54b6',
      },
      tiktokPlayCountMedian: {
        universalIdentifier: '4d8bee01-c6bb-5c0c-8943-5233c01e2489',
      },
      tiktokAvgLikes: {
        universalIdentifier: '535a8720-43ea-5b25-9cac-4bcf26fddc7b',
      },
      tiktokAvgComments: {
        universalIdentifier: 'a0bf2b36-21a3-5d68-84e2-d5c8ae256593',
      },
      tiktokAvgDownloads: {
        universalIdentifier: '414e5ecf-cca5-55f7-89c6-3aa94b78b954',
      },
      tiktokPostingFrequencyRecentMonths: {
        universalIdentifier: 'cdce06f2-f7d6-5587-8ea9-02e58c0d6b47',
      },
      youtubeUrl: {
        universalIdentifier: 'af645cc7-31fc-5175-af8d-427845ebe1ed',
      },
      youtubeCustomUrl: {
        universalIdentifier: 'cba072b8-6758-5eaa-bc1c-72e94a75b112',
      },
      youtubeTitle: {
        universalIdentifier: '6430e3f1-71aa-5b6a-bc7a-b635d4f2c3ab',
      },
      youtubeDescription: {
        universalIdentifier: 'bdaf9a54-8931-5e51-836f-eb1cf6b11fcb',
      },
      youtubeTopicDetails: {
        universalIdentifier: 'f82741c8-5e43-5ac0-bebc-75b0edb2e3a2',
      },
      youtubeSubscriberCount: {
        universalIdentifier: '047c19e7-43aa-557c-b1a9-5b1824a26c5e',
      },
      youtubeLastUploadDate: {
        universalIdentifier: '7ce4f52f-6963-5b4c-b012-21dbdd723048',
      },
      youtubeLastStreamUploadDate: {
        universalIdentifier: '4cc3ad51-3ca3-5044-b09f-1b57ba0c927e',
      },
      youtubeShortsPercentage: {
        universalIdentifier: '784644f6-24bb-5955-b2bc-557b17f6f07c',
      },
      youtubeVideoCount: {
        universalIdentifier: '162a494a-9981-5b6f-b131-3ff7dae5cc95',
      },
      youtubeEngagementPercent: {
        universalIdentifier: '77684c8c-d06b-50a9-a404-ea58ca2d8fd3',
      },
      youtubeAvgViewsLong: {
        universalIdentifier: '536e5718-d023-58e8-99b7-35d5f2759e69',
      },
      youtubeAvgViewsShorts: {
        universalIdentifier: '8077992b-d61d-5176-a166-c6933469b56b',
      },
      youtubeAvgStreamViews: {
        universalIdentifier: '296f47d1-e288-5d15-95b9-ea750532c05a',
      },
      youtubeAvgStreamDuration: {
        universalIdentifier: '972f8c77-ffe7-5385-9b38-4128a8ac5d98',
      },
      youtubePostingFrequencyRecentMonths: {
        universalIdentifier: '7a7775dd-23ba-58d3-a9c6-455cdee72e72',
      },
      youtubeEstimatedIncomeMin: {
        universalIdentifier: '461e1478-1109-58b6-b9bf-ae2d6aa7cb99',
      },
      youtubeEstimatedIncomeMax: {
        universalIdentifier: '1ed40657-e379-5a8f-8295-b7e1c072be68',
      },
      twitterUrl: {
        universalIdentifier: 'bbfda234-327c-5d9d-ac39-8a33fd06779d',
      },
      twitterUsername: {
        universalIdentifier: 'cba84727-9219-502a-9880-a14bee741515',
      },
      twitterBio: {
        universalIdentifier: 'b286bdf2-3024-575d-b852-adf935061749',
      },
      twitterFollowerCount: {
        universalIdentifier: '269f07b6-b2a8-551c-b23e-b44dd95e1e36',
      },
      twitterEngagementPercent: {
        universalIdentifier: '701fa901-6773-5637-b5d2-c85fdd4a34e7',
      },
      twitchUrl: {
        universalIdentifier: 'fa743d1a-aa43-5976-b6b2-8131a533ae5b',
      },
      twitchUsername: {
        universalIdentifier: '789717de-3c12-59c3-b91a-ca4a70d00886',
      },
      twitchDisplayName: {
        universalIdentifier: 'f10ed5aa-ff19-5cbe-b176-ae4bf642edf1',
      },
      twitchTotalFollowers: {
        universalIdentifier: 'a996b7a6-aeee-523a-b90f-30416891e37e',
      },
      listMemberships: {
        universalIdentifier: '32db62ac-6217-5316-89d9-f9d7290dff70',
      },
      campaignCreators: {
        universalIdentifier: '3b9494ff-0fe7-5492-8b69-c515f79ea437',
      },
      patreonUrl: {
        universalIdentifier: 'd68083f5-0db1-5c77-ac35-640a2fdb1f3f',
      },
      noteTargets: {
        universalIdentifier: '42b8e10b-8500-4530-b148-695ed3b5092a',
      },
      taskTargets: {
        universalIdentifier: '4dca8339-817b-4292-a55c-425d01c4ea35',
      },
    },
    indexes: {},
    views: {
      viewa5abdae3: {
        universalIdentifier: 'a5abdae3-d86a-51d3-9b04-2dc21c172c3e',
        viewFields: {
          name: { universalIdentifier: '1ee6e143-3bf6-58cc-b55c-e7bd8b9cb4d0' },
          creatorStatus: {
            universalIdentifier: 'f2d9c0cc-7838-477b-88fb-38a3f9a552ea',
          },
          owner: {
            universalIdentifier: 'cc5ed450-05fd-4c8e-b488-edae3cbd6586',
          },
          email: {
            universalIdentifier: 'd779e826-cf8c-5e36-9685-0f9a6989142d',
          },
          instagramUsername: {
            universalIdentifier: '77c1fa17-1566-59d6-9a1f-6597537c72c0',
          },
          instagramFollowerCount: {
            universalIdentifier: '2856cfb7-33c3-5441-a871-85c09cd34688',
          },
          source: {
            universalIdentifier: 'c2581172-2575-532c-8975-a79e55188fab',
          },
        },
      },
      qualifiedCreatorsWithEmail: {
        universalIdentifier: '19483764-6f84-4d09-8f03-945e7d0a4b28',
        viewFields: {
          name: { universalIdentifier: 'dd61ecce-0046-4b14-9cbf-7398f47849d6' },
          creatorStatus: {
            universalIdentifier: 'b3c7407a-07be-42e3-8663-e06fe7389c84',
          },
          owner: {
            universalIdentifier: '1d0ec242-c56a-4942-959d-de1c8621221c',
          },
          email: {
            universalIdentifier: '1c53246e-fd62-46ef-9484-2003d1a90040',
          },
          instagramUsername: {
            universalIdentifier: '6a3edac7-0b7c-4874-861a-965efd4b873c',
          },
          instagramFollowerCount: {
            universalIdentifier: '82068ee3-064a-43ea-8e8b-5cdca0e3d53e',
          },
          source: {
            universalIdentifier: '81c5939d-eb4c-43b9-8f91-3c3214d3161d',
          },
        },
        viewFilters: {
          creatorStatus: {
            universalIdentifier: '03ddcbb7-42dd-4078-bc0a-c985c6a9c131',
          },
          email: {
            universalIdentifier: 'd1319af0-eeb2-4ca3-8afc-31e66c8a4277',
          },
        },
      },
    },
  },
} as const satisfies Record<string, StandardObjectDefinition>;
