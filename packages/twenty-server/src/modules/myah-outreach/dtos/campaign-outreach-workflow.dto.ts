import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('CampaignOutreachWorkflow')
export class CampaignOutreachWorkflowDTO {
  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => UUIDScalarType, { nullable: true })
  currentVersionId: string | null;

  @Field(() => String, { nullable: true })
  name: string | null;

  @Field(() => UUIDScalarType)
  workflowId: string;
}
