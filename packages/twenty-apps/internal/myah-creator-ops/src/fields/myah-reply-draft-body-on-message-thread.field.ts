import {
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineField,
} from 'twenty-sdk/define';

import { MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftBody,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  type: FieldType.RICH_TEXT,
  name: 'myahReplyDraftBody',
  label: 'Myah reply draft',
  icon: 'IconMessage',
  isNullable: true,
});
