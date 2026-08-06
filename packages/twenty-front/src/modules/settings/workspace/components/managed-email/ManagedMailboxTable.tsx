import { useLingui } from '@lingui/react/macro';
import { Status } from 'twenty-ui/data-display';
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
>;

type ManagedMailboxTableProps = {
  mailboxes: ManagedMailboxTableItem[];
};

export const ManagedMailboxTable = ({
  mailboxes,
}: ManagedMailboxTableProps) => {
  const { t } = useLingui();

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

  const campaignStatus = (mailbox: ManagedMailboxTableItem) => {
    if (mailbox.campaignEligibility === 'ELIGIBLE') {
      return <Status color="green" text={t`Ready`} />;
    }

    return <Status color="gray" text={t`New threads blocked`} />;
  };

  return (
    <Table>
      <TableRow gridTemplateColumns="2fr 1fr 1fr 1fr">
        <TableHeader>{t`Mailbox`}</TableHeader>
        <TableHeader>{t`Domain`}</TableHeader>
        <TableHeader>{t`Warmup`}</TableHeader>
        <TableHeader>{t`Campaigns`}</TableHeader>
      </TableRow>
      <TableBody>
        {mailboxes.map((mailbox) => (
          <TableRow key={mailbox.id} gridTemplateColumns="2fr 1fr 1fr 1fr">
            <TableCell overflow="hidden">
              <div>
                <strong>{mailbox.personaDisplayName}</strong>
                <div>{mailbox.address}</div>
              </div>
            </TableCell>
            <TableCell overflow="hidden">{mailbox.domain}</TableCell>
            <TableCell>{warmupStatus(mailbox)}</TableCell>
            <TableCell>{campaignStatus(mailbox)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
