import { ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { ConfigVariableType } from 'src/engine/core-modules/twenty-config/enums/config-variable-type.enum';
import { ConfigVariablesGroup } from 'src/engine/core-modules/twenty-config/enums/config-variables-group.enum';
import { TypedReflect } from 'src/utils/typed-reflect';

describe('ConfigVariables', () => {
  it('registers exact Myah Team email allowlisting as an env-only hidden string', () => {
    const metadata = TypedReflect.getMetadata(
      'config-variables',
      ConfigVariables,
    );

    expect(metadata?.MYAH_TEAM_ALLOWED_EMAILS).toEqual({
      group: ConfigVariablesGroup.ADVANCED_SETTINGS,
      description:
        'Comma-separated exact email addresses authorized for Myah platform operations',
      isEnvOnly: true,
      isHiddenInAdminPanel: true,
      type: ConfigVariableType.STRING,
    });
  });
});
