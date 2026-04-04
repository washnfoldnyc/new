import type { Metadata } from 'next'
import Link from 'next/link'
import { homepageContent } from '@/lib/seo/content'
import { homepageSchemas, faqSchema } from '@/lib/seo/schema'
import JsonLd from '@/components/marketing/JsonLd'
import CTABlock from '@/components/marketing/CTABlock'
import FAQSection from '@/components/marketing/FAQSection'
import { SERVICES } from '@/lib/seo/services'
import { AREAS } from '@/lib/seo/data/areas'
import { getNeighborhoodsByArea } from '@/lib/seo/locations'

const content = homepageContent()

export const metadata: Metadata = {
  title: { absolute: content.title },
  description: content.metaDescription,
  alternates: { canonical: 'https://www.washandfoldnyc.com' },
  openGraph: {
    title: content.title,
    description: content.metaDescription,
    url: 'https://www.washandfoldnyc.com',
    siteName: 'Wash and Fold NYC',
    type: 'website',
    locale: 'en_US',
  },
}

const testimonials = [
  { text: 'Best wash and fold in the city. Clothes come back perfectly folded every time. The free pickup is a game changer.', name: 'Rachel K.', location: 'Upper West Side' },
  { text: 'Switched from my old laundromat and the difference is night and day. They actually separate colors and fold everything neatly.', name: 'David T.', location: 'Williamsburg' },
  { text: 'I run an Airbnb in Brooklyn and they handle all my linens between guests. Fast turnaround, always spotless.', name: 'Tyler B.', location: 'Park Slope' },
]

const homepageFAQs = [
  { question: 'How much does wash and fold cost?', answer: '$3/lb with a $39 minimum order. Free pickup and delivery on all orders. Same-day rush is +$20.' },
  { question: 'How does pickup work?', answer: 'Text (917) 970-6002 with your address. We schedule a pickup, grab your bag from your door or doorman, and deliver it back clean and folded within 24-48 hours.' },
  { question: 'What areas do you serve?', answer: 'We serve all of Manhattan, Brooklyn, and Queens. Same rate everywhere — no distance surcharges.' },
  { question: 'Do you offer dry cleaning?', answer: 'Yes. Dry cleaning with free pickup and delivery. Dress shirts $10, suits $34, dresses $28, winter coats $45, wedding dresses $350.' },
  { question: 'How much are comforters?', answer: 'Flat rate: Twin $35, Full/Queen $45, King $55. Duvet covers $20, pillows $12 each, mattress pads $25, sleeping bags $30.' },
  { question: 'Do you offer subscriptions?', answer: 'Yes. Weekly subscribers save 10% (15 lb plan: $162/mo, 20 lb plan: $216/mo). Biweekly subscribers save 5% (15 lb plan: $85.50/mo).' },
  { question: 'Is there a minimum order?', answer: '$39 minimum for pickup and delivery. Most orders are 13+ lbs so most customers hit it easily.' },
  { question: 'How fast is turnaround?', answer: 'Standard turnaround is 24-48 hours. Same-day rush available for +$20 on orders dropped off or picked up before 10am.' },
  { question: 'What payment methods do you accept?', answer: 'Credit card, debit card, Zelle (hi@washandfoldnyc.com), Venmo, Apple Pay, and cash.' },
  { question: 'Can I request the same person each time?', answer: 'With weekly or biweekly subscriptions, we assign a consistent route so you get familiar service every time.' },
]

export default function HomePage() {
  const schemas = [...homepageSchemas(), faqSchema(homepageFAQs)]

  return (
    <>
      <JsonLd data={schemas} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#1a3a5c] to-[#2B7BB0] pt-14 md:pt-20 pb-0">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <span className="text-yellow-400 text-lg">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <span className="text-sky-200/70 text-sm font-medium">5.0 Google Rating</span>
            <span className="text-white/20 hidden sm:inline">|</span>
            <span className="text-sky-200/70 text-sm font-medium">Manhattan &middot; Brooklyn &middot; Queens</span>
          </div>

          <h1 className="font-[family-name:var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl text-white tracking-wide leading-[0.95] mb-4">
            {content.h1}
          </h1>

          <p className="text-sky-200/60 text-lg max-w-3xl mb-6">{content.subtitle}</p>

          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; $3/lb</span>
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; Free pickup & delivery</span>
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; $39 minimum</span>
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; Same-day +$20</span>
          </div>

          {/* Hero CTAs — white with blue font */}
          <div className="flex flex-col sm:flex-row items-start gap-4 mb-12">
            <a href="sms:9179706002" className="bg-white text-[#4BA3D4] px-8 py-3.5 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-sky-50 transition-colors shadow-lg">
              Text (917) 970-6002
            </a>
            <a href="tel:9179706002" className="bg-white text-[#4BA3D4] px-8 py-3.5 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-sky-50 transition-colors shadow-lg">
              Call (917) 970-6002
            </a>
          </div>
        </div>

        {/* Pricing bar */}
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-wide">$3/lb</p>
                <p className="text-sky-200/40 text-xs">Wash & Fold</p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-bebas)] text-2xl text-[#7EC8E3] tracking-wide">FREE</p>
                <p className="text-sky-200/40 text-xs">Pickup & Delivery</p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-wide">24–48 hrs</p>
                <p className="text-sky-200/40 text-xs">Turnaround</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-yellow-400 text-sm mt-1">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <div>
                  <p className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-wide">5.0</p>
                  <p className="text-sky-200/40 text-xs">Google Rating</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-xs font-semibold text-gray-400 tracking-[0.25em] uppercase mb-3 text-center">Our Services</h2>
          <p className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-[#1a3a5c] tracking-wide text-center mb-4">7 Laundry Services, One Trusted Team</p>
          <p className="text-gray-500 text-center max-w-2xl mx-auto mb-12">From everyday wash & fold to commercial bulk laundry — we handle it all.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map(service => (
              <Link key={service.slug} href={`/services/${service.urlSlug}`} className="group border border-gray-200 rounded-2xl p-7 hover:border-[#4BA3D4] hover:shadow-lg transition-all bg-white">
                <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] tracking-wide mb-2 group-hover:text-[#4BA3D4] transition-colors">{service.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-2">{service.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#1a3a5c]">{service.priceRange}</span>
                  <span className="text-sm text-[#4BA3D4]">Details &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-[#1a3a5c]">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-xs font-semibold text-[#7EC8E3]/60 tracking-[0.25em] uppercase mb-3 text-center">How It Works</p>
          <p className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-white tracking-wide text-center mb-12">3 Steps to Fresh Laundry</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: '01', t: 'Text or Call', d: 'Text (917) 970-6002 with your address. We\'ll confirm pricing and schedule a pickup.' },
              { n: '02', t: 'We Pick Up', d: 'Leave your bag with the doorman or at your door. Free pickup on orders over $39.' },
              { n: '03', t: 'Delivered Clean', d: 'Washed, dried, folded, and delivered back to your door within 24-48 hours. Pay after.' },
            ].map(s => (
              <div key={s.n} className="bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-2xl p-7 text-center">
                <span className="font-[family-name:var(--font-bebas)] text-5xl text-[#4BA3D4]/30 leading-none">{s.n}</span>
                <p className="font-[family-name:var(--font-bebas)] text-xl text-white tracking-wide mt-3 mb-2">{s.t}</p>
                <p className="text-sky-200/60 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-[#F0F8FF]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-12">What Our Customers Say</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div key={t.name} className="bg-white border border-gray-200 rounded-2xl p-8">
                <span className="text-yellow-400 text-lg">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <p className="text-gray-600 text-sm leading-relaxed mt-4 mb-6">&ldquo;{t.text}&rdquo;</p>
                <p className="font-semibold text-[#1a3a5c] text-sm">{t.name}</p>
                <p className="text-gray-400 text-xs">{t.location}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Service Areas */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide mb-8">Serving Nearly 200 NYC Neighborhoods</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {AREAS.map(area => {
              const neighborhoods = getNeighborhoodsByArea(area.slug)
              return (
                <Link key={area.slug} href={`/boroughs/${area.slug}`} className="group border border-gray-200 rounded-2xl p-8 hover:border-[#4BA3D4] hover:shadow-lg transition-all">
                  <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide group-hover:text-[#4BA3D4] transition-colors">{area.name}</h3>
                  <p className="text-[#4BA3D4] font-bold text-lg mt-1">{neighborhoods.length} neighborhoods</p>
                  <p className="text-gray-500 text-sm mt-2">{area.description}</p>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Subscription Plans */}
      <section className="py-20 bg-gradient-to-r from-[#4BA3D4] to-[#7EC8E3]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-white tracking-wide mb-8">Subscription Plans — Save Up to 10%</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6">
              <p className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c]">Weekly 15 lb</p>
              <p className="font-[family-name:var(--font-bebas)] text-3xl text-[#4BA3D4] mt-2">$162<span className="text-lg text-gray-400">/mo</span></p>
              <p className="text-gray-400 text-xs mt-1">10% off</p>
            </div>
            <div className="bg-white rounded-xl p-6 ring-2 ring-[#1a3a5c]">
              <p className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c]">Weekly 20 lb</p>
              <p className="font-[family-name:var(--font-bebas)] text-3xl text-[#4BA3D4] mt-2">$216<span className="text-lg text-gray-400">/mo</span></p>
              <p className="text-gray-400 text-xs mt-1">10% off &middot; Most Popular</p>
            </div>
            <div className="bg-white rounded-xl p-6">
              <p className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c]">Biweekly 15 lb</p>
              <p className="font-[family-name:var(--font-bebas)] text-3xl text-[#4BA3D4] mt-2">$85.50<span className="text-lg text-gray-400">/mo</span></p>
              <p className="text-gray-400 text-xs mt-1">5% off</p>
            </div>
          </div>
        </div>
      </section>

      <FAQSection faqs={homepageFAQs} title="Frequently Asked Questions" />
      <CTABlock />
    </>
  )
}
