import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledPreview = styled.section`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: ${themeCssVariables.spacing[5]};
  padding-bottom: ${themeCssVariables.spacing[5]};
  h3 {
    font-size: ${themeCssVariables.font.size.md};
    margin: 0;
  }
  p {
    color: ${themeCssVariables.font.color.secondary};
    margin: 0;
  }
  fieldset {
    border: 0;
    display: grid;
    gap: ${themeCssVariables.spacing[3]};
    margin: 0;
    min-width: 0;
    padding: 0;
  }
  label {
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
    min-width: 0;
  }
  input:not([type='checkbox']),
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    min-height: 36px;
    padding: ${themeCssVariables.spacing[2]};
    width: 100%;
  }
  textarea {
    min-height: 80px;
  }
`;
const StyledChecks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[4]};
  label {
    display: inline-flex;
    flex-direction: row;
  }
`;
const StyledPair = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @container (max-width: 550px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const MyahCampaignOfferPreview = () => (
  <StyledPreview aria-label="Partnership offer layout preview">
    <h3>Build one clear partnership offer</h3>
    <p role="status">
      Layout preview only. These offer fields do not save yet; the follow-up
      will add their data, validation and approval rules. The Save button below
      updates only the Campaign brief and notes.
    </p>
    <fieldset disabled>
      <h3>01 · The offer</h3>
      <label>
        Collaboration summary
        <textarea placeholder="Describe the collaboration" />
      </label>
      <StyledPair>
        <label>
          Timeline
          <input placeholder="When is the work expected?" />
        </label>
        <label>
          Bundle
          <input placeholder="Describe the package" />
        </label>
      </StyledPair>
      <StyledChecks>
        <label>
          <input type="checkbox" />
          Fixed fee
        </label>
        <label>
          <input type="checkbox" />
          Affiliate
        </label>
        <label>
          <input type="checkbox" />
          Gifted product
        </label>
      </StyledChecks>
      <StyledPair>
        <label>
          Public starting offer
          <input placeholder="Amount" />
        </label>
        <label>
          Currency
          <input placeholder="Currency" />
        </label>
      </StyledPair>
      <label>
        Gifted product
        <input placeholder="Product or kit" />
      </label>
    </fieldset>
    <fieldset disabled>
      <h3>02 · Deliverables</h3>
      <label>
        Content formats and quantities
        <textarea placeholder="What would the Creator produce?" />
      </label>
      <label>
        Origin and duration
        <input placeholder="Original content and usage period" />
      </label>
    </fieldset>
    <fieldset disabled>
      <h3>03 · Boundaries</h3>
      <label>
        Requirements and preferences
        <textarea placeholder="Requirements, preferences and exclusions" />
      </label>
    </fieldset>
    <fieldset disabled>
      <h3>04 · Rights</h3>
      <label>
        Usage rights
        <textarea placeholder="Where and how content may be used" />
      </label>
    </fieldset>
    <fieldset disabled>
      <h3>05 · Payment and affiliate</h3>
      <label>
        Payment terms
        <input placeholder="Proposed terms" />
      </label>
      <label>
        Affiliate terms
        <input placeholder="Proposed commission or link" />
      </label>
    </fieldset>
  </StyledPreview>
);
