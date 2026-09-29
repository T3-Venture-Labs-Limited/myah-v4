import { CommandMenuItemAvailabilityType } from 'src/engine/metadata-modules/command-menu-item/enums/command-menu-item-availability-type.enum';
import { STANDARD_COMMAND_MENU_ITEMS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant';

describe('standard outreach command menu', () => {
  it('leads available global actions with the existing Email, Instagram and Campaign identities', () => {
    const { composeEmail, messageOnInstagram, composeCampaign } =
      STANDARD_COMMAND_MENU_ITEMS;
    const globalItems = Object.values(STANDARD_COMMAND_MENU_ITEMS)
      .filter(
        (item) =>
          item.availabilityType === CommandMenuItemAvailabilityType.GLOBAL,
      )
      .sort((a, b) => a.position - b.position);

    expect(
      globalItems.slice(0, 3).map((item) => item.universalIdentifier),
    ).toEqual([
      composeEmail.universalIdentifier,
      messageOnInstagram.universalIdentifier,
      composeCampaign.universalIdentifier,
    ]);
    expect(new Set(globalItems.map((item) => item.position)).size).toBe(
      globalItems.length,
    );
    expect(messageOnInstagram.conditionalAvailabilityExpression).toBeNull();
    expect(composeEmail.conditionalAvailabilityExpression).toBe(
      'permissionFlags.SEND_EMAIL_TOOL',
    );
    expect(composeCampaign.conditionalAvailabilityExpression).toBe(
      'featureFlags.IS_EMAIL_GROUP_ENABLED',
    );
  });
});
