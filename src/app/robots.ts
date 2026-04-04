import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Main crawlers (Google, Bing, Yahoo, DuckDuckGo)
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/admin',
          '/book/',
          '/book',
          '/team/',
          '/team',
          '/referral/',
          '/referral',
          '/feedback/',
          '/feedback',
          '/api/',
        ],
      },
      // AI Crawlers — explicitly allowed for AI search inclusion
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/admin/', '/book/', '/team/', '/referral/', '/feedback/', '/api/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/admin/', '/book/', '/team/', '/referral/', '/feedback/', '/api/'],
      },
      {
        userAgent: 'Claude-Web',
        allow: '/',
        disallow: ['/admin/', '/book/', '/team/', '/referral/', '/feedback/', '/api/'],
      },
      {
        userAgent: 'anthropic-ai',
        allow: '/',
        disallow: ['/admin/', '/book/', '/team/', '/referral/', '/feedback/', '/api/'],
      },
      {
        userAgent: 'Applebot',
        allow: '/',
        disallow: ['/admin/', '/book/', '/team/', '/referral/', '/feedback/', '/api/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/admin/', '/book/', '/team/', '/referral/', '/feedback/', '/api/'],
      },
    ],
    sitemap: 'https://www.washandfoldnyc.com/sitemap.xml',
    host: 'https://www.washandfoldnyc.com',
  }
}
