import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useRecordShowRecord } from '@/object-record/record-show/hooks/useRecordShowRecord';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

type ScopedRecordShowEffectProps = {
  objectNameSingular: string;
  recordId: string;
};

type RecordShowWithWorkspaceProps = ScopedRecordShowEffectProps;

const ScopedRecordShowEffect = (props: ScopedRecordShowEffectProps) => {
  useRecordShowRecord(props);

  return null;
};

const RecordShowWithWorkspace = (props: RecordShowWithWorkspaceProps) => {
  const workspaceId = useAtomStateValue(currentWorkspaceState)?.id;

  return (
    <ScopedRecordShowEffect
      key={
        props.objectNameSingular === 'campaign'
          ? `${workspaceId ?? ''}:${props.recordId}`
          : props.recordId
      }
      objectNameSingular={props.objectNameSingular}
      recordId={props.recordId}
    />
  );
};

export { RecordShowWithWorkspace as RecordShowEffect };
