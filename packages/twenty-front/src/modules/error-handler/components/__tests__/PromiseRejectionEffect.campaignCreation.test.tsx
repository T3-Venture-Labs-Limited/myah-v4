import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { PromiseRejectionEffect } from '@/error-handler/components/PromiseRejectionEffect';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { snackBarInternalComponentState } from '@/ui/feedback/snack-bar-manager/states/snackBarInternalComponentState';

it('still presents unrelated Apollo rejections through the native snackbar effect', () => {
  const store = createStore();
  const rendered = render(
    <Provider store={store}>
      <SnackBarComponentInstanceContext.Provider
        value={{ instanceId: 'campaign-test-snacks' }}
      >
        <PromiseRejectionEffect />
      </SnackBarComponentInstanceContext.Provider>
    </Provider>,
  );
  const error = new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Unrelated validation',
        extensions: {
          code: 'BAD_USER_INPUT',
          userFriendlyMessage: 'Unrelated validation',
        },
      },
    ],
  });
  const event = new Event('unhandledrejection');
  Object.defineProperty(event, 'reason', { value: error });
  act(() => {
    window.dispatchEvent(event);
  });
  expect(
    store.get(
      snackBarInternalComponentState.atomFamily({
        instanceId: 'campaign-test-snacks',
      }),
    ).queue,
  ).toEqual([expect.objectContaining({ message: 'Unrelated validation' })]);
  rendered.unmount();
});
