import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('InstagramActionUsage')
export class InstagramActionUsageDto {
  @Field(() => Int)
  hourlyUsed: number;

  @Field(() => Int)
  hourlyLimit: number;

  @Field(() => Int)
  hourlyRemaining: number;

  @Field(() => Int)
  dailyUsed: number;

  @Field(() => Int)
  dailyLimit: number;

  @Field(() => Int)
  dailyRemaining: number;

  @Field(() => Date, { nullable: true })
  nextEligibleAt: Date | null;
}
