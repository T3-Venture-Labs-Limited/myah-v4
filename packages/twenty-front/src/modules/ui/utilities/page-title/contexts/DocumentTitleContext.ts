import { createContext, useContext } from 'react';

export type DocumentTitleContextValue = {
  pathnameVisitToken: number;
  claimTitle: ({
    title,
    pathnameVisitToken,
  }: {
    title: string;
    pathnameVisitToken: number;
  }) => void;
};

export const DocumentTitleContext =
  createContext<DocumentTitleContextValue | null>(null);

export const useDocumentTitleContextOrThrow = (): DocumentTitleContextValue => {
  const documentTitleContext = useContext(DocumentTitleContext);

  if (!documentTitleContext) {
    throw new Error(
      'useDocumentTitleContextOrThrow must be used within a DocumentTitleProvider',
    );
  }

  return documentTitleContext;
};
