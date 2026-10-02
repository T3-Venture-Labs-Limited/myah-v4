import { SettingsPath } from 'twenty-shared/types';

import {
  getReadOnlyDataModelRedirectPath,
  READ_ONLY_DATA_MODEL_MUTATION_PATHS,
} from '~/pages/settings/data-model/utils/read-only-data-model-routing';

describe('read-only data model routing', () => {
  it('redirects every schema mutation route', () => {
    expect(READ_ONLY_DATA_MODEL_MUTATION_PATHS).toEqual([
      SettingsPath.NewObject,
      SettingsPath.ObjectNewFieldSelect,
      SettingsPath.ObjectNewFieldConfigure,
      SettingsPath.ObjectNewIndex,
      SettingsPath.ObjectFieldEdit,
    ]);
  });

  it('redirects object-scoped routes to read-only object details', () => {
    expect(getReadOnlyDataModelRedirectPath('creators')).toBe(
      '/settings/objects/creators',
    );
  });

  it('redirects workspace-scoped routes to the object list', () => {
    expect(getReadOnlyDataModelRedirectPath()).toBe('/settings/objects');
  });
});
