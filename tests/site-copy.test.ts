import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/lib/defaults';
import { defaultAbout, englishCopy, legacyEnglishAbout, repairLegacySiteCopy } from '../src/lib/site-copy';
import { renderMarkdown } from '../src/lib/markdown';

describe('English site copy and legacy settings', () => {
  it('renders the default About page as real Markdown sections', async () => {
    const rendered = await renderMarkdown(defaultSettings.about);
    expect(rendered.toc.filter((item) => item.depth === 1)).toHaveLength(1);
    expect(rendered.toc.filter((item) => item.depth === 2)).toHaveLength(3);
    expect(rendered.html).not.toContain('\\n');
    expect(rendered.html).not.toContain('Add your preferred contact links');
  });
  it('repairs the exact escaped legacy default without hard-coding the stored author', () => {
    const result = repairLegacySiteCopy({ ...defaultSettings, authorName: 'Alex', about: legacyEnglishAbout.replace(/\n/g, '\\n') });
    expect(result.about).toBe(defaultAbout('Alex'));
  });
  it('translates only known old settings', () => {
    const source = { ...defaultSettings, tagline: '技術筆記與開源作品', bio: '分享程式開發筆記與個人作品' };
    const result = repairLegacySiteCopy(source);
    expect(result.tagline).toBe(englishCopy.tagline);
    expect(result.bio).toBe(englishCopy.bio);
    expect(source.tagline).toBe('技術筆記與開源作品');
  });
  it('preserves custom copy, including literal newline escapes in code', () => {
    const source = { ...defaultSettings, tagline: 'My own tagline', about: '# My story\n\n```js\nconst separator = "\\n";\n```\n\n自己的內容' };
    expect(repairLegacySiteCopy(source)).toEqual(source);
  });
  it('repairs only an exact legacy home greeting, not occurrences inside custom content', () => {
    const greeting = '嗨，我是 [**Andy**](https://kaiyo.zeabur.app/about)';
    const result = repairLegacySiteCopy({ ...defaultSettings, homeIntro: `# ${greeting}**.**\n\nMy own introduction.` });
    expect(result.homeIntro).toBe("# I'm **Andy**\n\nMy own introduction.");
    const custom = { ...defaultSettings, homeIntro: `# A tutorial\n\nExample: ${greeting}` };
    expect(repairLegacySiteCopy(custom).homeIntro).toBe(custom.homeIntro);
  });
  it('is idempotent and escapes Markdown metacharacters in author names', async () => {
    const settings = repairLegacySiteCopy({ ...defaultSettings, about: legacyEnglishAbout });
    expect(repairLegacySiteCopy(settings)).toEqual(settings);
    const rendered = await renderMarkdown(defaultAbout('[Alex](https://example.test)'));
    expect(rendered.html).not.toContain('href="https://example.test"');
  });
});
