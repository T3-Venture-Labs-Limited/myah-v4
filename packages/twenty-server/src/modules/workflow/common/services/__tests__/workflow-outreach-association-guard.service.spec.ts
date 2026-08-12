import { WorkflowOutreachAssociationGuardService } from 'src/modules/workflow/common/services/workflow-outreach-association-guard.service';

describe('WorkflowOutreachAssociationGuardService', () => {
  const service = new WorkflowOutreachAssociationGuardService();

  it.each([
    { outreachCampaignId: 'campaign-a' },
    { outreachCampaign: { connect: { id: 'campaign-a' } } },
    { outreachCampaignId: null },
    { outreachCampaign: null },
  ])('rejects global Workflow mutation input %o', async (data) => {
    await expect(service.assertNoOutreachAssociation(data)).rejects.toMatchObject(
      {
        message: 'Outreach association is managed by Campaign Outreach',
      },
    );
  });

  it('allows a General Automation mutation without an Outreach association', async () => {
    await expect(
      service.assertNoOutreachAssociation({ name: 'General automation' }),
    ).resolves.toBeUndefined();
  });
});
