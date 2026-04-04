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
  { text: 'Best wash and fold in the city. My clothes come back perfectly folded every single time. The free pickup and delivery is what sold me — I literally never have to leave my apartment. I used to waste entire Saturdays at the laundromat hauling bags down four flights of stairs. Now I text them, leave a bag at my door, and it comes back clean and folded the next day. The price is fair, the quality is consistent, and the communication is excellent. I get a text when they pick up and another when they drop off. Five stars, no hesitation.', name: 'Rachel K.', location: 'Upper West Side' },
  { text: 'I switched from doing my own laundry and the difference is night and day. They actually separate colors, use quality detergent, and fold everything neatly — something I never had the patience for. My shirts come back crisp, my towels are fluffy, and nothing has ever been damaged or lost. At three dollars a pound, it costs me about fifty bucks a week for two people. That is absolutely worth it when you factor in the time, quarters, detergent, and energy I used to spend. I have recommended them to everyone in my building.', name: 'David T.', location: 'Williamsburg' },
  { text: 'I run two Airbnb units in Park Slope and they handle all my linens and towels between guest turnovers. Fast turnaround, always spotless, and they fold the towels exactly how I need them for photos. Before I found Wash and Fold NYC, I was doing six loads of laundry between every guest checkout and check-in. Now I just text them, they pick up the dirty linens at checkout, and deliver fresh ones before the next guest arrives. They have never missed a turnaround. If you are a host in NYC, this service pays for itself in time saved and better reviews.', name: 'Tyler B.', location: 'Park Slope' },
  { text: 'As a nurse working twelve-hour shifts at NYU Langone, the last thing I want to do when I get home is laundry. Scrubs, sheets, towels — it all piles up fast. I signed up for the weekly fifteen-pound plan and it has genuinely changed my quality of life. Every Monday they pick up my bag and by Tuesday evening it is back at my door, clean, folded, and ready to put away. The subscription saves me ten percent and I never run out of clean scrubs. I wish I had found this service years ago.', name: 'Danielle F.', location: 'Murray Hill' },
  { text: 'We are a family of four with two kids under five. The amount of laundry we generate is absurd — stained onesies, grass-covered play clothes, bedsheets that need washing twice a week, towels everywhere. We were spending every Sunday doing six or seven loads. Now we do the weekly twenty-pound plan and it covers almost everything. They handle the stains, they fold the tiny clothes, and they package everything by family member which makes putting it away so easy. The monthly cost is less than what we spent on detergent, dryer sheets, and machine time.', name: 'Kevin & Laura W.', location: 'Astoria' },
  { text: 'I moved to NYC from Austin last year and dreaded the laundromat situation. My building has a shared laundry room in the basement with two machines that are always broken or occupied. A coworker told me about Wash and Fold NYC and it solved the problem completely. I leave my bag with the doorman on my way to work, and it is back by the time I get home. Clean, folded, in a sealed bag. The first time I opened a bag of perfectly folded laundry that I did not have to wash, dry, or fold myself, I almost cried. Not exaggerating.', name: 'Olivia M.', location: 'Long Island City' },
]

const homepageFAQs = [
  { question: 'How much does wash and fold cost in NYC?', answer: 'Our wash and fold service is $3 per pound with a $39 minimum order. This includes sorting by color and fabric type, stain pre-treatment, washing with premium detergent, tumble drying on appropriate heat settings, hand-folding every item, and packaging in clean sealed bags. Pickup and delivery is always free on orders over $39. Same-day rush service is available for an additional $20 flat fee on orders received before 10am.' },
  { question: 'How does pickup and delivery work?', answer: 'Text or call (917) 970-6002 with your address and preferred pickup time. We will confirm your slot and send a driver to your door, lobby, or doorman. Your laundry is taken to our partner facility, sorted, washed, dried, folded, and packaged. We deliver it back to your door within 24 to 48 hours. You will receive text notifications at pickup, when your laundry is being processed, and when it is on its way back. There is no delivery fee — pickup and delivery is free on all orders over the $39 minimum.' },
  { question: 'What areas do you serve?', answer: 'We serve all of Manhattan, Brooklyn, and Queens — nearly 200 neighborhoods. This includes the Upper East Side, Upper West Side, Midtown, Chelsea, SoHo, Tribeca, the Financial District, Harlem, Washington Heights, Williamsburg, Park Slope, Brooklyn Heights, DUMBO, Bushwick, Greenpoint, Astoria, Long Island City, Forest Hills, Jackson Heights, Flushing, and every neighborhood in between. Same rate everywhere — no distance surcharges. See our full locations page for the complete neighborhood directory.' },
  { question: 'Do you offer dry cleaning?', answer: 'Yes. We offer premium dry cleaning with free pickup and delivery. Our dry cleaning is handled by trusted local partners and priced as a white-glove service. Dress shirts are $10, blouses $14, two-piece suits $34, dresses $28, pants $18, blazers $22, winter coats $45, down jackets $45, sweaters $18, ties $12, skirts $18, evening gowns $60, and wedding dresses $350. Every dry cleaning order includes garment bags, button checks, and minor repairs at no extra cost.' },
  { question: 'How much are comforters and bulky items?', answer: 'Comforters and bulky items are priced at a flat rate, not by the pound. Twin comforters are $35, Full or Queen comforters are $45, and King comforters are $55. Duvet covers are $20, pillows are $12 each, mattress pads are $25, and sleeping bags are $30. All items are washed, dried, fluffed, and sealed in clean packaging. Pickup and delivery is free.' },
  { question: 'Do you offer subscription plans?', answer: 'Yes. Weekly subscribers save 10 percent off the standard per-pound rate. The Weekly 15 pound plan is $162 per month, the Weekly 20 pound plan is $216 per month. Biweekly subscribers save 5 percent — the Biweekly 15 pound plan is $85.50 per month. Subscriptions include a consistent pickup schedule, the same route driver, and priority processing. You can pause, skip, or cancel anytime with no fees.' },
  { question: 'Is there a minimum order?', answer: 'Yes, the minimum order for pickup and delivery is $39, which works out to about 13 pounds at $3 per pound. Most individual orders are 15 pounds or more, so the majority of customers hit the minimum easily. A typical week of laundry for one person is 10 to 15 pounds. For couples, 20 to 25 pounds. For families with children, 30 to 50 pounds per week.' },
  { question: 'How fast is turnaround?', answer: 'Standard turnaround is 24 to 48 hours. If you need it faster, same-day rush service is available for a flat $20 fee on orders picked up or dropped off before 10am. We will have your laundry back to your door by evening the same day. For recurring weekly customers, turnaround is typically under 24 hours since your order is prioritized.' },
  { question: 'What payment methods do you accept?', answer: 'We accept credit cards, debit cards, Zelle (hi@washandfoldnyc.com), Venmo, Apple Pay, and cash. For subscription customers, we set up automatic billing on a weekly or biweekly cycle. For one-time orders, payment is collected upon delivery. We never charge before your laundry is done.' },
  { question: 'How do you handle delicates and special items?', answer: 'We sort every load by color, fabric type, and care requirements before washing. Delicates are washed on gentle cycles in mesh bags. If you have specific instructions — cold wash only, no dryer, fragrance-free detergent — just let us know when you schedule your pickup and we will follow your preferences exactly. We also offer eco-friendly and hypoallergenic detergent options at no extra cost.' },
  { question: 'What if something is damaged or lost?', answer: 'We carry full liability insurance. If any item is damaged or lost during our service, contact us within 48 hours and we will resolve it. In our history, lost items are extremely rare because we process each customer order separately — your laundry never mixes with anyone else. We take an inventory at pickup and cross-check at delivery.' },
  { question: 'Can I request the same person each time?', answer: 'With weekly or biweekly subscriptions, we assign a consistent route driver so you get the same person for pickup and delivery every time. This builds familiarity and trust — your driver knows your building, your doorman, and your preferences. For one-time orders, we assign based on route availability.' },
  { question: 'Do you serve businesses?', answer: 'Yes. Our commercial laundry service handles restaurants, salons, gyms, Airbnb hosts, and offices. Commercial pricing starts at $1 to $2 per pound depending on volume and frequency. We offer daily or weekly pickup schedules, invoice billing, and a dedicated account manager for businesses processing over 100 pounds per week. Contact us for a custom quote.' },
  { question: 'How is Wash and Fold NYC different from a regular laundromat?', answer: 'Three things: convenience, quality, and consistency. A laundromat requires you to haul your laundry there, wait for machines, switch loads, fold everything yourself, and haul it back. With us, you text a number, leave a bag at your door, and get it back clean and folded. We sort by color, pre-treat stains, use premium detergent, and hand-fold every item. And unlike a laundromat, your laundry never sits in a communal machine that just washed someone else clothes.' },
  { question: 'Do you use my detergent or yours?', answer: 'We use our own premium commercial-grade detergent. If you have preferences — fragrance-free, eco-friendly, hypoallergenic, or a specific brand — let us know and we will accommodate. There is no extra charge for special detergent requests.' },
  { question: 'What happens if I am not home for delivery?', answer: 'We can leave your laundry with your doorman, at your door, or in a secure location you designate. Many customers leave a laundry bag hanging on their door handle and we swap the clean bag for the dirty one. For buildings with doormen, we coordinate directly with the front desk. You will always receive a text notification when your laundry has been delivered.' },
  { question: 'How do I get started?', answer: 'Text or call (917) 970-6002 with your address and what you need — wash and fold, dry cleaning, comforters, or a subscription plan. We will confirm pricing, schedule your first pickup, and have your laundry back to you within 24 to 48 hours. No contracts, no signup fees, no commitment beyond your first order.' },
  { question: 'Do you offer gift cards or prepaid packages?', answer: 'Not currently, but we are working on it. In the meantime, you can prepay for a subscription plan or schedule a one-time order as a gift for someone. Just text us the recipient address and any special instructions.' },
  { question: 'What are your hours?', answer: 'We accept pickup and delivery requests seven days a week. Typical pickup windows are 7am to 9pm. Same-day rush orders must be scheduled before 10am. Text us anytime — we respond within minutes during operating hours and within an hour outside of them.' },
  { question: 'Are you licensed and insured?', answer: 'Yes. Wash and Fold NYC is fully licensed, bonded, and insured with general liability coverage. All team members are background-checked. Your garments and property are protected on every order.' },
]

export default function HomePage() {
  const schemas = [...homepageSchemas(), faqSchema(homepageFAQs)]

  return (
    <>
      <JsonLd data={schemas} />

      {/* ============ HERO ============ */}
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

          <p className="text-sky-200/70 text-lg max-w-3xl mb-4">
            {content.subtitle} We pick up your dirty laundry, wash it, dry it, fold it, and deliver it back to your door — clean, fresh, and ready to put away. Nearly 200 neighborhoods served across <Link href="/boroughs/manhattan" className="text-[#7EC8E3] underline underline-offset-2 hover:text-white transition-colors">Manhattan</Link>, <Link href="/boroughs/brooklyn" className="text-[#7EC8E3] underline underline-offset-2 hover:text-white transition-colors">Brooklyn</Link>, and <Link href="/boroughs/queens" className="text-[#7EC8E3] underline underline-offset-2 hover:text-white transition-colors">Queens</Link>.
          </p>

          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; $3/lb</span>
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; Free pickup & delivery</span>
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; $39 minimum</span>
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; Same-day +$20</span>
            <span className="text-[#7EC8E3] text-sm font-medium">&#10003; 10% off weekly subscriptions</span>
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

      {/* ============ SERVICES ============ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-xs font-semibold text-gray-400 tracking-[0.25em] uppercase mb-3 text-center">Our Services</h2>
          <p className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-[#1a3a5c] tracking-wide text-center mb-4">Seven Laundry Services, One Trusted Team</p>
          <p className="text-gray-500 text-center max-w-3xl mx-auto mb-12">From everyday <Link href="/services/wash-and-fold" className="text-[#4BA3D4] underline underline-offset-2">wash and fold</Link> to <Link href="/services/dry-cleaning" className="text-[#4BA3D4] underline underline-offset-2">professional dry cleaning</Link> and <Link href="/services/commercial-laundry" className="text-[#4BA3D4] underline underline-offset-2">commercial laundry for businesses</Link> — we handle every type of fabric and every size of order with the same attention to detail. All services include free pickup and delivery across Manhattan, Brooklyn, and Queens.</p>
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

      {/* ============ HOW IT WORKS ============ */}
      <section className="py-20 bg-[#1a3a5c]">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-xs font-semibold text-[#7EC8E3]/60 tracking-[0.25em] uppercase mb-3 text-center">How It Works</p>
          <p className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-white tracking-wide text-center mb-4">Three Steps to Fresh, Folded Laundry</p>
          <p className="text-sky-200/60 text-center max-w-2xl mx-auto mb-12">No app to download, no account to create, no contract to sign. Just text us your address and we take it from there. The entire process — from dirty laundry to clean, folded clothes at your door — takes 24 to 48 hours.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: '01', t: 'Text or Call', d: 'Text (917) 970-6002 with your address and what you need. We confirm pricing, schedule a pickup time that works for you, and send a driver. Most pickups are scheduled within a few hours of your first text. No forms, no app, no signup.' },
              { n: '02', t: 'We Pick Up — Free', d: 'Leave your bag with the doorman, at your door, or hand it to our driver. Free pickup on all orders over $39. Your laundry is taken to our partner facility where it is sorted by color and fabric, pre-treated for stains, washed with premium detergent, and tumble dried on appropriate heat settings.' },
              { n: '03', t: 'Delivered Clean & Folded', d: 'Every item is hand-folded, organized by garment type, and packaged in clean sealed bags. We deliver back to your door within 24 to 48 hours. You receive a text when your laundry is on its way. Pay after delivery — credit card, Zelle, Venmo, Apple Pay, or cash.' },
            ].map(s => (
              <div key={s.n} className="bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-2xl p-7 text-center">
                <span className="font-[family-name:var(--font-bebas)] text-5xl text-[#4BA3D4]/30 leading-none">{s.n}</span>
                <p className="font-[family-name:var(--font-bebas)] text-xl text-white tracking-wide mt-3 mb-2">{s.t}</p>
                <p className="text-sky-200/60 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-10">
            <a href="sms:9179706002" className="bg-white text-[#4BA3D4] px-10 py-4 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-sky-50 transition-colors shadow-lg">
              Text (917) 970-6002 to Start
            </a>
          </div>
        </div>
      </section>

      {/* ============ DETAILED PRICING ============ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-xs font-semibold text-gray-400 tracking-[0.25em] uppercase mb-3 text-center">Transparent Pricing</h2>
          <p className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-[#1a3a5c] tracking-wide text-center mb-4">Every Price, Right Here — No Surprises</p>
          <p className="text-gray-500 text-center max-w-3xl mx-auto mb-12">We believe pricing should be straightforward. No hidden fees, no surge pricing, no different rates for different neighborhoods. What you see below is exactly what you pay. For the complete breakdown including every dry cleaning item, visit our <Link href="/pricing" className="text-[#4BA3D4] underline underline-offset-2">full pricing page</Link>.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Wash & Fold */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide mb-4">Wash & Fold</h3>
              <div className="space-y-3">
                {[
                  ['Wash & fold', '$3/lb'],
                  ['Minimum order', '$39'],
                  ['Pickup & delivery', 'Free'],
                  ['Turnaround', '24–48 hours'],
                  ['Same-day rush', '+$20 flat fee'],
                ].map(([item, price]) => (
                  <div key={item} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-600 text-sm">{item}</span>
                    <span className="font-bold text-[#1a3a5c] text-sm">{price}</span>
                  </div>
                ))}
              </div>
              <Link href="/services/wash-and-fold" className="inline-block mt-4 text-[#4BA3D4] text-sm font-medium underline underline-offset-2">Full wash & fold details &rarr;</Link>
            </div>

            {/* Subscriptions */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide mb-4">Subscription Plans</h3>
              <div className="space-y-3">
                {[
                  ['Weekly 15 lb', '$162/mo', '10% off'],
                  ['Weekly 20 lb', '$216/mo', '10% off'],
                  ['Biweekly 15 lb', '$85.50/mo', '5% off'],
                ].map(([plan, price, savings]) => (
                  <div key={plan} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-600 text-sm">{plan}</span>
                    <div className="text-right">
                      <span className="font-bold text-[#1a3a5c] text-sm">{price}</span>
                      <span className="text-[#4BA3D4] text-xs ml-2">{savings}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-gray-400 text-xs mt-4">No contracts. Pause, skip, or cancel anytime.</p>
            </div>

            {/* Bulky Items */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide mb-4">Comforters & Bulky Items</h3>
              <div className="space-y-3">
                {[
                  ['Twin comforter', '$35'],
                  ['Full/Queen comforter', '$45'],
                  ['King comforter', '$55'],
                  ['Duvet cover', '$20'],
                  ['Pillow (each)', '$12'],
                  ['Mattress pad', '$25'],
                  ['Sleeping bag', '$30'],
                ].map(([item, price]) => (
                  <div key={item} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-600 text-sm">{item}</span>
                    <span className="font-bold text-[#1a3a5c] text-sm">{price}</span>
                  </div>
                ))}
              </div>
              <Link href="/services/comforter-cleaning" className="inline-block mt-4 text-[#4BA3D4] text-sm font-medium underline underline-offset-2">Comforter cleaning details &rarr;</Link>
            </div>

            {/* Dry Cleaning */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide mb-4">Dry Cleaning</h3>
              <div className="space-y-3">
                {[
                  ['Dress shirt', '$10'],
                  ['Blouse', '$14'],
                  ['Suit (2-piece)', '$34'],
                  ['Dress', '$28'],
                  ['Pants/trousers', '$18'],
                  ['Blazer/sport coat', '$22'],
                  ['Winter coat', '$45'],
                  ['Down jacket', '$45'],
                  ['Sweater', '$18'],
                  ['Tie', '$12'],
                  ['Skirt', '$18'],
                  ['Evening gown', '$60'],
                  ['Wedding dress', '$350'],
                ].map(([item, price]) => (
                  <div key={item} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-600 text-sm">{item}</span>
                    <span className="font-bold text-[#1a3a5c] text-sm">{price}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-400 text-xs mt-4">Free pickup & delivery. Garment bags included.</p>
              <Link href="/services/dry-cleaning" className="inline-block mt-2 text-[#4BA3D4] text-sm font-medium underline underline-offset-2">Full dry cleaning details &rarr;</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ WHY CHOOSE US ============ */}
      <section className="py-20 bg-[#F0F8FF]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-xs font-semibold text-gray-400 tracking-[0.25em] uppercase mb-3 text-center">Why Wash and Fold NYC</h2>
          <p className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-[#1a3a5c] tracking-wide text-center mb-4">Why Thousands of New Yorkers Trust Us With Their Laundry</p>
          <p className="text-gray-500 text-center max-w-3xl mx-auto mb-12">
            There are dozens of laundry services in NYC. Here is why our customers stay with us — and why they send their friends, their family, and their neighbors.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { t: 'Transparent Pricing — No Hidden Fees', d: 'Three dollars per pound. That is the rate. No fuel surcharges, no neighborhood premiums, no surge pricing during busy periods, no minimum that changes depending on the day. The price on our website is the price on your bill. Every time. We also publish our dry cleaning and comforter rates in full — every item, every price, right on our pricing page.' },
              { t: 'Free Pickup and Delivery — Always', d: 'Every order over $39 includes free pickup and free delivery. We come to your door, your lobby, or your doorman. You never have to carry a bag, find a cab, or wait for a machine. We deliver back to the same location within 24 to 48 hours. For buildings with doormen, we coordinate directly so you do not need to be home.' },
              { t: 'Your Laundry Never Mixes With Others', d: 'Every customer order is processed separately from start to finish. Your clothes are never thrown into a shared machine with a stranger laundry. We tag and track your bag from pickup to delivery. This is how we prevent lost items and cross-contamination — and why we can offer an inventory guarantee on every order.' },
              { t: 'Premium Detergent, Professional Equipment', d: 'We use commercial-grade machines and premium detergent — not the cheap stuff from a vending machine. Every load is sorted by color and fabric type, stains are pre-treated individually, and items are dried on the correct heat setting for the fabric. Fragrance-free, eco-friendly, and hypoallergenic options are available at no extra charge.' },
              { t: 'Hand-Folded, Not Machine-Crammed', d: 'Every single item in your order is hand-folded by a trained professional — not rolled into a ball or crammed into a bag. Shirts are folded flat, pants are creased, towels are stacked, and everything is organized by garment type. When you open your bag, it looks like a department store display, not a laundromat basket.' },
              { t: 'Real Humans, Real Communication', d: 'When you text (917) 970-6002, you are talking to a real person — not a chatbot, not an automated system, not a form that goes into a queue. We respond within minutes during business hours. You get text updates at pickup, during processing, and at delivery. If something is wrong, you text the same number and a human handles it immediately.' },
              { t: 'Consistent Quality — Every Single Order', d: 'We use standardized checklists for every load: sort, pre-treat, wash, dry, fold, package, deliver. There is no variation in quality from one order to the next. Whether it is your first order or your fiftieth, the result is the same — clean, fresh, perfectly folded laundry. This consistency is why our Google rating is 5.0 with zero negative reviews.' },
              { t: 'Licensed, Insured, Background-Checked', d: 'Wash and Fold NYC is fully licensed and insured with general liability coverage. Every team member passes a background check before handling a single bag of laundry. Your garments and your property are protected on every pickup and delivery. We are a real business with a real address at 150 W 47th Street in Midtown Manhattan.' },
              { t: 'Subscription Savings That Actually Matter', d: 'Weekly subscribers save 10 percent off every pound — that adds up fast. A single person doing 15 pounds per week saves $18 per month. A family doing 30 pounds per week saves $36 per month. And you get a consistent pickup schedule, the same route driver, and priority processing. Pause or cancel anytime with no penalties.' },
            ].map(item => (
              <div key={item.t} className="bg-white border border-gray-200 rounded-2xl p-7">
                <h3 className="font-semibold text-[#1a3a5c] text-base mb-3">{item.t}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ COMPARISON ============ */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-4">Wash & Fold NYC vs. The Alternatives</h2>
          <p className="text-gray-500 text-center max-w-2xl mx-auto mb-10">Here is how we compare to doing it yourself at a laundromat or using a delivery app. The numbers speak for themselves.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[#4BA3D4]">
                  <th className="text-left py-3 text-gray-500 font-medium">Feature</th>
                  <th className="text-center py-3 text-[#4BA3D4] font-bold">Wash & Fold NYC</th>
                  <th className="text-center py-3 text-gray-400 font-medium">NYC Laundromat</th>
                  <th className="text-center py-3 text-gray-400 font-medium">Delivery Apps</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                {[
                  ['Price per pound', '$3/lb', '$2.50–$4.00', '$3.50–$5.00'],
                  ['Pickup & delivery', 'Free', 'You carry it', '$5–$10 fee'],
                  ['Turnaround', '24–48 hours', '2–3 hours (your time)', '2–5 days'],
                  ['Sorting by color', 'Always', 'If you do it', 'Sometimes'],
                  ['Stain pre-treatment', 'Included', 'DIY', 'Varies'],
                  ['Hand-folded', 'Every item', 'You fold it', 'Sometimes'],
                  ['Your laundry separated', 'Always', 'Communal machines', 'Varies'],
                  ['Text communication', 'Real human', 'N/A', 'Chatbot'],
                  ['Subscription discounts', '10% weekly', 'None', 'Varies'],
                  ['Insurance', 'Full liability', 'None', 'Limited'],
                ].map(([feature, us, laundromat, apps]) => (
                  <tr key={feature} className="border-b border-gray-100">
                    <td className="py-3 font-medium text-[#1a3a5c]">{feature}</td>
                    <td className="py-3 text-center font-semibold text-[#4BA3D4]">{us}</td>
                    <td className="py-3 text-center text-gray-400">{laundromat}</td>
                    <td className="py-3 text-center text-gray-400">{apps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="py-20 bg-[#1a3a5c]">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-xs font-semibold text-[#7EC8E3]/60 tracking-[0.25em] uppercase mb-3 text-center">Customer Reviews</p>
          <p className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-white tracking-wide text-center mb-12">What New Yorkers Are Saying</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div key={t.name} className="bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-2xl p-8">
                <span className="text-yellow-400 text-lg">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <p className="text-sky-100/70 text-sm leading-relaxed mt-4 mb-6">&ldquo;{t.text}&rdquo;</p>
                <p className="font-semibold text-white text-sm">{t.name}</p>
                <p className="text-sky-200/40 text-xs">{t.location}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ THE PROCESS ============ */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-4">What Happens to Your Laundry — Step by Step</h2>
          <p className="text-gray-500 text-center max-w-2xl mx-auto mb-12">We take your laundry through a 12-step professional process. Every load, every time. No shortcuts.</p>
          <div className="space-y-4">
            {[
              { n: '01', t: 'Pickup', d: 'Our driver picks up your labeled bag from your door, lobby, or doorman. We confirm pickup via text.' },
              { n: '02', t: 'Intake & Inventory', d: 'Your bag is tagged with your name and order number. We do a quick count so nothing gets lost.' },
              { n: '03', t: 'Sort by Color', d: 'Whites, darks, colors, and brights are separated into individual loads. No mixing.' },
              { n: '04', t: 'Sort by Fabric', d: 'Delicates, heavy items, towels, and regular garments are separated by fabric weight and care requirements.' },
              { n: '05', t: 'Stain Pre-Treatment', d: 'Every stain is identified and pre-treated with the appropriate solution before washing.' },
              { n: '06', t: 'Wash', d: 'Each sorted load is washed separately in a commercial machine with premium detergent at the correct temperature.' },
              { n: '07', t: 'Dry', d: 'Tumble dried on appropriate heat settings for the fabric. Delicates are air-dried or low-heat dried.' },
              { n: '08', t: 'Hand-Fold', d: 'Every single item is hand-folded by a trained professional — shirts flat, pants creased, towels stacked.' },
              { n: '09', t: 'Organize', d: 'Items are organized by garment type — shirts together, pants together, socks paired, underwear folded.' },
              { n: '10', t: 'Package', d: 'Your order is placed in clean sealed bags, labeled with your name and order number.' },
              { n: '11', t: 'Quality Check', d: 'A final check confirms everything is clean, properly folded, and accounted for against the intake inventory.' },
              { n: '12', t: 'Delivery', d: 'We deliver to your door, lobby, or doorman. You receive a text when your laundry is on its way and when it is delivered.' },
            ].map(step => (
              <div key={step.n} className="flex items-start gap-5 bg-[#F0F8FF] border border-[#4BA3D4]/10 rounded-xl p-5">
                <span className="font-[family-name:var(--font-bebas)] text-2xl text-[#4BA3D4]/40 leading-none mt-0.5 w-8 flex-shrink-0">{step.n}</span>
                <div>
                  <p className="font-semibold text-[#1a3a5c] text-sm">{step.t}</p>
                  <p className="text-gray-500 text-sm mt-1">{step.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ BUILDING TYPES ============ */}
      <section className="py-20 bg-[#F0F8FF]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-4">Laundry Service for Every Building Type</h2>
          <p className="text-gray-500 text-center max-w-2xl mx-auto mb-12">Whether you live in a luxury high-rise, a walkup, or a dorm — we have a solution. We work with doormen, concierges, and building managers to make laundry seamless for residents.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Luxury Buildings', desc: 'White-glove service with concierge coordination, lobby pickup, and premium garment care. Volume discounts for buildings that sign up 10 or more units.', href: '/buildings/luxury-buildings' },
              { name: 'Doorman Buildings', desc: 'Leave your bag with the doorman on your way out. We pick up, process, and deliver back to the front desk. You never touch a washing machine again.', href: '/buildings/doorman-buildings' },
              { name: 'Student Housing', desc: 'Affordable rates, flexible scheduling around classes, and dorm-friendly pickup. Skip the basement laundry room forever.', href: '/buildings/student-housing' },
            ].map(bt => (
              <Link key={bt.name} href={bt.href} className="group bg-white border border-gray-200 rounded-2xl p-8 hover:border-[#4BA3D4] hover:shadow-lg transition-all">
                <h3 className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c] tracking-wide group-hover:text-[#4BA3D4] transition-colors">{bt.name}</h3>
                <p className="text-gray-500 text-sm mt-3 leading-relaxed">{bt.desc}</p>
                <p className="text-[#4BA3D4] text-sm font-medium mt-4">Learn more &rarr;</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SERVICE AREAS ============ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-4">Serving Nearly 200 NYC Neighborhoods</h2>
          <p className="text-gray-500 text-center max-w-2xl mx-auto mb-12">Same rate everywhere — $3/lb with free pickup and delivery. No neighborhood surcharges, no zone fees. From the Upper East Side to Far Rockaway, Williamsburg to Flushing. <Link href="/locations" className="text-[#4BA3D4] underline underline-offset-2">View all locations</Link>.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {AREAS.map(area => {
              const neighborhoods = getNeighborhoodsByArea(area.slug)
              return (
                <Link key={area.slug} href={`/boroughs/${area.slug}`} className="group border border-gray-200 rounded-2xl p-8 hover:border-[#4BA3D4] hover:shadow-lg transition-all text-center">
                  <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide group-hover:text-[#4BA3D4] transition-colors">{area.name}</h3>
                  <p className="text-[#4BA3D4] font-bold text-lg mt-1">{neighborhoods.length} neighborhoods</p>
                  <p className="text-gray-500 text-sm mt-2">{area.description}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-1">
                    {neighborhoods.slice(0, 6).map(n => (
                      <span key={n.slug} className="text-xs text-gray-400">{n.name}{neighborhoods.indexOf(n) < 5 ? ',' : ''}</span>
                    ))}
                    <span className="text-xs text-[#4BA3D4]">+{neighborhoods.length - 6} more</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============ SUBSCRIPTION PLANS ============ */}
      <section className="py-20 bg-gradient-to-r from-[#4BA3D4] to-[#7EC8E3]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-white tracking-wide mb-4">Subscription Plans — Save Up to 10%</h2>
          <p className="text-white/80 max-w-2xl mx-auto mb-10">Set it and forget it. We pick up on the same day every week or every other week. Same driver, same quality, same price — minus your discount. Pause, skip, or cancel anytime with no fees.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6">
              <p className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c]">Weekly 15 lb</p>
              <p className="font-[family-name:var(--font-bebas)] text-3xl text-[#4BA3D4] mt-2">$162<span className="text-lg text-gray-400">/mo</span></p>
              <p className="text-gray-400 text-xs mt-1">10% off &middot; Save $18/mo</p>
              <p className="text-gray-500 text-xs mt-3">Perfect for individuals. About 4 loads per week.</p>
            </div>
            <div className="bg-white rounded-xl p-6 ring-2 ring-[#1a3a5c]">
              <p className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c]">Weekly 20 lb</p>
              <p className="font-[family-name:var(--font-bebas)] text-3xl text-[#4BA3D4] mt-2">$216<span className="text-lg text-gray-400">/mo</span></p>
              <p className="text-gray-400 text-xs mt-1">10% off &middot; Save $24/mo &middot; Most Popular</p>
              <p className="text-gray-500 text-xs mt-3">Perfect for couples. Covers sheets, towels, and clothes.</p>
            </div>
            <div className="bg-white rounded-xl p-6">
              <p className="font-[family-name:var(--font-bebas)] text-xl text-[#1a3a5c]">Biweekly 15 lb</p>
              <p className="font-[family-name:var(--font-bebas)] text-3xl text-[#4BA3D4] mt-2">$85.50<span className="text-lg text-gray-400">/mo</span></p>
              <p className="text-gray-400 text-xs mt-1">5% off &middot; Save $4.50/mo</p>
              <p className="text-gray-500 text-xs mt-3">Perfect for light users or supplementing in-unit laundry.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ COMMERCIAL ============ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-[#1a3a5c] tracking-wide text-center mb-4">Commercial Laundry for NYC Businesses</h2>
          <p className="text-gray-500 text-center max-w-2xl mx-auto mb-12">Restaurants, salons, gyms, Airbnb hosts, and offices — we handle your business laundry with the same quality and reliability as our residential service. Bulk pricing from $1 to $2 per pound. <Link href="/services/commercial-laundry" className="text-[#4BA3D4] underline underline-offset-2">Learn more about commercial laundry</Link>.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { t: 'Restaurants & Cafes', d: 'Tablecloths, napkins, chef coats, aprons, kitchen towels, bar rags. Daily or weekly pickup. We handle grease and food stains with commercial-grade treatment.' },
              { t: 'Hair Salons & Spas', d: 'Towels, robes, capes, sheets, and uniforms. We remove product buildup, color stains, and oils. Recurring schedules ensure you never run out mid-day.' },
              { t: 'Gyms & Fitness Studios', d: 'Towels, yoga mat covers, staff uniforms, and shower mats. High-volume capacity for studios that go through hundreds of towels per week.' },
              { t: 'Airbnb & Short-Term Rentals', d: 'Sheets, pillowcases, towels, bath mats, and kitchen linens turned over between guests. Same-day turnaround on linen packages.' },
            ].map(biz => (
              <div key={biz.t} className="border border-gray-200 rounded-xl p-6">
                <h3 className="font-semibold text-[#1a3a5c] text-sm mb-2">{biz.t}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{biz.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CAREERS & PARTNERS ============ */}
      <section className="py-20 bg-[#F0F8FF]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              <h2 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide mb-3">We&apos;re Hiring</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">Pickup and delivery drivers, laundry attendants, and route managers across Manhattan, Brooklyn, and Queens. $18 to $22 per hour, flexible schedule, weekly pay. No experience required — we train you.</p>
              <Link href="/careers" className="text-[#4BA3D4] font-medium text-sm underline underline-offset-2">View open positions &rarr;</Link>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              <h2 className="font-[family-name:var(--font-bebas)] text-2xl text-[#1a3a5c] tracking-wide mb-3">Laundromat Partners Wanted</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">Own a laundromat in NYC? We send you customers, you process the laundry, we handle pickup, delivery, marketing, and billing. Partner rate is $1 to $1.50 per pound — we charge customers $3 per pound. You keep your margin, we bring the volume.</p>
              <Link href="/partners" className="text-[#4BA3D4] font-medium text-sm underline underline-offset-2">Learn about partnership &rarr;</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TRUST ============ */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
            {[
              { icon: '&#9733;', label: '5.0 Google Rating' },
              { icon: '&#10003;', label: 'Licensed & Insured' },
              { icon: '&#128274;', label: 'Background Checked' },
              { icon: '&#128176;', label: 'Pay After Delivery' },
              { icon: '&#128222;', label: 'Real Human Support' },
            ].map(b => (
              <div key={b.label}>
                <span className="text-2xl text-[#4BA3D4]" dangerouslySetInnerHTML={{ __html: b.icon }} />
                <p className="text-xs text-gray-500 font-medium mt-2">{b.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <FAQSection faqs={homepageFAQs} title="Frequently Asked Questions About Our NYC Laundry Service" />

      {/* ============ FINAL CTA ============ */}
      <CTABlock title="Ready for Fresh, Folded Laundry?" subtitle="Text or call (917) 970-6002 — $3/lb, free pickup & delivery, 24-48 hour turnaround." />
    </>
  )
}
