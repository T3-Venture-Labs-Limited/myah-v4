export type CoreApiClientLike = {
  query: (
    selection: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  mutation: (
    selection: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};
