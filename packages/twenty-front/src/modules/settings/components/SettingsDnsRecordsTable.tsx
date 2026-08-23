import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useId } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Status } from 'twenty-ui/data-display';
import { IconCopy } from 'twenty-ui/icon';
import { LightIconButton } from 'twenty-ui/input';
import { Card, CardContent, CardHeader } from 'twenty-ui/surfaces';
import { type ThemeColor } from 'twenty-ui/theme';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

export type SettingsDnsRecord = {
  type: string;
  key: string;
  value: string;
  priority?: number | null;
  ttl?: string | null;
  status?: string;
  statusColor?: ThemeColor;
  observedValue?: string | null;
  safeProblem?: string | null;
};

export type SettingsDnsRecordsTableProps = {
  records: SettingsDnsRecord[];
  domain?: string;
  ariaLabel?: string;
};

const StyledTableHead = styled.div`
  min-width: 0;
`;

const StyledMonospaceTableCell = styled(TableCell)`
  font-family: ${themeCssVariables.code.font.family};
  min-width: 0;
`;

const StyledDesktopCopyableValue = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledDesktopValueText = styled.div`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  user-select: text;
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledRecordDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[1]} 0;
`;

const StyledDetailLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  display: block;
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledDetailText = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledEmptyState = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  padding: ${themeCssVariables.spacing[8]};
  text-align: center;
`;

const StyledMobileRecords = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
  width: 100%;
`;

const StyledMobileRecordCard = styled(Card)`
  min-width: 0;
`;

const StyledMobileRecordTitle = styled.span`
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
`;

const StyledMobileRecordDetails = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;
  min-width: 0;

  > div {
    align-items: start;
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    min-width: 0;
  }

  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

const StyledMobileCopyableValue = styled.div`
  align-items: flex-start;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledMobileValueText = styled.div`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  user-select: text;
  white-space: pre-wrap;
  word-break: break-word;
`;

const getStatusColor = ({
  status,
  statusColor,
}: Pick<SettingsDnsRecord, 'status' | 'statusColor'>): ThemeColor => {
  if (isDefined(statusColor)) {
    return statusColor;
  }

  switch (status?.toLowerCase().replace(/_/g, '-')) {
    case 'verified':
    case 'success':
    case 'completed':
    case 'mailbox-connected':
      return 'green';
    case 'pending':
    case 'verification-required':
    case 'checking':
    case 'checking-dns':
    case 'warning':
      return 'yellow';
    case 'action-required':
    case 'invalid':
    case 'failed':
    case 'check-failed':
    case 'error':
      return 'red';
    case 'unknown':
    default:
      return 'gray';
  }
};

const getStatusLabel = (status: string) => {
  switch (status.toLowerCase().replace(/_/g, '-')) {
    case 'verified':
    case 'success':
    case 'completed':
      return t`Verified`;
    case 'mailbox-connected':
      return t`Mailbox connected`;
    case 'pending':
      return t`Pending`;
    case 'verification-required':
      return t`Verification required`;
    case 'checking':
      return t`Checking`;
    case 'checking-dns':
      return t`Checking DNS`;
    case 'action-required':
      return t`Action required`;
    case 'failed':
    case 'check-failed':
    case 'invalid':
      return t`Failed`;
    case 'error':
      return t`Error`;
    case 'warning':
      return t`Warning`;
    case 'unknown':
    default:
      return t`Unknown`;
  }
};

export const SettingsDnsRecordsTable = ({
  records,
  domain,
  ariaLabel,
}: SettingsDnsRecordsTableProps) => {
  const { copyToClipboard } = useCopyToClipboard();
  const isMobile = useIsMobile();
  const dnsRecordsId = useId();
  const normalizedDomain = domain?.trim() || undefined;
  const tableLabel =
    ariaLabel?.trim() ||
    (isDefined(normalizedDomain)
      ? t`DNS records for ${normalizedDomain}`
      : t`DNS records`);

  if (records.length === 0) {
    return (
      <StyledEmptyState role="status" aria-label={tableLabel}>
        {isDefined(normalizedDomain)
          ? t`No DNS records are required for ${normalizedDomain}`
          : t`No DNS records are required`}
      </StyledEmptyState>
    );
  }

  const hasTtlRecords = records.some((record) => isDefined(record.ttl));
  const hasStatusRecords = records.some((record) => isDefined(record.status));
  const hasPriorityRecords = records.some((record) =>
    isDefined(record.priority),
  );

  if (isMobile) {
    return (
      <StyledMobileRecords aria-label={tableLabel}>
        {records.map((record, recordIndex) => {
          const recordId = `${dnsRecordsId}-${recordIndex}`;
          const recordTitleId = `${recordId}-title`;
          const hostValueId = `${recordId}-host-value`;
          const expectedValueId = `${recordId}-expected-value`;
          const observedValueId = `${recordId}-observed-value`;
          const safeProblemId = `${recordId}-safe-problem`;
          const recordAriaLabelledBy = `${recordTitleId} ${hostValueId}`;
          const recordAriaDescribedBy = `${expectedValueId}${
            isDefined(record.observedValue) ? ` ${observedValueId}` : ''
          }${isDefined(record.safeProblem) ? ` ${safeProblemId}` : ''}`;
          const copyHostLabel = isDefined(normalizedDomain)
            ? t`Copy host ${record.key} for ${record.type} record on ${normalizedDomain}`
            : t`Copy host ${record.key} for ${record.type} record`;
          const copyValueLabel = isDefined(normalizedDomain)
            ? t`Copy value for ${record.type} record ${record.key} on ${normalizedDomain}`
            : t`Copy value for ${record.type} record ${record.key}`;

          return (
            <StyledMobileRecordCard
              key={`${record.type}:${record.key}:${record.value}`}
              fullWidth
              rounded
              role="article"
              aria-labelledby={recordAriaLabelledBy}
              aria-describedby={recordAriaDescribedBy}
            >
              <CardHeader>
                <StyledMobileRecordTitle id={recordTitleId}>
                  {t`${record.type} record`}
                </StyledMobileRecordTitle>
              </CardHeader>
              <CardContent>
                <StyledMobileRecordDetails>
                  <div>
                    <dt>{t`Type`}</dt>
                    <dd>{record.type}</dd>
                  </div>
                  <div>
                    <dt>{t`Host / Name`}</dt>
                    <dd>
                      <StyledMobileCopyableValue>
                        <StyledMobileValueText id={hostValueId}>
                          {record.key}
                        </StyledMobileValueText>
                        <LightIconButton
                          Icon={IconCopy}
                          size="medium"
                          aria-label={copyHostLabel}
                          title={copyHostLabel}
                          onClick={() => copyToClipboard(record.key)}
                        />
                      </StyledMobileCopyableValue>
                    </dd>
                  </div>
                  <div>
                    <dt>{t`Value`}</dt>
                    <dd>
                      <StyledMobileCopyableValue>
                        <StyledMobileValueText id={expectedValueId}>
                          <StyledDetailLabel>{t`Expected value`}</StyledDetailLabel>
                          {record.value}
                        </StyledMobileValueText>
                        <LightIconButton
                          Icon={IconCopy}
                          size="medium"
                          aria-label={copyValueLabel}
                          title={copyValueLabel}
                          onClick={() => copyToClipboard(record.value)}
                        />
                      </StyledMobileCopyableValue>
                    </dd>
                  </div>
                  {isDefined(record.priority) && (
                    <div>
                      <dt>{t`Priority`}</dt>
                      <dd>{record.priority}</dd>
                    </div>
                  )}
                  {isDefined(record.ttl) && (
                    <div>
                      <dt>{t`TTL`}</dt>
                      <dd>{record.ttl}</dd>
                    </div>
                  )}
                  {isDefined(record.status) && (
                    <div>
                      <dt>{t`Status`}</dt>
                      <dd>
                        <Status
                          color={getStatusColor(record)}
                          text={getStatusLabel(record.status)}
                        />
                      </dd>
                    </div>
                  )}
                  {isDefined(record.observedValue) && (
                    <div id={observedValueId}>
                      <dt>{t`Observed value`}</dt>
                      <dd>
                        <StyledDetailText>
                          {record.observedValue}
                        </StyledDetailText>
                      </dd>
                    </div>
                  )}
                  {isDefined(record.safeProblem) && (
                    <div id={safeProblemId}>
                      <dt>{t`Problem`}</dt>
                      <dd>
                        <StyledDetailText>
                          {record.safeProblem}
                        </StyledDetailText>
                      </dd>
                    </div>
                  )}
                </StyledMobileRecordDetails>
              </CardContent>
            </StyledMobileRecordCard>
          );
        })}
      </StyledMobileRecords>
    );
  }

  const gridTemplateColumns = [
    themeCssVariables.spacing[16],
    'minmax(0, 1fr)',
    'minmax(0, 1.5fr)',
    ...(hasPriorityRecords ? [themeCssVariables.spacing[16]] : []),
    ...(hasTtlRecords ? [themeCssVariables.spacing[12]] : []),
    ...(hasStatusRecords ? [themeCssVariables.spacing[20]] : []),
  ].join(' ');

  return (
    <Table role="table" aria-label={tableLabel}>
      <StyledTableHead role="rowgroup">
        <TableRow role="row" gridTemplateColumns={gridTemplateColumns}>
          <TableHeader role="columnheader" align="left">
            {t`Type`}
          </TableHeader>
          <TableHeader role="columnheader" align="left">
            {t`Host / Name`}
          </TableHeader>
          <TableHeader role="columnheader" align="left">
            {t`Value`}
          </TableHeader>
          {hasPriorityRecords && (
            <TableHeader role="columnheader" align="left">
              {t`Priority`}
            </TableHeader>
          )}
          {hasTtlRecords && (
            <TableHeader role="columnheader" align="left">
              {t`TTL`}
            </TableHeader>
          )}
          {hasStatusRecords && (
            <TableHeader role="columnheader" align="left">
              {t`Status`}
            </TableHeader>
          )}
        </TableRow>
      </StyledTableHead>
      <TableBody role="rowgroup">
        {records.map((record) => {
          const hasRecordDetails =
            isDefined(record.observedValue) || isDefined(record.safeProblem);
          const copyHostLabel = isDefined(normalizedDomain)
            ? t`Copy host ${record.key} for ${record.type} record on ${normalizedDomain}`
            : t`Copy host ${record.key} for ${record.type} record`;
          const copyValueLabel = isDefined(normalizedDomain)
            ? t`Copy value for ${record.type} record ${record.key} on ${normalizedDomain}`
            : t`Copy value for ${record.type} record ${record.key}`;

          return (
            <TableRow
              key={`${record.type}:${record.key}:${record.value}`}
              role="row"
              gridTemplateColumns={gridTemplateColumns}
            >
              <TableCell role="cell" align="left" height="auto">
                {record.type}
              </TableCell>
              <StyledMonospaceTableCell role="cell" align="left" height="auto">
                <StyledDesktopCopyableValue>
                  <StyledDesktopValueText>{record.key}</StyledDesktopValueText>
                  <LightIconButton
                    Icon={IconCopy}
                    size="small"
                    aria-label={copyHostLabel}
                    title={copyHostLabel}
                    onClick={() => copyToClipboard(record.key)}
                  />
                </StyledDesktopCopyableValue>
              </StyledMonospaceTableCell>
              <StyledMonospaceTableCell role="cell" align="left" height="auto">
                <StyledDesktopCopyableValue>
                  <StyledDesktopValueText>
                    {hasRecordDetails && (
                      <StyledDetailLabel>{t`Expected value`}</StyledDetailLabel>
                    )}
                    {record.value}
                  </StyledDesktopValueText>
                  <LightIconButton
                    Icon={IconCopy}
                    size="small"
                    aria-label={copyValueLabel}
                    title={copyValueLabel}
                    onClick={() => copyToClipboard(record.value)}
                  />
                </StyledDesktopCopyableValue>
                {(isDefined(record.observedValue) ||
                  isDefined(record.safeProblem)) && (
                  <StyledRecordDetails>
                    {isDefined(record.observedValue) && (
                      <StyledDetailText>
                        <StyledDetailLabel>{t`Observed value`}</StyledDetailLabel>
                        {record.observedValue}
                      </StyledDetailText>
                    )}
                    {isDefined(record.safeProblem) && (
                      <StyledDetailText>
                        <StyledDetailLabel>{t`Problem`}</StyledDetailLabel>
                        {record.safeProblem}
                      </StyledDetailText>
                    )}
                  </StyledRecordDetails>
                )}
              </StyledMonospaceTableCell>
              {hasPriorityRecords && (
                <StyledMonospaceTableCell
                  role="cell"
                  align="left"
                  height="auto"
                  overflow="hidden"
                >
                  {record.priority}
                </StyledMonospaceTableCell>
              )}
              {hasTtlRecords && (
                <StyledMonospaceTableCell
                  role="cell"
                  align="left"
                  height="auto"
                  overflow="hidden"
                >
                  {record.ttl}
                </StyledMonospaceTableCell>
              )}
              {hasStatusRecords && (
                <TableCell role="cell" align="left" height="auto">
                  {isDefined(record.status) ? (
                    <Status
                      color={getStatusColor(record)}
                      text={getStatusLabel(record.status)}
                    />
                  ) : null}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
