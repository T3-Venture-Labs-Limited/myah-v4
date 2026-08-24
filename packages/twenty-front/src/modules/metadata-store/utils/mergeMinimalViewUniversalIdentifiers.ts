import { type FlatView } from '@/metadata-store/types/FlatView';
import { type MinimalView } from '@/metadata-store/types/MinimalMetadata';

export const mergeMinimalViewUniversalIdentifiers = ({
  currentViews,
  minimalViews,
}: {
  currentViews: FlatView[];
  minimalViews: MinimalView[];
}): FlatView[] => {
  const universalIdentifierByViewId = new Map(
    minimalViews.map(({ id, universalIdentifier }) => [
      id,
      universalIdentifier,
    ]),
  );

  return currentViews.map((view) => {
    const universalIdentifier = universalIdentifierByViewId.get(view.id);

    return universalIdentifier === undefined
      ? view
      : { ...view, universalIdentifier };
  });
};
