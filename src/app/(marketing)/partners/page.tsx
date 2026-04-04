import type { Metadata } from 'next'
import Link from 'next/link'
import { AREAS } from '@/lib/seo/data/areas'
import { getNeighborhoodsByArea } from '@/lib/seo/locations'
import CTABlock from '@/components/marketing/CTABlock'

export const metadata: Metadata = {
  title: 'Laundromat Partnership Program | Wash and Fold NYC',
  description: 'Partner with Wash and Fold NYC. We send customers, you wash. $1-1.50/lb partner rate, we charge $3/lb. Volume growth guaranteed. Apply today. (917) 970-6002.',
  alternates: { canonical: 'https://www.washandfoldnyc.com/partners' },
}

export default function PartnersPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl md:text-6xl text-white tracking-wide mb-4">
            Partner With Wash and Fold NYC
          </h1>
          <p className="text-sky-200/60 text-lg max-w-2xl mx-auto mb-6">
            We send customers. You wash. We handle marketing, logistics, pickup & delivery. You process at your normal rate — we charge $3/lb and handle everything else.
          </p>
          <a href="sms:9179706002" className="bg-[#4BA3D4] text-white px-8 py-3.5 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-[#2B7BB0] transition-colors">
            Apply — Text (917) 970-6002
          </a>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-8">How the Partnership Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-[#F0F8FF] rounded-xl p-6">
              <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] mb-4">What We Bring</h3>
              <ul className="space-y-2 text-gray-600 text-sm">
                {['Customer acquisition & marketing', 'Pickup & delivery logistics', 'Customer service & support', 'Billing & payment processing', 'Route optimization', 'Brand & website'].map(i => (
                  <li key={i} className="flex items-start gap-2"><span className="text-[#4BA3D4]">&#10003;</span>{i}</li>
                ))}
              </ul>
            </div>
            <div className="bg-[#F0F8FF] rounded-xl p-6">
              <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] mb-4">What You Bring</h3>
              <ul className="space-y-2 text-gray-600 text-sm">
                {['Commercial washers & dryers', 'Labor for wash, dry, fold', 'Quality control', 'Consistent turnaround times', 'Space for staging', 'Your expertise'].map(i => (
                  <li key={i} className="flex items-start gap-2"><span className="text-[#4BA3D4]">&#10003;</span>{i}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-8 bg-gradient-to-r from-[#4BA3D4] to-[#7EC8E3] rounded-xl p-6 text-center text-white">
            <p className="text-sm mb-1">Revenue Model</p>
            <p className="font-[family-name:var(--font-bebas)] text-2xl">You process at $1–$1.50/lb &middot; We charge customers $3/lb &middot; We split the spread</p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#F0F8FF]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-8">Neighborhoods Seeking Partners</h2>
          {AREAS.map(area => {
            const neighborhoods = getNeighborhoodsByArea(area.slug)
            return (
              <div key={area.slug} className="mb-8">
                <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] tracking-wide mb-3">{area.name}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {neighborhoods.map(n => (
                    <Link key={n.slug} href={`/partners/${n.slug}`} className="text-sm text-gray-600 hover:text-[#4BA3D4] transition-colors py-1">
                      {n.name}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <CTABlock title="Apply to Partner" subtitle="Text (917) 970-6002 — we're actively seeking laundromat partners across NYC." />
    </>
  )
}
