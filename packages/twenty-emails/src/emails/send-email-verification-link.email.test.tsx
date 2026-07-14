import { describe, expect, it } from '@jest/globals';

import { renderToStaticMarkup } from 'react-dom/server';

import { SendEmailVerificationLinkEmail } from './send-email-verification-link.email';

const unsupportedFooterValues = [
  'https://twenty.com/',
  'https://github.com/twentyhq/twenty',
  'https://docs.twenty.com',
  'Twenty.com, Public Benefit Corporation',
  'San Francisco / Paris',
];

describe('SendEmailVerificationLinkEmail', () => {
  it('keeps its verification link without appending unsupported vendor footer content', () => {
    const verificationLink = 'https://workspace.example/verify-email/123';

    const markup = renderToStaticMarkup(
      <SendEmailVerificationLinkEmail link={verificationLink} locale="en" />,
    );

    expect(markup).toContain('Myah logo');
    expect(markup).toContain(verificationLink);

    unsupportedFooterValues.forEach((value) => {
      expect(markup).not.toContain(value);
    });
  });
});
