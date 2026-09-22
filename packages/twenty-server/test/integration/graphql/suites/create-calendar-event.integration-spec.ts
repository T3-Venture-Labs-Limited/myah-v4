import gql from 'graphql-tag';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';

const NON_EXISTENT_CONNECTED_ACCOUNT_ID =
  '00000000-0000-4000-8000-000000000000';

const CREATE_CALENDAR_EVENT_MUTATION = gql`
  mutation CreateCalendarEvent($input: CreateCalendarEventInput!) {
    createCalendarEvent(input: $input) {
      success
      error
      iCalUid
      conferenceLink
    }
  }
`;

describe('createCalendarEvent retirement (metadata API) (e2e)', () => {
  it('does not expose the retired mutation', async () => {
    const response = await makeMetadataAPIRequest({
      query: CREATE_CALENDAR_EVENT_MUTATION,
      variables: {
        input: {
          connectedAccountId: NON_EXISTENT_CONNECTED_ACCOUNT_ID,
          title: 'Integration test event',
          startsAt: '2026-07-01T15:00:00Z',
          endsAt: '2026-07-01T16:00:00Z',
        },
      },
    });

    expect(response.status).toBe(200);
    expect(
      response.body.errors
        ?.map((error: { message: string }) => error.message)
        .join('\n'),
    ).toContain('Cannot query field "createCalendarEvent"');
    expect(response.body.data).toBeUndefined();
  });
});
