import { gql } from '@apollo/client';

export const MYAH_CHECKOUT_PRICE = gql`
  query MyahCheckoutPrice($code: String) {
    myahCheckoutPrice(code: $code) {
      amountCents
      regularAmountCents
      earlyAccess
    }
  }
`;
