import { UPDATE_CONNECTED_ACCOUNT_SENDING_POLICY } from '@/settings/accounts/graphql/mutations/updateConnectedAccountSendingPolicy';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { useMutation } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';

type SettingsAccountSendingPolicyProps = {
  connectedAccountId: string;
  dailySendLimit: number;
  minimumSendIntervalMs: number;
};

type UpdateConnectedAccountSendingPolicyData = {
  updateConnectedAccountSendingPolicy: {
    id: string;
    dailySendLimit: number;
    minimumSendIntervalMs: number;
  };
};

type UpdateConnectedAccountSendingPolicyVariables = {
  input: {
    connectedAccountId: string;
    dailySendLimit: number;
    minimumSendIntervalMs: number;
  };
};

const parsePositiveInteger = (value: string) => {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
};

export const SettingsAccountSendingPolicy = ({
  connectedAccountId,
  dailySendLimit,
  minimumSendIntervalMs,
}: SettingsAccountSendingPolicyProps) => {
  const [dailySendLimitInput, setDailySendLimitInput] = useState(
    String(dailySendLimit),
  );
  const [minimumSendIntervalMsInput, setMinimumSendIntervalMsInput] = useState(
    String(minimumSendIntervalMs),
  );
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const [updateConnectedAccountSendingPolicy, { loading }] = useMutation<
    UpdateConnectedAccountSendingPolicyData,
    UpdateConnectedAccountSendingPolicyVariables
  >(UPDATE_CONNECTED_ACCOUNT_SENDING_POLICY);

  const parsedDailySendLimit = parsePositiveInteger(dailySendLimitInput);
  const parsedMinimumSendIntervalMs = parsePositiveInteger(
    minimumSendIntervalMsInput,
  );
  const isValid =
    parsedDailySendLimit !== null && parsedMinimumSendIntervalMs !== null;

  const saveSendingPolicy = async () => {
    if (!isValid) {
      return;
    }

    try {
      await updateConnectedAccountSendingPolicy({
        variables: {
          input: {
            connectedAccountId,
            dailySendLimit: parsedDailySendLimit,
            minimumSendIntervalMs: parsedMinimumSendIntervalMs,
          },
        },
      });
      enqueueSuccessSnackBar({ message: t`Sending policy updated` });
    } catch (error) {
      if (CombinedGraphQLErrors.is(error)) {
        enqueueErrorSnackBar({ apolloError: error });
      } else {
        enqueueErrorSnackBar({ message: t`Failed to update sending policy` });
      }
    }
  };

  return (
    <Section>
      <H2Title
        title={t`Sending policy`}
        description={t`Set the daily limit and minimum interval for outbound email from this account.`}
      />
      <SettingsTextInput
        instanceId={`connected-account-${connectedAccountId}-daily-send-limit`}
        label={t`Daily send limit`}
        min={1}
        step={1}
        type="number"
        value={dailySendLimitInput}
        onChange={setDailySendLimitInput}
      />
      <SettingsTextInput
        instanceId={`connected-account-${connectedAccountId}-minimum-send-interval`}
        label={t`Minimum send interval (milliseconds)`}
        min={1}
        step={1}
        type="number"
        value={minimumSendIntervalMsInput}
        onChange={setMinimumSendIntervalMsInput}
      />
      <Button
        title={t`Save sending policy`}
        variant="secondary"
        size="small"
        isLoading={loading}
        disabled={!isValid || loading}
        onClick={saveSendingPolicy}
      />
    </Section>
  );
};
