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
      name: { universalIdentifier: '56a8c222-bc15-48e2-a608-4c40a791ac4b' },
      linkType: { universalIdentifier: '806a4b82-1fc8-43c4-b965-e5271c73b7bb' },
      description: { universalIdentifier: '9688a814-290f-460f-9604-d5ffea3c78ac' },
    },
    indexes: {
    },
    views: {
    },
  },
  brandBrainPage: {
    universalIdentifier: '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
    fields: {
      title: { universalIdentifier: 'e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d' },
      slug: { universalIdentifier: '8e9bbffa-807a-4e0d-9fb1-f3deec6183cf' },
      canonicalPath: { universalIdentifier: '4452d201-44a5-46fc-bf11-e26fa85cc3b2' },
      idPath: { universalIdentifier: '3b78e6d5-d9ed-432f-b3f6-d5d6bdb82d99' },
      pageType: { universalIdentifier: 'b044e1f3-94f4-4d65-93a3-5082e317f5e1' },
      status: { universalIdentifier: '531d9732-7614-472c-ae02-8fc806d92c0a' },
      body: { universalIdentifier: 'f9194806-a2c6-4f03-a351-09b4546ce2ed' },
      summary: { universalIdentifier: '7f963c23-90c8-44b3-b488-b137e6e358a9' },
      tags: { universalIdentifier: '322e4f8d-a9b7-4293-a596-5df62e3961e9' },
      sortOrder: { universalIdentifier: '0a3cd691-7971-45c3-8e8d-996d9b631c84' },
      aliases: { universalIdentifier: '24d415b8-fc54-4c18-8cd8-0b5575d39e88' },
    },
    indexes: {
      canonicalPath: { universalIdentifier: 'b75fa72e-7365-4da0-a910-b6ef96f306c2' },
    },
    views: {
      view2774101b: {
        universalIdentifier: '2774101b-3c0b-485b-91f5-b92d30bdcb6e',
        viewFields: {
          title: { universalIdentifier: 'cecbfcb2-318d-48b0-ab64-59a25fb213e5' },
          slug: { universalIdentifier: 'cb99eb49-2960-4b98-b4f0-ef70add64f79' },
          canonicalPath: { universalIdentifier: '668d5313-ddc4-4815-93f9-d8f60b4fa550' },
          idPath: { universalIdentifier: 'c42cf06d-eaae-4bfe-8108-20887dd0d8c4' },
          pageType: { universalIdentifier: 'f0b70304-4119-4a91-aef6-9d7108a332fe' },
          summary: { universalIdentifier: '5658f977-d711-46ce-8563-a73dbe6a8d0b' },
          body: { universalIdentifier: '79c4d8b0-f4bb-43ff-bb06-c4d374be9130' },
          parentPage: { universalIdentifier: 'c3bde970-bc8e-41d5-bad0-b710c548496d' },
          childPages: { universalIdentifier: '16f5c397-468a-47c0-b704-a850d11e87a0' },
          sourceLinks: { universalIdentifier: 'cbdac244-5a78-4ff0-a28a-011b444b9412' },
          targetLinks: { universalIdentifier: '4f02dd57-6875-449b-a0c5-e6ca23f8f53b' },
        },
      },
      view914bd2ad: {
        universalIdentifier: '914bd2ad-17e0-48f2-a6da-38f94b92be9d',
        viewFields: {
          title: { universalIdentifier: '7c821735-92b0-417a-a4c6-b1c2d940a813' },
          canonicalPath: { universalIdentifier: 'fa092416-394c-4d01-8252-452249e445c2' },
          pageType: { universalIdentifier: 'b57ef565-d393-4777-921c-5aa0a2166033' },
          summary: { universalIdentifier: '3a621e09-bc66-4881-aa7c-d1ed0086de82' },
        },
      },
    },
  },
  brandBrainUpdateProposal: {
    universalIdentifier: 'facac4a1-0a2f-469f-9f1f-81ef01f06578',
    fields: {
      title: { universalIdentifier: 'e4418f8c-6f74-4d03-8c61-93c17848c2dc' },
      proposalType: { universalIdentifier: '5601c017-6a85-4211-b2b2-9fda0bf9f0c6' },
      status: { universalIdentifier: '5d00b029-7a0d-4320-acf4-036a634a44ab' },
      reason: { universalIdentifier: '6a5f0131-32c8-41a2-968c-1dd429071f18' },
      proposedPatch: { universalIdentifier: 'cf1caf3f-e423-43e6-bd47-62a27bb513e2' },
      sourceSummary: { universalIdentifier: '31fe27f7-a5cb-4590-95a0-f9247f490bb2' },
    },
    indexes: {
    },
    views: {
      view25d4c1a3: {
        universalIdentifier: '25d4c1a3-b315-4c2c-b95e-04f3bcb90807',
        viewFields: {
          title: { universalIdentifier: '64c4da41-f1a4-43a8-9f03-a155fa3963bf' },
          proposalType: { universalIdentifier: '600ea605-7496-4602-a2cb-ddb38c230fd6' },
          status: { universalIdentifier: '9a3bd420-c63d-479d-bb86-d4d25f7a9832' },
          reason: { universalIdentifier: 'f078acbb-e143-46f4-9b27-926315811539' },
          proposedPatch: { universalIdentifier: '1118b32e-5e02-4955-9bff-86cc6e3884d3' },
        },
        viewFilters: {
          status: { universalIdentifier: 'bb759248-7330-4730-b4a8-0752df10ab14' },
        },
      },
    },
  },
  offer: {
    universalIdentifier: 'fd8a37b8-72db-5069-902a-a1763ddc63f7',
    fields: {
      name: { universalIdentifier: 'b7706308-8a6a-5613-ac37-d5e8ce848be2' },
      campaign: { universalIdentifier: 'f8ea43b0-33f8-5071-9e6d-5b787fb4e043' },
      promotedAsset: { universalIdentifier: '00c95791-84b2-50cc-89aa-68faf18011eb' },
      termsSummary: { universalIdentifier: '0923fd4e-7f50-587b-af7f-f2cebf5293ec' },
      commissionRate: { universalIdentifier: '45e45dbb-b54a-57bf-a901-215aa193b42c' },
      fixedFee: { universalIdentifier: 'ee119d6e-9d38-5ab8-9382-70498edc9688' },
      cpaAmount: { universalIdentifier: '05ca2ea3-5833-5192-a2f2-9dc7b53ca89f' },
      giftedProductNotes: { universalIdentifier: '5fcb14fe-bed2-513d-9cd8-7c6ecb15bf0b' },
      usageRightsNotes: { universalIdentifier: '8044d22e-fba7-5af4-9b9f-28ccc0779801' },
    },
    indexes: {
    },
    views: {
    },
  },
  outreachAction: {
    universalIdentifier: 'b4459926-2c01-560a-8432-fa1974168439',
    fields: {
      name: { universalIdentifier: 'e3165e19-e1b8-51d2-9451-5caa4c398bd6' },
      campaignCreator: { universalIdentifier: '64617f40-1f95-54cf-be64-ff57c72df280' },
      outreachStep: { universalIdentifier: '09c835f8-9137-5b97-bc2c-a76139fd270c' },
      channel: { universalIdentifier: 'f1c1b41f-a1be-548b-a7b2-9d4c8863f74b' },
      status: { universalIdentifier: 'f41a5820-bb50-537d-ae28-e2824cd7aa36' },
      scheduledAt: { universalIdentifier: 'd11e908c-0cad-54c2-8326-56187dd177f5' },
      completedAt: { universalIdentifier: '04638c8a-b191-5030-ad00-810bbca02bbe' },
      resultSummary: { universalIdentifier: 'a461116c-dab8-525c-bdd9-4708dcebf433' },
    },
    indexes: {
    },
    views: {
    },
  },
  outreachSequence: {
    universalIdentifier: '0446497e-3240-5a78-a02f-e08594e5c2af',
    fields: {
      name: { universalIdentifier: '3f5fd643-d5ba-5db2-8cad-528b51189994' },
      campaign: { universalIdentifier: '75b56b0d-b69d-50fd-8f36-bfd3fa8d9237' },
      status: { universalIdentifier: '4298980f-fa5b-5e2a-8f80-1790cc7ec1da' },
      description: { universalIdentifier: '3278eed0-5897-54e0-a58d-fc237d64f4ea' },
      steps: { universalIdentifier: '79efc6cb-48f5-5569-9759-255825e287e0' },
    },
    indexes: {
    },
    views: {
    },
  },
  outreachStep: {
    universalIdentifier: 'c25bfef3-4636-5864-a777-705238c91326',
    fields: {
      name: { universalIdentifier: 'f9a7ec56-5aa0-5341-830a-5ab108c6b73c' },
      outreachSequence: { universalIdentifier: '9fd2575c-ca82-59bb-8f10-4907b104e6cb' },
      stepPosition: { universalIdentifier: 'a9469f6f-7cb8-5ed9-b171-15d65d7a47ea' },
      trigger: { universalIdentifier: 'b5fe44f8-8d01-573f-a3bb-920399c8f9bb' },
      channel: { universalIdentifier: '8bef3b6c-0347-5389-98d2-263ab99f2377' },
      delayDays: { universalIdentifier: '7b114005-6089-5a22-b172-f74bc93ef9b9' },
      templateSummary: { universalIdentifier: '766d505d-d6ac-54d2-940d-201a47e29c3a' },
      actions: { universalIdentifier: 'd68a67a8-b5b3-5dd0-a1a5-82ed7561eb4e' },
    },
    indexes: {
    },
    views: {
    },
  },
  promotedAsset: {
    universalIdentifier: '843aa6c8-36af-5906-8241-4017c4188df7',
    fields: {
      name: { universalIdentifier: '3891a76c-3119-52cc-84cd-abce75920db7' },
      assetType: { universalIdentifier: '3c7bb78a-3a42-590a-aca9-f4d966fd691f' },
      url: { universalIdentifier: 'f90326b9-e045-578b-8d76-c513bb3c1890' },
      description: { universalIdentifier: '38cf3b6d-bce8-5eca-9db0-232ebe8ea702' },
      offers: { universalIdentifier: '809800a3-fa41-591e-8d4e-7e9fd0daf322' },
    },
    indexes: {
    },
    views: {
    },
  },
  campaignCreator: {
    universalIdentifier: 'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a',
    fields: {
      name: { universalIdentifier: '31b163a4-99d9-5015-bcee-dc8ae5229ee3' },
      creator: { universalIdentifier: '730b323f-fae3-57e2-8e2e-62963106850a' },
      campaign: { universalIdentifier: '27ecf86e-08a4-5084-91d7-d305ab3363e1' },
      stage: { universalIdentifier: '427aad82-7fe4-516d-99b3-8d00161534f6' },
      selectedContactMethod: { universalIdentifier: 'b002caa0-6fb6-54a3-8111-a6dadf09e4ca' },
      nextActionAt: { universalIdentifier: '3d5adbfb-9e02-5583-95ea-bfe72e65106f' },
      selectionReason: { universalIdentifier: '6f38f371-8915-55be-a96c-a94e4fc293af' },
      dealSummary: { universalIdentifier: '12b6b77e-31a8-508f-bf3c-f7b3077dcbd3' },
      outcomeSummary: { universalIdentifier: '640d0d05-246d-5005-b592-a28889852fbd' },
      outreachActions: { universalIdentifier: 'e9b9d246-f49e-5200-9819-0a4c9cd0d19a' },
    },
    indexes: {
    },
    views: {
    },
  },
  campaign: {
    universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
    fields: {
      name: { universalIdentifier: '63c56aea-35db-5733-9d3a-d062544ac897' },
      status: { universalIdentifier: '9d3c6d96-896d-51d1-b6d2-5d6b2e333e87' },
      objective: { universalIdentifier: 'e22687bb-2633-573f-bd80-c4b13e80d966' },
      targetPlatforms: { universalIdentifier: '877f9622-775c-52c1-9869-4abf14161de0' },
      targetDemographics: { universalIdentifier: '3e4bc999-fad4-59c2-9e38-046c33e26f2b' },
      icpGoal: { universalIdentifier: '86ac6e3d-ef0e-5ee3-a8b6-e8a22756f81c' },
      budgetNotes: { universalIdentifier: '97377e2b-ec51-5fef-891e-b2202cc69512' },
      campaignCreators: { universalIdentifier: '894c80f2-a478-5680-8c20-c7a86aa24fde' },
      offers: { universalIdentifier: '1d33699f-76f3-5247-98b3-2de588543364' },
      outreachSequences: { universalIdentifier: '40b7c827-4699-5f99-bdb8-d8906dd948f5' },
    },
    indexes: {
    },
    views: {
      view5865bdbf: {
        universalIdentifier: '5865bdbf-be33-5457-9d91-184885276b94',
        viewFields: {
          name: { universalIdentifier: 'ead80d6b-300a-5edc-b03e-7cce7f3fecc4' },
          status: { universalIdentifier: '8ce2c107-f484-5525-8f45-b7f4c9d32683' },
          objective: { universalIdentifier: '4d438e45-9995-5b0f-b9eb-ed916870f280' },
          targetPlatforms: { universalIdentifier: '66f84b3e-c870-5180-b345-490897ce4cd2' },
          icpGoal: { universalIdentifier: 'dacf7682-7297-5319-b86d-6cb137f9ddb2' },
        },
      },
    },
  },
  creatorListMember: {
    universalIdentifier: 'e004c4b4-b1e1-59d9-b096-9fc57875d47f',
    fields: {
      name: { universalIdentifier: '7924764c-9378-5299-8b68-7757e6af35c2' },
      creator: { universalIdentifier: 'a8014e8c-e50a-547a-9f01-973d685314ec' },
      creatorList: { universalIdentifier: 'c84e31a5-ba66-5773-a2da-2b1c357257c5' },
      source: { universalIdentifier: 'cec1e32c-db2c-53fa-b0ad-4bbbce951ae2' },
      notes: { universalIdentifier: 'bb1651d8-de78-5a22-8ac3-7c1f4d631819' },
    },
    indexes: {
    },
    views: {
    },
  },
  creatorList: {
    universalIdentifier: 'd51f2758-055b-5367-8250-859cb3f58631',
    fields: {
      name: { universalIdentifier: 'e19694f0-0c78-566e-ab95-63f0488848f3' },
      source: { universalIdentifier: '1b27dc7c-0f11-5b2a-b81f-708dc785b6fa' },
      description: { universalIdentifier: '1a4485a2-1e44-51af-bfdc-666cdcf17223' },
      members: { universalIdentifier: 'ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df' },
    },
    indexes: {
    },
    views: {
      view1bc58554: {
        universalIdentifier: '1bc58554-efb5-52e4-8e2a-7f522a1c453c',
        viewFields: {
          name: { universalIdentifier: '8b68fcb0-490d-5414-9b67-abf9e858908b' },
          source: { universalIdentifier: 'ce532f04-7846-52b2-9d6b-cd9305f767e2' },
          description: { universalIdentifier: 'a9084da4-53a4-5af9-b078-480a6878d74c' },
        },
      },
    },
  },
  creator: {
    universalIdentifier: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
    fields: {
      name: { universalIdentifier: 'c3d4cafc-73ec-5d13-8fe9-cbcbd0eca899' },
      email: { universalIdentifier: 'c4bccf25-cfd1-5648-918e-bf20b32ed375' },
      phone: { universalIdentifier: 'ccdc5be6-6c2b-5920-acd8-fa0ad52eeb29' },
      location: { universalIdentifier: '48ea973f-0a2b-5650-910b-6e0c5b4b34ce' },
      language: { universalIdentifier: '54971f3a-9443-51e1-94d7-ca76e9889f08' },
      profileType: { universalIdentifier: 'ec240f13-8462-54ad-be55-b27275f0f58a' },
      creatorStatus: { universalIdentifier: 'b887feac-6623-5e8f-b84e-bd502abb8972' },
      source: { universalIdentifier: '22ad8e62-9b3c-5321-b1a1-8120a7566cd4' },
      sourceUrl: { universalIdentifier: 'e1f69ece-5d51-5819-82d0-eff0eb752396' },
      importSource: { universalIdentifier: '7ad7da3b-3d4f-5ebb-9f40-e4eaf5d01b5b' },
      lastImportedAt: { universalIdentifier: '364b7d34-15e8-54f5-896c-c7d871dc3626' },
      hasLinkInBio: { universalIdentifier: 'c6e8a5e1-5efd-5c91-a5ba-e5d0a30c7bbc' },
      hasBrandDeals: { universalIdentifier: 'c4493bec-5da6-57bc-8a5c-bcad9d57cc86' },
      promotesAffiliateLinks: { universalIdentifier: 'c9e348e1-803d-5e62-bd76-d3fe4f371b1e' },
      hasMerch: { universalIdentifier: 'e0ec78f5-8453-58ef-ba4d-c6ff1c2dae76' },
      linksInBio: { universalIdentifier: '5f918fd0-dbea-5c96-ac19-8cf69e358ae5' },
      externalUrls: { universalIdentifier: '27e916a0-3331-5239-8e46-2aa0461fc9f8' },
      hashtagsUsed: { universalIdentifier: 'f06e2a81-794f-5afd-ae94-f02df347b5a0' },
      categories: { universalIdentifier: 'f2b6b04b-c3a7-5440-9915-52deef3d0f17' },
      niches: { universalIdentifier: '825176a0-bedd-54a5-8fd7-b98b5a81e3d0' },
      notes: { universalIdentifier: '465d4f65-450f-507c-82b3-be142f608885' },
      instagramUrl: { universalIdentifier: '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b' },
      instagramUsername: { universalIdentifier: '1186d5b4-385f-5566-a4ba-87b8f65cdee5' },
      instagramBio: { universalIdentifier: 'd383c2c2-9617-548f-a0ab-266b7dbe0789' },
      instagramFollowerCount: { universalIdentifier: '8b74efdb-518f-5826-bacf-a0fdc34e19ff' },
      instagramEngagementPercent: { universalIdentifier: 'b2eaec35-b0ef-57cf-8010-e6c51ee3caba' },
      instagramMostRecentPostDate: { universalIdentifier: '6f73e724-4e44-5663-a0f7-596cb363ad9b' },
      instagramMediaCount: { universalIdentifier: '3d47e3bd-dbcb-5204-b5f0-a42b002ac95c' },
      instagramAvgLikes: { universalIdentifier: '3574c8db-eb8f-58af-853e-fdc6e049a0d3' },
      instagramAvgComments: { universalIdentifier: '663c7e77-5a0b-5aa5-877b-def51bcc81dc' },
      instagramReelsPercent: { universalIdentifier: '1be6555f-4544-53cc-95bb-d196fa6cf820' },
      instagramReelsAvgViewCount: { universalIdentifier: '53db1f45-e030-5dbd-8f87-e124dcbe3786' },
      instagramPostingFrequencyRecentMonths: { universalIdentifier: 'e7525fa2-b583-5602-bafb-d93f68257a3c' },
      instagramEstimatedIncomeMin: { universalIdentifier: '8568c880-be20-52fb-ae4d-d93520f77fc2' },
      instagramEstimatedIncomeMax: { universalIdentifier: '5b4b9184-7df7-54e6-8b10-2b706d6cec26' },
      tiktokUrl: { universalIdentifier: 'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31' },
      tiktokUsername: { universalIdentifier: '3db5e356-13b9-539d-8320-7c6606e3c574' },
      tiktokBio: { universalIdentifier: '52162ce6-20b6-536d-b6b1-c21271c96006' },
      tiktokFollowerCount: { universalIdentifier: '37078d35-ad1a-5804-bd6c-b7b6b7a332f7' },
      tiktokMostRecentPostDate: { universalIdentifier: '4d1c28ec-c011-5aea-a13e-3d75ac6c6447' },
      tiktokEngagementPercent: { universalIdentifier: 'e56f72b8-cf14-5549-9d5c-9f9ff8c8bc02' },
      tiktokVideoCount: { universalIdentifier: 'b4d417cb-9a24-50fb-b0f5-8d98732f54b6' },
      tiktokPlayCountMedian: { universalIdentifier: '4d8bee01-c6bb-5c0c-8943-5233c01e2489' },
      tiktokAvgLikes: { universalIdentifier: '535a8720-43ea-5b25-9cac-4bcf26fddc7b' },
      tiktokAvgComments: { universalIdentifier: 'a0bf2b36-21a3-5d68-84e2-d5c8ae256593' },
      tiktokAvgDownloads: { universalIdentifier: '414e5ecf-cca5-55f7-89c6-3aa94b78b954' },
      tiktokPostingFrequencyRecentMonths: { universalIdentifier: 'cdce06f2-f7d6-5587-8ea9-02e58c0d6b47' },
      youtubeUrl: { universalIdentifier: 'af645cc7-31fc-5175-af8d-427845ebe1ed' },
      youtubeCustomUrl: { universalIdentifier: 'cba072b8-6758-5eaa-bc1c-72e94a75b112' },
      youtubeTitle: { universalIdentifier: '6430e3f1-71aa-5b6a-bc7a-b635d4f2c3ab' },
      youtubeDescription: { universalIdentifier: 'bdaf9a54-8931-5e51-836f-eb1cf6b11fcb' },
      youtubeTopicDetails: { universalIdentifier: 'f82741c8-5e43-5ac0-bebc-75b0edb2e3a2' },
      youtubeSubscriberCount: { universalIdentifier: '047c19e7-43aa-557c-b1a9-5b1824a26c5e' },
      youtubeLastUploadDate: { universalIdentifier: '7ce4f52f-6963-5b4c-b012-21dbdd723048' },
      youtubeLastStreamUploadDate: { universalIdentifier: '4cc3ad51-3ca3-5044-b09f-1b57ba0c927e' },
      youtubeShortsPercentage: { universalIdentifier: '784644f6-24bb-5955-b2bc-557b17f6f07c' },
      youtubeVideoCount: { universalIdentifier: '162a494a-9981-5b6f-b131-3ff7dae5cc95' },
      youtubeEngagementPercent: { universalIdentifier: '77684c8c-d06b-50a9-a404-ea58ca2d8fd3' },
      youtubeAvgViewsLong: { universalIdentifier: '536e5718-d023-58e8-99b7-35d5f2759e69' },
      youtubeAvgViewsShorts: { universalIdentifier: '8077992b-d61d-5176-a166-c6933469b56b' },
      youtubeAvgStreamViews: { universalIdentifier: '296f47d1-e288-5d15-95b9-ea750532c05a' },
      youtubeAvgStreamDuration: { universalIdentifier: '972f8c77-ffe7-5385-9b38-4128a8ac5d98' },
      youtubePostingFrequencyRecentMonths: { universalIdentifier: '7a7775dd-23ba-58d3-a9c6-455cdee72e72' },
      youtubeEstimatedIncomeMin: { universalIdentifier: '461e1478-1109-58b6-b9bf-ae2d6aa7cb99' },
      youtubeEstimatedIncomeMax: { universalIdentifier: '1ed40657-e379-5a8f-8295-b7e1c072be68' },
      twitterUrl: { universalIdentifier: 'bbfda234-327c-5d9d-ac39-8a33fd06779d' },
      twitterUsername: { universalIdentifier: 'cba84727-9219-502a-9880-a14bee741515' },
      twitterBio: { universalIdentifier: 'b286bdf2-3024-575d-b852-adf935061749' },
      twitterFollowerCount: { universalIdentifier: '269f07b6-b2a8-551c-b23e-b44dd95e1e36' },
      twitterEngagementPercent: { universalIdentifier: '701fa901-6773-5637-b5d2-c85fdd4a34e7' },
      twitchUrl: { universalIdentifier: 'fa743d1a-aa43-5976-b6b2-8131a533ae5b' },
      twitchUsername: { universalIdentifier: '789717de-3c12-59c3-b91a-ca4a70d00886' },
      twitchDisplayName: { universalIdentifier: 'f10ed5aa-ff19-5cbe-b176-ae4bf642edf1' },
      twitchTotalFollowers: { universalIdentifier: 'a996b7a6-aeee-523a-b90f-30416891e37e' },
      listMemberships: { universalIdentifier: '32db62ac-6217-5316-89d9-f9d7290dff70' },
      campaignCreators: { universalIdentifier: '3b9494ff-0fe7-5492-8b69-c515f79ea437' },
      patreonUrl: { universalIdentifier: 'd68083f5-0db1-5c77-ac35-640a2fdb1f3f' },
    },
    indexes: {
    },
    views: {
      viewa5abdae3: {
        universalIdentifier: 'a5abdae3-d86a-51d3-9b04-2dc21c172c3e',
        viewFields: {
          name: { universalIdentifier: '1ee6e143-3bf6-58cc-b55c-e7bd8b9cb4d0' },
          email: { universalIdentifier: 'd779e826-cf8c-5e36-9685-0f9a6989142d' },
          location: { universalIdentifier: '566647f6-312a-5357-adb9-a98c084989b3' },
          instagramUsername: { universalIdentifier: '77c1fa17-1566-59d6-9a1f-6597537c72c0' },
          instagramFollowerCount: { universalIdentifier: '2856cfb7-33c3-5441-a871-85c09cd34688' },
          tiktokUsername: { universalIdentifier: 'b9998544-50cc-50a0-af98-598c3922ab11' },
          tiktokFollowerCount: { universalIdentifier: '0025c07e-7109-5f5f-b9ef-694abb133ec8' },
          youtubeTitle: { universalIdentifier: '7c46192c-272b-504b-aa1d-1048151b9943' },
          youtubeSubscriberCount: { universalIdentifier: 'eeebe69a-8c33-55ad-8375-ae0f7c68f9c5' },
          hasBrandDeals: { universalIdentifier: 'd5777661-6233-54e2-b073-6328a904d139' },
          promotesAffiliateLinks: { universalIdentifier: '72826aa0-29d6-5363-83d9-353819828b71' },
          source: { universalIdentifier: 'c2581172-2575-532c-8975-a79e55188fab' },
        },
      },
    },
  },
} as const satisfies Record<string, StandardObjectDefinition>;
