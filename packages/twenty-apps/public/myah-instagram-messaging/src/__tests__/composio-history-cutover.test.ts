import { describe, expect, it } from 'vitest';

import socialConversation from '../objects/social-conversation.object';
import socialMessage from '../objects/social-message.object';

const historyOption = {
  id: 'e161e884-2f21-44ad-a6ac-5e221a0c1cee',
  value: 'COMPOSIO_HISTORY',
  label: 'Composio history',
};

describe('Composio history metadata cutover', () => {
  it('retains historical and Unipile conversation provider identities', () => {
    const provider = socialConversation.config.fields.find(
      (candidate) => candidate.name === 'provider',
    );

    expect(provider).toMatchObject({
      name: 'provider',
      defaultValue: "'COMPOSIO_HISTORY'",
      options: expect.arrayContaining([
        expect.objectContaining(historyOption),
        expect.objectContaining({
          id: '5dcd0095-ae5f-431a-8fe2-d5d0e22c98ce',
          value: 'UNIPILE',
          label: 'Unipile',
        }),
      ]),
    });
  });

  it('retains historical and Unipile message provider identities', () => {
    const provider = socialMessage.config.fields.find(
      (candidate) => candidate.name === 'provider',
    );

    expect(provider).toMatchObject({
      name: 'provider',
      defaultValue: "'COMPOSIO_HISTORY'",
      options: expect.arrayContaining([
        expect.objectContaining({
          ...historyOption,
          id: 'e177ebaf-239f-4b44-aa9d-4f4358a1d244',
        }),
        expect.objectContaining({
          id: '8f616732-93b5-4a23-9f2a-bcb4d47931e4',
          value: 'UNIPILE',
          label: 'Unipile',
        }),
      ]),
    });
  });
});
