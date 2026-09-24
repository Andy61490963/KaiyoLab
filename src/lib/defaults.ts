import type { EntryContent, SiteSettings } from './types';
import { defaultAbout, englishCopy } from './site-copy';

export const defaultSettings: SiteSettings = {
  siteName: 'KaiyoLab',
  ...englishCopy,
  homeIntro: '',
  authorName: 'Andy',
  about: defaultAbout('Andy'),
  logo: '/favicon.svg',
  avatar: '',
  heroImage: '',
  socialLinks: [],
  siteUrl: process.env.SITE_URL || 'http://localhost:4321',
};
export const emptyContent: EntryContent = {
  title: 'Untitled article',
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
  series: '',
  seriesOrder: 0,
  coverPosition: { x: 50, y: 50 },
};
