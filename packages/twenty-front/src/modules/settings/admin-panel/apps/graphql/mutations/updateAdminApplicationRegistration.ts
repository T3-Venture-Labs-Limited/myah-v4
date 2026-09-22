import { gql } from '@apollo/client';

import { APPLICATION_REGISTRATION_FRAGMENT } from '@/settings/admin-panel/apps/graphql/fragments/applicationRegistrationFragment';

export const UPDATE_ADMIN_APPLICATION_REGISTRATION = gql`
  mutation UpdateAdminApplicationRegistration(
    $input: UpdateApplicationRegistrationInput!
  ) {
    updateAdminApplicationRegistration(input: $input) {
      ...ApplicationRegistrationFragment
    }
  }
  ${APPLICATION_REGISTRATION_FRAGMENT}
`;
