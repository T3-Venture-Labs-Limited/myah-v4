import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { MyahInboxReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { ACTION_RECEIPT_PROJECTION_WRITER } from 'src/engine/core-modules/action-approval/types/action-approval.type';

describe('ActionApprovalModule', () => {
  it('registers the real workspace projection writer', () => {
    const providers = Reflect.getMetadata('providers', ActionApprovalModule);

    expect(providers).toContain(ActionReceiptWorkspaceProjectionWriterService);
    expect(providers).toContainEqual({
      provide: ACTION_RECEIPT_PROJECTION_WRITER,
      useExisting: ActionReceiptWorkspaceProjectionWriterService,
    });
  });

  it('retains the Inbox authority class as the writer injection token', () => {
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        ActionReceiptWorkspaceProjectionWriterService,
      )[3],
    ).toBe(MyahInboxReplyActionDefinition);
  });
});
