import { useTextFieldFocusProps } from '@/ui/utilities/focus/hooks/useTextFieldFocusProps';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const StyledRow = styled.form`
  /* Stay in the visible part of a wide, horizontally scrolling table. */
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  left: 0;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  position: sticky;
  width: max-content;

  select,
  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font: inherit;
    padding: ${themeCssVariables.spacing[1]};
  }

  input {
    width: 160px;
  }
`;
const StyledError = styled.span`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
`;

// A social profile needs a platform and a handle up front (MYAH-409 identity
// rules), so it cannot be created as an empty table row (MYAH-445).
export const MyahSocialProfileAddRow = ({
  objectMetadataItem,
  onCreate,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  onCreate: (input: Partial<ObjectRecord>) => Promise<unknown>;
}) => {
  const textFieldFocus = useTextFieldFocusProps();
  const platforms =
    objectMetadataItem.fields.find((field) => field.name === 'platform')
      ?.options ?? [];
  const [platform, setPlatform] = useState(
    platforms.find((option) => option.value === 'INSTAGRAM')?.value ??
      platforms[0]?.value ??
      '',
  );
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = handle.trim().replace(/^@/, '');

  return (
    <StyledRow
      aria-label="Add social profile"
      // The record table starts drag-selection on mousedown and cancels it,
      // which would stop these inputs from taking focus.
      data-select-disable="true"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!trimmed || !platform) return;
        setSaving(true);
        setError(null);
        try {
          await onCreate({ platform, handle: trimmed, position: 'last' });
          setHandle('');
        } catch {
          setError('Could not add this profile. Check the handle.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <select
        aria-label="Platform"
        value={platform}
        onChange={(event) => setPlatform(event.target.value)}
      >
        {platforms.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        onFocus={textFieldFocus.onFocus}
        onBlur={textFieldFocus.onBlur}
        aria-label="Handle"
        placeholder="handle or profile URL"
        value={handle}
        onChange={(event) => setHandle(event.target.value)}
      />
      <Button
        title={saving ? 'Adding…' : 'Add'}
        type="submit"
        variant="secondary"
        size="small"
        disabled={saving || !trimmed || !platform}
      />
      {error ? <StyledError role="alert">{error}</StyledError> : null}
    </StyledRow>
  );
};
