import { useTextFieldFocusProps } from '@/ui/utilities/focus/hooks/useTextFieldFocusProps';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { IconSparkles } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  StyledAgentActions,
  StyledAgentBody,
  StyledAgentCard,
  StyledAgentChoice,
  StyledAgentConfirm,
  StyledAgentField,
  StyledAgentGrid,
  StyledAgentHint,
  StyledAgentIntro,
  StyledAgentList,
  StyledAgentPage,
  StyledAgentRow,
} from '@/myah/agent/components/MyahAgentFormStyles';
import {
  GET_MYAH_AGENT,
  UPDATE_MYAH_AGENT,
  type MyahAgent,
  type MyahAgentSendingMode,
} from '@/myah/agent/graphql/myahAgentOperations';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const StyledHeader = styled.header`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  height: 48px;
  padding: 0 ${themeCssVariables.spacing[4]};
  h1 {
    font-size: ${themeCssVariables.font.size.md};
    font-weight: ${themeCssVariables.font.weight.semiBold};
    margin: 0;
  }
`;

type GuidanceDraft = Pick<
  MyahAgent,
  | 'tone'
  | 'responseLength'
  | 'language'
  | 'brandInformation'
  | 'replyRules'
  | 'escalationBoundaries'
>;

const TONES = ['Warm and friendly', 'Professional', 'Playful'];
const LENGTHS = ['Concise', 'Standard', 'Detailed'];

const toDraft = (agent: MyahAgent | undefined): GuidanceDraft => ({
  tone: agent?.tone ?? TONES[0],
  responseLength: agent?.responseLength ?? LENGTHS[0],
  language: agent?.language ?? "Match the creator's language",
  brandInformation: agent?.brandInformation ?? '',
  replyRules: agent?.replyRules ?? '',
  escalationBoundaries: agent?.escalationBoundaries ?? '',
});

export const MyahAgentPage = () => {
  const textFieldFocus = useTextFieldFocusProps();
  const canEdit = useHasPermissionFlag(PermissionFlagType.WORKSPACE);
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const { data, loading } = useQuery<{ myahAgent: MyahAgent }>(GET_MYAH_AGENT);
  const [updateAgent, { loading: saving }] = useMutation<{
    updateMyahAgent: MyahAgent;
  }>(UPDATE_MYAH_AGENT);
  const agent = data?.myahAgent;
  const [draft, setDraft] = useState<GuidanceDraft>(toDraft(undefined));
  const [confirmAutomatic, setConfirmAutomatic] = useState(false);

  useEffect(() => {
    if (agent) setDraft(toDraft(agent));
  }, [agent]);

  const save = async (input: Record<string, unknown>, message: string) => {
    try {
      await updateAgent({ variables: { input } });
      enqueueSuccessSnackBar({ message });
    } catch {
      enqueueErrorSnackBar({ message: 'Agent settings could not be saved.' });
    }
  };

  const setMode = async (mode: MyahAgentSendingMode) => {
    setConfirmAutomatic(false);
    await save(
      { sendingMode: mode },
      mode === 'SEND_AUTOMATICALLY'
        ? 'Automatic sending is on.'
        : 'Replies now wait for your approval.',
    );
  };

  const automatic = agent?.sendingMode === 'SEND_AUTOMATICALLY';
  const readOnly = !canEdit || loading;
  const change =
    (name: keyof GuidanceDraft) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setDraft((current) => ({ ...current, [name]: event.target.value }));

  return (
    <StyledAgentPage aria-label="Agent">
      <StyledHeader>
        <IconSparkles size={16} />
        <h1>Agent</h1>
      </StyledHeader>
      <StyledAgentBody>
        <StyledAgentIntro>
          <h2>One agent for every Campaign</h2>
          <p>
            Set your brand&apos;s voice and rules once. Each Campaign adds its
            own brief, and every creator&apos;s history is included
            automatically.
          </p>
        </StyledAgentIntro>
        <StyledAgentGrid>
          <div>
            <StyledAgentCard aria-label="Voice">
              <h3>Voice</h3>
              <StyledAgentRow>
                <StyledAgentField>
                  Tone
                  <select
                    value={draft.tone ?? ''}
                    disabled={readOnly}
                    onChange={change('tone')}
                  >
                    {[...new Set([...TONES, draft.tone ?? TONES[0]])].map(
                      (tone) => (
                        <option key={tone}>{tone}</option>
                      ),
                    )}
                  </select>
                </StyledAgentField>
                <StyledAgentField>
                  Response length
                  <select
                    value={draft.responseLength ?? ''}
                    disabled={readOnly}
                    onChange={change('responseLength')}
                  >
                    {[
                      ...new Set([
                        ...LENGTHS,
                        draft.responseLength ?? LENGTHS[0],
                      ]),
                    ].map((length) => (
                      <option key={length}>{length}</option>
                    ))}
                  </select>
                </StyledAgentField>
              </StyledAgentRow>
              <StyledAgentField>
                Language
                <input
                  onFocus={textFieldFocus.onFocus}
                  onBlur={textFieldFocus.onBlur}
                  value={draft.language ?? ''}
                  disabled={readOnly}
                  onChange={change('language')}
                />
              </StyledAgentField>
            </StyledAgentCard>
            <StyledAgentCard aria-label="Brand and products">
              <h3>Brand and products</h3>
              <StyledAgentHint>
                What the agent can say about your brand. FAQs belong here.
              </StyledAgentHint>
              <StyledAgentField>
                <textarea
                  onFocus={textFieldFocus.onFocus}
                  onBlur={textFieldFocus.onBlur}
                  aria-label="Brand and product information"
                  rows={6}
                  value={draft.brandInformation ?? ''}
                  disabled={readOnly}
                  onChange={change('brandInformation')}
                />
              </StyledAgentField>
            </StyledAgentCard>
            <StyledAgentCard aria-label="Reply rules">
              <h3>Reply rules</h3>
              <StyledAgentHint>
                How the agent should handle common replies.
              </StyledAgentHint>
              <StyledAgentField>
                <textarea
                  onFocus={textFieldFocus.onFocus}
                  onBlur={textFieldFocus.onBlur}
                  aria-label="Reply rules"
                  value={draft.replyRules ?? ''}
                  disabled={readOnly}
                  onChange={change('replyRules')}
                />
              </StyledAgentField>
            </StyledAgentCard>
            <StyledAgentCard aria-label="When to hand off to you">
              <h3>When to hand off to you</h3>
              <StyledAgentHint>
                The agent stops and asks you instead of replying.
              </StyledAgentHint>
              <StyledAgentField>
                <textarea
                  onFocus={textFieldFocus.onFocus}
                  onBlur={textFieldFocus.onBlur}
                  aria-label="Escalation boundaries"
                  value={draft.escalationBoundaries ?? ''}
                  disabled={readOnly}
                  onChange={change('escalationBoundaries')}
                />
              </StyledAgentField>
            </StyledAgentCard>
            <StyledAgentActions>
              <StyledAgentHint>
                Saving changes future drafts only. It never sends or overwrites
                what you typed.
              </StyledAgentHint>
              <Button
                title="Save guidance"
                variant="primary"
                accent="brand"
                disabled={!canEdit || saving || loading}
                onClick={() => save(draft, 'Guidance saved.')}
              />
            </StyledAgentActions>
          </div>
          <div>
            <StyledAgentCard aria-label="Sending">
              <h3>Sending</h3>
              <StyledAgentChoice data-selected={!automatic}>
                <input
                  type="radio"
                  name="sending-mode"
                  checked={!automatic}
                  disabled={!canEdit || saving}
                  onChange={() => setMode('DRAFT_FOR_APPROVAL')}
                />
                <div>
                  <strong>Draft for approval</strong>
                  <span>The agent drafts every reply. A person sends it.</span>
                </div>
              </StyledAgentChoice>
              <StyledAgentChoice data-selected={automatic}>
                <input
                  type="radio"
                  name="sending-mode"
                  checked={automatic}
                  disabled={!canEdit || saving}
                  onChange={() => setConfirmAutomatic(true)}
                />
                <div>
                  <strong>Send automatically</strong>
                  <span>
                    Routine replies to creators in an active Campaign are sent
                    for you.
                  </span>
                </div>
              </StyledAgentChoice>
              {confirmAutomatic && !automatic ? (
                <StyledAgentConfirm role="alertdialog">
                  Replies will be sent as you, without review. The agent still
                  asks you when it hands off, a Campaign requires approval, you
                  have started typing, or it has sent 3 replies in a row.
                  <StyledAgentActions>
                    <Button
                      title="Turn on"
                      variant="primary"
                      accent="brand"
                      size="small"
                      onClick={() => setMode('SEND_AUTOMATICALLY')}
                    />
                    <Button
                      title="Cancel"
                      size="small"
                      onClick={() => setConfirmAutomatic(false)}
                    />
                  </StyledAgentActions>
                </StyledAgentConfirm>
              ) : null}
              {automatic && agent?.sendingModeEnabledAt ? (
                <StyledAgentHint>
                  Turned on
                  {agent.sendingModeEnabledByName
                    ? ` by ${agent.sendingModeEnabledByName}`
                    : ''}{' '}
                  · {new Date(agent.sendingModeEnabledAt).toLocaleDateString()}
                </StyledAgentHint>
              ) : null}
              <StyledAgentHint>Always asks you when:</StyledAgentHint>
              <StyledAgentList>
                <li>it hands off (see “When to hand off”)</li>
                <li>the Campaign requires approval</li>
                <li>you&apos;ve started typing a reply</li>
                <li>it has sent 3 replies in a row</li>
              </StyledAgentList>
            </StyledAgentCard>
            <StyledAgentCard aria-label="What the agent reads">
              <h3>What the agent reads</h3>
              <StyledAgentList>
                <li>This guidance</li>
                <li>The creator&apos;s Campaign brief</li>
                <li>Creator profile and notes</li>
                <li>All their emails and DMs</li>
                <li>Past Campaigns with this creator</li>
              </StyledAgentList>
            </StyledAgentCard>
          </div>
        </StyledAgentGrid>
      </StyledAgentBody>
    </StyledAgentPage>
  );
};
