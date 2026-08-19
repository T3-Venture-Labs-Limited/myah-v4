import { objectMetadataItemsWithFieldsSelector } from '@/object-metadata/states/objectMetadataItemsWithFieldsSelector';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';
import {
  FieldMetadataType,
  UploadFilesFieldFileDocument,
} from '~/generated-metadata/graphql';

export const usePersonAvatarUpload = (personRecordId: string) => {
  const apolloClient = useApolloClient();
  const [uploadFilesFieldFile] = useMutation(UploadFilesFieldFileDocument, {
    client: apolloClient,
  });
  const { updateOneRecord } = useUpdateOneRecord();

  const objectMetadataItemsWithFields = useAtomStateValue(
    objectMetadataItemsWithFieldsSelector,
  );
  const personMetadata = objectMetadataItemsWithFields.find(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === CoreObjectNameSingular.Person,
  );

  const avatarFileFieldMetadataId = personMetadata?.fields.find(
    (field) =>
      field.type === FieldMetadataType.FILES && field.name === 'avatarFile',
  )?.id;

  const onUploadPicture = async (file: File) => {
    assertIsDefinedOrThrow(
      avatarFileFieldMetadataId,
      new Error(t`Avatar file field not found for person object`),
    );

    const result = await uploadFilesFieldFile({
      variables: { file, fieldMetadataId: avatarFileFieldMetadataId },
    });

    const uploadedFile = result?.data?.uploadFilesFieldFile;

    if (!isDefined(uploadedFile)) {
      return;
    }

    await updateOneRecord({
      objectNameSingular: CoreObjectNameSingular.Person,
      idToUpdate: personRecordId,
      updateOneRecordInput: {
        avatarFile: [
          {
            fileId: uploadedFile.id,
            label: file.name,
          },
        ],
      },
    });
  };

  return {
    onUploadPicture: isDefined(personMetadata) ? onUploadPicture : undefined,
  };
};
