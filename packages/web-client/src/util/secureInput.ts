/** Attributes that discourage browser/password-manager autofill on sensitive fields. */
export const SENSITIVE_INPUT_ATTRS = {
  autocomplete: 'off',
  autocapitalize: 'off',
  autocorrect: 'off',
  spellcheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-form-type': 'other',
} as const;

/** Login-only: allow password managers for initial unlock. */
export const LOGIN_INPUT_ATTRS = {
  autocomplete: 'current-password',
  autocapitalize: 'off',
  autocorrect: 'off',
  spellcheck: false,
} as const;

export function clearInputElement(
  el: HTMLInputElement | HTMLTextAreaElement | null | undefined
): void {
  if (!el) return;
  el.value = '';
}
