import { MyahPlatformAdminController } from 'src/modules/myah-platform-admin/myah-platform-admin.controller';

describe('MyahPlatformAdminController', () => {
  it('loads its route metadata without a runtime reference error', () => {
    expect(MyahPlatformAdminController).toBeDefined();
  });
});
