import { UI_LANGUAGE_KEY, normalizeUiLanguage, uiLabel, isUiLabel, type UiLabel } from '../lib/ui-language';

const root = document.documentElement;
let language = normalizeUiLanguage(root.dataset.uiLanguage);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const buttons = document.querySelectorAll<HTMLButtonElement>('.language-toggle');
let animations: Animation[] = [];

function refreshLabels() {
  document.querySelectorAll<HTMLElement>('[data-ui-label]').forEach((element) => {
    if (isUiLabel(element.dataset.uiLabel)) element.setAttribute('aria-label', uiLabel(element.dataset.uiLabel, language));
  });
  document.querySelectorAll<HTMLInputElement>('[data-ui-placeholder]').forEach((element) => {
    if (isUiLabel(element.dataset.uiPlaceholder)) element.placeholder = uiLabel(element.dataset.uiPlaceholder, language);
  });
  document.querySelectorAll<HTMLElement>('[data-ui-message]').forEach((element) => {
    if (isUiLabel(element.dataset.uiMessage)) element.textContent = uiLabel(element.dataset.uiMessage, language);
  });
  buttons.forEach((button) => {
    button.setAttribute('aria-pressed', String(language === 'zh-TW'));
    button.setAttribute('aria-label', language === 'en' ? 'Switch interface language to Traditional Chinese' : '切換介面語言為英文');
    button.title = uiLabel('languageHint', language);
    button.hidden = false;
  });
}

function applyLanguage(value: unknown, announce = false) {
  language = normalizeUiLanguage(value);
  root.dataset.uiLanguage = language;
  root.lang = language;
  refreshLabels();
  animations.forEach((animation) => animation.cancel());
  animations = [];
  if (announce) {
    const status = document.getElementById('language-status');
    if (status) status.textContent = uiLabel('languageChanged', language);
    if (!reducedMotion.matches) {
      // Animate marked interface labels, never the article or profile Markdown.
      document.querySelectorAll<HTMLElement>('.ui-copy').forEach((element) => {
        animations.push(element.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 160 }));
      });
    }
  }
}

buttons.forEach((button) => button.addEventListener('click', () => {
  const next = language === 'en' ? 'zh-TW' : 'en';
  // An unavailable preference store must never disable switching in this page.
  try { localStorage.setItem(UI_LANGUAGE_KEY, next); } catch {}
  applyLanguage(next, true);
}));
window.addEventListener('storage', (event) => {
  if (event.key === UI_LANGUAGE_KEY || event.key === null) applyLanguage(event.newValue);
});
window.addEventListener('pageshow', () => {
  // Sync a restored bfcache page, but keep the in-memory choice if storage is blocked.
  try { applyLanguage(localStorage.getItem(UI_LANGUAGE_KEY)); } catch { refreshLabels(); }
});
applyLanguage(language);

// Used by the existing menu/theme/copy interactions after their state changes.
export function currentUiLabel(key: UiLabel): string {
  return uiLabel(key, normalizeUiLanguage(root.dataset.uiLanguage));
}
