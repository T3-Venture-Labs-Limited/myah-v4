import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useMediaQuery } from 'react-responsive';
import { Status } from 'twenty-ui/data-display';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { Card, CardContent, CardHeader } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import {
  type ManagedEmailDomain,
  type ManagedEmailMailbox,
  type ManagedEmailOverview,
} from '~/generated-metadata/graphql';
import { ManagedMailboxTable } from './ManagedMailboxTable';

type ManagedEmailDashboardProps = {
  domains: ManagedEmailDomain[];
  mailboxes: ManagedEmailMailbox[];
  onBrowsePrewarmedInventory: () => void;
  onSetUpManagedEmail: () => void;
  onConnectExistingMailbox: () => void;
  overview: ManagedEmailOverview;
};

const COMPACT_LAYOUT_MAX_VIEWPORT = 1023;
const DOMAIN_TABLE_GRID_TEMPLATE =
  'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr)';
const DESKTOP_INVENTORY_ROW_HEIGHT = '64px';

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSummaryCards = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: ${COMPACT_LAYOUT_MAX_VIEWPORT}px) {
    grid-template-columns: 1fr;
  }
`;

const StyledInventory = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
`;

const StyledGuidance = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
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

const formatDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : null;

const DomainStatus = ({ domain }: { domain: ManagedEmailDomain }) => {
  const { t } = useLingui();

  if (domain.infrastructureState === 'ACTIVE') {
    return <Status color="green" text={t`Ready`} />;
  }

  if (
    domain.infrastructureState === 'ORDERING' ||
    domain.infrastructureState === 'PROVISIONING_DOMAIN'
  ) {
    return <Status color="yellow" text={t`Setting up`} />;
  }

  if (domain.infrastructureState === 'DEACTIVATING') {
    return <Status color="yellow" text={t`Stopping`} />;
  }

  if (domain.infrastructureState === 'INACTIVE') {
    return <Status color="gray" text={t`Inactive`} />;
  }

  return <Status color="red" text={t`Action required`} />;
};

const DomainCompactCard = ({ domain }: { domain: ManagedEmailDomain }) => {
  const { t } = useLingui();
  const paidThrough = formatDate(domain.paidThrough);

  return (
    <Card fullWidth rounded>
      <CardHeader>{domain.domain}</CardHeader>
      <CardContent>
        <StyledDetails>
          <div>
            <dt>{t`Status`}</dt>
            <dd>
              <DomainStatus domain={domain} />
            </dd>
          </div>
          <div>
            <dt>{t`Mailboxes`}</dt>
            <dd>{t`${domain.dependentMailboxCount} mailboxes`}</dd>
          </div>
          <div>
            <dt>{t`Renewal`}</dt>
            <dd>
              {domain.cancelAtPeriodEnd || !domain.renewalEnabled
                ? t`Ends after paid period`
                : t`Renews automatically`}
              {paidThrough === null ? '' : t` · Paid through ${paidThrough}`}
            </dd>
          </div>
        </StyledDetails>
      </CardContent>
    </Card>
  );
};

export const ManagedEmailDashboard = ({
  domains,
  mailboxes,
  onBrowsePrewarmedInventory,
  onConnectExistingMailbox,
  onSetUpManagedEmail,
  overview,
}: ManagedEmailDashboardProps) => {
  const { t } = useLingui();
  const isCompactLayout = useMediaQuery({
    query: `(max-width: ${COMPACT_LAYOUT_MAX_VIEWPORT}px)`,
  });
  const warmupStates = mailboxes.map(({ warmupState }) => warmupState);
  const warmupNeedsAttention = warmupStates.some(
    (state) =>
      state === 'ACTION_REQUIRED' || state === 'RECONCILIATION_REQUIRED',
  );
  const warmingMailboxCount = warmupStates.filter(
    (state) => state === 'CONNECTING' || state === 'WARMING',
  ).length;
  const warmupIsProgressing = warmingMailboxCount > 0;
  const allWarmupUnavailable =
    mailboxes.length > 0 &&
    warmupStates.every((state) => state === 'DELETING' || state === 'DELETED');
  const allWarmupPaused =
    mailboxes.length > 0 && warmupStates.every((state) => state === 'PAUSED');
  const allWarmupReady =
    mailboxes.length > 0 &&
    warmupStates.every(
      (state) =>
        state === 'MAINTENANCE' ||
        state === 'NOT_APPLICABLE' ||
        state === 'CANCEL_AT_PERIOD_END',
    );
  const warmupStatus =
    mailboxes.length === 0 ? (
      <Status color="gray" text={t`No managed mailboxes`} />
    ) : warmupNeedsAttention ? (
      <Status color="red" text={t`Action required`} />
    ) : warmupIsProgressing ? (
      <Status color="yellow" text={t`Warming`} />
    ) : allWarmupUnavailable ? (
      <Status color="gray" text={t`Unavailable`} />
    ) : allWarmupPaused ? (
      <Status color="gray" text={t`Paused`} />
    ) : allWarmupReady ? (
      <Status color="green" text={t`Ready`} />
    ) : (
      <Status color="gray" text={t`Mixed status`} />
    );

  return (
    <>
      <Section>
        <StyledInventory>
          <H2Title
            title={t`Email infrastructure`}
            description={t`Manage sending domains, mailboxes, warmup, and campaign readiness.`}
          />
          <StyledActions>
            <Button
              title={t`Set up managed email`}
              variant="primary"
              disabled={!overview.acquisitionAvailable}
              onClick={onSetUpManagedEmail}
            />
            <Button
              title={t`Browse prewarmed inventory`}
              variant="secondary"
              disabled={!overview.acquisitionAvailable}
              onClick={onBrowsePrewarmedInventory}
            />
            <Button
              title={t`Connect existing mailbox`}
              variant="secondary"
              onClick={onConnectExistingMailbox}
            />
          </StyledActions>
          <StyledSummaryCards>
            <Card fullWidth rounded>
              <CardHeader>{t`Domains`}</CardHeader>
              <CardContent>{t`${overview.domainCount} managed sending domains`}</CardContent>
            </Card>
            <Card fullWidth rounded>
              <CardHeader>{t`Mailboxes`}</CardHeader>
              <CardContent>{t`${overview.mailboxCount} managed mailboxes`}</CardContent>
            </Card>
            <Card fullWidth rounded>
              <CardHeader>{t`Managed warmup`}</CardHeader>
              <CardContent>{warmupStatus}</CardContent>
            </Card>
          </StyledSummaryCards>
        </StyledInventory>
      </Section>

      <Section>
        <StyledInventory>
          <H2Title
            title={t`Domains`}
            description={t`${overview.domainCount} managed sending domains`}
          />
          <StyledActions>
            <Button title={t`Add domain`} variant="secondary" disabled />
            <StyledGuidance>
              {t`Independent domain setup is not available yet.`}
            </StyledGuidance>
          </StyledActions>
          {domains.length === 0 ? (
            <StyledGuidance>{t`No managed domains yet.`}</StyledGuidance>
          ) : isCompactLayout ? (
            <StyledInventory>
              {domains.map((domain) => (
                <DomainCompactCard key={domain.id} domain={domain} />
              ))}
            </StyledInventory>
          ) : (
            <Table role="table" aria-label={t`Managed email domains`}>
              <TableRow
                role="row"
                gridTemplateColumns={DOMAIN_TABLE_GRID_TEMPLATE}
              >
                <TableHeader role="columnheader">{t`Domain`}</TableHeader>
                <TableHeader role="columnheader">{t`Status`}</TableHeader>
                <TableHeader role="columnheader">{t`Mailboxes`}</TableHeader>
                <TableHeader role="columnheader">{t`Renewal`}</TableHeader>
              </TableRow>
              <TableBody>
                {domains.map((domain) => {
                  const paidThrough = formatDate(domain.paidThrough);

                  return (
                    <TableRow
                      key={domain.id}
                      role="row"
                      gridTemplateColumns={DOMAIN_TABLE_GRID_TEMPLATE}
                      height={DESKTOP_INVENTORY_ROW_HEIGHT}
                    >
                      <TableCell
                        height={DESKTOP_INVENTORY_ROW_HEIGHT}
                        role="cell"
                        minWidth="0"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                      >
                        <strong title={domain.domain}>{domain.domain}</strong>
                      </TableCell>
                      <TableCell
                        role="cell"
                        height={DESKTOP_INVENTORY_ROW_HEIGHT}
                      >
                        <DomainStatus domain={domain} />
                      </TableCell>
                      <TableCell
                        role="cell"
                        height={DESKTOP_INVENTORY_ROW_HEIGHT}
                      >
                        {t`${domain.dependentMailboxCount} mailboxes`}
                      </TableCell>
                      <TableCell
                        role="cell"
                        height={DESKTOP_INVENTORY_ROW_HEIGHT}
                        overflow="hidden"
                      >
                        <StyledInventory>
                          <span>
                            {domain.cancelAtPeriodEnd || !domain.renewalEnabled
                              ? t`Ends after paid period`
                              : t`Renews automatically`}
                          </span>
                          {paidThrough !== null && (
                            <StyledGuidance>
                              {t`Paid through ${paidThrough}`}
                            </StyledGuidance>
                          )}
                        </StyledInventory>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </StyledInventory>
      </Section>

      <Section>
        <StyledInventory>
          <H2Title
            title={t`Mailboxes`}
            description={t`${overview.mailboxCount} managed mailboxes`}
          />
          <StyledActions>
            <Button title={t`Add mailbox`} variant="secondary" disabled />
            <StyledGuidance>
              {t`Mailbox-only setup is not available yet.`}
            </StyledGuidance>
          </StyledActions>
          {mailboxes.length === 0 ? (
            <StyledGuidance>{t`No managed mailboxes yet.`}</StyledGuidance>
          ) : (
            <ManagedMailboxTable mailboxes={mailboxes} />
          )}
        </StyledInventory>
      </Section>

      <Section>
        <StyledInventory>
          <H2Title
            title={t`Managed warmup`}
            description={
              warmingMailboxCount === 1
                ? t`1 mailbox warming`
                : t`${warmingMailboxCount} mailboxes warming`
            }
          />
          <StyledActions>
            <Button
              title={t`Start managed warmup`}
              variant="secondary"
              disabled
            />
            <StyledGuidance>
              {t`Warmup-only setup is not available yet.`}
            </StyledGuidance>
          </StyledActions>
          {warmupStatus}
        </StyledInventory>
      </Section>
    </>
  );
};
