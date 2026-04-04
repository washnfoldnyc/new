import type { Metadata } from 'next'
import Link from 'next/link'
import { AREAS } from '@/lib/seo/data/areas'
import { getNeighborhoodsByArea } from '@/lib/seo/locations'
import CTABlock from '@/components/marketing/CTABlock'

export const metadata: Metadata = {
  title: 'Laundry Jobs NYC — Now Hiring | $18–22/hr | Wash and Fold NYC',
  description: 'Join the Wash and Fold NYC team. Laundry pickup, processing, and delivery jobs across Manhattan, Brooklyn & Queens. $18-22/hr, flexible schedule, weekly pay. (917) 970-6002.',
  alternates: { canonical: 'https://www.washandfoldnyc.com/careers' },
}

export default function CareersPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl md:text-6xl text-white tracking-wide mb-4">
            Join the Wash and Fold NYC Team
          </h1>
          <p className="text-sky-200/60 text-lg max-w-2xl mx-auto mb-6">
            Now hiring across Manhattan, Brooklyn & Queens. $18–22/hr, flexible hours, weekly pay.
          </p>
          <a href="sms:9179706002" className="bg-[#4BA3D4] text-white px-8 py-3.5 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-[#2B7BB0] transition-colors">
            Apply — Text (917) 970-6002
          </a>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-8">Open Positions</h2>
          <div className="space-y-6">
            {[
              { title: 'Pickup & Delivery Driver', pay: '$20–22/hr', desc: 'Pick up and deliver laundry across your assigned neighborhood. Must have reliable transportation.' },
              { title: 'Laundry Attendant', pay: '$18–20/hr', desc: 'Sort, wash, dry, and fold laundry at our partner facilities. Attention to detail required.' },
              { title: 'Route Manager', pay: '$22–26/hr', desc: 'Manage pickup routes, coordinate drivers, and ensure on-time delivery across a borough.' },
            ].map(job => (
              <div key={job.title} className="border border-gray-200 rounded-xl p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] tracking-wide">{job.title}</h3>
                    <p className="text-gray-500 text-sm mt-1">{job.desc}</p>
                  </div>
                  <span className="text-[#4BA3D4] font-bold text-lg whitespace-nowrap ml-4">{job.pay}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#F0F8FF]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-8">Hiring by Neighborhood</h2>
          {AREAS.map(area => {
            const neighborhoods = getNeighborhoodsByArea(area.slug)
            return (
              <div key={area.slug} className="mb-8">
                <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] tracking-wide mb-3">{area.name}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {neighborhoods.map(n => (
                    <Link key={n.slug} href={`/careers/${n.slug}`} className="text-sm text-gray-600 hover:text-[#4BA3D4] transition-colors py-1">
                      {n.name}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <CTABlock title="Apply Today" subtitle="Text (917) 970-6002 — flexible hours, weekly pay, growth opportunities." />
    </>
  )
}
