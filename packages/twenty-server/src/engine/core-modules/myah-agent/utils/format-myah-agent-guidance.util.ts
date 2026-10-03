import { type MyahAgentRecord } from 'src/engine/core-modules/myah-agent/services/myah-agent.service';

const MAX_GUIDANCE_FIELD_LENGTH = 4_000;

const clip = (value: string): string =>
  value.length > MAX_GUIDANCE_FIELD_LENGTH
    ? `${value.slice(0, MAX_GUIDANCE_FIELD_LENGTH)} […truncated]`
    : value;

// Workspace agent guidance as prompt reference lines; empty when unset.
export const formatMyahAgentGuidance = (agent: MyahAgentRecord): string =>
  (
    [
      ['Tone', agent.tone],
      ['Response length', agent.responseLength],
      ['Language', agent.language],
      ['Brand and product information', agent.brandInformation],
      ['Reply rules', agent.replyRules],
      ['Hand off to a human when', agent.escalationBoundaries],
    ] as Array<[string, string | null]>
  )
    .flatMap(([label, value]) =>
      value === null ? [] : [`${label}: ${clip(value)}`],
    )
    .join('\n');
