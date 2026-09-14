import { useEffect, useMemo, useState } from 'react';
import { MAX_EMAIL_RECIPIENTS } from 'twenty-shared/constants';
import {
  CoreObjectNameSingular,
  FieldMetadataType,
  RelationType,
  type RecordGqlOperationFilter,
  type RecordGqlOperationSignature,
} from 'twenty-shared/types';
import { capitalize, isDefined } from 'twenty-shared/utils';

import { getPrimaryEmailFromRecord } from '@/activities/emails/utils/getPrimaryEmailFromRecord';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { getRecordsFromRecordConnection } from '@/object-record/cache/utils/getRecordsFromRecordConnection';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useGenerateCombinedFindManyRecordsQuery } from '@/object-record/multiple-objects/hooks/useGenerateCombinedFindManyRecordsQuery';
import { type CombinedFindManyRecordsQueryResult } from '@/object-record/multiple-objects/types/CombinedFindManyRecordsQueryResult';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

type UseResolveDefaultEmailRecipientParams = {
  objectNameSingular: string | null | undefined;
  recordId: string | null | undefined;
  bulkPerson?: { filter: RecordGqlOperationFilter | undefined };
};

export const useResolveDefaultEmailRecipient = ({
  objectNameSingular,
  recordId,
  bulkPerson,
}: UseResolveDefaultEmailRecipientParams) => {
  const contextMetadata = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    {
      objectName: objectNameSingular ?? '',
      objectNameType: 'singular',
    },
  );
  const personMetadata = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    {
      objectName: CoreObjectNameSingular.Person,
      objectNameType: 'singular',
    },
  );
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const client = useApolloCoreClient();
  const isBulkPerson = isDefined(bulkPerson);
  const bulkFilter = bulkPerson?.filter;

  const operationSignatures = useMemo<RecordGqlOperationSignature[]>(() => {
    const canRead = (metadata: EnrichedObjectMetadataItem | null) =>
      isDefined(metadata) &&
      metadata.isActive &&
      getObjectPermissionsForObject(
        objectPermissionsByObjectMetadataId,
        metadata.id,
      ).canReadObjectRecords;
    const field = (metadata: EnrichedObjectMetadataItem | null, name: string) =>
      metadata?.readableFields.find(
        (candidate) => candidate.isActive && candidate.name === name,
      );
    const relationTargets = (
      metadata: EnrichedObjectMetadataItem | null,
      name: string,
      target: EnrichedObjectMetadataItem,
    ) => {
      const relation = field(metadata, name);
      return (
        relation?.type === FieldMetadataType.RELATION &&
        relation.relation?.type === RelationType.MANY_TO_ONE &&
        relation.relation.targetObjectMetadata.id === target.id
      );
    };
    const isPerson = objectNameSingular === CoreObjectNameSingular.Person;
    const isCompany = objectNameSingular === CoreObjectNameSingular.Company;
    const isOpportunity =
      objectNameSingular === CoreObjectNameSingular.Opportunity;
    if (
      (!isPerson && !isCompany && !isOpportunity) ||
      (!isBulkPerson && !recordId) ||
      (isBulkPerson && !isPerson) ||
      !contextMetadata ||
      !personMetadata ||
      !canRead(contextMetadata) ||
      !canRead(personMetadata) ||
      !field(contextMetadata, 'id') ||
      !field(personMetadata, 'id') ||
      field(personMetadata, 'emails')?.type !== FieldMetadataType.EMAILS
    ) {
      return [];
    }
    if (
      isCompany &&
      !relationTargets(personMetadata, 'company', contextMetadata)
    ) {
      return [];
    }
    if (
      isOpportunity &&
      !relationTargets(contextMetadata, 'pointOfContact', personMetadata)
    ) {
      return [];
    }
    return [
      {
        objectNameSingular: isOpportunity
          ? CoreObjectNameSingular.Opportunity
          : CoreObjectNameSingular.Person,
        fields: isOpportunity
          ? {
              id: true,
              pointOfContact: { id: true, emails: { primaryEmail: true } },
            }
          : { id: true, emails: { primaryEmail: true } },
        variables: {
          filter: isBulkPerson
            ? bulkFilter
            : isCompany
              ? { companyId: { eq: recordId ?? '' } }
              : { id: { eq: recordId ?? '' } },
          limit: isBulkPerson ? MAX_EMAIL_RECIPIENTS : 1,
        },
      },
    ];
  }, [
    objectNameSingular,
    recordId,
    isBulkPerson,
    bulkFilter,
    contextMetadata,
    personMetadata,
    objectPermissionsByObjectMetadataId,
  ]);

  const query = useGenerateCombinedFindManyRecordsQuery({
    operationSignatures,
  });
  const workspaceId = currentWorkspace?.id;
  const metadataVersion = currentWorkspace?.metadataVersion;
  const request = useMemo(() => {
    const signature = operationSignatures[0];
    if (!query || !contextMetadata || !personMetadata) {
      return null;
    }
    const isOpportunity =
      signature.objectNameSingular === CoreObjectNameSingular.Opportunity;
    const variableSuffix = capitalize(signature.objectNameSingular);
    return {
      client,
      query,
      workspaceId,
      metadataVersion,
      isOpportunity,
      namePlural: isOpportunity
        ? contextMetadata.namePlural
        : personMetadata.namePlural,
      variables: {
        [`filter${variableSuffix}`]: signature.variables.filter,
        [`first${variableSuffix}`]: signature.variables.limit,
      },
    };
  }, [
    operationSignatures,
    query,
    client,
    workspaceId,
    metadataVersion,
    contextMetadata,
    personMetadata,
  ]);
  const [resolved, setResolved] = useState<{
    request: NonNullable<typeof request>;
    defaultTo: string;
  } | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    let active = true;
    void request.client
      .query<CombinedFindManyRecordsQueryResult>({
        query: request.query,
        variables: request.variables,
        // Optional prefill must not reuse a prior workspace's cache or in-flight request.
        fetchPolicy: 'no-cache',
        context: { queryDeduplication: false },
      })
      .then(
        ({ data }) => {
          if (!active) {
            return;
          }
          const connection = data?.[request.namePlural];
          const records = connection
            ? getRecordsFromRecordConnection({ recordConnection: connection })
            : [];
          const defaultTo = records
            .map((record) => {
              const recipient = request.isOpportunity
                ? record.pointOfContact
                : record;
              return recipient && typeof recipient === 'object'
                ? getPrimaryEmailFromRecord(recipient)
                : null;
            })
            .filter(isDefined)
            .join(', ');
          setResolved({ request, defaultTo });
        },
        () => {
          if (active) {
            setResolved({ request, defaultTo: '' });
          }
        },
      );
    return () => {
      active = false;
    };
  }, [request]);

  // Mask retained state during the render that changes scope, before effect cleanup.
  return {
    defaultTo:
      request && resolved?.request === request ? resolved.defaultTo : '',
    loading: request !== null && resolved?.request !== request,
  };
};
