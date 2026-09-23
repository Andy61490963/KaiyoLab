import type { SiteSettings } from './types';

type IntroSource = Pick<SiteSettings, 'authorName' | 'siteName' | 'tagline' | 'description'>;

function plainText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_{}\[\]()#+\-.!|>~]/g, '\\$&');
}

export function defaultHomeIntro(settings: IntroSource): string {
  return [
    `# 嗨，我是 ${plainText(settings.authorName || settings.siteName)}`,
    plainText(settings.tagline),
    plainText(settings.description),
  ]
    .filter(Boolean)
    .join('\n\n');
}
