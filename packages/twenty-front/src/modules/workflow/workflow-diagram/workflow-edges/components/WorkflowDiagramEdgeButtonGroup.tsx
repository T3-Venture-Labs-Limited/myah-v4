import { styled } from '@linaria/react';
import { IconButtonGroup, type IconButtonGroupProps } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledIconButtonGroupContainer = styled.div`
  pointer-events: all;
`;

const StyledSelectedIconButtonGroupContainer = styled.div`
  background-color: ${themeCssVariables.brand.soft};
  border-color: ${themeCssVariables.brand.border};
  pointer-events: all;
`;

type WorkflowDiagramEdgeButtonGroupProps = IconButtonGroupProps & {
  selected?: boolean;
};

export const WorkflowDiagramEdgeButtonGroup = ({
  selected = false,
  iconButtons,
}: WorkflowDiagramEdgeButtonGroupProps) => {
  const Container = selected
    ? StyledSelectedIconButtonGroupContainer
    : StyledIconButtonGroupContainer;

  return (
    <Container>
      <IconButtonGroup className="nodrag nopan" iconButtons={iconButtons} />
    </Container>
  );
};
