/**
 * Hook for generating accessible ARIA attributes
 * Helps ensure components meet WCAG 2.1 standards
 * Mobile-friendly: Touch-accessible, keyboard-navigable
 */

interface AriaAttributes {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-hidden'?: boolean;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-modal'?: boolean;
  'aria-disabled'?: boolean;
  'aria-busy'?: boolean;
  'aria-atomic'?: boolean;
  'aria-controls'?: string;
  role?: string;
  tabIndex?: number;
  id?: string;
}

interface UseAccessibleOptions {
  label?: string;
  describedBy?: string;
  role?: string;
  expanded?: boolean;
  hidden?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  isDisabled?: boolean;
  live?: 'polite' | 'assertive' | 'off';
  initialFocused?: boolean;
}

/**
 * Returns ARIA attributes for accessible component
 */
export const useAccessible = (options: UseAccessibleOptions = {}): AriaAttributes => {
  const {
    label,
    describedBy,
    role,
    expanded,
    hidden,
    isRequired,
    isInvalid,
    isDisabled,
    live = 'off',
    initialFocused = false,
  } = options;

  const attrs: AriaAttributes = {};

  if (label) attrs['aria-label'] = label;
  if (describedBy) attrs['aria-describedby'] = describedBy;
  if (role) attrs.role = role;
  if (expanded !== undefined) attrs['aria-expanded'] = expanded;
  if (hidden) attrs['aria-hidden'] = hidden;
  if (isRequired) attrs['aria-required'] = isRequired;
  if (isInvalid) attrs['aria-invalid'] = isInvalid;
  if (isDisabled) attrs['aria-disabled'] = isDisabled;
  if (live !== 'off') attrs['aria-live'] = live;

  // Tab index for keyboard navigation (0 = focusable, -1 = not in tab order)
  attrs.tabIndex = initialFocused ? 0 : isDisabled ? -1 : undefined;

  return attrs;
};

/**
 * Hook for modal dialogs - ensures proper ARIA attributes
 */
export const useAccessibleModal = (
  isOpen: boolean,
  labelId: string
): AriaAttributes => {
  return {
    role: 'dialog',
    'aria-modal': isOpen,
    'aria-labelledby': labelId,
    'aria-hidden': !isOpen,
  };
};

/**
 * Hook for dropdowns/menu buttons - manages expanded state
 */
export const useAccessibleDropdown = (
  isOpen: boolean,
  menuId: string
): {
  button: AriaAttributes;
  menu: AriaAttributes;
} => {
  return {
    button: {
      'aria-expanded': isOpen,
      'aria-controls': menuId,
    },
    menu: {
      id: menuId,
      role: 'menu',
      'aria-hidden': !isOpen,
    },
  };
};

/**
 * Hook for form inputs - validation and required states
 */
export const useAccessibleInput = (options: {
  isRequired?: boolean;
  isInvalid?: boolean;
  errorId?: string;
  helpId?: string;
  label?: string;
}): AriaAttributes => {
  const { isRequired, isInvalid, errorId, helpId, label } = options;

  const attrs: AriaAttributes = {};

  if (label) attrs['aria-label'] = label;
  if (isRequired) attrs['aria-required'] = isRequired;
  if (isInvalid) attrs['aria-invalid'] = isInvalid;

  // Describe both error and help text
  const describedByIds = [];
  if (errorId) describedByIds.push(errorId);
  if (helpId) describedByIds.push(helpId);

  if (describedByIds.length > 0) {
    attrs['aria-describedby'] = describedByIds.join(' ');
  }

  return attrs;
};

/**
 * Hook for loading/busy states - announce to screen readers
 */
export const useAccessibleLoading = (
  isLoading: boolean,
  message: string = 'Loading...'
): AriaAttributes => {
  return {
    'aria-busy': isLoading,
    'aria-live': isLoading ? 'polite' : 'off',
    'aria-label': isLoading ? message : undefined,
  };
};

/**
 * Hook for notifications/alerts - auto-announce to screen readers
 */
export const useAccessibleAlert = (
  _message: string,
  type: 'polite' | 'assertive' = 'polite'
): AriaAttributes => {
  return {
    role: 'alert',
    'aria-live': type,
    'aria-atomic': true,
  };
};
