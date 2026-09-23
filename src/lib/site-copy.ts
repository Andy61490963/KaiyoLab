import type { SiteSettings } from './types';

export const englishCopy = {
  tagline: 'Software engineering notes and open-source projects',
  description: 'Sharing software development notes and personal projects.',
  bio: 'Software engineer sharing development notes and personal projects.',
};

const escapeMarkdown = (text: string) => text
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[\\`*_{}\[\]()#+\-.!|>~]/g, '\\$&');

export function defaultAbout(authorName = 'Andy'): string {
  return [
    '# About Me',
    `Hey, I'm ${escapeMarkdown(authorName || 'Andy')}. I build software and share what I learn along the way.`,
    'This is my corner of the web for development notes, personal projects, and ideas in progress.',
    '## What I Do',
    'I work on software, explore how systems fit together, and turn what I learn into practical notes and tools.',
    '## On This Site',
    '- [Articles](/articles): development notes, walkthroughs, and things worth documenting.\n- [Projects](/projects): software I have built and experiments I am working on.',
    '## Keep in Touch',
    'Follow new writing through the [RSS feed](/rss.xml), or find me through the links in the site navigation.',
  ].join('\n\n');
}

// Exact legacy defaults only. Never rewrite an author's arbitrary Markdown or code samples.
export const legacyEnglishAbout = [
  '# About Me',
  "Hey, I'm Kaiyo. This is my corner of the web for software development notes and personal projects.",
  '## What I Do',
  'I build software, explore systems, and document what I learn along the way.',
  '## Contact',
  'Add your preferred contact links here from the admin settings.',
].join('\n\n');

const oldCopy: Record<keyof typeof englishCopy, readonly string[]> = {
  tagline: [
    '在想像與技術之間，探索更多可能。',
    '在想像與技術之間，探索更多可能',
    '技術筆記與開源作品',
  ],
  description: [
    '一個記錄想法、分享技術與創作的個人實驗室。',
    '一個記錄想法、分享技術與創作的個人實驗室',
    '整理開發筆記、做過的專案，以及正在學習的事',
    'Sharing software development notes, personal projects, and things I am learning',
  ],
  bio: [
    '寫下探索的軌跡，讓每一個想法都有發光的機會。',
    '寫下探索的軌跡，讓每一個想法都有發光的機會',
    '分享程式開發筆記與個人作品',
    'Software engineer sharing development notes and personal projects',
  ],
};
const oldAbout = new Set([
  legacyEnglishAbout,
  '## 嗨，歡迎來到我的實驗室\n\n這裡記錄我的學習、創作，以及對世界的好奇。\n\n你可以在管理後台編輯這段介紹。',
  '## 嗨，歡迎來到我的實驗室\n\n這裡記錄我的學習、創作，以及對世界的好奇\n\n你可以在管理後台編輯這段介紹',
  '## 關於我\n\n這裡可以介紹自己的背景、正在做的專案，以及聯絡方式\n\n登入管理後台後，就能編輯這段文字',
]);

export function repairLegacySiteCopy(settings: SiteSettings): SiteSettings {
  const result = { ...settings };
  for (const key of Object.keys(englishCopy) as (keyof typeof englishCopy)[]) {
    if (oldCopy[key].includes(result[key])) result[key] = englishCopy[key];
  }
  const about = result.about || '';
  // Normalizing a comparison value is safe; a global replacement on custom Markdown is not.
  const candidate = about.replace(/\\n/g, '\n').trim();
  if (!candidate || oldAbout.has(candidate) || candidate === defaultAbout(result.authorName)) {
    result.about = defaultAbout(result.authorName);
  }

  const lines = (result.homeIntro || '').split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim());
  if (first >= 0) {
    const line = lines[first].trim();
    const greeting = line.replace(/^#\s+/, '');
    const legacyGreeting = '嗨，我是 [**Andy**](https://kaiyo.zeabur.app/about)';
    if ([legacyGreeting, `${legacyGreeting}.`, `${legacyGreeting}**.**`].includes(greeting)) {
      lines[first] = `${line.startsWith('#') ? '# ' : ''}I'm **Andy**`;
      result.homeIntro = lines.join('\n');
    }
  }
  return result;
}
