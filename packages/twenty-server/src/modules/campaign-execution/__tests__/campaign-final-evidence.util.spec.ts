import { buildCampaignFinalEvidenceDigest } from 'src/modules/campaign-execution/utils/campaign-launch-proof.util';

describe('Campaign final evidence digest', () => {
  const material = {
    reservation: {
      attemptId: '00000000-0000-4000-8000-000000000001',
      renderDigest: 'a'.repeat(64),
    },
    material: {
      subject: 'Subject',
      html: '<p>Body</p>',
      body: 'Body',
      to: 'creator@example.com',
      inReplyTo: null,
      threadExternalId: null,
      references: [],
      attachments: [],
    },
  };

  it('is stable for equivalent canonical material and changes when send material changes', () => {
    expect(buildCampaignFinalEvidenceDigest({ ...material })).toBe(
      buildCampaignFinalEvidenceDigest({
        material: { ...material.material },
        reservation: { ...material.reservation },
      }),
    );
    expect(
      buildCampaignFinalEvidenceDigest({
        ...material,
        material: { ...material.material, body: 'Changed' },
      }),
    ).not.toBe(buildCampaignFinalEvidenceDigest(material));
  });
});
