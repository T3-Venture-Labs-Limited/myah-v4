import { Injectable } from '@nestjs/common';

import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';

@Injectable()
export class WorkflowOutreachAssociationGuardService {
  async assertNoOutreachAssociation(data: object): Promise<void> {
    if (
      Object.prototype.hasOwnProperty.call(data, 'outreachCampaignId') ||
      Object.prototype.hasOwnProperty.call(data, 'outreachCampaign')
    ) {
      throw new WorkflowQueryValidationException(
        'Outreach association is managed by Campaign Outreach',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }
}
