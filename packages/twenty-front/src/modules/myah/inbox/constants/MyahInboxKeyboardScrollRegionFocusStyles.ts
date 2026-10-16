import { themeCssVariables } from 'twenty-ui/theme-constants';

// MYAH-478: keyboard-scrollable Inbox regions show the brand focus ring inset
// within their own box instead of the browser default ring. The default ring
// painted outside the region, was clipped by the page card, and could leave
// stale lines on the page header and contact list after focus moved away.
export const MYAH_INBOX_KEYBOARD_SCROLL_REGION_FOCUS_STYLES = `
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.brand.focusRing};
    outline-offset: -2px;
  }
`;
