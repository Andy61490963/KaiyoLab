import type { EntryContent, SiteSettings } from './types';
export const defaultSettings: SiteSettings = {
  siteName: 'KaiyoLab',
  tagline: 'Software engineering notes and open-source projects',
  description: 'Sharing software development notes, personal projects, and things I am learning',
  homeIntro: '',
  authorName: 'Kaiyo',
  bio: 'Software engineer sharing development notes and personal projects',
  about:
    "# About Me\\n\\nHey, I'm Kaiyo. This is my corner of the web for software development notes and personal projects.\\n\\n## What I Do\\n\\nI build software, explore systems, and document what I learn along the way.\\n\\n## Contact\\n\\nAdd your preferred contact links here from the admin settings.",
  logo: '/favicon.svg',
  avatar: '',
  heroImage: '/images/kaiyo-hero.png',
  socialLinks: [],
  siteUrl: process.env.SITE_URL || 'http://localhost:4321',
};
export const emptyContent: EntryContent = {
  title: '未命名文章',
  slug: '',
  excerpt: '',
  body: '',
  cover: '',
  coverAlt: '',
  category: '',
  tags: [],
  featured: false,
  seoTitle: '',
  seoDescription: '',
  demoUrl: '',
  repoUrl: '',
};
