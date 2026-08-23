import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useMediaQuery } from 'react-responsive';
import { Status } from 'twenty-ui/data-display';
import { Card, CardContent, CardHeader } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { type ManagedEmailMailbox } from '~/generated-metadata/graphql';

export type ManagedMailboxTableItem = Pick<
  ManagedEmailMailbox,
  | 'address'
  | 'campaignEligibility'
  | 'domain'
  | 'id'
  | 'personaDisplayName'
  | 'warmupState'
> &
  Partial<Pick<ManagedEmailMailbox, 'infrastructureState' | 'personaRole'>>;

type ManagedMailboxTableProps = {
  mailboxes: ManagedMailboxTableItem[];
};

const COMPACT_LAYOUT_MAX_VIEWPORT = 1023;
const MAILBOX_TABLE_GRID_TEMPLATE =
  'minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)';
const DESKTOP_INVENTORY_ROW_HEIGHT = '64px';

const StyledStackedContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;

  & > * {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledDetails = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;

  & > div {
    align-items: center;
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
  }

  dt {
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

export const ManagedMailboxTable = ({
  mailboxes,
}: ManagedMailboxTableProps) => {
  const { t } = useLingui();
  const isCompactLayout = useMediaQuery({
    query: `(max-width: ${COMPACT_LAYOUT_MAX_VIEWPORT}px)`,
  });

  const infrastructureStatus = (mailbox: ManagedMailboxTableItem) => {
    if (mailbox.infrastructureState === undefined) {
      return null;
    }

    if (mailbox.infrastructureState === 'ACTIVE') {
      return <Status color="green" text={t`Ready`} />;
    }

    if (
      mailbox.infrastructureState === 'ORDERING' ||
      mailbox.infrastructureState === 'PROVISIONING_MAILBOX' ||
      mailbox.infrastructureState === 'WAITING_FOR_CREDENTIALS' ||
      mailbox.infrastructureState === 'CONNECTING_TWENTY'
    ) {
      return <Status color="yellow" text={t`Setting up`} />;
    }

    if (mailbox.infrastructureState === 'DEACTIVATING') {
      return <Status color="yellow" text={t`Stopping`} />;
    }

    if (mailbox.infrastructureState === 'INACTIVE') {
      return <Status color="gray" text={t`Inactive`} />;
    }

    return <Status color="red" text={t`Action required`} />;
  };

  const warmupStatus = (mailbox: ManagedMailboxTableItem) => {
    switch (mailbox.warmupState) {
      case 'MAINTENANCE':
        return <Status color="green" text={t`Ready`} />;
      case 'NOT_APPLICABLE':
        return <Status color="green" text={t`Prewarmed`} />;
      case 'CONNECTING':
      case 'WARMING':
        return <Status color="yellow" text={t`Warming`} />;
      case 'CANCEL_AT_PERIOD_END':
        return <Status color="gray" text={t`Ends after paid period`} />;
      case 'PAUSED':
        return <Status color="gray" text={t`Paused`} />;
      case 'DELETING':
      case 'DELETED':
        return <Status color="gray" text={t`Unavailable`} />;
      case 'ACTION_REQUIRED':
      case 'RECONCILIATION_REQUIRED':
      default:
        return <Status color="red" text={t`Action required`} />;
    }
  };

  const campaignStatus = (mailbox: ManagedMailboxTableItem) =>
    mailbox.campaignEligibility === 'ELIGIBLE' ? (
      <Status color="green" text={t`Ready`} />
    ) : (
      <Status color="gray" text={t`New threads blocked`} />
    );

  if (isCompactLayout) {
    return (
      <StyledCards>
        {mailboxes.map((mailbox) => (
          <Card key={mailbox.id} fullWidth rounded>
            <CardHeader>
              <StyledStackedContent>
                <strong>{mailbox.personaDisplayName}</strong>
                <span>{mailbox.address}</span>
              </StyledStackedContent>
            </CardHeader>
            <CardContent>
              <StyledDetails>
                {mailbox.personaRole !== undefined &&
                  mailbox.personaRole !== null && (
                    <div>
                      <dt>{t`Identity`}</dt>
                      <dd>{mailbox.personaRole}</dd>
                    </div>
                  )}
                <div>
                  <dt>{t`Domain`}</dt>
                  <dd>{mailbox.domain}</dd>
                </div>
                <div>
                  <dt>{t`Infrastructure`}</dt>
                  <dd>{infrastructureStatus(mailbox)}</dd>
                </div>
                <div>
                  <dt>{t`Warmup`}</dt>
                  <dd>{warmupStatus(mailbox)}</dd>
                </div>
                <div>
                  <dt>{t`Campaigns`}</dt>
                  <dd>{campaignStatus(mailbox)}</dd>
                </div>
              </StyledDetails>
            </CardContent>
          </Card>
        ))}
      </StyledCards>
    );
  }

  return (
    <Table role="table" aria-label={t`Managed email mailboxes`}>
      <TableRow role="row" gridTemplateColumns={MAILBOX_TABLE_GRID_TEMPLATE}>
        <TableHeader role="columnheader">{t`Mailbox`}</TableHeader>
        <TableHeader role="columnheader">{t`Domain`}</TableHeader>
        <TableHeader role="columnheader">{t`Infrastructure`}</TableHeader>
        <TableHeader role="columnheader">{t`Warmup`}</TableHeader>
        <TableHeader role="columnheader">{t`Campaigns`}</TableHeader>
      </TableRow>
      <TableBody>
        {mailboxes.map((mailbox) => (
          <TableRow
            key={mailbox.id}
            role="row"
            gridTemplateColumns={MAILBOX_TABLE_GRID_TEMPLATE}
            height={DESKTOP_INVENTORY_ROW_HEIGHT}
          >
            <TableCell
              role="cell"
              height={DESKTOP_INVENTORY_ROW_HEIGHT}
              minWidth="0"
              overflow="hidden"
            >
              <StyledStackedContent>
                <strong title={mailbox.personaDisplayName}>
                  {mailbox.personaDisplayName}
                </strong>
                <span title={mailbox.address}>{mailbox.address}</span>
                {mailbox.personaRole !== undefined &&
                  mailbox.personaRole !== null && (
                    <span title={mailbox.personaRole}>
                      {mailbox.personaRole}
                    </span>
                  )}
              </StyledStackedContent>
            </TableCell>
            <TableCell
              role="cell"
              height={DESKTOP_INVENTORY_ROW_HEIGHT}
              minWidth="0"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {mailbox.domain}
            </TableCell>
            <TableCell role="cell" height={DESKTOP_INVENTORY_ROW_HEIGHT}>
              {infrastructureStatus(mailbox)}
            </TableCell>
            <TableCell role="cell" height={DESKTOP_INVENTORY_ROW_HEIGHT}>
              {warmupStatus(mailbox)}
            </TableCell>
            <TableCell role="cell" height={DESKTOP_INVENTORY_ROW_HEIGHT}>
              {campaignStatus(mailbox)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
