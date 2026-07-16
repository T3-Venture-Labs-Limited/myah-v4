import { FieldMetadataType } from '~/generated-metadata/graphql';

type FieldDefinitionToMatch = {
  metadata: {
    fieldName: string;
    objectMetadataNameSingular?: string;
  };
  type: FieldMetadataType;
};

export const isInstagramReplyWindowDeadline = (
  fieldDefinition: FieldDefinitionToMatch,
): boolean =>
  fieldDefinition.type === FieldMetadataType.DATE_TIME &&
  fieldDefinition.metadata.objectMetadataNameSingular ===
    'myahSocialConversation' &&
  fieldDefinition.metadata.fieldName === 'replyWindowEndsAt';
