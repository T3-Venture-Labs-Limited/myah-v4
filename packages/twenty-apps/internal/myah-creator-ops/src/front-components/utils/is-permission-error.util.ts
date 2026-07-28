export const isPermissionError = (error: unknown): boolean => {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('errors' in error) ||
    !Array.isArray(error.errors)
  ) {
    return false;
  }

  return error.errors.some((graphqlError) => {
    if (
      typeof graphqlError !== 'object' ||
      graphqlError === null ||
      !('extensions' in graphqlError) ||
      typeof graphqlError.extensions !== 'object' ||
      graphqlError.extensions === null
    ) {
      return false;
    }

    const code =
      'code' in graphqlError.extensions
        ? graphqlError.extensions.code
        : undefined;
    const subCode =
      'subCode' in graphqlError.extensions
        ? graphqlError.extensions.subCode
        : undefined;

    return code === 'FORBIDDEN' || subCode === 'PERMISSION_DENIED';
  });
};
