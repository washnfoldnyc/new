import type { Metadata } from 'next'
import Link from 'next/link'
import { AREAS } from '@/lib/seo/data/areas'
import { getNeighborhoodsByArea } from '@/lib/seo/locations'
import CTABlock from '@/components/marketing/CTABlock'

export const metadata: Metadata = {
  title: 'Laundry Service Locations — Manhattan, Brooklyn & Queens',
  description: 'Wash and Fold NYC serves nearly 200 neighborhoods across Manhattan, Brooklyn & Queens. $3/lb, free pickup & delivery. Find your neighborhood. (917) 970-6002.',
  alternates: { canonical: 'https://www.washandfoldnyc.com/locations' },
}

export default function LocationsPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl md:text-6xl text-white tracking-wide mb-4">
            Wash & Fold Across NYC — $3/lb
          </h1>
          <p className="text-sky-200/60 text-lg max-w-2xl mx-auto">
            Free pickup and delivery across Manhattan, Brooklyn & Queens. Nearly 200 neighborhoods served.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {AREAS.map(area => {
              const neighborhoods = getNeighborhoodsByArea(area.slug)
              return (
                <Link key={area.slug} href={`/boroughs/${area.slug}`} className="group border border-gray-200 rounded-2xl p-8 hover:border-[#4BA3D4] hover:shadow-lg transition-all text-center">
                  <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide group-hover:text-[#4BA3D4] transition-colors">{area.name}</h2>
                  <p className="text-[#4BA3D4] font-bold text-lg mt-2">{neighborhoods.length} neighborhoods</p>
                  <p className="text-gray-500 text-sm mt-3">{area.description}</p>
                </Link>
              )
            })}
          </div>

          {AREAS.map(area => {
            const neighborhoods = getNeighborhoodsByArea(area.slug)
            return (
              <div key={area.slug} className="mb-12">
                <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide mb-4">{area.name}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {neighborhoods.map(n => (
                    <Link key={n.slug} href={`/${n.urlSlug}`} className="text-sm text-gray-600 hover:text-[#4BA3D4] transition-colors py-1">
                      {n.name}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <CTABlock title="Find Your Neighborhood" subtitle="Text your address — we'll confirm coverage and schedule a pickup." />
    </>
  )
}
