import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum MyahPlatformOperationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  QUEUED = 'queued',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

@Entity({ name: 'myahPlatformOperation', schema: 'core' })
@Unique('IDX_MYAH_PLATFORM_OPERATION_OPERATOR_ID_IDEMPOTENCY_KEY_UNIQUE', [
  'operatorId',
  'idempotencyKey',
])
@Index('IDX_MYAH_PLATFORM_OPERATION_STATUS_CREATED_AT', ['status', 'createdAt'])
export class MyahPlatformOperationEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'varchar' }) operatorId: string;
  @Column({ type: 'varchar' }) idempotencyKey: string;
  @Column({ type: 'varchar' }) action: string;
  @Column({ type: 'varchar' }) resourceType: string;
  @Column({ nullable: true, type: 'varchar' }) resourceId: string | null;
  @Column({ length: 64, type: 'char' }) requestHash: string;
  @Column({ type: 'jsonb' }) requestBody: unknown;
  @Column({ type: 'varchar' }) status: MyahPlatformOperationStatus;
  @Column({ nullable: true, type: 'jsonb' }) result: unknown | null;
  @Column({ nullable: true, type: 'varchar' }) errorCode: string | null;
  @Column({ nullable: true, type: 'text' }) errorMessage: string | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ nullable: true, type: 'timestamptz' }) completedAt: Date | null;
}
