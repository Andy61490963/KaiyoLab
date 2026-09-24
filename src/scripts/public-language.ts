import { UI_LANGUAGE_KEY, normalizeUiLanguage, uiText, type UiKey } from '../lib/ui-language';

export const currentUiText = (key: UiKey) =>
  uiText(key, normalizeUiLanguage(document.documentElement.dataset.uiLanguage));

export function initializeUiLanguage() {
  const root = document.documentElement;
  const control = document.querySelector<HTMLElement>('.language-switch');
  if (!control) return;
  const apply = (value: unknown, announce = false) => {
    const language = normalizeUiLanguage(value);
    root.dataset.uiLanguage = language;
    root.lang = language;
    // Authored content is never traversed or rewritten. Only explicitly marked UI attributes change.
    for (const element of document.querySelectorAll<HTMLElement>('[data-ui-label-en]')) {
      if (element.closest('[data-original-content]')) continue;
      element.setAttribute(
        'aria-label',
        (language === 'en' ? element.dataset.uiLabelEn : element.dataset.uiLabelZh) || '',
      );
    }
    for (const element of document.querySelectorAll<HTMLInputElement>('[data-ui-placeholder-en]')) {
      element.placeholder =
        (language === 'en' ? element.dataset.uiPlaceholderEn : element.dataset.uiPlaceholderZh) ||
        '';
    }
    const title = document.querySelector<HTMLTitleElement>('title[data-ui-title-en]');
    if (title)
      title.textContent =
        (language === 'en' ? title.dataset.uiTitleEn : title.dataset.uiTitleZh) || '';
    control.querySelectorAll<HTMLButtonElement>('button[data-language]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    document.dispatchEvent(new Event('kaiyo:ui-language'));
    if (announce) {
      const status = document.getElementById('language-status');
      if (status)
        status.textContent = currentUiText('Interface language: English. Content is unchanged.');
    }
  };
  apply(root.dataset.uiLanguage);
  control.hidden = false;
  control.querySelectorAll<HTMLButtonElement>('button[data-language]').forEach((button) => {
    button.addEventListener('click', () => {
      const language = normalizeUiLanguage(button.dataset.language);
      if (language === root.dataset.uiLanguage) return;
      apply(language, true);
      try {
        localStorage.setItem(UI_LANGUAGE_KEY, language);
      } catch {
        /* Still works for this page. */
      }
    });
  });
  window.addEventListener('storage', (event) => {
    if (event.key === UI_LANGUAGE_KEY || event.key === null) apply(event.newValue);
  });
  window.addEventListener('pageshow', () => {
    try {
      apply(localStorage.getItem(UI_LANGUAGE_KEY));
    } catch {
      apply(root.dataset.uiLanguage);
    }
  });
}
