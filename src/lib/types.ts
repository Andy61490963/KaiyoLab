export type EntryKind = 'article' | 'project';
export interface EntryContent {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover: string;
  coverAlt: string;
  category: string;
  tags: string[];
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  demoUrl: string;
  repoUrl: string;
}
export interface Entry {
  id: string;
  kind: EntryKind;
  content: EntryContent;
  published: EntryContent | null;
  publishedAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}
export interface PublicEntry extends EntryContent {
  id: string;
  kind: EntryKind;
  publishedAt: string;
  updatedAt: string;
}
export interface Taxonomy {
  id: string;
  name: string;
  slug: string;
  kind: 'category' | 'tag';
}
export interface SiteSettings {
  siteName: string;
  tagline: string;
  description: string;
  authorName: string;
  bio: string;
  about: string;
  logo: string;
  avatar: string;
  heroImage: string;
  socialLinks: { label: string; url: string }[];
  siteUrl: string;
}
export interface Media {
  id: string;
  url: string;
  name: string;
  alt: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
  usedBy: string[];
}
