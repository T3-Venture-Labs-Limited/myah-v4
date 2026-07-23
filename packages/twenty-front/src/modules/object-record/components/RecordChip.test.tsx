import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { RecordChip } from '@/object-record/components/RecordChip';

const openGenericRecordInSidePanel = jest.fn();
const openRecordInSidePanel = jest.fn();

jest.mock('@/object-record/hooks/useRecordChipData', () => ({
  useRecordChipData: () => ({
    recordChipData: {
      name: 'Creator List',
      avatarType: 'rounded',
      avatarUrl: undefined,
    },
  }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => 'SIDE_PANEL',
}));

jest.mock('@/object-record/utils/canOpenObjectInSidePanel', () => ({
  canOpenObjectInSidePanel: () => true,
}));

jest.mock('~/generated-metadata/graphql', () => ({
  ViewOpenRecordIn: { SIDE_PANEL: 'SIDE_PANEL' },
}));

const CurrentLocation = () => {
  const location = useLocation();

  return <output>{`${location.pathname}${location.search}`}</output>;
};

describe('RecordChip identifier navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('follows a Creator List identifier link instead of opening the generic side panel in SIDE_PANEL mode', () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/objects/creator-lists']}
      >
        <RecordChip
          objectNameSingular="creatorList"
          record={{ id: 'list-id' } as never}
          to="/objects/creators?creatorListId=list-id"
          triggerEvent="CLICK"
          onClick={openGenericRecordInSidePanel}
        />
        <CurrentLocation />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Creator List/ }));

    expect(screen.getByRole('status')).toHaveTextContent(
      '/objects/creators?creatorListId=list-id',
    );
    expect(openGenericRecordInSidePanel).not.toHaveBeenCalled();
    expect(openRecordInSidePanel).not.toHaveBeenCalled();
  });

  it('follows a Creator List identifier link without opening the generic side panel in MOUSE_DOWN mode', () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/objects/creator-lists']}
      >
        <RecordChip
          objectNameSingular="creatorList"
          record={{ id: 'list-id' } as never}
          to="/objects/creators?creatorListId=list-id"
          triggerEvent="MOUSE_DOWN"
          onClick={openGenericRecordInSidePanel}
        />
        <CurrentLocation />
      </MemoryRouter>,
    );

    fireEvent.mouseDown(screen.getByRole('link', { name: /Creator List/ }));

    expect(screen.getByRole('status')).toHaveTextContent(
      '/objects/creators?creatorListId=list-id',
    );
    expect(openGenericRecordInSidePanel).not.toHaveBeenCalled();
    expect(openRecordInSidePanel).not.toHaveBeenCalled();
  });

  it.each([
    ['CLICK', 'click'],
    ['MOUSE_DOWN', 'mouseDown'],
  ] as const)(
    'retains generic side-panel handling for a Creator List show destination on %s',
    (triggerEvent, eventName) => {
      render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/objects/creator-lists']}
        >
          <RecordChip
            objectNameSingular="creatorList"
            record={{ id: 'list-id' } as never}
            to="/objects/creator-lists/list-id"
            triggerEvent={triggerEvent}
            onClick={openGenericRecordInSidePanel}
          />
          <CurrentLocation />
        </MemoryRouter>,
      );

      fireEvent[eventName](screen.getByRole('link', { name: /Creator List/ }));

      expect(openGenericRecordInSidePanel).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent(
        '/objects/creator-lists',
      );
    },
  );
  it.each([
    ['CLICK', 'click'],
    ['MOUSE_DOWN', 'mouseDown'],
  ] as const)(
    'retains generic side-panel handling for a non-Creator List chip with a filtered-Creators destination on %s',
    (triggerEvent, eventName) => {
      render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/objects/creators']}
        >
          <RecordChip
            objectNameSingular="creator"
            record={{ id: 'creator-id' } as never}
            to="/objects/creators?creatorListId=list-id"
            triggerEvent={triggerEvent}
            onClick={openGenericRecordInSidePanel}
          />
          <CurrentLocation />
        </MemoryRouter>,
      );

      fireEvent[eventName](screen.getByRole('link', { name: /Creator List/ }));

      expect(openGenericRecordInSidePanel).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent('/objects/creators');
    },
  );

  it('retains generic identifier side-panel handling for other objects', () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/objects/creators']}
      >
        <RecordChip
          objectNameSingular="creator"
          record={{ id: 'creator-id' } as never}
          to="/objects/creators/creator-id"
          triggerEvent="CLICK"
          onClick={openGenericRecordInSidePanel}
        />
        <CurrentLocation />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Creator List/ }));

    expect(openGenericRecordInSidePanel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('/objects/creators');
  });
});
