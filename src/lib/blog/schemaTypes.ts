export type BlogSchemaType = 'BlogPosting' | 'Article' | 'NewsArticle';

export const BLOG_SCHEMA_OPTIONS: {
  value: BlogSchemaType;
  label: string;
}[] = [
  {
    value: 'BlogPosting',
    label: 'Blog Post - for community stories, event recaps, guides',
  },
  {
    value: 'Article',
    label: 'Article - for long-form educational content and features',
  },
  {
    value: 'NewsArticle',
    label: 'News Article - for announcements, launches, and time-sensitive updates',
  },
];
