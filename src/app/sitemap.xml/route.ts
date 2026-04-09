import { ALL_NEIGHBORHOODS } from '@/lib/seo/locations'
import { AREAS } from '@/lib/seo/data/areas'
import { SERVICES } from '@/lib/seo/services'

const BASE_URL = 'https://www.washandfoldnyc.com'

export async function GET() {
  const now = new Date().toISOString()

  const urls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = []

  // Homepage
  urls.push({ loc: BASE_URL, lastmod: now, changefreq: 'weekly', priority: '1.0' })

  // Static pages
  const staticPages = [
    { path: '/services', freq: 'weekly', pri: '0.9' },
    { path: '/locations', freq: 'weekly', pri: '0.9' },
    { path: '/pricing', freq: 'weekly', pri: '0.9' },
    { path: '/about', freq: 'monthly', pri: '0.7' },
    { path: '/contact', freq: 'monthly', pri: '0.8' },
    { path: '/faq', freq: 'monthly', pri: '0.8' },
    { path: '/careers', freq: 'daily', pri: '0.8' },
    { path: '/partners', freq: 'weekly', pri: '0.7' },
    { path: '/buildings', freq: 'weekly', pri: '0.7' },
    { path: '/reviews', freq: 'weekly', pri: '0.8' },
    { path: '/privacy-policy', freq: 'yearly', pri: '0.3' },
    { path: '/terms-conditions', freq: 'yearly', pri: '0.3' },
    { path: '/legal', freq: 'yearly', pri: '0.3' },
    { path: '/refund-policy', freq: 'yearly', pri: '0.3' },
  ]
  for (const p of staticPages) {
    urls.push({ loc: `${BASE_URL}${p.path}`, lastmod: now, changefreq: p.freq, priority: p.pri })
  }

  // Borough pages
  for (const area of AREAS) {
    urls.push({ loc: `${BASE_URL}/boroughs/${area.slug}`, lastmod: now, changefreq: 'weekly', priority: '0.9' })
  }

  // Service detail pages
  for (const service of SERVICES) {
    urls.push({ loc: `${BASE_URL}/services/${service.urlSlug}`, lastmod: now, changefreq: 'weekly', priority: '0.8' })
  }

  // Neighborhood pages
  for (const n of ALL_NEIGHBORHOODS) {
    urls.push({ loc: `${BASE_URL}/${n.urlSlug}`, lastmod: now, changefreq: 'weekly', priority: '0.8' })
  }

  // Neighborhood career pages
  for (const n of ALL_NEIGHBORHOODS) {
    urls.push({ loc: `${BASE_URL}/careers/${n.slug}`, lastmod: now, changefreq: 'daily', priority: '0.7' })
  }

  // Neighborhood partner pages
  for (const n of ALL_NEIGHBORHOODS) {
    urls.push({ loc: `${BASE_URL}/partners/${n.slug}`, lastmod: now, changefreq: 'weekly', priority: '0.6' })
  }

  // Building type pages
  for (const slug of ['luxury-buildings', 'doorman-buildings', 'student-housing']) {
    urls.push({ loc: `${BASE_URL}/buildings/${slug}`, lastmod: now, changefreq: 'weekly', priority: '0.7' })
  }

  // Neighborhood x Service cross pages
  for (const n of ALL_NEIGHBORHOODS) {
    for (const s of SERVICES) {
      urls.push({ loc: `${BASE_URL}/${n.urlSlug}/${s.slug}`, lastmod: now, changefreq: 'monthly', priority: '0.6' })
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
