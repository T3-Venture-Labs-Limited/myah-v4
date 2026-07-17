export const STANDARD_ROLE = {
  admin: { universalIdentifier: '20202020-02c2-43f2-b94d-cab1f2b532eb' },
  brandBrainAdmin: {
    universalIdentifier: '8563f1a9-4e02-408a-a5d7-45f68779023a',
  },
  creatorOpsDefault: {
    universalIdentifier: '802cf87a-e4c5-559b-89c5-2172e3e5cc2f',
  },
} as const satisfies Record<string, { universalIdentifier: string }>;
