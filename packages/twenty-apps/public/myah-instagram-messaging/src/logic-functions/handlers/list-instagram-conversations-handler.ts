import { type ListInstagramConversationsInput } from 'src/logic-functions/types/instagram-messaging-inputs.type';

export const listInstagramConversationsHandler = async (
  _input: ListInstagramConversationsInput = {},
) => ({
  success: false,
  error:
    'Composio Instagram conversation reads are disabled after the Unipile provider cutover.',
});
