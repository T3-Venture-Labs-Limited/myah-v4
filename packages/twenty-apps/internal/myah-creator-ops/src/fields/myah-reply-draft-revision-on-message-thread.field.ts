import {
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineField,
} from 'twenty-sdk/define';

import { MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftRevision,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  type: FieldType.NUMBER,
  name: 'myahReplyDraftRevision',
  label: 'Myah reply draft revision',
  icon: 'IconVersions',
  isNullable: false,
  defaultValue: 0,
});
