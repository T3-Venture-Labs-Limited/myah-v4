import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MyahSocialProfileAddRow } from '@/myah/creator-crm/components/MyahSocialProfileAddRow';

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    disabled,
    type,
  }: {
    title: string;
    disabled: boolean;
    type: 'submit';
  }) => (
    <button disabled={disabled} type={type}>
      {title}
    </button>
  ),
}));

const objectMetadataItem = {
  fields: [
    {
      name: 'platform',
      options: [
        { value: 'TIKTOK', label: 'TikTok' },
        { value: 'INSTAGRAM', label: 'Instagram' },
      ],
    },
  ],
} as never;

describe('MyahSocialProfileAddRow', () => {
  it('creates a profile with platform and handle in one step, defaulting to Instagram', async () => {
    const onCreate = jest.fn().mockResolvedValue(undefined);
    render(
      <MyahSocialProfileAddRow
        objectMetadataItem={objectMetadataItem}
        onCreate={onCreate}
      />,
    );

    // Inside a record table, drag-selection must not swallow clicks here.
    expect(
      screen.getByRole('form', { name: 'Add social profile' }),
    ).toHaveAttribute('data-select-disable', 'true');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Handle'), {
      target: { value: '@myah_dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        platform: 'INSTAGRAM',
        handle: 'myah_dev',
        position: 'last',
      }),
    );
    expect(screen.getByLabelText('Handle')).toHaveValue('');
  });

  it('keeps the handle and explains when the profile is rejected', async () => {
    const onCreate = jest.fn().mockRejectedValue(new Error('duplicate'));
    render(
      <MyahSocialProfileAddRow
        objectMetadataItem={objectMetadataItem}
        onCreate={onCreate}
      />,
    );
    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'TIKTOK' },
    });
    fireEvent.change(screen.getByLabelText('Handle'), {
      target: { value: 'taken.handle' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add this profile. Check the handle.',
    );
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'TIKTOK' }),
    );
    expect(screen.getByLabelText('Handle')).toHaveValue('taken.handle');
  });
});
