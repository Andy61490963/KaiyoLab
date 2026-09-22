import type { EntryContent, SiteSettings } from './types';
export const defaultSettings: SiteSettings = {
  siteName: 'KaiyoLab',
  tagline: '在想像與技術之間，探索更多可能',
  description: '一個記錄想法、分享技術與創作的個人實驗室',
  authorName: 'Kaiyo',
  bio: '寫下探索的軌跡，讓每一個想法都有發光的機會',
  about:
    '## 嗨，歡迎來到我的實驗室\n\n這裡記錄我的學習、創作，以及對世界的好奇\n\n你可以在管理後台編輯這段介紹',
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
