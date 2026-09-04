import { type MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import {
  type Decorator,
  type Meta,
  type StoryObj,
} from '@storybook/react-vite';
import { useStore } from 'jotai';
import { type ReactNode, useEffect } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { ComponentDecorator } from 'twenty-ui/testing';

import { AiChatApprovalCard } from '@/ai/components/AiChatApprovalCard';
import { GET_ACTION_APPROVAL_PROPOSAL } from '@/ai/graphql/queries/getActionApprovalProposal';
import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { type AgentChatPendingApproval } from '@/ai/types/AgentChatPendingApproval';

import { RootDecorator } from '~/testing/decorators/RootDecorator';
import { SnackBarDecorator } from '~/testing/decorators/SnackBarDecorator';

const INBOX_REPLY_BINDING_ID = '00000000-0000-4000-8000-000000000156';
const STORY_THREAD_ID = 'inbox-reply-approval-story-thread';

const inboxReplyBody = `Hi Jamie,

Thanks for sending the updated audience breakdown. The mix of beauty and lifestyle creators is a strong fit for the September launch.

We can confirm the proposed deliverables:
- one dedicated short-form video
- three story frames with the tracked link
- five edited product photos for paid usage

Could you confirm whether the creators can deliver first drafts by September 12? Once confirmed, I’ll share the final brief and shipping details.

Best,
Maya
Creator Partnerships at Myah`;

const pendingApproval: AgentChatPendingApproval = {
  messageId: 'inbox-reply-approval-message',
  toolCallId: 'send-inbox-reply-tool-call',
  actionApprovalBindingId: INBOX_REPLY_BINDING_ID,
};

const inboxReplyProposalMock: MockedResponse = {
  request: {
    query: GET_ACTION_APPROVAL_PROPOSAL,
    variables: { bindingId: INBOX_REPLY_BINDING_ID },
  },
  result: {
    data: {
      getActionApprovalProposal: {
        action: 'send_inbox_reply',
        actionVersion: 1,
        body: inboxReplyBody,
        recipientLabel: 'Jamie Chen <jamie@northstarcreators.test>',
        sendingAccountLabel: 'Maya at Myah <partnerships@myah.test>',
        subject: 'Re: September launch creator shortlist',
        draftRevision: 4,
        state: 'PENDING',
        expiresAt: '2099-09-03T18:00:00.000Z',
        occurredAt: '2026-09-03T17:45:00.000Z',
        evidenceLinks: [],
      },
    },
  },
};

const ChatStoreSeeder = ({ children }: { children: ReactNode }) => {
  const store = useStore();

  useEffect(() => {
    store.set(currentAiChatThreadState.atom, STORY_THREAD_ID);
    store.set(agentChatDisplayedThreadState.atom, STORY_THREAD_ID);
  }, [store]);

  return <>{children}</>;
};

const InboxReplyStoryDecorator: Decorator = (Story) => (
  <MockedProvider mocks={[inboxReplyProposalMock]}>
    <ChatStoreSeeder>
      <Story />
    </ChatStoreSeeder>
  </MockedProvider>
);

const meta: Meta<typeof AiChatApprovalCard> = {
  title: 'Modules/AI/AiChatApprovalCard',
  component: AiChatApprovalCard,
  decorators: [
    InboxReplyStoryDecorator,
    SnackBarDecorator,
    ComponentDecorator,
    RootDecorator,
  ],
};

export default meta;

type Story = StoryObj<typeof AiChatApprovalCard>;

export const InboxReply: Story = {
  args: { pendingApproval },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Review Inbox reply')).toBeVisible();
    await expect(
      canvas.getByText(
        'Review the exact server-derived Inbox reply before it is sent.',
      ),
    ).toBeVisible();

    const preview = canvas.getByText(
      (_content, element) =>
        element?.tagName === 'PRE' && element.textContent === inboxReplyBody,
    );

    await expect(preview).toBeVisible();
    await expect(
      canvas.getByText('To: Jamie Chen <jamie@northstarcreators.test>'),
    ).toBeVisible();
    await expect(
      canvas.getByText('From: Maya at Myah <partnerships@myah.test>'),
    ).toBeVisible();
    await expect(
      canvas.getByText('Subject: Re: September launch creator shortlist'),
    ).toBeVisible();
    await expect(canvas.getByText('Revision: 4')).toBeVisible();

    for (const buttonName of ['Request changes', 'Reject', 'Approve']) {
      await expect(
        canvas.getByRole('button', { name: buttonName }),
      ).toBeVisible();
    }

    await waitFor(async () => {
      await expect(preview.scrollHeight).toBeGreaterThan(preview.clientHeight);
    });
    await expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth);

    const documentElement = canvasElement.ownerDocument.documentElement;
    await expect(documentElement.scrollWidth).toBeLessThanOrEqual(
      documentElement.clientWidth,
    );
  },
};
