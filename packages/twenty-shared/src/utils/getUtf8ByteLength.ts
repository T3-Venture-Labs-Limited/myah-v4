// Blob uses UTF-8 and replaces lone UTF-16 surrogates with U+FFFD, matching
// TextEncoder without relying on a TextEncoder global in Jest's jsdom runtime.
export const getUtf8ByteLength = (text: string): number =>
  new Blob([text]).size;
