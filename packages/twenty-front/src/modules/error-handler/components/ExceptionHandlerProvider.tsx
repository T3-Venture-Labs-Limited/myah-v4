import { SentryUserEffect } from '@/error-handler/components/SentryUserEffect';

export const ExceptionHandlerProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  return (
    <>
      <SentryUserEffect />
      {children}
    </>
  );
};
