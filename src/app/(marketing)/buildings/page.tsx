import type { Metadata } from 'next'
import Link from 'next/link'
import CTABlock from '@/components/marketing/CTABlock'

export const metadata: Metadata = {
  title: 'Building Laundry Packages — $3/lb | Wash and Fold NYC',
  description: 'Laundry service for NYC buildings — luxury, doorman, and student housing. $3/lb, free pickup from lobby. Volume discounts available. (917) 970-6002.',
  alternates: { canonical: 'https://www.washandfoldnyc.com/buildings' },
}

const buildingTypes = [
  { slug: 'luxury-buildings', name: 'Luxury Buildings', desc: 'White-glove laundry service for luxury residences. Concierge integration, lobby pickup, premium garment care.' },
  { slug: 'doorman-buildings', name: 'Doorman Buildings', desc: 'Scheduled pickup and delivery through your doorman. Leave your bag at the front desk, we handle the rest.' },
  { slug: 'student-housing', name: 'Student Housing', desc: 'Affordable rates for dorms and student apartments. Pickup schedules that work around class times.' },
]

export default function BuildingsPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl md:text-6xl text-white tracking-wide mb-4">
            Building Laundry Packages — $3/lb
          </h1>
          <p className="text-sky-200/60 text-lg max-w-2xl mx-auto">
            Laundry service designed for NYC buildings. Lobby pickup, doorman integration, volume discounts for residents.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {buildingTypes.map(bt => (
              <Link key={bt.slug} href={`/buildings/${bt.slug}`} className="group border border-gray-200 rounded-2xl p-8 hover:border-[#4BA3D4] hover:shadow-lg transition-all text-center">
                <h2 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide group-hover:text-[#4BA3D4] transition-colors">{bt.name}</h2>
                <p className="text-gray-500 text-sm mt-3">{bt.desc}</p>
                <p className="text-[#4BA3D4] font-bold text-sm mt-4">Learn More &rarr;</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTABlock title="Get a Building Quote" subtitle="Text your building address — we'll create a custom package for your residents." />
    </>
  )
}
