// Product cap, not a Unipile-confirmed limit: Unipile documents an
// `errors/too_many_characters` rejection but publishes no numeric bound.
// Matches Meta's documented Instagram Send API constraint of 1,000 UTF-8 bytes.
export const INSTAGRAM_MESSAGE_MAX_BODY_BYTES = 1000;
