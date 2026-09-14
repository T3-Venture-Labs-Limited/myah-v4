import { Field, Int, ObjectType } from '@nestjs/graphql';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxRichText } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';

@ObjectType()
export class MyahInboxEmailDraft {
  @Field(() => UUIDScalarType) workspaceId: string;
  @Field(() => UUIDScalarType) threadId: string;
  @Field(() => Int) revision: number;
  @Field(() => MyahInboxRichText, { nullable: true })
  body: MyahInboxRichText | null;
}
