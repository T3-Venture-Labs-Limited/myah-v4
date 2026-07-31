import { Field, InputType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class CopyGeneralAutomationToCampaignInput {
  @Field(() => UUIDScalarType, {
    description: 'Campaign that will own the copied Workflow',
    nullable: false,
  })
  campaignId: string;

  @Field(() => UUIDScalarType, {
    description: 'General Workflow to copy',
    nullable: false,
  })
  sourceWorkflowId: string;

  @Field(() => UUIDScalarType, {
    description: 'Workflow version to copy',
    nullable: false,
  })
  sourceWorkflowVersionId: string;
}
