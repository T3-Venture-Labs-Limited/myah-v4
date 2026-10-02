// Synthetic HTTP rejection is safe only for known local write requests: the
// client can classify a response as definitely not accepted, unlike a throw.
// Reads and unrecognized methods still fail locally without using global fetch.
export const e2eFixtureRejectingUnipileFetch: typeof globalThis.fetch = async (
  _input,
  init,
) => {
  const url = _input instanceof Request ? _input.url : String(_input);
  const path = new URL(url).pathname;
  const knownWrite =
    (init?.method === 'POST' &&
      (/\/hosted\/accounts\/link$/.test(path) ||
        /\/chats$/.test(path) ||
        /\/chats\/[^/]+\/messages$/.test(path))) ||
    (init?.method === 'DELETE' && /\/accounts\/[^/]+$/.test(path));

  if (knownWrite) {
    return new Response(null, { status: 403 });
  }

  throw new Error('E2E fixtures never contact Unipile');
};
