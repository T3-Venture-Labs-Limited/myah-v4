import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('retired customer application routes', () => {
  it('redirects retired application settings URLs to retained settings', () => {
    const routes = readSource(
      'packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx',
    );

    expect(routes).toContain('path={SettingsPath.Applications}');
    expect(routes).toContain('path={`${SettingsPath.Applications}/*`}');
    expect(routes).toContain(
      '<Navigate to={getSettingsPath(SettingsPath.General)} replace />',
    );
  });

  it('keeps retained tool and public-domain navigation off retired routes', () => {
    const toolCreation = readSource(
      'packages/twenty-front/src/pages/settings/ai/hooks/useCreateTool.ts',
    );
    const toolDetail = readSource(
      'packages/twenty-front/src/pages/settings/ai/SettingsToolDetail.tsx',
    );
    const publicDomain = readSource(
      'packages/twenty-front/src/modules/settings/domains/components/SettingPublicDomain.tsx',
    );

    expect(toolCreation).toContain('SettingsPath.LogicFunctionDetail');
    expect(toolDetail).toContain('SettingsPath.LogicFunctionDetail');
    expect(toolCreation).not.toContain(
      'SettingsPath.ApplicationLogicFunctionDetail',
    );
    expect(toolDetail).not.toContain(
      'SettingsPath.ApplicationLogicFunctionDetail',
    );
    expect(publicDomain).not.toContain('SettingsPath.Applications');
  });
});
