import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
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
});
