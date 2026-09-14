import { useEffect, useRef, useState } from 'react';
import { styled } from '@linaria/react';
import {
  type CampaignSequenceIssue,
  type CampaignSequenceMessage,
  type WorkflowAttachment,
} from 'twenty-shared/workflow';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useUploadWorkflowFile } from '@/advanced-text-editor/hooks/useUploadWorkflowFile';
import { FormAdvancedTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput';
import { FormTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormTextFieldInput';

const StyledEditor = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  min-width: 0;
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  margin: 0;
`;

const StyledWarning = styled.p`
  color: ${themeCssVariables.color.red};
  margin: 0;
`;

const StyledAttachments = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledAttachment = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const isWorkflowAttachment = (value: unknown): value is WorkflowAttachment => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'size' in value &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    'type' in value &&
    typeof value.type === 'string' &&
    'createdAt' in value &&
    typeof value.createdAt === 'string'
  );
};

type CampaignSequenceMessageEditorProps = {
  editable: boolean;
  hasPriorEmail?: boolean;
  issues: CampaignSequenceIssue[];
  message: CampaignSequenceMessage;
  messageIndex: number;
  onAttachmentsAdded: (
    messageId: string,
    attachments: WorkflowAttachment[],
  ) => void;
  onChange: (message: CampaignSequenceMessage) => void;
  reloadGeneration: number;
};

export const CampaignSequenceMessageEditor = ({
  editable,
  hasPriorEmail,
  issues,
  message,
  messageIndex,
  onAttachmentsAdded,
  onChange,
  reloadGeneration,
}: CampaignSequenceMessageEditorProps) => {
  const { uploadWorkflowFile } = useUploadWorkflowFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Async upload identity, not render state: reject switched or unmounted cards.
  // oxlint-disable-next-line twenty/no-state-useref
  const mountedRef = useRef(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);
  const messageIssues = issues.filter(
    ({ messageId, path }) =>
      messageId === message.id || path.startsWith(`messages.${messageIndex}.`),
  );

  if (message.channel === 'INSTAGRAM') {
    return (
      <StyledEditor aria-label={`Edit Instagram message ${messageIndex + 1}`}>
        <strong>Instagram delivery unavailable</strong>
        <StyledHint>
          Instagram is text-only. Delivery cannot be enabled in this phase.
        </StyledHint>
        <label>
          Instagram message
          <textarea
            aria-label="Instagram message"
            disabled={!editable}
            onChange={(event) =>
              onChange({ ...message, text: event.target.value })
            }
            value={message.text}
          />
        </label>
        {messageIssues.map((issue) => (
          <StyledWarning key={`${issue.code}-${issue.path}`}>
            {issue.message}
          </StyledWarning>
        ))}
      </StyledEditor>
    );
  }

  const canReply = hasPriorEmail ?? messageIndex > 0;
  const invalidRetainedReply = message.replyToThread && !canReply;

  const handleFiles = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0 || !editable) {
      return;
    }

    const uploadingMessageId = message.id;
    setUploading(true);
    try {
      const uploadedFiles = await Promise.all(
        Array.from(selectedFiles).map((file) => uploadWorkflowFile(file)),
      );
      const checkedFiles = uploadedFiles.filter(isWorkflowAttachment);

      if (mountedRef.current && checkedFiles.length > 0) {
        onAttachmentsAdded(uploadingMessageId, checkedFiles);
      }
    } finally {
      if (mountedRef.current) {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  return (
    <StyledEditor aria-label={`Edit email message ${messageIndex + 1}`}>
      <StyledHint>
        Sender and recipients are controlled by the Campaign. Each eligible
        Creator receives the resolved message; this step cannot override To, CC,
        BCC, or the sending account.
      </StyledHint>
      <div aria-label="Subject" role="group">
        <FormTextFieldInput
          defaultValue={message.subject}
          error={
            messageIssues.find(({ path }) => path.endsWith('.subject'))?.message
          }
          label="Subject"
          onChange={(subject) => onChange({ ...message, subject })}
          placeholder="Email subject"
          readonly={!editable}
        />
      </div>
      <div aria-label="Body" role="group">
        <FormAdvancedTextFieldInput
          contentType="json"
          defaultValue={message.body}
          enableFullScreen={false}
          error={
            messageIssues.find(({ path }) => path.endsWith('.body'))?.message
          }
          key={`${message.id}-${reloadGeneration}`}
          label="Body"
          maxWidth={640}
          minHeight={160}
          onChange={(body) => onChange({ ...message, body })}
          placeholder={'Type a message or press "/" for formatting'}
          readonly={!editable}
        />
      </div>
      <button
        aria-label="Insert Creator variable"
        disabled
        title="Creator variables require canonical Campaign preview integration"
        type="button"
      >
        Insert Creator variable
      </button>
      <StyledHint>
        Creator variable insertion is unavailable until canonical Campaign
        preview integration is connected.
      </StyledHint>
      <StyledAttachments>
        <strong>Attachments</strong>
        <input
          aria-label="Choose attachments"
          disabled={!editable || uploading}
          hidden
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
          ref={fileInputRef}
          type="file"
        />
        <button
          disabled={!editable || uploading}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          {uploading ? 'Uploading attachments' : 'Add attachments'}
        </button>
        {message.files.map((file) => (
          <StyledAttachment key={file.id}>
            <span>{file.name}</span>
            <button
              aria-label={`Remove attachment ${file.name}`}
              disabled={!editable}
              onClick={() =>
                onChange({
                  ...message,
                  files: message.files.filter(({ id }) => id !== file.id),
                })
              }
              type="button"
            >
              Remove
            </button>
          </StyledAttachment>
        ))}
      </StyledAttachments>
      <label>
        <input
          aria-label="Reply to earlier email"
          checked={message.replyToThread}
          disabled={!editable || !canReply}
          onChange={(event) =>
            onChange({ ...message, replyToThread: event.target.checked })
          }
          type="checkbox"
        />
        Reply to the most recent earlier email in this sequence
      </label>
      <StyledHint>
        Replies use verified sent evidence for the same Campaign Creator.
        Missing or ambiguous thread evidence holds that Creator instead of
        starting a new thread.
      </StyledHint>
      {invalidRetainedReply ? (
        <>
          <StyledWarning>
            Move this email after an earlier email or turn off reply.
          </StyledWarning>
          <button
            disabled={!editable}
            onClick={() => onChange({ ...message, replyToThread: false })}
            type="button"
          >
            Turn off reply
          </button>
        </>
      ) : null}
      {messageIssues
        .filter(
          ({ path }) => !path.endsWith('.subject') && !path.endsWith('.body'),
        )
        .map((issue) => (
          <StyledWarning key={`${issue.code}-${issue.path}`}>
            {issue.message}
          </StyledWarning>
        ))}
    </StyledEditor>
  );
};
