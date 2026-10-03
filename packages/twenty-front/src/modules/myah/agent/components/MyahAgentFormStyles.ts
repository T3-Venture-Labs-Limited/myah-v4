import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAgentPage = styled.main`
  background: ${themeCssVariables.background.primary};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  min-height: 100%;
  min-width: 0;
  overflow-y: auto;
  width: 100%;
`;

export const StyledAgentBody = styled.div`
  box-sizing: border-box;
  container-type: inline-size;
  padding: ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[5]};
  width: 100%;
`;

export const StyledAgentIntro = styled.div`
  margin-bottom: ${themeCssVariables.spacing[5]};
  h2 {
    font-size: ${themeCssVariables.font.size.md};
    font-weight: ${themeCssVariables.font.weight.semiBold};
    margin: 0;
  }
  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
    margin: ${themeCssVariables.spacing[1]} 0 0;
  }
`;

export const StyledAgentGrid = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[6]};
  grid-template-columns: minmax(0, 1fr) 320px;
  @container (max-width: 850px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledAgentCard = styled.section`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  margin-bottom: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[5]};
  h3 {
    font-size: ${themeCssVariables.font.size.md};
    font-weight: ${themeCssVariables.font.weight.semiBold};
    margin: 0 0 ${themeCssVariables.spacing[1]};
  }
`;

export const StyledAgentHint = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  margin: ${themeCssVariables.spacing[1]} 0 0;
`;

export const StyledAgentRow = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: 1fr 1fr;
`;

export const StyledAgentField = styled.label`
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  margin-top: ${themeCssVariables.spacing[3]};
  input,
  select,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: ${themeCssVariables.font.size.md};
    padding: ${themeCssVariables.spacing[2]};
  }
  textarea {
    line-height: 1.6;
    min-height: 96px;
    resize: vertical;
  }
`;

export const StyledAgentChoice = styled.label`
  align-items: flex-start;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
  &[data-selected='true'] {
    background: ${themeCssVariables.background.transparent.lighter};
    border-color: ${themeCssVariables.border.color.blue};
  }
  strong {
    display: block;
    font-weight: ${themeCssVariables.font.weight.medium};
  }
  span {
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
  }
`;

export const StyledAgentList = styled.ul`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.8;
  margin: ${themeCssVariables.spacing[2]} 0 0;
  padding-left: ${themeCssVariables.spacing[4]};
`;

export const StyledAgentConfirm = styled.div`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  margin-top: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

export const StyledAgentActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  margin-top: ${themeCssVariables.spacing[2]};
`;
