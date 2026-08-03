import { capitalize } from 'twenty-shared/utils';

export const getActivityTargetObjectFieldIdName = ({
  nameSingular,
}: {
  nameSingular: string;
}) => {
  return `target${capitalize(nameSingular)}Id`;
};

export const doesActivityTargetObjectSupportAttachments = ({
  attachmentFieldNames,
  objectNameSingular,
}: {
  attachmentFieldNames: readonly string[];
  objectNameSingular: string;
}) =>
  attachmentFieldNames.includes(
    getActivityTargetObjectFieldIdName({ nameSingular: objectNameSingular }),
  );
