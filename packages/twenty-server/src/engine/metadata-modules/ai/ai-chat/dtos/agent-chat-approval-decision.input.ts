import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class AgentChatApprovalDecisionInput {
  @Field(() => String)
  decision: string;

  @Field(() => String, { nullable: true })
  comment?: string;
}
