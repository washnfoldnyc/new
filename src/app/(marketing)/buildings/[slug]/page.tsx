import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CTABlock from '@/components/marketing/CTABlock'
import Breadcrumbs from '@/components/marketing/Breadcrumbs'

interface Props { params: Promise<{ slug: string }> }

const BUILDING_DATA: Record<string, { name: string; description: string; features: string[] }> = {
  'luxury-buildings': {
    name: 'Luxury Building Laundry Service',
    description: 'White-glove laundry service for luxury residences. Concierge integration, lobby pickup, premium garment care, and dry cleaning — all at $3/lb with free pickup.',
    features: ['Concierge and doorman coordination', 'Lobby pickup and delivery', 'Premium detergent and fabric care', 'Garment bags for delicates', 'Same-day rush available (+$20)', 'Dry cleaning pickup included', 'Comforter and bedding service', 'Recurring weekly scheduling', 'Volume discounts for 10+ units', 'Dedicated account manager'],
  },
  'doorman-buildings': {
    name: 'Doorman Building Laundry Service',
    description: 'Leave your laundry with the doorman, we pick it up and deliver it back — clean, folded, and ready. $3/lb, free pickup, no hassle.',
    features: ['Doorman pickup coordination', 'Scheduled pickup times', 'Free delivery back to lobby', 'Text notifications at every step', 'Same-day rush available (+$20)', 'Recurring weekly or biweekly', 'All services: wash & fold, dry cleaning, comforters', 'Volume discounts available', 'Building-wide packages', 'No in-unit access needed'],
  },
  'student-housing': {
    name: 'Student Housing Laundry Service',
    description: 'Affordable laundry service for students. $3/lb, flexible scheduling around classes, pickup from your dorm or building lobby.',
    features: ['$3/lb — same rate for everyone', 'Dorm lobby pickup', 'Flexible scheduling around classes', 'Text to schedule anytime', 'Weekly subscription saves 10%', 'Comforter cleaning available', 'End-of-semester deep clean packages', 'No contract required', 'Pay per order or subscribe', 'Fast 24-48 hour turnaround'],
  },
}

export function generateStaticParams() {
  return Object.keys(BUILDING_DATA).map(slug => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = BUILDING_DATA[slug]
  if (!data) return {}
  return {
    title: `${data.name} — $3/lb | Wash and Fold NYC`,
    description: `${data.description} (917) 970-6002.`,
    alternates: { canonical: `https://www.washandfoldnyc.com/buildings/${slug}` },
  }
}

export default async function BuildingTypePage({ params }: Props) {
  const { slug } = await params
  const data = BUILDING_DATA[slug]
  if (!data) notFound()

  return (
    <>
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-4">
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl md:text-6xl text-white tracking-wide mb-4">{data.name}</h1>
          <p className="text-sky-200/60 text-lg max-w-3xl mb-6">{data.description}</p>
          <div className="flex flex-wrap gap-4 mb-8">
            <div className="bg-white/10 border border-white/20 rounded-lg px-5 py-3">
              <p className="font-[family-name:var(--font-bebas)] text-2xl text-white">$3<span className="text-lg text-sky-200/60">/lb</span></p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-lg px-5 py-3">
              <p className="font-[family-name:var(--font-bebas)] text-2xl text-[#7EC8E3]">FREE</p>
              <p className="text-sky-200/40 text-xs">Pickup & Delivery</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a href="sms:9179706002" className="bg-white text-[#4BA3D4] px-8 py-3.5 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-sky-50 transition-colors shadow-lg">Text (917) 970-6002</a>
            <a href="tel:9179706002" className="bg-white text-[#4BA3D4] px-8 py-3.5 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-sky-50 transition-colors shadow-lg">Call (917) 970-6002</a>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumbs items={[{ name: 'Buildings', href: '/buildings' }, { name: data.name, href: `/buildings/${slug}` }]} />
      </div>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide mb-6">What&apos;s Included</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.features.map((f, i) => (
              <div key={f} className="flex items-start gap-3 bg-[#F0F8FF] rounded-xl p-4">
                <span className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c]/20">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-gray-700 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTABlock title="Get a Building Quote" subtitle="Text your building address — custom packages for any building type." />
    </>
  )
}
