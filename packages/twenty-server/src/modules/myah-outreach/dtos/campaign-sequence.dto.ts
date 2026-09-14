import { Field, InputType, ObjectType, createUnionType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import {
  type CampaignSequence,
  type CampaignSequenceIssue,
} from 'twenty-shared/workflow';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('CampaignSequenceIssue')
export class CampaignSequenceIssueDTO implements CampaignSequenceIssue {
  @Field(() => String)
  code: CampaignSequenceIssue['code'];

  @Field(() => String)
  path: string;

  @Field(() => String)
  message: string;

  @Field(() => UUIDScalarType, { nullable: true })
  messageId?: string;
}

@ObjectType('CampaignSequenceSnapshot')
export class CampaignSequenceSnapshotDTO {
  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => UUIDScalarType)
  workflowId: string;

  @Field(() => UUIDScalarType)
  versionId: string;

  @Field(() => GraphQLJSON)
  sequence: CampaignSequence;

  @Field(() => String, { nullable: true })
  lifecycleStatus: string | null;

  @Field(() => String)
  versionStatus: string;

  @Field(() => Boolean)
  editable: boolean;

  @Field(() => [CampaignSequenceIssueDTO])
  issues: CampaignSequenceIssue[];
}

@InputType('SaveCampaignSequenceInput')
export class SaveCampaignSequenceInput {
  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => UUIDScalarType)
  expectedVersionId: string;

  @Field(() => GraphQLJSON)
  sequence: CampaignSequence;
}

@InputType('PublishCampaignSequenceInput')
export class PublishCampaignSequenceInput {
  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => UUIDScalarType)
  expectedVersionId: string;
}

@InputType('ReplaceLegacyCampaignSequenceInput')
export class ReplaceLegacyCampaignSequenceInput {
  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => UUIDScalarType)
  expectedWorkflowId: string;
}

@ObjectType('CampaignSequenceAbsent')
export class CampaignSequenceAbsentDTO {
  @Field(() => String)
  kind: 'ABSENT';

  @Field(() => UUIDScalarType)
  campaignId: string;
}

@ObjectType('CampaignSequenceLegacy')
export class CampaignSequenceLegacyDTO {
  @Field(() => String)
  kind: 'LEGACY';

  @Field(() => UUIDScalarType)
  campaignId: string;

  @Field(() => UUIDScalarType)
  workflowId: string;
}

@ObjectType('CampaignSequencePresent')
export class CampaignSequencePresentDTO {
  @Field(() => String)
  kind: 'SEQUENCE';

  @Field(() => CampaignSequenceSnapshotDTO)
  snapshot: CampaignSequenceSnapshotDTO;
}

export const CampaignSequenceLoadResultDTO = createUnionType({
  name: 'CampaignSequenceLoadResult',
  types: () => [
    CampaignSequenceAbsentDTO,
    CampaignSequenceLegacyDTO,
    CampaignSequencePresentDTO,
  ],
  resolveType(value: { kind: 'ABSENT' | 'LEGACY' | 'SEQUENCE' }) {
    if (value.kind === 'ABSENT') return CampaignSequenceAbsentDTO;
    if (value.kind === 'LEGACY') return CampaignSequenceLegacyDTO;
    return CampaignSequencePresentDTO;
  },
});
