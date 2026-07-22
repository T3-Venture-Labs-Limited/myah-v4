import {
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineField,
} from 'twenty-sdk/define';

import {
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS,
  MYAH_INBOX_STATE_OPTION_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxState,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  type: FieldType.SELECT,
  name: 'inboxState',
  label: 'Inbox state',
  icon: 'IconProgressCheck',
  isNullable: false,
  isUIEditable: false,
  defaultValue: "'NEEDS_REPLY'",
  options: [
    {
      id: MYAH_INBOX_STATE_OPTION_UNIVERSAL_IDENTIFIERS.needsReply,
      value: 'NEEDS_REPLY',
      label: 'Needs reply',
      position: 0,
      color: 'orange',
    },
    {
      id: MYAH_INBOX_STATE_OPTION_UNIVERSAL_IDENTIFIERS.waitingOnCreator,
      value: 'WAITING_ON_CREATOR',
      label: 'Waiting on creator',
      position: 1,
      color: 'blue',
    },
    {
      id: MYAH_INBOX_STATE_OPTION_UNIVERSAL_IDENTIFIERS.snoozed,
      value: 'SNOOZED',
      label: 'Snoozed',
      position: 2,
      color: 'purple',
    },
    {
      id: MYAH_INBOX_STATE_OPTION_UNIVERSAL_IDENTIFIERS.closed,
      value: 'CLOSED',
      label: 'Closed',
      position: 3,
      color: 'green',
    },
  ],
});
