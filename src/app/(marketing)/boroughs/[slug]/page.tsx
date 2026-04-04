import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AREAS } from '@/lib/seo/data/areas'
import { getArea } from '@/lib/seo/locations'
import { getNeighborhoodsByArea } from '@/lib/seo/locations'
import { SERVICES } from '@/lib/seo/services'
import CTABlock from '@/components/marketing/CTABlock'
import Breadcrumbs from '@/components/marketing/Breadcrumbs'

interface Props { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return AREAS.map(a => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const area = getArea(slug)
  if (!area) return {}
  return {
    title: `${area.name} Wash and Fold — $3/lb | Free Pickup & Delivery`,
    description: `${area.description} $3/lb, $39 minimum, free pickup. (917) 970-6002.`,
    alternates: { canonical: `https://www.washandfoldnyc.com/boroughs/${slug}` },
  }
}

export default async function BoroughPage({ params }: Props) {
  const { slug } = await params
  const area = getArea(slug)
  if (!area) notFound()
  const neighborhoods = getNeighborhoodsByArea(area.slug)

  return (
    <>
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl md:text-6xl text-white tracking-wide mb-4">
            {area.name} Wash & Fold — $3/lb
          </h1>
          <p className="text-sky-200/60 text-lg max-w-2xl mx-auto">{area.description}</p>
          <p className="text-[#7EC8E3] font-bold mt-4">{neighborhoods.length} neighborhoods served</p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumbs items={[{ name: 'Locations', href: '/locations' }, { name: area.name, href: `/boroughs/${area.slug}` }]} />
      </div>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide mb-6">{area.name} Neighborhoods</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {neighborhoods.map(n => (
              <Link key={n.slug} href={`/${n.urlSlug}`} className="border border-gray-200 rounded-xl p-4 text-center hover:border-[#4BA3D4] hover:shadow-md transition-all">
                <p className="text-sm font-medium text-[#1a3a5c]">{n.name}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#F0F8FF]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-8">Services in {area.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map(s => (
              <div key={s.slug} className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] tracking-wide">{s.name}</h3>
                <p className="text-sm font-bold text-[#4BA3D4] mt-1">{s.priceRange}</p>
                <p className="text-gray-500 text-sm mt-2 line-clamp-2">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTABlock title={`Book Laundry in ${area.name}`} subtitle={`$3/lb, free pickup & delivery across all ${area.name} neighborhoods.`} />
    </>
  )
}
