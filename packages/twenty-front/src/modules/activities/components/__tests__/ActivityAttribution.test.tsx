import { render, screen } from '@testing-library/react';

import { ActivityAttribution } from '@/activities/components/ActivityAttribution';

const createdAt = '2026-09-22T12:00:00.000Z';

describe('ActivityAttribution', () => {
  it('shows recorded author, source and creation date', () => {
    render(
      <ActivityAttribution
        createdAt={createdAt}
        createdBy={{ name: 'Alex Rivera', source: 'IMPORT' }}
      />,
    );

    expect(screen.getByText(/Created by Alex Rivera/)).toBeVisible();
    expect(screen.getByText(/Source: IMPORT/)).toBeVisible();
    expect(screen.getByText(/Sep 22, 2026/)).toBeVisible();
  });

  it('does not invent an author or source when metadata is missing', () => {
    render(<ActivityAttribution createdAt={createdAt} />);

    expect(screen.getByText(/Author unavailable/)).toBeVisible();
    expect(screen.queryByText(/Source:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sep 22, 2026/)).toBeVisible();
  });

  it('does not display an invalid or missing timestamp as a creation date', () => {
    render(
      <ActivityAttribution
        createdAt="not-a-date"
        createdBy={{ name: ' ', source: '' }}
      />,
    );

    expect(screen.getByText(/Author unavailable/)).toBeVisible();
    expect(screen.queryByText(/Source:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sep 22, 2026/)).not.toBeInTheDocument();
  });
});
