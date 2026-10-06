import { AgentChatRuntimeEffects } from '@/ai/components/AgentChatRuntimeEffects';
import { AgentChatThreadInitializationEffect } from '@/ai/components/AgentChatThreadInitializationEffect';
import { AgentChatComponentInstanceContext } from '@/ai/contexts/AgentChatComponentInstanceContext';
import { Suspense } from 'react';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';

export const AgentChatProviderContent = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { hasAccess } = useMyahWorkspaceUsage();
  return (
    <Suspense fallback={null}>
      <AgentChatComponentInstanceContext.Provider
        value={{ instanceId: 'agentChatComponentInstance' }}
      >
        {hasAccess && (
          <>
            <AgentChatThreadInitializationEffect />
            <AgentChatRuntimeEffects />
          </>
        )}
        {children}
      </AgentChatComponentInstanceContext.Provider>
    </Suspense>
  );
};
