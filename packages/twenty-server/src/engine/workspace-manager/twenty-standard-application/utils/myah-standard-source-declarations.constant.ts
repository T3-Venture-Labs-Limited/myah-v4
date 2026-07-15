export const MYAH_STANDARD_SOURCE_DECLARATIONS = {
  "objects": [
    {
      "universalIdentifier": "f99ff6bc-3b56-4600-beb3-cfc2c23364f6",
      "nameSingular": "brandBrainLink",
      "namePlural": "brandBrainLinks",
      "labelSingular": "Brand Brain Link",
      "labelPlural": "Brand Brain Links",
      "description": "An explicit backlink or citation between Brand Brain pages.",
      "icon": "IconLink",
      "labelIdentifierFieldMetadataUniversalIdentifier": "56a8c222-bc15-48e2-a608-4c40a791ac4b",
      "fields": [
        {
          "universalIdentifier": "56a8c222-bc15-48e2-a608-4c40a791ac4b",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "806a4b82-1fc8-43c4-b965-e5271c73b7bb",
          "name": "linkType",
          "label": "Link Type",
          "icon": "IconRouteAltLeft",
          "defaultValue": "'RELATED'",
          "options": [
            {
              "id": "251e1198-0de4-454f-83e7-1d6a451af3a8",
              "value": "RELATED",
              "label": "Related",
              "color": "blue"
            },
            {
              "id": "d885992d-2658-4410-8147-c6a7b8399f75",
              "value": "CITES",
              "label": "Cites",
              "color": "sky"
            },
            {
              "id": "f77b8f64-7a75-43ac-b65f-918d2db70c9f",
              "value": "SUPPORTS",
              "label": "Supports",
              "color": "green"
            },
            {
              "id": "53b7572c-26e9-4f2b-8372-2dfcbfd560ff",
              "value": "CONTRADICTS",
              "label": "Contradicts",
              "color": "red"
            },
            {
              "id": "3af080c7-b833-4c1e-923a-1edc70e0e93c",
              "value": "SUPERSEDES",
              "label": "Supersedes",
              "color": "orange"
            },
            {
              "id": "ee0d2617-4de2-44fb-b56e-7e574890acdf",
              "value": "DERIVED_FROM",
              "label": "Derived from",
              "color": "purple"
            }
          ]
        },
        {
          "universalIdentifier": "9688a814-290f-460f-9604-d5ffea3c78ac",
          "name": "description",
          "label": "Description",
          "icon": "IconTextCaption"
        }
      ]
    },
    {
      "universalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "nameSingular": "brandBrainPage",
      "namePlural": "brandBrainPages",
      "labelSingular": "Brand Brain Page",
      "labelPlural": "Brand Brain",
      "description": "A record-backed folder, page, Index, or Log entry for the Brand Brain.",
      "icon": "IconNotebook",
      "labelIdentifierFieldMetadataUniversalIdentifier": "e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d",
      "fields": [
        {
          "universalIdentifier": "e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d",
          "name": "title",
          "label": "Title",
          "icon": "IconHeading",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "8e9bbffa-807a-4e0d-9fb1-f3deec6183cf",
          "name": "slug",
          "label": "Slug",
          "icon": "IconLink",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "4452d201-44a5-46fc-bf11-e26fa85cc3b2",
          "name": "canonicalPath",
          "label": "Canonical Path",
          "icon": "IconRoute",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "3b78e6d5-d9ed-432f-b3f6-d5d6bdb82d99",
          "name": "idPath",
          "label": "ID Path",
          "icon": "IconBinaryTree"
        },
        {
          "universalIdentifier": "b044e1f3-94f4-4d65-93a3-5082e317f5e1",
          "name": "pageType",
          "label": "Page Type",
          "icon": "IconCategory",
          "defaultValue": "'PAGE'",
          "options": [
            {
              "id": "1cc61a12-c3f0-43ef-904f-ed58c0a9f3c4",
              "value": "BRAND_ROOT",
              "label": "Brand root",
              "color": "purple"
            },
            {
              "id": "fc0ad6a2-61f9-4985-a6be-e8978f5733c3",
              "value": "FOLDER",
              "label": "Folder",
              "color": "blue"
            },
            {
              "id": "91ca184c-5274-4e1d-b960-07fe10b4e8f4",
              "value": "PAGE",
              "label": "Page",
              "color": "green"
            },
            {
              "id": "f47b7f64-ee39-4896-a27f-cbc069e712fa",
              "value": "INDEX",
              "label": "Index",
              "color": "sky"
            },
            {
              "id": "e6c933f3-111d-4966-a7b2-7e72ee4d4d92",
              "value": "LOG",
              "label": "Log",
              "color": "orange"
            },
            {
              "id": "83e84f56-a98b-4a36-92d7-23b2ea3160f1",
              "value": "SOURCE",
              "label": "Source",
              "color": "gray"
            },
            {
              "id": "2cf85c0b-8662-4de2-a2c4-63715358f931",
              "value": "PROMPT",
              "label": "Prompt",
              "color": "pink"
            },
            {
              "id": "138f5749-c522-4c04-a55b-e23c29c3e188",
              "value": "PLAYBOOK",
              "label": "Playbook",
              "color": "turquoise"
            }
          ]
        },
        {
          "universalIdentifier": "531d9732-7614-472c-ae02-8fc806d92c0a",
          "name": "status",
          "label": "Status",
          "icon": "IconProgressCheck",
          "defaultValue": "'DRAFT'",
          "options": [
            {
              "id": "7eeae3ef-e85f-431a-8889-562057d78e40",
              "value": "DRAFT",
              "label": "Draft",
              "color": "gray"
            },
            {
              "id": "47617c1b-b0d0-44b4-8b5d-6c1f3dc365a2",
              "value": "APPROVED",
              "label": "Approved",
              "color": "green"
            },
            {
              "id": "b366dc27-8151-4203-bc8d-55ae2013fbbe",
              "value": "STALE",
              "label": "Stale",
              "color": "orange"
            },
            {
              "id": "caebc76e-47f1-4498-b2ad-8a0d6d28a469",
              "value": "ARCHIVED",
              "label": "Archived",
              "color": "red"
            }
          ]
        },
        {
          "universalIdentifier": "f9194806-a2c6-4f03-a351-09b4546ce2ed",
          "name": "body",
          "label": "Body",
          "icon": "IconNotes"
        },
        {
          "universalIdentifier": "7f963c23-90c8-44b3-b488-b137e6e358a9",
          "name": "summary",
          "label": "Summary",
          "icon": "IconTextCaption"
        },
        {
          "universalIdentifier": "322e4f8d-a9b7-4293-a596-5df62e3961e9",
          "name": "tags",
          "label": "Tags",
          "icon": "IconTags"
        },
        {
          "universalIdentifier": "0a3cd691-7971-45c3-8e8d-996d9b631c84",
          "name": "sortOrder",
          "label": "Sort Order",
          "icon": "IconSortAscending"
        },
        {
          "universalIdentifier": "24d415b8-fc54-4c18-8cd8-0b5575d39e88",
          "name": "aliases",
          "label": "Aliases",
          "icon": "IconArrowFork"
        }
      ]
    },
    {
      "universalIdentifier": "facac4a1-0a2f-469f-9f1f-81ef01f06578",
      "nameSingular": "brandBrainUpdateProposal",
      "namePlural": "brandBrainUpdateProposals",
      "labelSingular": "Brand Brain Update Proposal",
      "labelPlural": "Brand Brain Update Proposals",
      "description": "Dormant migration-safe proposal object retained for existing test workspaces; routine Brand Brain writes are direct agent updates.",
      "icon": "IconFilePencil",
      "labelIdentifierFieldMetadataUniversalIdentifier": "e4418f8c-6f74-4d03-8c61-93c17848c2dc",
      "fields": [
        {
          "universalIdentifier": "e4418f8c-6f74-4d03-8c61-93c17848c2dc",
          "name": "title",
          "label": "Title",
          "icon": "IconHeading",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "5601c017-6a85-4211-b2b2-9fda0bf9f0c6",
          "name": "proposalType",
          "label": "Proposal Type",
          "icon": "IconEdit",
          "defaultValue": "'UPDATE_PAGE'",
          "options": [
            {
              "id": "dd5522a7-f3d6-4ce3-a1ea-336f4f0b772f",
              "value": "CREATE_PAGE",
              "label": "Create page",
              "color": "green"
            },
            {
              "id": "4e61f20b-6643-4307-913c-06696947aef8",
              "value": "UPDATE_PAGE",
              "label": "Update page",
              "color": "blue"
            },
            {
              "id": "b5ab743d-6337-4c51-a7dc-56c28341e697",
              "value": "APPEND_LOG",
              "label": "Append log",
              "color": "orange"
            },
            {
              "id": "08137fbf-127b-472c-b3ea-2255f86a7db5",
              "value": "UPDATE_INDEX",
              "label": "Update index",
              "color": "sky"
            },
            {
              "id": "51b3a48a-c9ed-4420-80d5-990ee5d0d4c9",
              "value": "ADD_LINK",
              "label": "Add link",
              "color": "purple"
            },
            {
              "id": "7d4f06a5-8623-46a2-8780-7ab9cd337919",
              "value": "ARCHIVE_PAGE",
              "label": "Archive page",
              "color": "red"
            }
          ]
        },
        {
          "universalIdentifier": "5d00b029-7a0d-4320-acf4-036a634a44ab",
          "name": "status",
          "label": "Status",
          "icon": "IconProgressCheck",
          "defaultValue": "'PENDING'",
          "options": [
            {
              "id": "064cf1aa-f26e-4397-8fd8-15d24b8c0122",
              "value": "PENDING",
              "label": "Pending",
              "color": "orange"
            },
            {
              "id": "69fdb8eb-6fc3-46fc-a554-edeb13fff56b",
              "value": "APPROVED",
              "label": "Approved",
              "color": "green"
            },
            {
              "id": "c8de23d7-3b9e-4c63-9c7b-37b901eb5773",
              "value": "REJECTED",
              "label": "Rejected",
              "color": "red"
            },
            {
              "id": "ea5d03c1-d933-468a-8bc8-e3e5fc33cf23",
              "value": "APPLIED",
              "label": "Applied",
              "color": "blue"
            }
          ]
        },
        {
          "universalIdentifier": "6a5f0131-32c8-41a2-968c-1dd429071f18",
          "name": "reason",
          "label": "Reason",
          "icon": "IconMessage2Question"
        },
        {
          "universalIdentifier": "cf1caf3f-e423-43e6-bd47-62a27bb513e2",
          "name": "proposedPatch",
          "label": "Proposed Patch",
          "icon": "IconDiff"
        },
        {
          "universalIdentifier": "31fe27f7-a5cb-4590-95a0-f9247f490bb2",
          "name": "sourceSummary",
          "label": "Source Summary",
          "icon": "IconSourceCode"
        }
      ]
    },
    {
      "universalIdentifier": "fd8a37b8-72db-5069-902a-a1763ddc63f7",
      "nameSingular": "offer",
      "namePlural": "offers",
      "labelSingular": "Offer",
      "labelPlural": "Offers",
      "description": "Commercial terms for creator promotion",
      "icon": "IconGift",
      "labelIdentifierFieldMetadataUniversalIdentifier": "b7706308-8a6a-5613-ac37-d5e8ce848be2",
      "fields": [
        {
          "universalIdentifier": "b7706308-8a6a-5613-ac37-d5e8ce848be2",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "f8ea43b0-33f8-5071-9e6d-5b787fb4e043",
          "name": "campaign",
          "label": "Campaign",
          "icon": "IconTargetArrow",
          "relationTargetObjectMetadataUniversalIdentifier": "9a09d54a-d464-5692-ac74-70527fb00ddd",
          "relationTargetFieldMetadataUniversalIdentifier": "1d33699f-76f3-5247-98b3-2de588543364",
          "universalSettings": {
            "joinColumnName": "campaignId"
          }
        },
        {
          "universalIdentifier": "00c95791-84b2-50cc-89aa-68faf18011eb",
          "name": "promotedAsset",
          "label": "Promoted Asset",
          "icon": "IconPackage",
          "relationTargetObjectMetadataUniversalIdentifier": "843aa6c8-36af-5906-8241-4017c4188df7",
          "relationTargetFieldMetadataUniversalIdentifier": "809800a3-fa41-591e-8d4e-7e9fd0daf322",
          "universalSettings": {
            "joinColumnName": "promotedAssetId"
          }
        },
        {
          "universalIdentifier": "0923fd4e-7f50-587b-af7f-f2cebf5293ec",
          "name": "termsSummary",
          "label": "Terms summary",
          "icon": "IconFileDollar"
        },
        {
          "universalIdentifier": "45e45dbb-b54a-57bf-a901-215aa193b42c",
          "name": "commissionRate",
          "label": "Commission rate",
          "icon": "IconPercentage"
        },
        {
          "universalIdentifier": "ee119d6e-9d38-5ab8-9382-70498edc9688",
          "name": "fixedFee",
          "label": "Fixed fee",
          "icon": "IconCash"
        },
        {
          "universalIdentifier": "05ca2ea3-5833-5192-a2f2-9dc7b53ca89f",
          "name": "cpaAmount",
          "label": "CPA amount",
          "icon": "IconReceipt"
        },
        {
          "universalIdentifier": "5fcb14fe-bed2-513d-9cd8-7c6ecb15bf0b",
          "name": "giftedProductNotes",
          "label": "Gifted product notes",
          "icon": "IconPackageExport"
        },
        {
          "universalIdentifier": "8044d22e-fba7-5af4-9b9f-28ccc0779801",
          "name": "usageRightsNotes",
          "label": "Usage rights notes",
          "icon": "IconLicense"
        }
      ]
    },
    {
      "universalIdentifier": "b4459926-2c01-560a-8432-fa1974168439",
      "nameSingular": "outreachAction",
      "namePlural": "outreachActions",
      "labelSingular": "Outreach Action",
      "labelPlural": "Outreach Actions",
      "description": "A scheduled or completed outreach action for a campaign creator",
      "icon": "IconSend",
      "labelIdentifierFieldMetadataUniversalIdentifier": "e3165e19-e1b8-51d2-9451-5caa4c398bd6",
      "fields": [
        {
          "universalIdentifier": "e3165e19-e1b8-51d2-9451-5caa4c398bd6",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "64617f40-1f95-54cf-be64-ff57c72df280",
          "name": "campaignCreator",
          "label": "Campaign Creator",
          "icon": "IconUserCheck",
          "relationTargetObjectMetadataUniversalIdentifier": "f9f0d7a8-7e05-519b-b158-5f543f7a7e9a",
          "relationTargetFieldMetadataUniversalIdentifier": "e9b9d246-f49e-5200-9819-0a4c9cd0d19a",
          "universalSettings": {
            "joinColumnName": "campaignCreatorId"
          }
        },
        {
          "universalIdentifier": "09c835f8-9137-5b97-bc2c-a76139fd270c",
          "name": "outreachStep",
          "label": "Outreach Step",
          "icon": "IconListCheck",
          "relationTargetObjectMetadataUniversalIdentifier": "c25bfef3-4636-5864-a777-705238c91326",
          "relationTargetFieldMetadataUniversalIdentifier": "d68a67a8-b5b3-5dd0-a1a5-82ed7561eb4e",
          "universalSettings": {
            "joinColumnName": "outreachStepId"
          }
        },
        {
          "universalIdentifier": "f1c1b41f-a1be-548b-a7b2-9d4c8863f74b",
          "name": "channel",
          "label": "Channel",
          "icon": "IconSend"
        },
        {
          "universalIdentifier": "f41a5820-bb50-537d-ae28-e2824cd7aa36",
          "name": "status",
          "label": "Status",
          "icon": "IconProgress"
        },
        {
          "universalIdentifier": "d11e908c-0cad-54c2-8326-56187dd177f5",
          "name": "scheduledAt",
          "label": "Scheduled at",
          "icon": "IconCalendarDue"
        },
        {
          "universalIdentifier": "04638c8a-b191-5030-ad00-810bbca02bbe",
          "name": "completedAt",
          "label": "Completed at",
          "icon": "IconCircleCheck"
        },
        {
          "universalIdentifier": "a461116c-dab8-525c-bdd9-4708dcebf433",
          "name": "resultSummary",
          "label": "Result summary",
          "icon": "IconReportAnalytics"
        }
      ]
    },
    {
      "universalIdentifier": "0446497e-3240-5a78-a02f-e08594e5c2af",
      "nameSingular": "outreachSequence",
      "namePlural": "outreachSequences",
      "labelSingular": "Outreach Sequence",
      "labelPlural": "Outreach Sequences",
      "description": "A campaign-level outreach sequence",
      "icon": "IconRoute",
      "labelIdentifierFieldMetadataUniversalIdentifier": "3f5fd643-d5ba-5db2-8cad-528b51189994",
      "fields": [
        {
          "universalIdentifier": "3f5fd643-d5ba-5db2-8cad-528b51189994",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "75b56b0d-b69d-50fd-8f36-bfd3fa8d9237",
          "name": "campaign",
          "label": "Campaign",
          "icon": "IconTargetArrow",
          "relationTargetObjectMetadataUniversalIdentifier": "9a09d54a-d464-5692-ac74-70527fb00ddd",
          "relationTargetFieldMetadataUniversalIdentifier": "40b7c827-4699-5f99-bdb8-d8906dd948f5",
          "universalSettings": {
            "joinColumnName": "campaignId"
          }
        },
        {
          "universalIdentifier": "4298980f-fa5b-5e2a-8f80-1790cc7ec1da",
          "name": "status",
          "label": "Status",
          "icon": "IconProgress"
        },
        {
          "universalIdentifier": "3278eed0-5897-54e0-a58d-fc237d64f4ea",
          "name": "description",
          "label": "Description",
          "icon": "IconFileDescription"
        },
        {
          "universalIdentifier": "79efc6cb-48f5-5569-9759-255825e287e0",
          "name": "steps",
          "label": "Steps",
          "icon": "IconListCheck",
          "relationTargetObjectMetadataUniversalIdentifier": "c25bfef3-4636-5864-a777-705238c91326",
          "relationTargetFieldMetadataUniversalIdentifier": "9fd2575c-ca82-59bb-8f10-4907b104e6cb",
          "universalSettings": {}
        }
      ]
    },
    {
      "universalIdentifier": "c25bfef3-4636-5864-a777-705238c91326",
      "nameSingular": "outreachStep",
      "namePlural": "outreachSteps",
      "labelSingular": "Outreach Step",
      "labelPlural": "Outreach Steps",
      "description": "A step in an outreach sequence",
      "icon": "IconListCheck",
      "labelIdentifierFieldMetadataUniversalIdentifier": "f9a7ec56-5aa0-5341-830a-5ab108c6b73c",
      "fields": [
        {
          "universalIdentifier": "f9a7ec56-5aa0-5341-830a-5ab108c6b73c",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "9fd2575c-ca82-59bb-8f10-4907b104e6cb",
          "name": "outreachSequence",
          "label": "Outreach Sequence",
          "icon": "IconRoute",
          "relationTargetObjectMetadataUniversalIdentifier": "0446497e-3240-5a78-a02f-e08594e5c2af",
          "relationTargetFieldMetadataUniversalIdentifier": "79efc6cb-48f5-5569-9759-255825e287e0",
          "universalSettings": {
            "joinColumnName": "outreachSequenceId"
          }
        },
        {
          "universalIdentifier": "a9469f6f-7cb8-5ed9-b171-15d65d7a47ea",
          "name": "stepPosition",
          "label": "Step position",
          "icon": "IconSortAscending"
        },
        {
          "universalIdentifier": "b5fe44f8-8d01-573f-a3bb-920399c8f9bb",
          "name": "trigger",
          "label": "Trigger",
          "icon": "IconBolt"
        },
        {
          "universalIdentifier": "8bef3b6c-0347-5389-98d2-263ab99f2377",
          "name": "channel",
          "label": "Channel",
          "icon": "IconSend"
        },
        {
          "universalIdentifier": "7b114005-6089-5a22-b172-f74bc93ef9b9",
          "name": "delayDays",
          "label": "Delay days",
          "icon": "IconClock"
        },
        {
          "universalIdentifier": "766d505d-d6ac-54d2-940d-201a47e29c3a",
          "name": "templateSummary",
          "label": "Template summary",
          "icon": "IconTemplate"
        },
        {
          "universalIdentifier": "d68a67a8-b5b3-5dd0-a1a5-82ed7561eb4e",
          "name": "actions",
          "label": "Actions",
          "icon": "IconSend",
          "relationTargetObjectMetadataUniversalIdentifier": "b4459926-2c01-560a-8432-fa1974168439",
          "relationTargetFieldMetadataUniversalIdentifier": "09c835f8-9137-5b97-bc2c-a76139fd270c",
          "universalSettings": {}
        }
      ]
    },
    {
      "universalIdentifier": "843aa6c8-36af-5906-8241-4017c4188df7",
      "nameSingular": "promotedAsset",
      "namePlural": "promotedAssets",
      "labelSingular": "Promoted Asset",
      "labelPlural": "Promoted Assets",
      "description": "A product, app, offer, or asset promoted by creators",
      "icon": "IconPackage",
      "labelIdentifierFieldMetadataUniversalIdentifier": "3891a76c-3119-52cc-84cd-abce75920db7",
      "fields": [
        {
          "universalIdentifier": "3891a76c-3119-52cc-84cd-abce75920db7",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "3c7bb78a-3a42-590a-aca9-f4d966fd691f",
          "name": "assetType",
          "label": "Asset type",
          "icon": "IconCategory"
        },
        {
          "universalIdentifier": "f90326b9-e045-578b-8d76-c513bb3c1890",
          "name": "url",
          "label": "URL",
          "icon": "IconLink"
        },
        {
          "universalIdentifier": "38cf3b6d-bce8-5eca-9db0-232ebe8ea702",
          "name": "description",
          "label": "Description",
          "icon": "IconFileDescription"
        },
        {
          "universalIdentifier": "809800a3-fa41-591e-8d4e-7e9fd0daf322",
          "name": "offers",
          "label": "Offers",
          "icon": "IconGift",
          "relationTargetObjectMetadataUniversalIdentifier": "fd8a37b8-72db-5069-902a-a1763ddc63f7",
          "relationTargetFieldMetadataUniversalIdentifier": "00c95791-84b2-50cc-89aa-68faf18011eb",
          "universalSettings": {}
        }
      ]
    },
    {
      "universalIdentifier": "f9f0d7a8-7e05-519b-b158-5f543f7a7e9a",
      "nameSingular": "campaignCreator",
      "namePlural": "campaignCreators",
      "labelSingular": "Campaign Creator",
      "labelPlural": "Campaign Creators",
      "description": "A selected creator in a campaign workflow",
      "icon": "IconUserCheck",
      "labelIdentifierFieldMetadataUniversalIdentifier": "31b163a4-99d9-5015-bcee-dc8ae5229ee3",
      "fields": [
        {
          "universalIdentifier": "31b163a4-99d9-5015-bcee-dc8ae5229ee3",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "730b323f-fae3-57e2-8e2e-62963106850a",
          "name": "creator",
          "label": "Creator",
          "icon": "IconUserStar",
          "relationTargetObjectMetadataUniversalIdentifier": "5ca82f72-9778-4ae1-8a8e-9b762c4ce0de",
          "relationTargetFieldMetadataUniversalIdentifier": "3b9494ff-0fe7-5492-8b69-c515f79ea437",
          "universalSettings": {
            "joinColumnName": "creatorId"
          }
        },
        {
          "universalIdentifier": "27ecf86e-08a4-5084-91d7-d305ab3363e1",
          "name": "campaign",
          "label": "Campaign",
          "icon": "IconTargetArrow",
          "relationTargetObjectMetadataUniversalIdentifier": "9a09d54a-d464-5692-ac74-70527fb00ddd",
          "relationTargetFieldMetadataUniversalIdentifier": "894c80f2-a478-5680-8c20-c7a86aa24fde",
          "universalSettings": {
            "joinColumnName": "campaignId"
          }
        },
        {
          "universalIdentifier": "427aad82-7fe4-516d-99b3-8d00161534f6",
          "name": "stage",
          "label": "Stage",
          "icon": "IconProgress"
        },
        {
          "universalIdentifier": "b002caa0-6fb6-54a3-8111-a6dadf09e4ca",
          "name": "selectedContactMethod",
          "label": "Selected contact method",
          "icon": "IconSend"
        },
        {
          "universalIdentifier": "3d5adbfb-9e02-5583-95ea-bfe72e65106f",
          "name": "nextActionAt",
          "label": "Next action at",
          "icon": "IconCalendarDue"
        },
        {
          "universalIdentifier": "6f38f371-8915-55be-a96c-a94e4fc293af",
          "name": "selectionReason",
          "label": "Selection reason",
          "icon": "IconMessageCircle"
        },
        {
          "universalIdentifier": "12b6b77e-31a8-508f-bf3c-f7b3077dcbd3",
          "name": "dealSummary",
          "label": "Deal summary",
          "icon": "IconFileDollar"
        },
        {
          "universalIdentifier": "640d0d05-246d-5005-b592-a28889852fbd",
          "name": "outcomeSummary",
          "label": "Outcome summary",
          "icon": "IconReportAnalytics"
        },
        {
          "universalIdentifier": "e9b9d246-f49e-5200-9819-0a4c9cd0d19a",
          "name": "outreachActions",
          "label": "Outreach actions",
          "icon": "IconSend",
          "relationTargetObjectMetadataUniversalIdentifier": "b4459926-2c01-560a-8432-fa1974168439",
          "relationTargetFieldMetadataUniversalIdentifier": "64617f40-1f95-54cf-be64-ff57c72df280",
          "universalSettings": {}
        }
      ]
    },
    {
      "universalIdentifier": "9a09d54a-d464-5692-ac74-70527fb00ddd",
      "nameSingular": "campaign",
      "namePlural": "campaigns",
      "labelSingular": "Campaign",
      "labelPlural": "Campaigns",
      "description": "A creator campaign organized by objective and target audience",
      "icon": "IconTargetArrow",
      "labelIdentifierFieldMetadataUniversalIdentifier": "63c56aea-35db-5733-9d3a-d062544ac897",
      "fields": [
        {
          "universalIdentifier": "63c56aea-35db-5733-9d3a-d062544ac897",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "9d3c6d96-896d-51d1-b6d2-5d6b2e333e87",
          "name": "status",
          "label": "Status",
          "icon": "IconProgress"
        },
        {
          "universalIdentifier": "e22687bb-2633-573f-bd80-c4b13e80d966",
          "name": "objective",
          "label": "Objective",
          "icon": "IconTarget"
        },
        {
          "universalIdentifier": "877f9622-775c-52c1-9869-4abf14161de0",
          "name": "targetPlatforms",
          "label": "Target platforms",
          "icon": "IconApps"
        },
        {
          "universalIdentifier": "3e4bc999-fad4-59c2-9e38-046c33e26f2b",
          "name": "targetDemographics",
          "label": "Target demographics",
          "icon": "IconUsersGroup"
        },
        {
          "universalIdentifier": "86ac6e3d-ef0e-5ee3-a8b6-e8a22756f81c",
          "name": "icpGoal",
          "label": "ICP goal",
          "icon": "IconSparkles"
        },
        {
          "universalIdentifier": "97377e2b-ec51-5fef-891e-b2202cc69512",
          "name": "budgetNotes",
          "label": "Budget notes",
          "icon": "IconCash"
        },
        {
          "universalIdentifier": "894c80f2-a478-5680-8c20-c7a86aa24fde",
          "name": "campaignCreators",
          "label": "Campaign creators",
          "icon": "IconUsersGroup",
          "relationTargetObjectMetadataUniversalIdentifier": "f9f0d7a8-7e05-519b-b158-5f543f7a7e9a",
          "relationTargetFieldMetadataUniversalIdentifier": "27ecf86e-08a4-5084-91d7-d305ab3363e1",
          "universalSettings": {}
        },
        {
          "universalIdentifier": "1d33699f-76f3-5247-98b3-2de588543364",
          "name": "offers",
          "label": "Offers",
          "icon": "IconGift",
          "relationTargetObjectMetadataUniversalIdentifier": "fd8a37b8-72db-5069-902a-a1763ddc63f7",
          "relationTargetFieldMetadataUniversalIdentifier": "f8ea43b0-33f8-5071-9e6d-5b787fb4e043",
          "universalSettings": {}
        },
        {
          "universalIdentifier": "40b7c827-4699-5f99-bdb8-d8906dd948f5",
          "name": "outreachSequences",
          "label": "Outreach sequences",
          "icon": "IconRoute",
          "relationTargetObjectMetadataUniversalIdentifier": "0446497e-3240-5a78-a02f-e08594e5c2af",
          "relationTargetFieldMetadataUniversalIdentifier": "75b56b0d-b69d-50fd-8f36-bfd3fa8d9237",
          "universalSettings": {}
        }
      ]
    },
    {
      "universalIdentifier": "e004c4b4-b1e1-59d9-b096-9fc57875d47f",
      "nameSingular": "creatorListMember",
      "namePlural": "creatorListMembers",
      "labelSingular": "Creator List Member",
      "labelPlural": "Creator List Members",
      "description": "A creator captured inside a curated creator list",
      "icon": "IconUserPlus",
      "labelIdentifierFieldMetadataUniversalIdentifier": "7924764c-9378-5299-8b68-7757e6af35c2",
      "fields": [
        {
          "universalIdentifier": "7924764c-9378-5299-8b68-7757e6af35c2",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "a8014e8c-e50a-547a-9f01-973d685314ec",
          "name": "creator",
          "label": "Creator",
          "icon": "IconUserStar",
          "relationTargetObjectMetadataUniversalIdentifier": "5ca82f72-9778-4ae1-8a8e-9b762c4ce0de",
          "relationTargetFieldMetadataUniversalIdentifier": "32db62ac-6217-5316-89d9-f9d7290dff70",
          "universalSettings": {
            "joinColumnName": "creatorId"
          }
        },
        {
          "universalIdentifier": "c84e31a5-ba66-5773-a2da-2b1c357257c5",
          "name": "creatorList",
          "label": "Creator List",
          "icon": "IconListDetails",
          "relationTargetObjectMetadataUniversalIdentifier": "d51f2758-055b-5367-8250-859cb3f58631",
          "relationTargetFieldMetadataUniversalIdentifier": "ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df",
          "universalSettings": {
            "joinColumnName": "creatorListId"
          }
        },
        {
          "universalIdentifier": "cec1e32c-db2c-53fa-b0ad-4bbbce951ae2",
          "name": "source",
          "label": "Source",
          "icon": "IconDatabaseImport"
        },
        {
          "universalIdentifier": "bb1651d8-de78-5a22-8ac3-7c1f4d631819",
          "name": "notes",
          "label": "Notes",
          "icon": "IconNotes"
        }
      ]
    },
    {
      "universalIdentifier": "d51f2758-055b-5367-8250-859cb3f58631",
      "nameSingular": "creatorList",
      "namePlural": "creatorLists",
      "labelSingular": "Creator List",
      "labelPlural": "Creator Lists",
      "description": "A reusable imported or curated creator cohort",
      "icon": "IconListDetails",
      "labelIdentifierFieldMetadataUniversalIdentifier": "e19694f0-0c78-566e-ab95-63f0488848f3",
      "fields": [
        {
          "universalIdentifier": "e19694f0-0c78-566e-ab95-63f0488848f3",
          "name": "name",
          "label": "Name",
          "icon": "IconTag",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "1b27dc7c-0f11-5b2a-b81f-708dc785b6fa",
          "name": "source",
          "label": "Source",
          "icon": "IconDatabaseImport"
        },
        {
          "universalIdentifier": "1a4485a2-1e44-51af-bfdc-666cdcf17223",
          "name": "description",
          "label": "Description",
          "icon": "IconFileDescription"
        },
        {
          "universalIdentifier": "ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df",
          "name": "members",
          "label": "Members",
          "icon": "IconUsersGroup",
          "relationTargetObjectMetadataUniversalIdentifier": "e004c4b4-b1e1-59d9-b096-9fc57875d47f",
          "relationTargetFieldMetadataUniversalIdentifier": "c84e31a5-ba66-5773-a2da-2b1c357257c5",
          "universalSettings": {}
        }
      ]
    },
    {
      "universalIdentifier": "5ca82f72-9778-4ae1-8a8e-9b762c4ce0de",
      "nameSingular": "creator",
      "namePlural": "creators",
      "labelSingular": "Creator",
      "labelPlural": "Creators",
      "description": "A creator profile imported from influencer discovery sources",
      "icon": "IconUserStar",
      "labelIdentifierFieldMetadataUniversalIdentifier": "c3d4cafc-73ec-5d13-8fe9-cbcbd0eca899",
      "fields": [
        {
          "universalIdentifier": "c3d4cafc-73ec-5d13-8fe9-cbcbd0eca899",
          "name": "name",
          "label": "Name",
          "icon": "IconUser",
          "defaultValue": "''"
        },
        {
          "universalIdentifier": "c4bccf25-cfd1-5648-918e-bf20b32ed375",
          "name": "email",
          "label": "Email",
          "icon": "IconMail"
        },
        {
          "universalIdentifier": "ccdc5be6-6c2b-5920-acd8-fa0ad52eeb29",
          "name": "phone",
          "label": "Phone",
          "icon": "IconPhone"
        },
        {
          "universalIdentifier": "48ea973f-0a2b-5650-910b-6e0c5b4b34ce",
          "name": "location",
          "label": "Location",
          "icon": "IconMapPin"
        },
        {
          "universalIdentifier": "54971f3a-9443-51e1-94d7-ca76e9889f08",
          "name": "language",
          "label": "Language",
          "icon": "IconLanguage"
        },
        {
          "universalIdentifier": "ec240f13-8462-54ad-be55-b27275f0f58a",
          "name": "profileType",
          "label": "Profile type",
          "icon": "IconUserCheck",
          "defaultValue": "'CREATOR'",
          "options": [
            {
              "id": "b30587ac-a851-5d1f-bbd7-3b6752bf6b06",
              "value": "CREATOR",
              "label": "Creator",
              "color": "blue"
            },
            {
              "id": "3da75a71-bb21-584b-a20f-a21f2a9ea385",
              "value": "BRAND",
              "label": "Brand",
              "color": "purple"
            },
            {
              "id": "1fad4603-50ec-5cf7-b3a1-91660cf401db",
              "value": "AGENCY",
              "label": "Agency",
              "color": "orange"
            },
            {
              "id": "6d675a09-a811-592e-a23d-868ff646e990",
              "value": "MEDIA",
              "label": "Media",
              "color": "turquoise"
            }
          ]
        },
        {
          "universalIdentifier": "b887feac-6623-5e8f-b84e-bd502abb8972",
          "name": "creatorStatus",
          "label": "Creator status",
          "icon": "IconProgressCheck",
          "defaultValue": "'NEW'",
          "options": [
            {
              "id": "802d87dc-5d1f-5980-884c-b252f1bde49d",
              "value": "NEW",
              "label": "New",
              "color": "gray"
            },
            {
              "id": "e88ede68-e4c7-52a6-8bfd-8503201d1b6b",
              "value": "REVIEWING",
              "label": "Reviewing",
              "color": "blue"
            },
            {
              "id": "9cd50629-da4e-5f32-be91-74ceb77c538e",
              "value": "QUALIFIED",
              "label": "Qualified",
              "color": "green"
            },
            {
              "id": "06d55c97-1366-59bc-a205-f679b8e6d8d9",
              "value": "CONTACTED",
              "label": "Contacted",
              "color": "orange"
            },
            {
              "id": "d7f5c4f0-97a2-527c-91b0-86e42bc2349b",
              "value": "ARCHIVED",
              "label": "Archived",
              "color": "red"
            }
          ]
        },
        {
          "universalIdentifier": "22ad8e62-9b3c-5321-b1a1-8120a7566cd4",
          "name": "source",
          "label": "Source",
          "icon": "IconDatabaseImport"
        },
        {
          "universalIdentifier": "e1f69ece-5d51-5819-82d0-eff0eb752396",
          "name": "sourceUrl",
          "label": "Source URL",
          "icon": "IconLink"
        },
        {
          "universalIdentifier": "7ad7da3b-3d4f-5ebb-9f40-e4eaf5d01b5b",
          "name": "importSource",
          "label": "Import source",
          "icon": "IconFileImport"
        },
        {
          "universalIdentifier": "364b7d34-15e8-54f5-896c-c7d871dc3626",
          "name": "lastImportedAt",
          "label": "Last imported at",
          "icon": "IconCalendarImport"
        },
        {
          "universalIdentifier": "c6e8a5e1-5efd-5c91-a5ba-e5d0a30c7bbc",
          "name": "hasLinkInBio",
          "label": "Has link in bio",
          "icon": "IconLink"
        },
        {
          "universalIdentifier": "c4493bec-5da6-57bc-8a5c-bcad9d57cc86",
          "name": "hasBrandDeals",
          "label": "Has brand deals",
          "icon": "IconBriefcase"
        },
        {
          "universalIdentifier": "c9e348e1-803d-5e62-bd76-d3fe4f371b1e",
          "name": "promotesAffiliateLinks",
          "label": "Promotes affiliate links",
          "icon": "IconAffiliate"
        },
        {
          "universalIdentifier": "e0ec78f5-8453-58ef-ba4d-c6ff1c2dae76",
          "name": "hasMerch",
          "label": "Has merch",
          "icon": "IconShirt"
        },
        {
          "universalIdentifier": "5f918fd0-dbea-5c96-ac19-8cf69e358ae5",
          "name": "linksInBio",
          "label": "Links in bio",
          "icon": "IconLinks"
        },
        {
          "universalIdentifier": "27e916a0-3331-5239-8e46-2aa0461fc9f8",
          "name": "externalUrls",
          "label": "External URLs",
          "icon": "IconExternalLink"
        },
        {
          "universalIdentifier": "f06e2a81-794f-5afd-ae94-f02df347b5a0",
          "name": "hashtagsUsed",
          "label": "Hashtags used",
          "icon": "IconHash"
        },
        {
          "universalIdentifier": "f2b6b04b-c3a7-5440-9915-52deef3d0f17",
          "name": "categories",
          "label": "Categories",
          "icon": "IconCategory"
        },
        {
          "universalIdentifier": "825176a0-bedd-54a5-8fd7-b98b5a81e3d0",
          "name": "niches",
          "label": "Niches",
          "icon": "IconTags"
        },
        {
          "universalIdentifier": "465d4f65-450f-507c-82b3-be142f608885",
          "name": "notes",
          "label": "Notes",
          "icon": "IconNotes"
        },
        {
          "universalIdentifier": "8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b",
          "name": "instagramUrl",
          "label": "Instagram URL",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "1186d5b4-385f-5566-a4ba-87b8f65cdee5",
          "name": "instagramUsername",
          "label": "Instagram username",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "d383c2c2-9617-548f-a0ab-266b7dbe0789",
          "name": "instagramBio",
          "label": "Instagram bio",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "8b74efdb-518f-5826-bacf-a0fdc34e19ff",
          "name": "instagramFollowerCount",
          "label": "Instagram follower count",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "b2eaec35-b0ef-57cf-8010-e6c51ee3caba",
          "name": "instagramEngagementPercent",
          "label": "Instagram engagement percent",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "6f73e724-4e44-5663-a0f7-596cb363ad9b",
          "name": "instagramMostRecentPostDate",
          "label": "Instagram most recent post date",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "3d47e3bd-dbcb-5204-b5f0-a42b002ac95c",
          "name": "instagramMediaCount",
          "label": "Instagram media count",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "3574c8db-eb8f-58af-853e-fdc6e049a0d3",
          "name": "instagramAvgLikes",
          "label": "Instagram average likes",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "663c7e77-5a0b-5aa5-877b-def51bcc81dc",
          "name": "instagramAvgComments",
          "label": "Instagram average comments",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "1be6555f-4544-53cc-95bb-d196fa6cf820",
          "name": "instagramReelsPercent",
          "label": "Instagram reels percent",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "53db1f45-e030-5dbd-8f87-e124dcbe3786",
          "name": "instagramReelsAvgViewCount",
          "label": "Instagram reels average view count",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "e7525fa2-b583-5602-bafb-d93f68257a3c",
          "name": "instagramPostingFrequencyRecentMonths",
          "label": "Instagram posting frequency recent months",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "8568c880-be20-52fb-ae4d-d93520f77fc2",
          "name": "instagramEstimatedIncomeMin",
          "label": "Instagram estimated income min",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "5b4b9184-7df7-54e6-8b10-2b706d6cec26",
          "name": "instagramEstimatedIncomeMax",
          "label": "Instagram estimated income max",
          "icon": "IconBrandInstagram"
        },
        {
          "universalIdentifier": "e2b3b717-5d83-5dde-bb47-42c3a6cc6f31",
          "name": "tiktokUrl",
          "label": "TikTok URL",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "3db5e356-13b9-539d-8320-7c6606e3c574",
          "name": "tiktokUsername",
          "label": "TikTok username",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "52162ce6-20b6-536d-b6b1-c21271c96006",
          "name": "tiktokBio",
          "label": "TikTok bio",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "37078d35-ad1a-5804-bd6c-b7b6b7a332f7",
          "name": "tiktokFollowerCount",
          "label": "TikTok follower count",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "4d1c28ec-c011-5aea-a13e-3d75ac6c6447",
          "name": "tiktokMostRecentPostDate",
          "label": "TikTok most recent post date",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "e56f72b8-cf14-5549-9d5c-9f9ff8c8bc02",
          "name": "tiktokEngagementPercent",
          "label": "TikTok engagement percent",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "b4d417cb-9a24-50fb-b0f5-8d98732f54b6",
          "name": "tiktokVideoCount",
          "label": "TikTok video count",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "4d8bee01-c6bb-5c0c-8943-5233c01e2489",
          "name": "tiktokPlayCountMedian",
          "label": "TikTok median play count",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "535a8720-43ea-5b25-9cac-4bcf26fddc7b",
          "name": "tiktokAvgLikes",
          "label": "TikTok average likes",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "a0bf2b36-21a3-5d68-84e2-d5c8ae256593",
          "name": "tiktokAvgComments",
          "label": "TikTok average comments",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "414e5ecf-cca5-55f7-89c6-3aa94b78b954",
          "name": "tiktokAvgDownloads",
          "label": "TikTok average downloads",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "cdce06f2-f7d6-5587-8ea9-02e58c0d6b47",
          "name": "tiktokPostingFrequencyRecentMonths",
          "label": "TikTok posting frequency recent months",
          "icon": "IconBrandTiktok"
        },
        {
          "universalIdentifier": "af645cc7-31fc-5175-af8d-427845ebe1ed",
          "name": "youtubeUrl",
          "label": "YouTube URL",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "cba072b8-6758-5eaa-bc1c-72e94a75b112",
          "name": "youtubeCustomUrl",
          "label": "YouTube custom URL",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "6430e3f1-71aa-5b6a-bc7a-b635d4f2c3ab",
          "name": "youtubeTitle",
          "label": "YouTube title",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "bdaf9a54-8931-5e51-836f-eb1cf6b11fcb",
          "name": "youtubeDescription",
          "label": "YouTube description",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "f82741c8-5e43-5ac0-bebc-75b0edb2e3a2",
          "name": "youtubeTopicDetails",
          "label": "YouTube topic details",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "047c19e7-43aa-557c-b1a9-5b1824a26c5e",
          "name": "youtubeSubscriberCount",
          "label": "YouTube subscriber count",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "7ce4f52f-6963-5b4c-b012-21dbdd723048",
          "name": "youtubeLastUploadDate",
          "label": "YouTube last upload date",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "4cc3ad51-3ca3-5044-b09f-1b57ba0c927e",
          "name": "youtubeLastStreamUploadDate",
          "label": "YouTube last stream upload date",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "784644f6-24bb-5955-b2bc-557b17f6f07c",
          "name": "youtubeShortsPercentage",
          "label": "YouTube Shorts percentage",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "162a494a-9981-5b6f-b131-3ff7dae5cc95",
          "name": "youtubeVideoCount",
          "label": "YouTube video count",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "77684c8c-d06b-50a9-a404-ea58ca2d8fd3",
          "name": "youtubeEngagementPercent",
          "label": "YouTube engagement percent",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "536e5718-d023-58e8-99b7-35d5f2759e69",
          "name": "youtubeAvgViewsLong",
          "label": "YouTube average long views",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "8077992b-d61d-5176-a166-c6933469b56b",
          "name": "youtubeAvgViewsShorts",
          "label": "YouTube average Shorts views",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "296f47d1-e288-5d15-95b9-ea750532c05a",
          "name": "youtubeAvgStreamViews",
          "label": "YouTube average stream views",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "972f8c77-ffe7-5385-9b38-4128a8ac5d98",
          "name": "youtubeAvgStreamDuration",
          "label": "YouTube average stream duration",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "7a7775dd-23ba-58d3-a9c6-455cdee72e72",
          "name": "youtubePostingFrequencyRecentMonths",
          "label": "YouTube posting frequency recent months",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "461e1478-1109-58b6-b9bf-ae2d6aa7cb99",
          "name": "youtubeEstimatedIncomeMin",
          "label": "YouTube estimated income min",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "1ed40657-e379-5a8f-8295-b7e1c072be68",
          "name": "youtubeEstimatedIncomeMax",
          "label": "YouTube estimated income max",
          "icon": "IconBrandYoutube"
        },
        {
          "universalIdentifier": "bbfda234-327c-5d9d-ac39-8a33fd06779d",
          "name": "twitterUrl",
          "label": "Twitter URL",
          "icon": "IconBrandX"
        },
        {
          "universalIdentifier": "cba84727-9219-502a-9880-a14bee741515",
          "name": "twitterUsername",
          "label": "Twitter username",
          "icon": "IconBrandX"
        },
        {
          "universalIdentifier": "b286bdf2-3024-575d-b852-adf935061749",
          "name": "twitterBio",
          "label": "Twitter bio",
          "icon": "IconBrandX"
        },
        {
          "universalIdentifier": "269f07b6-b2a8-551c-b23e-b44dd95e1e36",
          "name": "twitterFollowerCount",
          "label": "Twitter follower count",
          "icon": "IconBrandX"
        },
        {
          "universalIdentifier": "701fa901-6773-5637-b5d2-c85fdd4a34e7",
          "name": "twitterEngagementPercent",
          "label": "Twitter engagement percent",
          "icon": "IconBrandX"
        },
        {
          "universalIdentifier": "fa743d1a-aa43-5976-b6b2-8131a533ae5b",
          "name": "twitchUrl",
          "label": "Twitch URL",
          "icon": "IconBrandTwitch"
        },
        {
          "universalIdentifier": "789717de-3c12-59c3-b91a-ca4a70d00886",
          "name": "twitchUsername",
          "label": "Twitch username",
          "icon": "IconBrandTwitch"
        },
        {
          "universalIdentifier": "f10ed5aa-ff19-5cbe-b176-ae4bf642edf1",
          "name": "twitchDisplayName",
          "label": "Twitch display name",
          "icon": "IconBrandTwitch"
        },
        {
          "universalIdentifier": "a996b7a6-aeee-523a-b90f-30416891e37e",
          "name": "twitchTotalFollowers",
          "label": "Twitch total followers",
          "icon": "IconBrandTwitch"
        },
        {
          "universalIdentifier": "32db62ac-6217-5316-89d9-f9d7290dff70",
          "name": "listMemberships",
          "label": "List memberships",
          "icon": "IconListDetails",
          "relationTargetObjectMetadataUniversalIdentifier": "e004c4b4-b1e1-59d9-b096-9fc57875d47f",
          "relationTargetFieldMetadataUniversalIdentifier": "a8014e8c-e50a-547a-9f01-973d685314ec",
          "universalSettings": {}
        },
        {
          "universalIdentifier": "3b9494ff-0fe7-5492-8b69-c515f79ea437",
          "name": "campaignCreators",
          "label": "Campaign creators",
          "icon": "IconTargetArrow",
          "relationTargetObjectMetadataUniversalIdentifier": "f9f0d7a8-7e05-519b-b158-5f543f7a7e9a",
          "relationTargetFieldMetadataUniversalIdentifier": "730b323f-fae3-57e2-8e2e-62963106850a",
          "universalSettings": {}
        },
        {
          "universalIdentifier": "d68083f5-0db1-5c77-ac35-640a2fdb1f3f",
          "name": "patreonUrl",
          "label": "Patreon URL",
          "icon": "IconBrandPatreon"
        }
      ]
    }
  ],
  "fields": [
    {
      "universalIdentifier": "3cb59cb6-8ef0-4608-bc1a-872e888a60ed",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "name": "targetPageLinks",
      "label": "Incoming Links",
      "relationTargetObjectMetadataUniversalIdentifier": "f99ff6bc-3b56-4600-beb3-cfc2c23364f6",
      "relationTargetFieldMetadataUniversalIdentifier": "93ed2052-7d48-4a60-b43f-f0a07ccdf1ff",
      "universalSettings": {}
    },
    {
      "universalIdentifier": "93ed2052-7d48-4a60-b43f-f0a07ccdf1ff",
      "objectUniversalIdentifier": "f99ff6bc-3b56-4600-beb3-cfc2c23364f6",
      "name": "targetPage",
      "label": "Target Page",
      "relationTargetObjectMetadataUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "relationTargetFieldMetadataUniversalIdentifier": "3cb59cb6-8ef0-4608-bc1a-872e888a60ed",
      "universalSettings": {
        "joinColumnName": "targetPageId"
      }
    },
    {
      "universalIdentifier": "da4861d8-2d29-498d-8a70-62461022dbfd",
      "objectUniversalIdentifier": "facac4a1-0a2f-469f-9f1f-81ef01f06578",
      "name": "targetPage",
      "label": "Target Page",
      "relationTargetObjectMetadataUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "relationTargetFieldMetadataUniversalIdentifier": "4fd149a3-b506-45f8-94c4-970a3106eccf",
      "universalSettings": {
        "joinColumnName": "targetPageId"
      }
    },
    {
      "universalIdentifier": "4fd149a3-b506-45f8-94c4-970a3106eccf",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "name": "updateProposals",
      "label": "Update Proposals",
      "relationTargetObjectMetadataUniversalIdentifier": "facac4a1-0a2f-469f-9f1f-81ef01f06578",
      "relationTargetFieldMetadataUniversalIdentifier": "da4861d8-2d29-498d-8a70-62461022dbfd",
      "universalSettings": {}
    },
    {
      "universalIdentifier": "0bbf483c-9c52-4286-9427-a14058456611",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "name": "childPages",
      "label": "Child Pages",
      "relationTargetObjectMetadataUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "relationTargetFieldMetadataUniversalIdentifier": "62f3e27e-3c6c-4449-9d81-2b24501f5e3f",
      "universalSettings": {}
    },
    {
      "universalIdentifier": "62f3e27e-3c6c-4449-9d81-2b24501f5e3f",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "name": "parentPage",
      "label": "Parent Page",
      "relationTargetObjectMetadataUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "relationTargetFieldMetadataUniversalIdentifier": "0bbf483c-9c52-4286-9427-a14058456611",
      "universalSettings": {
        "joinColumnName": "parentPageId"
      }
    },
    {
      "universalIdentifier": "776301dc-08a6-4692-b9b8-f427f040085b",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "name": "sourcePageLinks",
      "label": "Outgoing Links",
      "relationTargetObjectMetadataUniversalIdentifier": "f99ff6bc-3b56-4600-beb3-cfc2c23364f6",
      "relationTargetFieldMetadataUniversalIdentifier": "94d2f0e6-0915-40e3-bc40-b1a6336dc16a",
      "universalSettings": {}
    },
    {
      "universalIdentifier": "94d2f0e6-0915-40e3-bc40-b1a6336dc16a",
      "objectUniversalIdentifier": "f99ff6bc-3b56-4600-beb3-cfc2c23364f6",
      "name": "sourcePage",
      "label": "Source Page",
      "relationTargetObjectMetadataUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "relationTargetFieldMetadataUniversalIdentifier": "776301dc-08a6-4692-b9b8-f427f040085b",
      "universalSettings": {
        "joinColumnName": "sourcePageId"
      }
    }
  ],
  "views": [
    {
      "universalIdentifier": "2774101b-3c0b-485b-91f5-b92d30bdcb6e",
      "name": "Brand Brain Page Record Fields",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "fields": [
        {
          "universalIdentifier": "cecbfcb2-318d-48b0-ab64-59a25fb213e5",
          "fieldMetadataUniversalIdentifier": "e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d"
        },
        {
          "universalIdentifier": "cb99eb49-2960-4b98-b4f0-ef70add64f79",
          "fieldMetadataUniversalIdentifier": "8e9bbffa-807a-4e0d-9fb1-f3deec6183cf"
        },
        {
          "universalIdentifier": "668d5313-ddc4-4815-93f9-d8f60b4fa550",
          "fieldMetadataUniversalIdentifier": "4452d201-44a5-46fc-bf11-e26fa85cc3b2"
        },
        {
          "universalIdentifier": "c42cf06d-eaae-4bfe-8108-20887dd0d8c4",
          "fieldMetadataUniversalIdentifier": "3b78e6d5-d9ed-432f-b3f6-d5d6bdb82d99"
        },
        {
          "universalIdentifier": "f0b70304-4119-4a91-aef6-9d7108a332fe",
          "fieldMetadataUniversalIdentifier": "b044e1f3-94f4-4d65-93a3-5082e317f5e1"
        },
        {
          "universalIdentifier": "5658f977-d711-46ce-8563-a73dbe6a8d0b",
          "fieldMetadataUniversalIdentifier": "7f963c23-90c8-44b3-b488-b137e6e358a9"
        },
        {
          "universalIdentifier": "79c4d8b0-f4bb-43ff-bb06-c4d374be9130",
          "fieldMetadataUniversalIdentifier": "f9194806-a2c6-4f03-a351-09b4546ce2ed"
        },
        {
          "universalIdentifier": "c3bde970-bc8e-41d5-bad0-b710c548496d",
          "fieldMetadataUniversalIdentifier": "62f3e27e-3c6c-4449-9d81-2b24501f5e3f"
        },
        {
          "universalIdentifier": "16f5c397-468a-47c0-b704-a850d11e87a0",
          "fieldMetadataUniversalIdentifier": "0bbf483c-9c52-4286-9427-a14058456611"
        },
        {
          "universalIdentifier": "cbdac244-5a78-4ff0-a28a-011b444b9412",
          "fieldMetadataUniversalIdentifier": "776301dc-08a6-4692-b9b8-f427f040085b"
        },
        {
          "universalIdentifier": "4f02dd57-6875-449b-a0c5-e6ca23f8f53b",
          "fieldMetadataUniversalIdentifier": "3cb59cb6-8ef0-4608-bc1a-872e888a60ed"
        }
      ]
    },
    {
      "universalIdentifier": "25d4c1a3-b315-4c2c-b95e-04f3bcb90807",
      "name": "Pending Brand Brain Proposals",
      "objectUniversalIdentifier": "facac4a1-0a2f-469f-9f1f-81ef01f06578",
      "icon": "IconFilePencil",
      "fields": [
        {
          "universalIdentifier": "64c4da41-f1a4-43a8-9f03-a155fa3963bf",
          "fieldMetadataUniversalIdentifier": "e4418f8c-6f74-4d03-8c61-93c17848c2dc"
        },
        {
          "universalIdentifier": "600ea605-7496-4602-a2cb-ddb38c230fd6",
          "fieldMetadataUniversalIdentifier": "5601c017-6a85-4211-b2b2-9fda0bf9f0c6"
        },
        {
          "universalIdentifier": "9a3bd420-c63d-479d-bb86-d4d25f7a9832",
          "fieldMetadataUniversalIdentifier": "5d00b029-7a0d-4320-acf4-036a634a44ab"
        },
        {
          "universalIdentifier": "f078acbb-e143-46f4-9b27-926315811539",
          "fieldMetadataUniversalIdentifier": "6a5f0131-32c8-41a2-968c-1dd429071f18"
        },
        {
          "universalIdentifier": "1118b32e-5e02-4955-9bff-86cc6e3884d3",
          "fieldMetadataUniversalIdentifier": "cf1caf3f-e423-43e6-bd47-62a27bb513e2"
        }
      ],
      "filters": [
        {
          "universalIdentifier": "bb759248-7330-4730-b4a8-0752df10ab14",
          "fieldMetadataUniversalIdentifier": "5d00b029-7a0d-4320-acf4-036a634a44ab",
          "value": [
            "PENDING"
          ]
        }
      ]
    },
    {
      "universalIdentifier": "914bd2ad-17e0-48f2-a6da-38f94b92be9d",
      "name": "All Brand Brain",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "icon": "IconNotebook",
      "fields": [
        {
          "universalIdentifier": "7c821735-92b0-417a-a4c6-b1c2d940a813",
          "fieldMetadataUniversalIdentifier": "e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d"
        },
        {
          "universalIdentifier": "fa092416-394c-4d01-8252-452249e445c2",
          "fieldMetadataUniversalIdentifier": "4452d201-44a5-46fc-bf11-e26fa85cc3b2"
        },
        {
          "universalIdentifier": "b57ef565-d393-4777-921c-5aa0a2166033",
          "fieldMetadataUniversalIdentifier": "b044e1f3-94f4-4d65-93a3-5082e317f5e1"
        },
        {
          "universalIdentifier": "3a621e09-bc66-4881-aa7c-d1ed0086de82",
          "fieldMetadataUniversalIdentifier": "7f963c23-90c8-44b3-b488-b137e6e358a9"
        }
      ]
    },
    {
      "universalIdentifier": "5865bdbf-be33-5457-9d91-184885276b94",
      "name": "Campaigns",
      "icon": "IconTargetArrow",
      "objectUniversalIdentifier": "9a09d54a-d464-5692-ac74-70527fb00ddd",
      "fields": [
        {
          "universalIdentifier": "ead80d6b-300a-5edc-b03e-7cce7f3fecc4",
          "fieldMetadataUniversalIdentifier": "63c56aea-35db-5733-9d3a-d062544ac897"
        },
        {
          "universalIdentifier": "8ce2c107-f484-5525-8f45-b7f4c9d32683",
          "fieldMetadataUniversalIdentifier": "9d3c6d96-896d-51d1-b6d2-5d6b2e333e87"
        },
        {
          "universalIdentifier": "4d438e45-9995-5b0f-b9eb-ed916870f280",
          "fieldMetadataUniversalIdentifier": "e22687bb-2633-573f-bd80-c4b13e80d966"
        },
        {
          "universalIdentifier": "66f84b3e-c870-5180-b345-490897ce4cd2",
          "fieldMetadataUniversalIdentifier": "877f9622-775c-52c1-9869-4abf14161de0"
        },
        {
          "universalIdentifier": "dacf7682-7297-5319-b86d-6cb137f9ddb2",
          "fieldMetadataUniversalIdentifier": "86ac6e3d-ef0e-5ee3-a8b6-e8a22756f81c"
        }
      ]
    },
    {
      "universalIdentifier": "1bc58554-efb5-52e4-8e2a-7f522a1c453c",
      "name": "Creator Lists",
      "icon": "IconListDetails",
      "objectUniversalIdentifier": "d51f2758-055b-5367-8250-859cb3f58631",
      "fields": [
        {
          "universalIdentifier": "8b68fcb0-490d-5414-9b67-abf9e858908b",
          "fieldMetadataUniversalIdentifier": "e19694f0-0c78-566e-ab95-63f0488848f3"
        },
        {
          "universalIdentifier": "ce532f04-7846-52b2-9d6b-cd9305f767e2",
          "fieldMetadataUniversalIdentifier": "1b27dc7c-0f11-5b2a-b81f-708dc785b6fa"
        },
        {
          "universalIdentifier": "a9084da4-53a4-5af9-b078-480a6878d74c",
          "fieldMetadataUniversalIdentifier": "1a4485a2-1e44-51af-bfdc-666cdcf17223"
        }
      ]
    },
    {
      "universalIdentifier": "a5abdae3-d86a-51d3-9b04-2dc21c172c3e",
      "name": "Creators",
      "icon": "IconUserStar",
      "objectUniversalIdentifier": "5ca82f72-9778-4ae1-8a8e-9b762c4ce0de",
      "fields": [
        {
          "universalIdentifier": "1ee6e143-3bf6-58cc-b55c-e7bd8b9cb4d0"
        },
        {
          "universalIdentifier": "d779e826-cf8c-5e36-9685-0f9a6989142d"
        },
        {
          "universalIdentifier": "566647f6-312a-5357-adb9-a98c084989b3"
        },
        {
          "universalIdentifier": "77c1fa17-1566-59d6-9a1f-6597537c72c0"
        },
        {
          "universalIdentifier": "2856cfb7-33c3-5441-a871-85c09cd34688"
        },
        {
          "universalIdentifier": "b9998544-50cc-50a0-af98-598c3922ab11"
        },
        {
          "universalIdentifier": "0025c07e-7109-5f5f-b9ef-694abb133ec8"
        },
        {
          "universalIdentifier": "7c46192c-272b-504b-aa1d-1048151b9943"
        },
        {
          "universalIdentifier": "eeebe69a-8c33-55ad-8375-ae0f7c68f9c5"
        },
        {
          "universalIdentifier": "d5777661-6233-54e2-b073-6328a904d139"
        },
        {
          "universalIdentifier": "72826aa0-29d6-5363-83d9-353819828b71"
        },
        {
          "universalIdentifier": "c2581172-2575-532c-8975-a79e55188fab"
        }
      ]
    }
  ],
  "nav": [
    {
      "universalIdentifier": "43f7a291-b0a4-481d-a5e4-b557e1a8f65d",
      "targetObjectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f"
    },
    {
      "universalIdentifier": "a1556a2b-8c0a-570a-a902-38827cadc867",
      "icon": "IconTargetArrow",
      "viewUniversalIdentifier": "5865bdbf-be33-5457-9d91-184885276b94"
    },
    {
      "universalIdentifier": "c124f0aa-7836-5242-ac52-e8667e0ed4f7",
      "icon": "IconListDetails",
      "viewUniversalIdentifier": "1bc58554-efb5-52e4-8e2a-7f522a1c453c"
    },
    {
      "universalIdentifier": "d06225df-32da-5c5d-b5d1-2b8d48fdca1c",
      "icon": "IconUserStar",
      "viewUniversalIdentifier": "a5abdae3-d86a-51d3-9b04-2dc21c172c3e"
    }
  ],
  "layouts": [
    {
      "universalIdentifier": "c8e159f8-1815-4138-9203-c29f59703386",
      "name": "Brand Brain Page Record Page",
      "type": "RECORD_PAGE",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "tabs": [
        {
          "universalIdentifier": "221532a5-ac54-4a46-ae75-88e095f4633f",
          "title": "Fields",
          "icon": "IconHome",
          "widgets": [
            {
              "universalIdentifier": "ca066d67-d7a5-4951-9674-8a25d5710387",
              "title": "Fields",
              "type": "FIELDS",
              "configuration": {
                "configurationType": "FIELDS",
                "viewUniversalIdentifier": "2774101b-3c0b-485b-91f5-b92d30bdcb6e"
              }
            }
          ]
        },
        {
          "universalIdentifier": "74e295f0-ea2e-4c47-b1b4-6d9a77f8ebc9",
          "title": "Timeline",
          "icon": "IconTimelineEvent",
          "widgets": [
            {
              "universalIdentifier": "10aef0fb-a7dd-49d2-b818-5f167ba29091",
              "title": "Timeline",
              "type": "TIMELINE",
              "configuration": {
                "configurationType": "TIMELINE"
              }
            }
          ]
        },
        {
          "universalIdentifier": "14a3d605-51dc-4197-99b6-1f8415316ac1",
          "title": "Notes",
          "icon": "IconNotes",
          "widgets": [
            {
              "universalIdentifier": "8c7fb069-9866-4333-895b-5e5ad5d2d835",
              "title": "Notes",
              "type": "NOTES",
              "configuration": {
                "configurationType": "NOTES"
              }
            }
          ]
        }
      ]
    }
  ],
  "indexes": [
    {
      "universalIdentifier": "b75fa72e-7365-4da0-a910-b6ef96f306c2",
      "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
      "fields": [
        {
          "universalIdentifier": "30cf8266-372a-44b7-bdf5-f1188b168d6a",
          "fieldUniversalIdentifier": "4452d201-44a5-46fc-bf11-e26fa85cc3b2"
        }
      ]
    }
  ],
  "roles": [
    {
      "universalIdentifier": "8563f1a9-4e02-408a-a5d7-45f68779023a",
      "label": "Brand Brain Admin",
      "description": "Can manage Brand Brain pages and links in the local MVP.",
      "icon": "IconNotebook",
      "objectPermissions": [
        {
          "objectUniversalIdentifier": "6a8289d7-8034-4f70-b3fa-47bc0e52828f"
        },
        {
          "objectUniversalIdentifier": "f99ff6bc-3b56-4600-beb3-cfc2c23364f6"
        }
      ]
    },
    {
      "universalIdentifier": "802cf87a-e4c5-559b-89c5-2172e3e5cc2f"
    }
  ]
} as const;
