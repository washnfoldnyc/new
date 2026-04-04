import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SERVICES, getServiceByUrlSlug } from '@/lib/seo/services'
import CTABlock from '@/components/marketing/CTABlock'
import Breadcrumbs from '@/components/marketing/Breadcrumbs'

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return SERVICES.map(s => ({ slug: s.urlSlug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const service = getServiceByUrlSlug(slug)
  if (!service) return {}
  return {
    title: `${service.name} in NYC — ${service.priceRange} | Wash and Fold NYC`,
    description: `${service.description} Serving Manhattan, Brooklyn & Queens. (917) 970-6002.`,
    alternates: { canonical: `https://www.washandfoldnyc.com/services/${slug}` },
  }
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params
  const service = getServiceByUrlSlug(slug)
  if (!service) notFound()

  return (
    <>
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/services" className="text-xs font-semibold text-[#7EC8E3]/70 tracking-[0.15em] uppercase hover:text-[#7EC8E3] transition-colors">Services</Link>
            <span className="text-white/20">/</span>
            <span className="text-xs font-semibold text-white/40 tracking-[0.15em] uppercase">{service.shortName}</span>
          </div>
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl md:text-6xl text-white tracking-wide mb-4">
            {service.name}
          </h1>
          <p className="text-sky-200/60 text-lg max-w-3xl mb-6">{service.description}</p>
          <div className="flex flex-wrap gap-4 mb-8">
            <div className="bg-white/10 border border-white/20 rounded-lg px-5 py-3">
              <p className="font-[family-name:var(--font-bebas)] text-2xl text-white">{service.priceRange}</p>
              <p className="text-sky-200/40 text-xs">Price</p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-lg px-5 py-3">
              <p className="font-[family-name:var(--font-bebas)] text-2xl text-[#7EC8E3]">{service.duration}</p>
              <p className="text-sky-200/40 text-xs">Turnaround</p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-lg px-5 py-3">
              <p className="font-[family-name:var(--font-bebas)] text-2xl text-white">FREE</p>
              <p className="text-sky-200/40 text-xs">Pickup & Delivery</p>
            </div>
          </div>
          <a href="sms:9179706002" className="bg-[#4BA3D4] text-white px-8 py-3.5 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-[#2B7BB0] transition-colors">
            Text (917) 970-6002
          </a>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumbs items={[{ name: 'Services', href: '/services' }, { name: service.name, href: `/services/${service.urlSlug}` }]} />
      </div>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide mb-8">What&apos;s Included</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {service.features.map((f, i) => (
              <div key={f} className="flex items-start gap-4 bg-[#F0F8FF] border border-[#4BA3D4]/10 rounded-xl p-4">
                <span className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c]/20 leading-none mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-gray-700 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#F0F8FF]">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-4">Perfect For</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {service.idealFor.map(item => (
              <div key={item} className="bg-white border border-gray-200 rounded-xl p-5 text-center">
                <p className="text-sm font-medium text-[#1a3a5c]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-4">Other Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            {SERVICES.filter(s => s.slug !== service.slug).map(s => (
              <Link key={s.slug} href={`/services/${s.urlSlug}`} className="group border border-gray-200 rounded-2xl p-6 hover:border-[#4BA3D4] hover:shadow-lg transition-all">
                <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] tracking-wide group-hover:text-[#4BA3D4] transition-colors">{s.name}</h3>
                <p className="text-gray-500 text-sm mt-2 line-clamp-2">{s.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm font-bold text-[#1a3a5c]">{s.priceRange}</span>
                  <span className="text-sm text-[#4BA3D4]">Learn More &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTABlock title={`Book ${service.name} Today`} subtitle={`${service.priceRange} — free pickup & delivery across Manhattan, Brooklyn & Queens.`} />
    </>
  )
}
