import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { MyahInboxReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { MyahInboxReplyAuthorityContextService } from 'src/engine/core-modules/action-approval/services/myah-inbox-reply-authority-context.service';
import { MyahInboxReplyReceiptProjectionService } from 'src/engine/core-modules/action-approval/services/myah-inbox-reply-receipt-projection.service';
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { ACTION_RECEIPT_PROJECTION_WRITER } from 'src/engine/core-modules/action-approval/types/action-approval.type';

describe('ActionApprovalModule', () => {
  it('registers the real workspace projection writer', () => {
    const providers = Reflect.getMetadata('providers', ActionApprovalModule);

    expect(providers).toContain(ActionReceiptWorkspaceProjectionWriterService);
    expect(providers).toContain(MyahInboxReplyAuthorityContextService);
    expect(providers).toContain(MyahInboxReplyReceiptProjectionService);
    expect(providers).toContainEqual({
      provide: ACTION_RECEIPT_PROJECTION_WRITER,
      useExisting: ActionReceiptWorkspaceProjectionWriterService,
    });
  });

  it('retains concrete Inbox injection metadata', () => {
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        ActionReceiptWorkspaceProjectionWriterService,
      )[3],
    ).toBe(MyahInboxReplyReceiptProjectionService);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        MyahInboxReplyReceiptProjectionService,
      )[2],
    ).toBe(MyahInboxReplyActionDefinition);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        MyahInboxReplyActionDefinition,
      )[0],
    ).toBe(MyahInboxReplyAuthorityContextService);
    for (const service of [
      ActionReceiptWorkspaceProjectionWriterService,
      MyahInboxReplyReceiptProjectionService,
      MyahInboxReplyActionDefinition,
      MyahInboxReplyAuthorityContextService,
    ]) {
      expect(Reflect.getMetadata('design:paramtypes', service)).not.toContain(
        Object,
      );
    }
  });
});
