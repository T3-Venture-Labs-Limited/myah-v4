import { type ListInstagramMessagesInput } from 'src/logic-functions/types/instagram-messaging-inputs.type';

export const listInstagramMessagesHandler = async (
  _input: ListInstagramMessagesInput = {},
) => ({
  success: false,
  error:
    'Composio Instagram message reads are disabled after the Unipile provider cutover.',
});
