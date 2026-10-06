import { gql } from '@apollo/client';

export const CREATE_MYAH_CHECKOUT_SESSION = gql`
  mutation CreateMyahCheckoutSession(
    $code: String
    $expectedAmountCents: Float!
  ) {
    createMyahCheckoutSession(
      code: $code
      expectedAmountCents: $expectedAmountCents
    )
  }
`;
