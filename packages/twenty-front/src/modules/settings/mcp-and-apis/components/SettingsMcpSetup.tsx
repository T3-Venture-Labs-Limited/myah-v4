import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Fragment } from 'react';

import { LightCopyIconButton } from '@/object-record/record-field/ui/components/LightCopyIconButton';
import ModelContextProtocolLogo from '@/settings/mcp-and-apis/assets/model-context-protocol-logo.svg?react';
import { SettingsMcpSetupCard } from '@/settings/mcp-and-apis/components/SettingsMcpSetupCard';
import { buildMcpSetupCategories } from '@/settings/mcp-and-apis/utils/buildMcpSetupCategories';
import {
  buildMcpConfig,
  buildMcpServerUrl,
  isHttpsUrl,
} from '@/settings/mcp-and-apis/utils/mcpSetup';
import { CoreEditorHeader } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const StyledMcpEditorHeaderTitle = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledMcpIcon = styled(ModelContextProtocolLogo)`
  color: inherit;
  flex-shrink: 0;
  height: calc(${themeCssVariables.icon.size.md} * 1px);
  width: calc(${themeCssVariables.icon.size.md} * 1px);
`;

const StyledMcpSetupContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[10]};
`;

const StyledCardsGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: 1fr;
  }
`;

const StyledMcpConfigPre = styled.pre`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 0 0 ${themeCssVariables.border.radius.md}
    ${themeCssVariables.border.radius.md};
  border-top: 0;
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.code.font.family}, monospace;
  font-size: ${themeCssVariables.font.size.sm};
  line-height: ${themeCssVariables.text.lineHeight.md};
  margin: 0;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[4]};
  white-space: pre-wrap;
  word-break: break-word;
`;

export const SettingsMcpSetup = () => {
  const mcpServerUrl = buildMcpServerUrl(REACT_APP_SERVER_BASE_URL);
  const mcpConfig = buildMcpConfig(mcpServerUrl);
  const categories = buildMcpSetupCategories({
    isHttpsInstallLinkEnabled: isHttpsUrl(mcpServerUrl),
    mcpServerUrl,
  });

  return (
    <StyledMcpSetupContainer>
      {categories.map((category) => (
        <Fragment key={category.title}>
          <Section>
            <H2Title
              title={category.title}
              description={category.description}
            />
            <StyledCardsGrid>
              {category.cards.map((card) => (
                <SettingsMcpSetupCard key={card.title} card={card} />
              ))}
            </StyledCardsGrid>
          </Section>

          {category.showManualConfigurationAfter && (
            <Section>
              <H2Title
                title={t`Manual configuration`}
                description={t`Access your workspace data from your favorite MCP client like Claude, Codex or Cursor.`}
              />
              <CoreEditorHeader
                leftNodes={[
                  <StyledMcpEditorHeaderTitle key="mcp-editor-header-title">
                    <StyledMcpIcon aria-hidden />
                    <span>{t`MCP client configuration`}</span>
                  </StyledMcpEditorHeaderTitle>,
                ]}
                rightNodes={[
                  <LightCopyIconButton
                    key="mcp-config-copy-button"
                    copyText={mcpConfig}
                  />,
                ]}
              />
              <StyledMcpConfigPre aria-label={t`MCP client configuration`}>
                {mcpConfig}
              </StyledMcpConfigPre>
            </Section>
          )}
        </Fragment>
      ))}
    </StyledMcpSetupContainer>
  );
};
