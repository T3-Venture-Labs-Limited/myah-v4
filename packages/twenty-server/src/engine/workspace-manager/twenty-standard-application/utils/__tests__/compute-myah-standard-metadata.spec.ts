import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const result = computeTwentyStandardApplicationAllFlatEntityMaps({ now: '2026-07-14T00:00:00.000Z', workspaceId: '00000000-0000-4000-8000-000000000001', twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002' });

const EXPECTED_OBJECTS = [
  "0446497e-3240-5a78-a02f-e08594e5c2af",
  "5ca82f72-9778-4ae1-8a8e-9b762c4ce0de",
  "6a8289d7-8034-4f70-b3fa-47bc0e52828f",
  "843aa6c8-36af-5906-8241-4017c4188df7",
  "9a09d54a-d464-5692-ac74-70527fb00ddd",
  "b4459926-2c01-560a-8432-fa1974168439",
  "c25bfef3-4636-5864-a777-705238c91326",
  "d51f2758-055b-5367-8250-859cb3f58631",
  "e004c4b4-b1e1-59d9-b096-9fc57875d47f",
  "f99ff6bc-3b56-4600-beb3-cfc2c23364f6",
  "f9f0d7a8-7e05-519b-b158-5f543f7a7e9a",
  "facac4a1-0a2f-469f-9f1f-81ef01f06578",
  "fd8a37b8-72db-5069-902a-a1763ddc63f7"
] as const;

const EXPECTED_FIELDS = [
  "047c19e7-43aa-557c-b1a9-5b1824a26c5e",
  "064cf1aa-f26e-4397-8fd8-15d24b8c0122",
  "08137fbf-127b-472c-b3ea-2255f86a7db5",
  "0a3cd691-7971-45c3-8e8d-996d9b631c84",
  "0bbf483c-9c52-4286-9427-a14058456611",
  "1186d5b4-385f-5566-a4ba-87b8f65cdee5",
  "138f5749-c522-4c04-a55b-e23c29c3e188",
  "162a494a-9981-5b6f-b131-3ff7dae5cc95",
  "1be6555f-4544-53cc-95bb-d196fa6cf820",
  "1cc61a12-c3f0-43ef-904f-ed58c0a9f3c4",
  "1ed40657-e379-5a8f-8295-b7e1c072be68",
  "22ad8e62-9b3c-5321-b1a1-8120a7566cd4",
  "24d415b8-fc54-4c18-8cd8-0b5575d39e88",
  "251e1198-0de4-454f-83e7-1d6a451af3a8",
  "269f07b6-b2a8-551c-b23e-b44dd95e1e36",
  "27e916a0-3331-5239-8e46-2aa0461fc9f8",
  "296f47d1-e288-5d15-95b9-ea750532c05a",
  "2cf85c0b-8662-4de2-a2c4-63715358f931",
  "31fe27f7-a5cb-4590-95a0-f9247f490bb2",
  "322e4f8d-a9b7-4293-a596-5df62e3961e9",
  "3574c8db-eb8f-58af-853e-fdc6e049a0d3",
  "364b7d34-15e8-54f5-896c-c7d871dc3626",
  "37078d35-ad1a-5804-bd6c-b7b6b7a332f7",
  "3af080c7-b833-4c1e-923a-1edc70e0e93c",
  "3b78e6d5-d9ed-432f-b3f6-d5d6bdb82d99",
  "3cb59cb6-8ef0-4608-bc1a-872e888a60ed",
  "3d47e3bd-dbcb-5204-b5f0-a42b002ac95c",
  "3db5e356-13b9-539d-8320-7c6606e3c574",
  "414e5ecf-cca5-55f7-89c6-3aa94b78b954",
  "4452d201-44a5-46fc-bf11-e26fa85cc3b2",
  "461e1478-1109-58b6-b9bf-ae2d6aa7cb99",
  "465d4f65-450f-507c-82b3-be142f608885",
  "47617c1b-b0d0-44b4-8b5d-6c1f3dc365a2",
  "48ea973f-0a2b-5650-910b-6e0c5b4b34ce",
  "4cc3ad51-3ca3-5044-b09f-1b57ba0c927e",
  "4d1c28ec-c011-5aea-a13e-3d75ac6c6447",
  "4d8bee01-c6bb-5c0c-8943-5233c01e2489",
  "4e61f20b-6643-4307-913c-06696947aef8",
  "4fd149a3-b506-45f8-94c4-970a3106eccf",
  "51b3a48a-c9ed-4420-80d5-990ee5d0d4c9",
  "52162ce6-20b6-536d-b6b1-c21271c96006",
  "531d9732-7614-472c-ae02-8fc806d92c0a",
  "535a8720-43ea-5b25-9cac-4bcf26fddc7b",
  "536e5718-d023-58e8-99b7-35d5f2759e69",
  "53b7572c-26e9-4f2b-8372-2dfcbfd560ff",
  "53db1f45-e030-5dbd-8f87-e124dcbe3786",
  "54971f3a-9443-51e1-94d7-ca76e9889f08",
  "5601c017-6a85-4211-b2b2-9fda0bf9f0c6",
  "56a8c222-bc15-48e2-a608-4c40a791ac4b",
  "5b4b9184-7df7-54e6-8b10-2b706d6cec26",
  "5d00b029-7a0d-4320-acf4-036a634a44ab",
  "5f918fd0-dbea-5c96-ac19-8cf69e358ae5",
  "62f3e27e-3c6c-4449-9d81-2b24501f5e3f",
  "6430e3f1-71aa-5b6a-bc7a-b635d4f2c3ab",
  "663c7e77-5a0b-5aa5-877b-def51bcc81dc",
  "69fdb8eb-6fc3-46fc-a554-edeb13fff56b",
  "6a5f0131-32c8-41a2-968c-1dd429071f18",
  "6f73e724-4e44-5663-a0f7-596cb363ad9b",
  "701fa901-6773-5637-b5d2-c85fdd4a34e7",
  "776301dc-08a6-4692-b9b8-f427f040085b",
  "77684c8c-d06b-50a9-a404-ea58ca2d8fd3",
  "784644f6-24bb-5955-b2bc-557b17f6f07c",
  "789717de-3c12-59c3-b91a-ca4a70d00886",
  "7a7775dd-23ba-58d3-a9c6-455cdee72e72",
  "7ad7da3b-3d4f-5ebb-9f40-e4eaf5d01b5b",
  "7ce4f52f-6963-5b4c-b012-21dbdd723048",
  "7d4f06a5-8623-46a2-8780-7ab9cd337919",
  "7eeae3ef-e85f-431a-8889-562057d78e40",
  "7f963c23-90c8-44b3-b488-b137e6e358a9",
  "806a4b82-1fc8-43c4-b965-e5271c73b7bb",
  "8077992b-d61d-5176-a166-c6933469b56b",
  "825176a0-bedd-54a5-8fd7-b98b5a81e3d0",
  "83e84f56-a98b-4a36-92d7-23b2ea3160f1",
  "8568c880-be20-52fb-ae4d-d93520f77fc2",
  "8b74efdb-518f-5826-bacf-a0fdc34e19ff",
  "8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b",
  "8e9bbffa-807a-4e0d-9fb1-f3deec6183cf",
  "91ca184c-5274-4e1d-b960-07fe10b4e8f4",
  "93ed2052-7d48-4a60-b43f-f0a07ccdf1ff",
  "94d2f0e6-0915-40e3-bc40-b1a6336dc16a",
  "9688a814-290f-460f-9604-d5ffea3c78ac",
  "972f8c77-ffe7-5385-9b38-4128a8ac5d98",
  "a0bf2b36-21a3-5d68-84e2-d5c8ae256593",
  "a996b7a6-aeee-523a-b90f-30416891e37e",
  "af645cc7-31fc-5175-af8d-427845ebe1ed",
  "b044e1f3-94f4-4d65-93a3-5082e317f5e1",
  "b286bdf2-3024-575d-b852-adf935061749",
  "b2eaec35-b0ef-57cf-8010-e6c51ee3caba",
  "b366dc27-8151-4203-bc8d-55ae2013fbbe",
  "b4d417cb-9a24-50fb-b0f5-8d98732f54b6",
  "b5ab743d-6337-4c51-a7dc-56c28341e697",
  "b887feac-6623-5e8f-b84e-bd502abb8972",
  "bbfda234-327c-5d9d-ac39-8a33fd06779d",
  "bdaf9a54-8931-5e51-836f-eb1cf6b11fcb",
  "c3d4cafc-73ec-5d13-8fe9-cbcbd0eca899",
  "c4493bec-5da6-57bc-8a5c-bcad9d57cc86",
  "c4bccf25-cfd1-5648-918e-bf20b32ed375",
  "c6e8a5e1-5efd-5c91-a5ba-e5d0a30c7bbc",
  "c8de23d7-3b9e-4c63-9c7b-37b901eb5773",
  "c9e348e1-803d-5e62-bd76-d3fe4f371b1e",
  "caebc76e-47f1-4498-b2ad-8a0d6d28a469",
  "cba072b8-6758-5eaa-bc1c-72e94a75b112",
  "cba84727-9219-502a-9880-a14bee741515",
  "ccdc5be6-6c2b-5920-acd8-fa0ad52eeb29",
  "cdce06f2-f7d6-5587-8ea9-02e58c0d6b47",
  "cf1caf3f-e423-43e6-bd47-62a27bb513e2",
  "d383c2c2-9617-548f-a0ab-266b7dbe0789",
  "d68083f5-0db1-5c77-ac35-640a2fdb1f3f",
  "d885992d-2658-4410-8147-c6a7b8399f75",
  "da4861d8-2d29-498d-8a70-62461022dbfd",
  "dd5522a7-f3d6-4ce3-a1ea-336f4f0b772f",
  "e0ec78f5-8453-58ef-ba4d-c6ff1c2dae76",
  "e1f69ece-5d51-5819-82d0-eff0eb752396",
  "e2b3b717-5d83-5dde-bb47-42c3a6cc6f31",
  "e4418f8c-6f74-4d03-8c61-93c17848c2dc",
  "e56f72b8-cf14-5549-9d5c-9f9ff8c8bc02",
  "e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d",
  "e6c933f3-111d-4966-a7b2-7e72ee4d4d92",
  "e7525fa2-b583-5602-bafb-d93f68257a3c",
  "ea5d03c1-d933-468a-8bc8-e3e5fc33cf23",
  "ec240f13-8462-54ad-be55-b27275f0f58a",
  "ee0d2617-4de2-44fb-b56e-7e574890acdf",
  "f06e2a81-794f-5afd-ae94-f02df347b5a0",
  "f10ed5aa-ff19-5cbe-b176-ae4bf642edf1",
  "f2b6b04b-c3a7-5440-9915-52deef3d0f17",
  "f47b7f64-ee39-4896-a27f-cbc069e712fa",
  "f77b8f64-7a75-43ac-b65f-918d2db70c9f",
  "f82741c8-5e43-5ac0-bebc-75b0edb2e3a2",
  "f9194806-a2c6-4f03-a351-09b4546ce2ed",
  "fa743d1a-aa43-5976-b6b2-8131a533ae5b",
  "fc0ad6a2-61f9-4985-a6be-e8978f5733c3"
] as const;

const EXPECTED_INDEXES = [
  "b75fa72e-7365-4da0-a910-b6ef96f306c2"
] as const;

const EXPECTED_INDEX_FIELDS = [
  "30cf8266-372a-44b7-bdf5-f1188b168d6a"
] as const;

const EXPECTED_SEARCH_FIELDS = [] as const;

const EXPECTED_VIEWS = [
  "1bc58554-efb5-52e4-8e2a-7f522a1c453c",
  "25d4c1a3-b315-4c2c-b95e-04f3bcb90807",
  "2774101b-3c0b-485b-91f5-b92d30bdcb6e",
  "5865bdbf-be33-5457-9d91-184885276b94",
  "914bd2ad-17e0-48f2-a6da-38f94b92be9d",
  "a5abdae3-d86a-51d3-9b04-2dc21c172c3e"
] as const;

const EXPECTED_VIEW_GROUPS = [] as const;

const EXPECTED_VIEW_FILTERS = [
  "bb759248-7330-4730-b4a8-0752df10ab14"
] as const;

const EXPECTED_VIEW_FIELD_GROUPS = [] as const;

const EXPECTED_VIEW_FIELDS = [
  "1118b32e-5e02-4955-9bff-86cc6e3884d3",
  "16f5c397-468a-47c0-b704-a850d11e87a0",
  "3a621e09-bc66-4881-aa7c-d1ed0086de82",
  "4f02dd57-6875-449b-a0c5-e6ca23f8f53b",
  "5658f977-d711-46ce-8563-a73dbe6a8d0b",
  "600ea605-7496-4602-a2cb-ddb38c230fd6",
  "64c4da41-f1a4-43a8-9f03-a155fa3963bf",
  "668d5313-ddc4-4815-93f9-d8f60b4fa550",
  "79c4d8b0-f4bb-43ff-bb06-c4d374be9130",
  "7c821735-92b0-417a-a4c6-b1c2d940a813",
  "9a3bd420-c63d-479d-bb86-d4d25f7a9832",
  "b57ef565-d393-4777-921c-5aa0a2166033",
  "c3bde970-bc8e-41d5-bad0-b710c548496d",
  "c42cf06d-eaae-4bfe-8108-20887dd0d8c4",
  "cb99eb49-2960-4b98-b4f0-ef70add64f79",
  "cbdac244-5a78-4ff0-a28a-011b444b9412",
  "cecbfcb2-318d-48b0-ab64-59a25fb213e5",
  "f078acbb-e143-46f4-9b27-926315811539",
  "f0b70304-4119-4a91-aef6-9d7108a332fe",
  "fa092416-394c-4d01-8252-452249e445c2"
] as const;

const EXPECTED_ROLES = [
  "802cf87a-e4c5-559b-89c5-2172e3e5cc2f",
  "8563f1a9-4e02-408a-a5d7-45f68779023a"
] as const;

const EXPECTED_PERMISSION_FLAGS = [] as const;

const EXPECTED_AGENTS = [] as const;

const EXPECTED_SKILLS = [] as const;

const EXPECTED_PAGE_LAYOUTS = [
  "c8e159f8-1815-4138-9203-c29f59703386"
] as const;

const EXPECTED_PAGE_LAYOUT_TABS = [
  "14a3d605-51dc-4197-99b6-1f8415316ac1",
  "221532a5-ac54-4a46-ae75-88e095f4633f",
  "74e295f0-ea2e-4c47-b1b4-6d9a77f8ebc9"
] as const;

const EXPECTED_PAGE_LAYOUT_WIDGETS = [
  "10aef0fb-a7dd-49d2-b818-5f167ba29091",
  "8c7fb069-9866-4333-895b-5e5ad5d2d835",
  "ca066d67-d7a5-4951-9674-8a25d5710387"
] as const;

const EXPECTED_NAVIGATION = [
  "43f7a291-b0a4-481d-a5e4-b557e1a8f65d",
  "a1556a2b-8c0a-570a-a902-38827cadc867",
  "c124f0aa-7836-5242-ac52-e8667e0ed4f7",
  "d06225df-32da-5c5d-b5d1-2b8d48fdca1c"
] as const;

const EXPECTED_COMMAND_MENU = [] as const;

const expectedByMap = { flatObjectMetadataMaps: EXPECTED_OBJECTS, flatFieldMetadataMaps: EXPECTED_FIELDS, flatIndexMaps: EXPECTED_INDEXES, flatSearchFieldMetadataMaps: EXPECTED_SEARCH_FIELDS, flatViewMaps: EXPECTED_VIEWS, flatViewGroupMaps: EXPECTED_VIEW_GROUPS, flatViewFilterMaps: EXPECTED_VIEW_FILTERS, flatViewFieldGroupMaps: EXPECTED_VIEW_FIELD_GROUPS, flatViewFieldMaps: EXPECTED_VIEW_FIELDS, flatRoleMetadataMaps: EXPECTED_ROLES, flatPermissionFlagMaps: EXPECTED_PERMISSION_FLAGS, flatAgentMaps: EXPECTED_AGENTS, flatSkillMaps: EXPECTED_SKILLS, flatPageLayoutMaps: EXPECTED_PAGE_LAYOUTS, flatPageLayoutTabMaps: EXPECTED_PAGE_LAYOUT_TABS, flatPageLayoutWidgetMaps: EXPECTED_PAGE_LAYOUT_WIDGETS, flatNavigationMenuItemMaps: EXPECTED_NAVIGATION, flatCommandMenuItemMaps: EXPECTED_COMMAND_MENU } as const;

describe('Myah standard metadata contract', () => {
  it('places every canonical identifier in its category map', () => {
    for (const [mapName, identifiers] of Object.entries(expectedByMap)) {
      const map = result.allFlatEntityMaps[mapName as keyof typeof result.allFlatEntityMaps];
      expect(Object.keys(map.byUniversalIdentifier)).toEqual(expect.arrayContaining(identifiers));
    }
  });
  it('asserts every Brand Brain and Creator Ops relation endpoint', () => {
    const fields = result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
    const relations = [
      ['0bbf483c-9c52-4286-9427-a14058456611','6a8289d7-8034-4f70-b3fa-47bc0e52828f','62f3e27e-3c6c-4449-9d81-2b24501f5e3f'], ['62f3e27e-3c6c-4449-9d81-2b24501f5e3f','6a8289d7-8034-4f70-b3fa-47bc0e52828f','0bbf483c-9c52-4286-9427-a14058456611'], ['776301dc-08a6-4692-b9b8-f427f040085b','6a8289d7-8034-4f70-b3fa-47bc0e52828f','94d2f0e6-0915-40e3-bc40-b1a6336dc16a'], ['94d2f0e6-0915-40e3-bc40-b1a6336dc16a','f99ff6bc-3b56-4600-beb3-cfc2c23364f6','776301dc-08a6-4692-b9b8-f427f040085b'], ['3cb59cb6-8ef0-4608-bc1a-872e888a60ed','6a8289d7-8034-4f70-b3fa-47bc0e52828f','93ed2052-7d48-4a60-b43f-f0a07ccdf1ff'], ['93ed2052-7d48-4a60-b43f-f0a07ccdf1ff','f99ff6bc-3b56-4600-beb3-cfc2c23364f6','3cb59cb6-8ef0-4608-bc1a-872e888a60ed'], ['4fd149a3-b506-45f8-94c4-970a3106eccf','6a8289d7-8034-4f70-b3fa-47bc0e52828f','da4861d8-2d29-498d-8a70-62461022dbfd'], ['da4861d8-2d29-498d-8a70-62461022dbfd','facac4a1-0a2f-469f-9f1f-81ef01f06578','4fd149a3-b506-45f8-94c4-970a3106eccf'],
      ['32db62ac-6217-5316-89d9-f9d7290dff70','5ca82f72-9778-4ae1-8a8e-9b762c4ce0de','c84e31a5-ba66-5773-a2da-2b1c357257c5'], ['894c80f2-a478-5680-8c20-c7a86aa24fde','5ca82f72-9778-4ae1-8a8e-9b762c4ce0de','730b323f-fae3-57e2-8e2e-62963106850a'], ['ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df','d51f2758-055b-5367-8250-859cb3f58631','c84e31a5-ba66-5773-a2da-2b1c357257c5'], ['c84e31a5-ba66-5773-a2da-2b1c357257c5','e004c4b4-b1e1-59d9-b096-9fc57875d47f','ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df' ], ['32db62ac-6217-5316-89d9-f9d7290dff70','5ca82f72-9778-4ae1-8a8e-9b762c4ce0de','a8014e8c-e50a-547a-9f01-973d685314ec'], ['a8014e8c-e50a-547a-9f01-973d685314ec','e004c4b4-b1e1-59d9-b096-9fc57875d47f','32db62ac-6217-5316-89d9-f9d7290dff70'], ['ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df','d51f2758-055b-5367-8250-859cb3f58631','c84e31a5-ba66-5773-a2da-2b1c357257c5'], ['c84e31a5-ba66-5773-a2da-2b1c357257c5','e004c4b4-b1e1-59d9-b096-9fc57875d47f','ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df'], ['27ecf86e-08a4-5084-91d7-d305ab3363e1','9a09d54a-d464-5692-ac74-70527fb00ddd','894c80f2-a478-5680-8c20-c7a86aa24fde'], ['809800a3-fa41-591e-8d4e-7e9fd0daf322','843aa6c8-36af-5906-8241-4017c4188df7','00c95791-84b2-50cc-89aa-68faf18011eb'], ['40b7c827-4699-5f99-bdb8-d8906dd948f5','0446497e-3240-5a78-a02f-e08594e5c2af','75b56b0d-b69d-50fd-8f36-bfd3fa8d9237'], ['79efc6cb-48f5-5569-9759-255825e287e0','c25bfef3-4636-5864-a777-705238c91326','9fd2575c-ca82-59bb-8f10-4907b104e6cb'], ['e9b9d246-f49e-5200-9819-0a4c9cd0d19a','b4459926-2c01-560a-8432-fa1974168439','64617f40-1f95-54cf-be64-ff57c72df280'], ['f8ea43b0-33f8-5071-9e6d-5b787fb4e043','fd8a37b8-72db-5069-902a-a1763ddc63f7','1d33699f-76f3-5247-98b3-2de588543364'], ['1d33699f-76f3-5247-98b3-2de588543364','9a09d54a-d464-5692-ac74-70527fb00ddd','f8ea43b0-33f8-5071-9e6d-5b787fb4e043'], ['9fd2575c-ca82-59bb-8f10-4907b104e6cb','0446497e-3240-5a78-a02f-e08594e5c2af','79efc6cb-48f5-5569-9759-255825e287e0'], ['d68a67a8-b5b3-5dd0-a1a5-82ed7561eb4e','c25bfef3-4636-5864-a777-705238c91326','79efc6cb-48f5-5569-9759-255825e287e0'], ['64617f40-1f95-54cf-be64-ff57c72df280','b4459926-2c01-560a-8432-fa1974168439','e9b9d246-f49e-5200-9819-0a4c9cd0d19a']
    ] as const;
    for (const [source, object, target] of relations) { expect(fields[source]).toBeDefined(); expect(fields[target]).toBeDefined(); if (fields[source] && fields[target]) expect(fields[source]).toMatchObject({ objectMetadataUniversalIdentifier: object, relationTargetObjectMetadataUniversalIdentifier: fields[target].objectMetadataUniversalIdentifier, relationTargetFieldMetadataUniversalIdentifier: target }); }
  });
  it('links the canonical path index and index field', () => {
    const indexes = result.allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier;
    expect(indexes['b75fa72e-7365-4da0-a910-b6ef96f306c2']).toMatchObject({ objectMetadataUniversalIdentifier: '6a8289d7-8034-4f70-b3fa-47bc0e52828f', indexFieldMetadata: [{ universalIdentifier: '30cf8266-372a-44b7-bdf5-f1188b168d6a', fieldMetadataUniversalIdentifier: '4452d201-44a5-46fc-bf11-e26fa85cc3b2' }] });
  });
});
