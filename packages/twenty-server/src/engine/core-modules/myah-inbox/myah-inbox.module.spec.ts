import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxReplySendResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-reply-send.resolver';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';

describe('MyahInboxModule', () => {
  it('wires send permissions for the reply-send resolver', () => {
    const imports = Reflect.getMetadata('imports', MyahInboxModule);
    const providers = Reflect.getMetadata('providers', MyahInboxModule);

    expect(imports).toContain(PermissionsModule);
    expect(providers).toContain(MyahInboxReplySendResolver);
  });
});
