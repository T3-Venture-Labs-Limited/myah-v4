import { type InstagramMessageSendResult } from '@/myah/inbox/utils/pollInstagramMessageSendStatus';
import { type SendInstagramMessageComposerInputDto } from '~/generated/graphql';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';

export type InstagramMessageComposerState = {
  recipient: { creatorRecordId: string } | { rawHandle: string } | null;
  body: string;
  draftId: string;
  attempt?: {
    workspaceId: string;
    input: SendInstagramMessageComposerInputDto;
    normalizedHandle: string;
    senderLabel: string;
    result: InstagramMessageSendResult | null;
    safeToRetry: boolean;
  };
};

// The opener allocates the attempt once; renders and account refreshes never rotate it.
export const instagramMessageComposerState =
  createAtomComponentState<InstagramMessageComposerState | null>({
    key: 'side-panel/instagram-message-composer',
    defaultValue: null,
    componentInstanceContext: SidePanelPageComponentInstanceContext,
  });
