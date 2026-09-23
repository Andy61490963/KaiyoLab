import type { EntryContent, SiteSettings } from './types';
export const defaultSettings: SiteSettings = {
  siteName: 'KaiyoLab',
  tagline: '技術筆記與開源作品',
  description: '整理開發筆記、做過的專案，以及正在學習的事',
  authorName: 'Kaiyo',
  bio: '分享程式開發筆記與個人作品',
  about:
    '## 關於我\n\n這裡可以介紹自己的背景、正在做的專案，以及聯絡方式\n\n登入管理後台後，就能編輯這段文字',
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
