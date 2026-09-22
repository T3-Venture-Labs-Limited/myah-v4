import { RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';

export const MYAH_INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER =
  RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER;

export const MYAH_STANDARD_APP_UNIVERSAL_IDENTIFIER_LOOKUP: Readonly<
  Record<string, true>
> = Object.freeze({
  [MYAH_INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER]: true,
});

export const isMyahStandardAppUniversalIdentifier = (value: string): boolean =>
  MYAH_STANDARD_APP_UNIVERSAL_IDENTIFIER_LOOKUP[value] === true;
