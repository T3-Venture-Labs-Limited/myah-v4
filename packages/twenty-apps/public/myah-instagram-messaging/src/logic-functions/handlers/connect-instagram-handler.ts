export const connectInstagramHandler = async (): Promise<{
  success: boolean;
  error: string;
}> => ({
  success: false,
  error:
    'Composio Instagram connection is disabled after the Unipile provider cutover.',
});
