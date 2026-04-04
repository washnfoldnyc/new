'use client'

import SidePanel from '@/components/SidePanel'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { RecurringOptions, generateRecurringDates, getRecurringDisplayName } from '@/components/RecurringOptions'
import AddressAutocomplete from '@/components/AddressAutocomplete'

export default function BookingsPageWrapper() {
  return (
    <Suspense>
      <BookingsPage />
    </Suspense>
  )
}

interface Booking {
  id: string
  start_time: string
  end_time: string
  service_type: string
  price: number
  status: string
  payment_status: string
  payment_method: string | null
  notes: string | null
  client_id: string
  cleaner_id: string
  cleaner_token: string | null
  hourly_rate: number | null
  recurring_type: string | null
  schedule_id: string | null
  actual_hours: number | null
  cleaner_pay: number | null
  check_in_time: string | null
  check_out_time: string | null
  check_in_location: Record<string, unknown> | null
  check_out_location: Record<string, unknown> | null
  clients: { id: string; name: string; phone: string; address: string } | null
  cleaners: { id: string; name: string } | null
  cleaner_paid: boolean | null
  cleaner_paid_at: string | null
  cleaner_pay_rate: number | null
}

interface Client { id: string; name: string; phone: string; email: string; address: string; created_at: string; do_not_service?: boolean }
interface Cleaner { id: string; name: string; hourly_rate?: number }
interface Referrer { id: string; name: string; ref_code: string; active: boolean }

function BookingsPage() {
  const searchParams = useSearchParams()
  useEffect(() => { document.title = 'Bookings | The NYC Maid' }, []);
  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    if (cleaned.length <= 3) return cleaned
    if (cleaned.length <= 6) return '(' + cleaned.slice(0,3) + ') ' + cleaned.slice(3)
    return '(' + cleaned.slice(0,3) + ') ' + cleaned.slice(3,6) + '-' + cleaned.slice(6,10)
  }

  const [bookings, setBookings] = useState<Booking[]>([])
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [showUpdateChoice, setShowUpdateChoice] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [form, setForm] = useState({
    status: '', payment_status: '', payment_method: '', notes: '', cleaner_id: '',
    start_date: '', start_time: '', hours: 2, service_type: '', hourly_rate: 75,
    discount_enabled: false,
    repeat_enabled: false, repeat_type: 'weekly', repeat_end: 'never',
    repeat_end_count: 10, repeat_end_date: '', custom_interval: 3,
    actual_hours: null as number | null, cleaner_pay: null as number | null,
    cleaner_paid: false,
    _originalPrice: 0
  })
  const [createForm, setCreateForm] = useState({
    client_id: '', cleaner_id: '', start_date: '', start_time: '09:00',
    hours: 2, hourly_rate: 75, service_type: 'Standard Cleaning', notes: '',
    repeat_enabled: false, repeat_type: 'weekly', repeat_end: 'never',
    repeat_end_count: 10, repeat_end_date: '', custom_interval: 3,
    discount_enabled: false,
    is_emergency: false, cleaner_pay_rate: 40, status: 'scheduled' as string
  })
  const [newClientForm, setNewClientForm] = useState({ name: '', phone: '', email: '', address: '', unit: '', referrer_id: '', notes: '' })
  const [referrers, setReferrers] = useState<Referrer[]>([])
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resendMenuId, setResendMenuId] = useState<string | null>(null)
  const [showCloseOut, setShowCloseOut] = useState(false)
  const [closeOutSaving, setCloseOutSaving] = useState<string | null>(null)

  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  
  const [filters, setFilters] = useState({
    status: '',
    service_type: '',
    cleaner_id: '',
    client_id: '',
    date_from: '',
    date_to: ''
  })
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  useEffect(() => { loadBookings(); loadClients(); loadCleaners(); loadReferrers() }, [])
  useEffect(() => { applyFilters() }, [bookings, filters, searchQuery])

  useEffect(() => {
    if (clientSearch) {
      const search = clientSearch.toLowerCase()
      const filtered = clients
        .filter(c => c.name.toLowerCase().includes(search) || c.phone.includes(search) || c.email?.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8)
      setFilteredClients(filtered)
    } else {
      setFilteredClients([])
    }
  }, [clientSearch, clients])

  // Auto-open create modal when linked from clients page with ?new=1&client_id=xxx
  useEffect(() => {
    if (searchParams.get('new') === '1' && clients.length > 0) {
      const clientId = searchParams.get('client_id')
      const client = clientId ? clients.find(c => c.id === clientId) : null
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + 3)
      setCreateForm({
        client_id: client ? client.id : '',
        cleaner_id: '', start_date: tomorrow.toISOString().split('T')[0],
        start_time: '09:00', hours: 2, hourly_rate: 75, service_type: 'Standard Cleaning', notes: '',
        repeat_enabled: false, repeat_type: 'weekly', repeat_end: 'never',
        repeat_end_count: 10, repeat_end_date: endDate.toISOString().split('T')[0], custom_interval: 3,
        discount_enabled: false, is_emergency: false, cleaner_pay_rate: 40, status: 'scheduled'
      })
      if (client) {
        setClientSearch(client.name + ' - ' + client.phone)
      }
      setShowClientDropdown(false)
      setShowCreateModal(true)
    }
  }, [searchParams, clients])

  // Auto-open edit modal when linked from calendar with ?edit=BOOKING_ID
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && bookings.length > 0) {
      const booking = bookings.find(b => b.id === editId)
      if (booking) {
        setFilters({ status: '', service_type: '', cleaner_id: '', client_id: '', date_from: '', date_to: '' })
        openEdit(booking)
        window.history.replaceState({}, '', '/admin/bookings')
      }
    }
  }, [searchParams, bookings])

  // Auto-open create modal when linked from calendar with ?date=...&time=...
  useEffect(() => {
    const date = searchParams.get('date')
    const time = searchParams.get('time')
    if (date && !searchParams.get('new') && !searchParams.get('edit')) {
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + 3)
      setCreateForm({
        client_id: '', cleaner_id: '', start_date: date,
        start_time: time || '09:00', hours: 2, hourly_rate: 75, service_type: 'Standard Cleaning', notes: '',
        repeat_enabled: false, repeat_type: 'weekly', repeat_end: 'never',
        repeat_end_count: 10, repeat_end_date: endDate.toISOString().split('T')[0], custom_interval: 3,
        discount_enabled: false, is_emergency: false, cleaner_pay_rate: 40, status: 'scheduled'
      })
      setClientSearch('')
      setShowClientDropdown(false)
      setShowCreateModal(true)
      window.history.replaceState({}, '', '/admin/bookings')
    }
  }, [searchParams])

  const loadBookings = async () => { 
    const res = await fetch('/api/bookings')
    if (res.ok) {
      const data = await res.json()
      data.sort((a: Booking, b: Booking) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      setBookings(data)
    }
    setLoading(false) 
  }
  const loadClients = async () => { const res = await fetch('/api/clients'); if (res.ok) setClients(await res.json()) }
  const loadCleaners = async () => { const res = await fetch('/api/cleaners'); if (res.ok) setCleaners(await res.json()) }
  const loadReferrers = async () => { const res = await fetch('/api/referrers'); if (res.ok) setReferrers(await res.json()) }

  const applyFilters = () => {
    let result = [...bookings]
    if (filters.status) result = result.filter(b => b.status === filters.status)
    if (filters.service_type) result = result.filter(b => b.service_type === filters.service_type)
    if (filters.cleaner_id) result = result.filter(b => b.cleaner_id === filters.cleaner_id)
    if (filters.client_id) result = result.filter(b => b.client_id === filters.client_id)
    if (filters.date_from) result = result.filter(b => new Date(b.start_time) >= new Date(filters.date_from))
    if (filters.date_to) result = result.filter(b => new Date(b.start_time) <= new Date(filters.date_to + 'T23:59:59'))
    if (searchQuery) { const q = searchQuery.toLowerCase(); result = result.filter(b => (b.clients?.name || '').toLowerCase().includes(q) || (b.clients?.phone || '').includes(q) || (b.clients?.address || '').toLowerCase().includes(q) || (b.cleaners?.name || '').toLowerCase().includes(q)) }
    setFilteredBookings(result)
  }

  // Close-out: jobs needing attention (in_progress/completed with payment or cleaner pay pending)
  const closeOutJobs = bookings.filter(b =>
    (b.status === 'in_progress' || b.status === 'completed') &&
    (b.payment_status !== 'paid' || !b.cleaner_paid)
  ).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  // Also show recently completed & fully closed (last 7 days) for reference
  const recentlyClosedJobs = bookings.filter(b => {
    if (b.status !== 'completed' || b.payment_status !== 'paid' || !b.cleaner_paid) return false
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return new Date(b.start_time) >= sevenDaysAgo
  }).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())

  const handleCloseOutUpdate = async (bookingId: string, updates: Record<string, unknown>) => {
    setCloseOutSaving(bookingId)
    try {
      const res = await fetch('/api/bookings/' + bookingId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (res.ok) {
        // Update local state
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updates } as Booking : b))
      }
    } catch (e) { console.error('Close out update failed:', e) }
    setCloseOutSaving(null)
  }

  const clearFilters = () => {
    setFilters({ status: 'scheduled', service_type: '', cleaner_id: '', client_id: '', date_from: '', date_to: '' })
  }

  // Parse naive datetime string (no timezone conversion)
  const parseNaive = (s: string) => {
    const [datePart, timePart] = s.split('T')
    return { date: datePart, time: (timePart || '00:00').slice(0, 5) }
  }

  const openEdit = (booking: Booking) => {
    setEditingBooking(booking)
    const start = parseNaive(booking.start_time)
    const end = parseNaive(booking.end_time)
    // Calculate hours from naive time strings
    const [sh, sm] = start.time.split(':').map(Number)
    const [eh, em] = end.time.split(':').map(Number)
    const hours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60) || 2

    // Derive rate: use stored hourly_rate, or calculate from price/hours, or default to 75
    const rate = booking.hourly_rate || (booking.price && hours ? Math.round(booking.price / 100 / hours) : 75)
    // Snap to nearest known rate option
    const knownRates = [49, 65, 75]
    const snappedRate = knownRates.reduce((best, r) => Math.abs(r - rate) < Math.abs(best - rate) ? r : best, 75)
    const fullPrice = (hours || 2) * snappedRate * 100
    const hasDiscount = booking.price < fullPrice && booking.price > 0

    const endDate3 = new Date()
    endDate3.setMonth(endDate3.getMonth() + 3)

    setForm({
      status: booking.status,
      payment_status: booking.payment_status,
      payment_method: booking.payment_method || '',
      notes: booking.notes || '',
      cleaner_id: booking.cleaner_id || '',
      start_date: start.date,
      start_time: start.time,
      hours: hours || 2,
      service_type: booking.service_type,
      hourly_rate: snappedRate,
      discount_enabled: hasDiscount,
      repeat_enabled: !!booking.recurring_type,
      repeat_type: reverseRecurringType(booking.recurring_type),
      repeat_end: 'never',
      repeat_end_count: 10,
      repeat_end_date: endDate3.toISOString().split('T')[0],
      custom_interval: 3,
      actual_hours: booking.actual_hours,
      cleaner_pay: booking.cleaner_pay,
      cleaner_paid: !!(booking as any).cleaner_paid,
      _originalPrice: booking.price
    })
    setShowModal(true)
    setCopied(false)
  }

  const openCreate = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + 3)
    setCreateForm({
      client_id: '', cleaner_id: '', start_date: tomorrow.toISOString().split('T')[0],
      start_time: '09:00', hours: 2, hourly_rate: 75, service_type: 'Standard Cleaning', notes: '',
      repeat_enabled: false, repeat_type: 'weekly', repeat_end: 'never',
      repeat_end_count: 10, repeat_end_date: endDate.toISOString().split('T')[0], custom_interval: 3,
      discount_enabled: false, is_emergency: false, cleaner_pay_rate: 40, status: 'scheduled'
    })
    setClientSearch('')
    setShowClientDropdown(false)
    setShowCreateModal(true)
  }

  const handleClientSelect = (client: Client) => {
    setCreateForm({ ...createForm, client_id: client.id })
    setClientSearch(client.name + ' - ' + client.phone)
    setShowClientDropdown(false)
  }

  const handleClientSearchChange = (value: string) => {
    setClientSearch(value)
    setCreateForm({ ...createForm, client_id: '' })
    setShowClientDropdown(true)
  }

  const handleNewClientClick = () => {
    setNewClientForm({ name: '', phone: '', email: '', address: '', unit: '', referrer_id: '', notes: '' })
    setShowNewClientModal(true)
    setShowClientDropdown(false)
  }

  const handleNewClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const fullAddress = newClientForm.unit
      ? `${newClientForm.address}, ${newClientForm.unit}`
      : newClientForm.address
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newClientForm.name, phone: newClientForm.phone, email: newClientForm.email, address: fullAddress, referrer_id: newClientForm.referrer_id || null, notes: newClientForm.notes || null })
    })
    if (res.ok) {
      const newClient = await res.json()
      await loadClients()
      setCreateForm({ ...createForm, client_id: newClient.id })
      setClientSearch(newClient.name + ' - ' + newClient.phone)
      setShowNewClientModal(false)
      setNewClientForm({ name: '', phone: '', email: '', address: '', unit: '', referrer_id: '', notes: '' })
    }
    setSaving(false)
  }

  const isExistingClient = (clientId: string) => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return false
    return new Date(client.created_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)
  }

  const calculatePrice = () => {
    const basePrice = createForm.hours * createForm.hourly_rate * 100
    if (createForm.discount_enabled) {
      const discounted = basePrice * 0.9
      return Math.floor(discounted / 500) * 500 // round down to nearest $5
    }
    return basePrice
  }

  const calculateEditPrice = () => {
    // If editing a completed booking with actual_hours, use actual_hours for pricing
    if (form.actual_hours && form.actual_hours > 0) {
      return Math.round(form.actual_hours * form.hourly_rate * 100)
    }
    const basePrice = form.hours * form.hourly_rate * 100
    if (form.discount_enabled) {
      const discounted = basePrice * 0.9
      return Math.floor(discounted / 500) * 500
    }
    return basePrice
  }

  // Check if pricing fields changed from what was loaded
  const pricingChanged = () => {
    if (!editingBooking) return true
    const s = parseNaive(editingBooking.start_time), e = parseNaive(editingBooking.end_time)
    const [sh, sm] = s.time.split(':').map(Number), [eh, em] = e.time.split(':').map(Number)
    const origHours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60) || 2
    const origRate = editingBooking.hourly_rate || form.hourly_rate
    return form.hours !== origHours || form.hourly_rate !== origRate ||
      form.discount_enabled !== (editingBooking.price < origHours * origRate * 100 && editingBooking.price > 0) ||
      form.actual_hours !== editingBooking.actual_hours
  }

  const getEstimatedHoursRange = (hours: number) => {
    const ranges: Record<number, string> = { 1: '1-2', 2: '2-3', 3: '3-4', 4: '4-6', 5: '5-7', 6: '6-8', 7: '7-9' }
    return ranges[hours] || hours + '-' + (hours + 2)
  }

  const recurringDates = generateRecurringDates(
    createForm.start_date, createForm.repeat_enabled, createForm.repeat_type,
    createForm.repeat_end, createForm.repeat_end_count, createForm.repeat_end_date, createForm.custom_interval
  )

  const editRecurringDates = generateRecurringDates(
    form.start_date, form.repeat_enabled, form.repeat_type,
    form.repeat_end, form.repeat_end_count, form.repeat_end_date, form.custom_interval
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingBooking?.recurring_type || editingBooking?.schedule_id) {
      setShowUpdateChoice(true)
      return
    }
    await saveBooking('single')
  }

  // Build naive datetime string from date + time + hours (no Date object, no TZ shift)
  const buildNaiveTime = (date: string, time: string, addHours: number = 0) => {
    const [h, m] = time.split(':').map(Number)
    const totalMinutes = h * 60 + m + addHours * 60
    const newH = Math.floor(totalMinutes / 60) % 24
    const newM = totalMinutes % 60
    return `${date}T${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`
  }

  // Calculate minute difference between two naive time strings
  const naiveMinuteDiff = (a: string, b: string) => {
    const [ad, at] = a.split('T'); const [bd, bt] = b.split('T')
    const [ay, am, aday] = ad.split('-').map(Number); const [by, bm, bday] = bd.split('-').map(Number)
    const [ah, amin] = at.split(':').map(Number); const [bh, bmin] = bt.split(':').map(Number)
    const aTotal = new Date(ay, am - 1, aday).getTime() / 60000 + ah * 60 + amin
    const bTotal = new Date(by, bm - 1, bday).getTime() / 60000 + bh * 60 + bmin
    return aTotal - bTotal
  }

  // Shift a naive time string by N minutes
  const shiftNaive = (s: string, minutes: number) => {
    const [datePart, timePart] = s.split('T')
    const [y, mo, d] = datePart.split('-').map(Number)
    const [h, m] = timePart.split(':').map(Number)
    const dt = new Date(y, mo - 1, d, h, m + minutes)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`
  }

  const saveBooking = async (scope: 'single' | 'all') => {
    setSaving(true)
    setShowUpdateChoice(false)

    const newStartStr = buildNaiveTime(form.start_date, form.start_time)
    const newEndStr = buildNaiveTime(form.start_date, form.start_time, form.hours)
    const recurringType = form.repeat_enabled ? getRecurringDisplayName(form.repeat_type, form.start_date) : null

    const updateData = {
      ...form,
      start_time: newStartStr,
      end_time: newEndStr,
      price: pricingChanged() ? calculateEditPrice() : form._originalPrice,
      recurring_type: recurringType
    }

    if (scope === 'all' && (editingBooking?.schedule_id || editingBooking?.recurring_type)) {
      // Check if the recurring pattern itself changed (not just time/price/cleaner)
      const oldRecurringType = editingBooking.recurring_type
      const patternChanged = recurringType !== oldRecurringType

      if (patternChanged && editingBooking.schedule_id && form.repeat_enabled) {
        // Pattern changed: delete all future bookings and regenerate with correct dates
        const futureBookings = bookings.filter(b =>
          b.schedule_id === editingBooking.schedule_id &&
          b.status === 'scheduled' &&
          b.start_time >= editingBooking.start_time
        )

        // Delete all future bookings in this series
        for (const booking of futureBookings) {
          await fetch('/api/bookings/' + booking.id, { method: 'DELETE' })
        }

        // Update the schedule record with new pattern
        const startDateObj = new Date(form.start_date + 'T12:00:00')
        await fetch('/api/admin/recurring-schedules/' + editingBooking.schedule_id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recurring_type: recurringType,
            day_of_week: startDateObj.getDay(),
            preferred_time: form.start_time,
            duration_hours: form.hours,
            hourly_rate: form.hourly_rate,
            cleaner_id: form.cleaner_id,
            notes: form.notes || null,
          })
        })

        // Generate new dates using the correct pattern
        const newDates = generateRecurringDates(
          form.start_date, true, form.repeat_type,
          form.repeat_end, form.repeat_end_count, form.repeat_end_date, form.custom_interval
        )

        // Create bookings on the correct dates
        for (let i = 0; i < newDates.length; i++) {
          const date = newDates[i]
          const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: editingBooking.client_id,
              cleaner_id: form.cleaner_id,
              start_time: buildNaiveTime(date, form.start_time),
              end_time: buildNaiveTime(date, form.start_time, form.hours),
              service_type: form.service_type,
              price: pricingChanged() ? calculateEditPrice() : form._originalPrice,
              hourly_rate: form.hourly_rate,
              recurring_type: recurringType,
              notes: form.notes || null,
              status: 'scheduled',
              schedule_id: editingBooking.schedule_id,
              skip_email: i > 0,
            })
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }))
            alert(`Failed to create booking ${i + 1}/${newDates.length}: ${err.error || res.statusText}`)
            setSaving(false)
            return
          }
        }
      } else {
        // Pattern unchanged: shift times/update fields on existing bookings
        const deltaMinutes = naiveMinuteDiff(newStartStr, editingBooking.start_time)
        const durationMinutes = form.hours * 60

        const futureBookings = editingBooking.schedule_id
          ? bookings.filter(b =>
              b.schedule_id === editingBooking.schedule_id &&
              b.status === 'scheduled' &&
              b.start_time >= editingBooking.start_time
            )
          : bookings.filter(b =>
              b.client_id === editingBooking.client_id &&
              b.recurring_type === editingBooking.recurring_type &&
              b.status === 'scheduled' &&
              b.start_time >= editingBooking.start_time
            )

        for (let i = 0; i < futureBookings.length; i++) {
          const booking = futureBookings[i]
          const shiftedStart = shiftNaive(booking.start_time, deltaMinutes)
          const shiftedEnd = shiftNaive(booking.start_time, deltaMinutes + durationMinutes)
          const res = await fetch('/api/bookings/' + booking.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...updateData,
              start_time: shiftedStart,
              end_time: shiftedEnd,
              skip_email: i > 0
            })
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }))
            alert(`Failed to update booking ${i + 1}/${futureBookings.length}: ${err.error || res.statusText}`)
            setSaving(false)
            return
          }
        }

        // Also update the schedule record with non-pattern fields
        if (editingBooking.schedule_id) {
          await fetch('/api/admin/recurring-schedules/' + editingBooking.schedule_id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              preferred_time: form.start_time,
              duration_hours: form.hours,
              hourly_rate: form.hourly_rate,
              cleaner_id: form.cleaner_id,
              notes: form.notes || null,
            })
          })
        }
      }
    } else {
      // Update this booking
      const res = await fetch('/api/bookings/' + editingBooking?.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        alert(`Failed to save booking: ${err.error || res.statusText}`)
        setSaving(false)
        return
      }

      // If repeat newly enabled on a non-recurring booking, create future bookings
      if (form.repeat_enabled && !editingBooking?.recurring_type && editRecurringDates.length > 1) {
        for (let i = 1; i < editRecurringDates.length; i++) {
          const date = editRecurringDates[i]
          await fetch('/api/bookings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: editingBooking?.client_id, cleaner_id: form.cleaner_id,
              start_time: buildNaiveTime(date, form.start_time), end_time: buildNaiveTime(date, form.start_time, form.hours),
              service_type: form.service_type, price: calculateEditPrice(),
              hourly_rate: form.hourly_rate, recurring_type: recurringType, notes: form.notes || null,
              skip_email: true
            })
          })
        }
      }
    }

    setShowModal(false)
    setEditingBooking(null)
    loadBookings()
    setSaving(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const recurringType = createForm.repeat_enabled ? getRecurringDisplayName(createForm.repeat_type, createForm.start_date) : null

    if (createForm.is_emergency) {
      // Emergency: single booking + broadcast (can't batch)
      const date = recurringDates[0]
      const res = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: createForm.client_id, cleaner_id: null,
          start_time: buildNaiveTime(date, createForm.start_time),
          end_time: buildNaiveTime(date, createForm.start_time, createForm.hours),
          service_type: createForm.service_type, price: calculatePrice(),
          hourly_rate: createForm.hourly_rate, recurring_type: recurringType,
          notes: createForm.notes || null, skip_email: true,
          status: 'available', cleaner_pay_rate: createForm.cleaner_pay_rate
        })
      })
      if (res.ok) {
        const booking = await res.json()
        await fetch('/api/bookings/broadcast', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: booking.id })
        })
      }
    } else if (createForm.repeat_enabled && recurringType && recurringDates.length > 1) {
      // Recurring: create schedule + first 4 weeks of bookings (cron generates the rest)
      const fourWeeksOut = new Date(createForm.start_date + 'T12:00:00')
      fourWeeksOut.setDate(fourWeeksOut.getDate() + 28)
      const cutoff = fourWeeksOut.toISOString().split('T')[0]
      const initialDates = recurringDates.filter(d => d <= cutoff)

      const scheduleRes = await fetch('/api/admin/recurring-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: createForm.client_id,
          cleaner_id: createForm.cleaner_id,
          recurring_type: recurringType,
          day_of_week: new Date(createForm.start_date + 'T12:00:00').getDay(),
          preferred_time: createForm.start_time,
          duration_hours: createForm.hours,
          hourly_rate: createForm.hourly_rate,
          cleaner_pay_rate: createForm.cleaner_pay_rate,
          notes: createForm.notes || null,
          start_date: createForm.start_date,
          price: calculatePrice(),
          service_type: createForm.service_type,
          status: createForm.status,
          dates: initialDates,
        })
      })
      if (!scheduleRes.ok) {
        const err = await scheduleRes.json().catch(() => ({ error: 'Unknown error' }))
        alert(`Failed to create recurring schedule: ${err.error || scheduleRes.statusText}`)
      }
    } else {
      // Single booking via batch (1 booking)
      const bookings = recurringDates.map(date => ({
        client_id: createForm.client_id,
        cleaner_id: createForm.cleaner_id,
        start_time: buildNaiveTime(date, createForm.start_time),
        end_time: buildNaiveTime(date, createForm.start_time, createForm.hours),
        service_type: createForm.service_type,
        price: calculatePrice(),
        hourly_rate: createForm.hourly_rate,
        recurring_type: recurringType,
        notes: createForm.notes || null,
        status: createForm.status,
      }))

      await fetch('/api/bookings/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookings })
      })
    }
    setShowCreateModal(false); loadBookings(); setSaving(false)
  }

  const handleCancel = async (scope: 'single' | 'all') => {
    if (!editingBooking) return
    setSaving(true)

    if (scope === 'all' && (editingBooking.schedule_id || editingBooking.recurring_type)) {
      if (editingBooking.schedule_id) {
        // Use schedule_id for precise series cancellation (server-side)
        await fetch('/api/bookings/' + editingBooking.id + '?cancel_series=true', { method: 'DELETE' })
      } else {
        // Legacy fallback: match by client_id + recurring_type
        const futureBookings = bookings.filter(b =>
          b.client_id === editingBooking.client_id &&
          b.recurring_type === editingBooking.recurring_type &&
          b.status === 'scheduled' &&
          new Date(b.start_time) >= new Date(editingBooking.start_time)
        )

        if (futureBookings.length > 0) {
          await fetch('/api/bookings/' + futureBookings[0].id, { method: 'DELETE' })
          await Promise.all(
            futureBookings.slice(1).map(b =>
              fetch('/api/bookings/' + b.id + '?skip_email=true', { method: 'DELETE' })
            )
          )
        }
      }
    } else {
      await fetch('/api/bookings/' + editingBooking.id, { method: 'DELETE' })
    }

    setShowModal(false)
    setEditingBooking(null)
    loadBookings()
    setSaving(false)
  }

  const handleResend = async (bookingId: string, channel: 'email' | 'sms') => {
    setResendMenuId(null)
    const res = await fetch('/api/send-booking-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, clientOnly: true, ...(channel === 'sms' ? { channel: 'sms' } : {}) })
    })
    if (res.ok) {
      alert(channel === 'sms' ? 'Confirmation text sent!' : 'Confirmation email sent!')
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || `Failed to send ${channel}`)
    }
  }

  const copyTeamLink = () => {
    if (editingBooking?.cleaner_token) {
      navigator.clipboard.writeText(window.location.origin + '/team/' + editingBooking.cleaner_token)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  const toLocalISOString = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  const formatDate = (dateStr: string) => {
    // Parse naive datetime string to avoid timezone shift
    const [datePart, timePart] = dateStr.split('T')
    const [y, mo, d] = datePart.split('-').map(Number)
    const [h, m] = (timePart || '00:00').split(':').map(Number)
    const dt = new Date(y, mo - 1, d, h, m)
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const serviceTypes = ['Standard Cleaning', 'Deep Cleaning', 'Move In/Out', 'Post Construction', 'Emergency / Same-Day']

  // Reverse-map stored recurring_type display name back to form repeat_type
  const reverseRecurringType = (displayName: string | null): string => {
    if (!displayName) return 'weekly'
    const lower = displayName.toLowerCase()
    if (lower === 'daily') return 'daily'
    if (lower === 'weekly') return 'weekly'
    if (lower === 'bi-weekly') return 'biweekly'
    if (lower === 'tri-weekly') return 'triweekly'
    if (lower === 'monthly') return 'monthly_date'
    if (lower === 'custom') return 'custom'
    // Pattern like "1st Mon", "2nd Thu" = monthly_day
    if (/^\d/.test(displayName)) return 'monthly_day'
    return 'weekly'
  }

  const activeFilterCount = [filters.service_type, filters.cleaner_id, filters.client_id, filters.date_from, filters.date_to].filter(Boolean).length

  // Status counts for filter pills
  const statusCounts = {
    all: bookings.length,
    scheduled: bookings.filter(b => b.status === 'scheduled').length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
    pending: bookings.filter(b => b.status === 'pending').length,
  }

  // Summary stats
  const totalRevenue = bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + b.price, 0)
  const upcomingCount = bookings.filter(b => b.status === 'scheduled' && new Date(b.start_time) > new Date()).length
  const thisWeekCount = bookings.filter(b => {
    const d = new Date(b.start_time)
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return d >= now && d <= weekFromNow && b.status === 'scheduled'
  }).length

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize))
  const paginatedBookings = filteredBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [filters, searchQuery])

  const statusPillClass = (status: string) => {
    const isActive = filters.status === status
    const base = 'px-3 py-2 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5'
    if (status === '' && !filters.status) return base + ' bg-[#1E2A4A] text-white shadow-sm'
    if (isActive) return base + ' bg-[#1E2A4A] text-white shadow-sm'
    return base + ' bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
  }

  return (
    <>
      <main className="p-3 md:p-6 max-w-[1400px] mx-auto">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6">
          <div>
            <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">BOOKINGS</h2>
            <p className="text-2xl font-bold text-[#1E2A4A]">Manage Bookings</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)} className={'px-4 py-2.5 border rounded-xl font-medium text-sm transition-all ' + (showFilters || activeFilterCount > 0 ? 'border-[#1E2A4A] bg-[#1E2A4A] text-white' : 'border-gray-200 text-[#1E2A4A] hover:border-gray-300 hover:bg-gray-50')}>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </span>
            </button>
            <button onClick={() => setShowCloseOut(!showCloseOut)} className={'px-4 py-2.5 border rounded-xl font-medium text-sm transition-all flex items-center gap-2 ' + (showCloseOut ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-200 text-[#1E2A4A] hover:border-gray-300 hover:bg-gray-50')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Close Out{closeOutJobs.length > 0 ? ` (${closeOutJobs.length})` : ''}
            </button>
            <button onClick={openCreate} className="bg-[#1E2A4A] text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-[#1E2A4A]/90 transition-all shadow-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Booking
            </button>
          </div>
        </div>

        {/* Quick Links */}
        <div className="text-xs text-gray-400 mb-4 hidden md:flex items-center gap-1 flex-wrap">
          <a href="https://www.thenycmaid.com/book" target="_blank" className="text-gray-500 hover:text-[#1E2A4A] hover:underline">Client Portal</a>
          <span className="text-gray-300 mx-1">/</span>
          <a href="https://www.thenycmaid.com/book/new" target="_blank" className="text-gray-500 hover:text-[#1E2A4A] hover:underline">New Booking</a>
          <span className="text-gray-300 mx-1">/</span>
          <a href="https://www.thenycmaid.com/book/collect" target="_blank" className="text-gray-500 hover:text-[#1E2A4A] hover:underline">Collect Info</a>
          <span className="text-gray-300 mx-1">/</span>
          <a href="https://www.thenycmaid.com/team" target="_blank" className="text-gray-500 hover:text-[#1E2A4A] hover:underline">Team Portal</a>
        </div>

        {/* Stat Cards */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Upcoming</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{upcomingCount}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">This Week</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{thisWeekCount}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Completed</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{statusCounts.completed}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Revenue</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">${(totalRevenue / 100).toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <input type="text" placeholder="Search client, cleaner, address..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1E2A4A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E2A4A]/10 focus:border-[#1E2A4A] transition-all" />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide flex-nowrap">
          <button onClick={() => setFilters({ ...filters, status: '' })} className={statusPillClass('')}>
            All <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{statusCounts.all}</span>
          </button>
          {statusCounts.pending > 0 && (
            <button onClick={() => setFilters({ ...filters, status: 'pending' })} className={statusPillClass('pending')}>
              Pending <span className={'text-xs px-1.5 py-0.5 rounded-full ' + (filters.status === 'pending' ? 'bg-white/20' : 'bg-red-100 text-red-600')}>{statusCounts.pending}</span>
            </button>
          )}
          <button onClick={() => setFilters({ ...filters, status: 'scheduled' })} className={statusPillClass('scheduled')}>
            Scheduled <span className={'text-xs px-1.5 py-0.5 rounded-full ' + (filters.status === 'scheduled' ? 'bg-white/20' : 'bg-blue-100 text-blue-600')}>{statusCounts.scheduled}</span>
          </button>
          <button onClick={() => setFilters({ ...filters, status: 'in_progress' })} className={statusPillClass('in_progress')}>
            In Progress <span className={'text-xs px-1.5 py-0.5 rounded-full ' + (filters.status === 'in_progress' ? 'bg-white/20' : 'bg-amber-100 text-amber-600')}>{statusCounts.in_progress}</span>
          </button>
          <button onClick={() => setFilters({ ...filters, status: 'completed' })} className={statusPillClass('completed')}>
            Completed <span className={'text-xs px-1.5 py-0.5 rounded-full ' + (filters.status === 'completed' ? 'bg-white/20' : 'bg-green-100 text-green-600')}>{statusCounts.completed}</span>
          </button>
          <button onClick={() => setFilters({ ...filters, status: 'cancelled' })} className={statusPillClass('cancelled')}>
            Cancelled <span className={'text-xs px-1.5 py-0.5 rounded-full ' + (filters.status === 'cancelled' ? 'bg-white/20' : 'bg-gray-100 text-gray-500')}>{statusCounts.cancelled}</span>
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="bg-gray-50/80 backdrop-blur-sm rounded-xl p-4 mb-4 space-y-4 border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Service</label>
                <select value={filters.service_type} onChange={(e) => setFilters({ ...filters, service_type: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[#1E2A4A] text-sm bg-white focus:outline-none focus:border-[#1E2A4A]">
                  <option value="">All</option>
                  {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Cleaner</label>
                <select value={filters.cleaner_id} onChange={(e) => setFilters({ ...filters, cleaner_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[#1E2A4A] text-sm bg-white focus:outline-none focus:border-[#1E2A4A]">
                  <option value="">All</option>
                  {cleaners.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client</label>
                <select value={filters.client_id} onChange={(e) => setFilters({ ...filters, client_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[#1E2A4A] text-sm bg-white focus:outline-none focus:border-[#1E2A4A]">
                  <option value="">All</option>
                  {[...clients].sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From</label>
                <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[#1E2A4A] text-sm bg-white focus:outline-none focus:border-[#1E2A4A]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">To</label>
                <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[#1E2A4A] text-sm bg-white focus:outline-none focus:border-[#1E2A4A]" />
              </div>
            </div>
            <div className="flex justify-between items-center pt-2">
              <p className="text-sm text-gray-500">{filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''} found</p>
              <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-[#1E2A4A] transition-colors">Clear All</button>
            </div>
          </div>
        )}

        {/* Pending Bookings Section */}
        {!loading && bookings.filter(b => b.status === 'pending').length > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200/60 rounded-xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h3 className="text-xs font-bold text-red-700 uppercase tracking-wide">Pending Approval ({bookings.filter(b => b.status === 'pending').length})</h3>
            </div>
            <div className="space-y-2">
              {bookings.filter(b => b.status === 'pending').map((b) => (
                <div key={b.id} onClick={() => openEdit(b)} className="flex items-center justify-between bg-white/80 backdrop-blur-sm border border-red-200/40 rounded-xl p-3.5 cursor-pointer hover:bg-white hover:shadow-sm transition-all">
                  <div>
                    <p className="text-[#1E2A4A] font-semibold text-sm">{b.clients?.name || '-'}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{formatDate(b.start_time)} · {b.service_type}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{b.clients?.address || ''}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Pending</span>
                    <p className="text-[#1E2A4A] text-sm font-semibold">~${(b.price / 100).toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close Out Panel */}
        {showCloseOut && (
          <div className="mb-5">
            <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200/60 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Close Out Jobs ({closeOutJobs.length})</h3>
                </div>
                <button onClick={() => setShowCloseOut(false)} className="text-gray-400 hover:text-gray-600 text-sm">Close</button>
              </div>
              {closeOutJobs.length === 0 ? (
                <p className="text-emerald-600 text-sm py-4 text-center">All jobs are closed out!</p>
              ) : (
                <div className="space-y-3">
                  {closeOutJobs.map((b) => {
                    const isSaving = closeOutSaving === b.id
                    return (
                      <div key={b.id} className={'bg-white rounded-xl border p-4 transition-all ' + (isSaving ? 'opacity-60 border-emerald-200' : 'border-gray-200')}>
                        {/* Job header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-[#1E2A4A] font-semibold text-sm">{b.clients?.name || '-'}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{formatDate(b.start_time)} · {b.cleaners?.name || 'Unassigned'}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{b.service_type}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[#1E2A4A] font-bold text-lg">${(b.price / 100).toFixed(0)}</p>
                            {b.cleaner_pay && <p className="text-gray-400 text-xs">Pay: ${Number(b.cleaner_pay).toFixed(0)}</p>}
                          </div>
                        </div>
                        {/* Close out controls */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {/* Job Complete */}
                          <button
                            disabled={isSaving}
                            onClick={() => {
                              const newStatus = b.status === 'completed' ? 'in_progress' : 'completed'
                              handleCloseOutUpdate(b.id, { status: newStatus })
                            }}
                            className={'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ' +
                              (b.status === 'completed'
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-green-300 hover:bg-green-50/50')}
                          >
                            <span className={'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ' +
                              (b.status === 'completed' ? 'border-green-500 bg-green-500' : 'border-gray-300')}>
                              {b.status === 'completed' && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            Job Done
                          </button>
                          {/* Payment Collected */}
                          <button
                            disabled={isSaving}
                            onClick={() => {
                              if (b.payment_status === 'paid') {
                                handleCloseOutUpdate(b.id, { payment_status: 'pending', payment_method: null })
                              } else {
                                handleCloseOutUpdate(b.id, { payment_status: 'paid' })
                              }
                            }}
                            className={'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ' +
                              (b.payment_status === 'paid'
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-green-300 hover:bg-green-50/50')}
                          >
                            <span className={'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ' +
                              (b.payment_status === 'paid' ? 'border-green-500 bg-green-500' : 'border-gray-300')}>
                              {b.payment_status === 'paid' && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            Paid
                          </button>
                          {/* Payment Method */}
                          <div className="flex gap-1">
                            <button
                              disabled={isSaving}
                              onClick={() => handleCloseOutUpdate(b.id, { payment_method: 'zelle', payment_status: 'paid' })}
                              className={'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all border ' +
                                (b.payment_method === 'zelle'
                                  ? 'bg-purple-50 border-purple-300 text-purple-700'
                                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-purple-200 hover:text-purple-600')}
                            >
                              Zelle
                            </button>
                            <button
                              disabled={isSaving}
                              onClick={() => handleCloseOutUpdate(b.id, { payment_method: 'apple_pay', payment_status: 'paid' })}
                              className={'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all border ' +
                                (b.payment_method === 'apple_pay'
                                  ? 'bg-gray-800 border-gray-800 text-white'
                                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600')}
                            >
                              Apple
                            </button>
                          </div>
                          {/* Cleaner Paid */}
                          <button
                            disabled={isSaving}
                            onClick={() => handleCloseOutUpdate(b.id, { cleaner_paid: !b.cleaner_paid })}
                            className={'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ' +
                              (b.cleaner_paid
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-green-300 hover:bg-green-50/50')}
                          >
                            <span className={'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ' +
                              (b.cleaner_paid ? 'border-green-500 bg-green-500' : 'border-gray-300')}>
                              {b.cleaner_paid && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            Team Paid
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Recently closed out */}
            {recentlyClosedJobs.length > 0 && (
              <div className="bg-gray-50/80 border border-gray-200/60 rounded-xl p-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Recently Closed (Last 7 Days)</h3>
                <div className="space-y-1">
                  {recentlyClosedJobs.map((b) => (
                    <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <div>
                          <p className="text-sm text-[#1E2A4A] font-medium">{b.clients?.name || '-'}</p>
                          <p className="text-xs text-gray-400">{formatDate(b.start_time)} · {b.cleaners?.name || '-'}</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="text-xs text-gray-400">{b.payment_method === 'zelle' ? 'Zelle' : 'Apple'}</span>
                        <span className="text-sm font-semibold text-[#1E2A4A]">${(b.price / 100).toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Desktop Table */}
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden shadow-sm hidden md:block">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[#1E2A4A] border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Loading bookings...</p>
              </div>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <p className="text-gray-500 text-sm">No bookings found.</p>
              <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or search</p>
            </div>
          ) : (
            <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date & Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cleaner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Rate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Recurring</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedBookings.map((b) => (
                  <tr
                    key={b.id}
                    className={
                      'cursor-pointer transition-colors ' +
                      (b.status === 'in_progress' ? 'bg-amber-50/50 hover:bg-amber-50' :
                       b.status === 'cancelled' ? 'bg-gray-50/50 opacity-60 hover:opacity-80 hover:bg-gray-50' :
                       b.status === 'pending' ? 'bg-red-50/30 hover:bg-red-50/60' :
                       'hover:bg-gray-50/80')
                    }
                    onClick={() => openEdit(b)}
                  >
                    <td className="px-4 py-3.5">
                      <div>
                        <p className={'text-sm font-medium ' + (b.status === 'cancelled' ? 'text-gray-400' : 'text-[#1E2A4A]')}>{b.clients?.name || '-'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{b.clients?.address || ''}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={'text-sm ' + (b.status === 'cancelled' ? 'text-gray-400' : 'text-gray-600')}>{b.service_type}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={'text-sm ' + (b.status === 'cancelled' ? 'text-gray-400' : 'text-[#1E2A4A]')}>{formatDate(b.start_time)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={'text-sm ' + (b.status === 'cancelled' ? 'text-gray-400' : 'text-gray-600')}>{b.cleaners?.name || <span className="text-gray-300">--</span>}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className={'text-sm ' + (b.status === 'cancelled' ? 'text-gray-400' : 'text-gray-500')}>${(() => { const hours = Math.max(1, Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60 * 60))); return b.hourly_rate ? b.hourly_rate : b.price ? Math.round(b.price / 100 / hours) : 75 })()}/hr</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={'text-sm font-semibold ' + (b.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-[#1E2A4A]')}>~${(b.price / 100).toFixed(0)}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {b.recurring_type ? <span className="px-2 py-1 bg-purple-50 text-purple-600 rounded-full text-xs font-medium border border-purple-100">{b.recurring_type}</span> : <span className="text-gray-300">--</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ' +
                        (b.status === 'pending' ? 'bg-red-100 text-red-700' :
                         b.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                         b.status === 'completed' ? 'bg-green-100 text-green-700' :
                         b.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                         'bg-blue-100 text-blue-700')
                      }>
                        {b.status === 'completed' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                        {b.status === 'in_progress' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                        {b.status === 'in_progress' ? 'In Progress' : b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {b.status !== 'cancelled' && (
                          <div className="relative">
                            <button onClick={() => setResendMenuId(resendMenuId === b.id ? null : b.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Resend confirmation">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            </button>
                            {resendMenuId === b.id && (
                              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[100px]">
                                <button onClick={() => handleResend(b.id, 'email')} className="w-full text-left px-3 py-1.5 text-sm text-[#1E2A4A] hover:bg-gray-50 transition-colors">Email</button>
                                <button onClick={() => handleResend(b.id, 'sms')} className="w-full text-left px-3 py-1.5 text-sm text-[#1E2A4A] hover:bg-gray-50 transition-colors">Text</button>
                              </div>
                            )}
                          </div>
                        )}
                        <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg text-gray-400 hover:text-[#1E2A4A] hover:bg-gray-100 transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        {b.status === 'cancelled' ? (
                          <button onClick={() => { if (confirm(`Permanently delete this cancelled booking for ${b.clients?.name || 'this client'}?`)) { fetch('/api/bookings/' + b.id + '?hard_delete=true', { method: 'DELETE' }).then(() => loadBookings()) } }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        ) : (
                          <button onClick={() => { if (confirm(`Cancel booking for ${b.clients?.name || 'this client'}?`)) { fetch('/api/bookings/' + b.id, { method: 'DELETE' }).then(() => loadBookings()) } }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Cancel">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredBookings.length)} of {filteredBookings.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce((acc: (number | string)[], p, i, arr) => {
                      if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) =>
                      typeof p === 'string' ? (
                        <span key={`ellipsis-${i}`} className="px-1.5 text-gray-300 text-xs">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p as number)}
                          className={
                            'min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ' +
                            (currentPage === p ? 'bg-[#1E2A4A] text-white' : 'text-gray-500 hover:bg-gray-100')
                          }
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-2 border-[#1E2A4A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No bookings found.</p>
            </div>
          ) : (
            <>
              {paginatedBookings.map((b) => (
                <div
                  key={b.id}
                  onClick={() => openEdit(b)}
                  className={
                    'bg-white rounded-xl border border-gray-200/60 p-4 cursor-pointer transition-all active:scale-[0.99] ' +
                    (b.status === 'in_progress' ? 'border-amber-200 bg-amber-50/30 shadow-sm' :
                     b.status === 'cancelled' ? 'opacity-60' :
                     b.status === 'pending' ? 'border-red-200 bg-red-50/20' :
                     'hover:shadow-sm')
                  }
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className={'font-semibold text-sm ' + (b.status === 'cancelled' ? 'text-gray-400' : 'text-[#1E2A4A]')}>{b.clients?.name || '-'}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{b.clients?.address || ''}</p>
                    </div>
                    <span className={
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ml-2 flex-shrink-0 ' +
                      (b.status === 'pending' ? 'bg-red-100 text-red-700' :
                       b.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                       b.status === 'completed' ? 'bg-green-100 text-green-700' :
                       b.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                       'bg-blue-100 text-blue-700')
                    }>
                      {b.status === 'completed' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                      {b.status === 'in_progress' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                      {b.status === 'in_progress' ? 'In Progress' : b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {formatDate(b.start_time)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{b.service_type}</span>
                      {b.cleaners?.name && <span className="text-gray-400">/ {b.cleaners.name}</span>}
                      {b.recurring_type && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs font-medium">{b.recurring_type}</span>}
                    </div>
                    <span className={'text-sm font-bold ' + (b.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-[#1E2A4A]')}>~${(b.price / 100).toFixed(0)}</span>
                  </div>
                </div>
              ))}

              {/* Mobile Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 pb-4">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 bg-white border border-gray-200 disabled:opacity-30 transition-colors"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-gray-400">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 bg-white border border-gray-200 disabled:opacity-30 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      </main>

      {showModal && editingBooking && (
        <SidePanel open={showModal} onClose={() => { setShowModal(false); setEditingBooking(null) }} title="Edit Booking">
            <p className="text-[#1E2A4A] font-medium">{editingBooking.clients?.name}</p>
            {editingBooking.client_id && clients.find(c => c.id === editingBooking.client_id)?.do_not_service && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 my-2">
                <p className="text-red-700 font-bold text-sm">DO NOT SERVICE</p>
                <p className="text-red-600 text-sm">This client is flagged. Check notes before proceeding.</p>
              </div>
            )}
            {editingBooking.clients?.address && (
              <p className="text-[#1E2A4A] text-base">{editingBooking.clients.address}</p>
            )}
            {editingBooking.clients?.phone && (
              <div className="flex items-center gap-3 mt-2 mb-4">
                <span className="text-[#1E2A4A] text-base font-medium">{editingBooking.clients.phone}</span>
                <a href={`tel:${editingBooking.clients.phone}`} className="px-4 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-sm font-medium hover:bg-green-100">Call</a>
                <a href={`sms:${editingBooking.clients.phone}`} className="px-4 py-1.5 bg-[#A8F0DC]/20 text-[#1E2A4A]/70 border border-[#A8F0DC]/30 rounded-full text-sm font-medium hover:bg-[#A8F0DC]/20">Text</a>
              </div>
            )}
            {!editingBooking.clients?.phone && <div className="mb-4" />}
            {/* GPS Distance */}
            {(() => {
              const locations = [
                { label: 'Check-in', loc: editingBooking.check_in_location },
                { label: 'Check-out', loc: editingBooking.check_out_location }
              ].filter(l => l.loc && typeof l.loc === 'object' && 'distance_miles' in (l.loc as Record<string, unknown>))
              if (locations.length === 0) return null
              return (
                <div className="mb-4 space-y-1">
                  {locations.map(({ label, loc }) => {
                    const l = loc as Record<string, unknown>
                    const flagged = l.flagged as boolean
                    const dist = l.distance_miles as number
                    return (
                      <div key={label} className={`text-sm px-3 py-2 rounded-lg ${flagged ? 'bg-red-50 text-red-700 font-medium' : 'bg-green-50 text-green-700'}`}>
                        {flagged ? '⚠️' : '✓'} {label}: {dist.toFixed(2)} mi from address
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            {/* Admin Check-In / Check-Out */}
            {editingBooking.status === 'scheduled' && !editingBooking.check_in_time && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Check in this booking now? This will set the start time to now.')) return
                  setSaving(true)
                  const now = new Date().toISOString()
                  await fetch('/api/bookings/' + editingBooking.id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'in_progress', check_in_time: now, cleaner_id: form.cleaner_id || null, skip_email: true })
                  })
                  setShowModal(false)
                  setEditingBooking(null)
                  loadBookings()
                  setSaving(false)
                }}
                className="w-full mb-3 py-2.5 px-4 bg-[#1E2A4A] text-white rounded-lg font-medium hover:bg-[#1E2A4A]/90"
              >
                Check In (Admin)
              </button>
            )}
            {editingBooking.check_in_time && !editingBooking.check_out_time && (
              <div className="mb-3">
                <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg mb-2">
                  Checked in: {new Date(editingBooking.check_in_time + (editingBooking.check_in_time.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Check out this booking now? This will calculate actual hours and payment.')) return
                    setSaving(true)
                    const now = new Date()
                    const checkIn = new Date(editingBooking.check_in_time!)
                    const rawHours = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60)
                    const actualHours = Math.ceil(rawHours * 2) / 2 // round to half hour
                    const clientRate = editingBooking.hourly_rate || 75
                    const cleanerRate = 25
                    const updatedPrice = Math.round(actualHours * clientRate * 100)
                    const cleanerPay = Math.round(actualHours * cleanerRate * 100)
                    await fetch('/api/bookings/' + editingBooking.id, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        status: 'completed',
                        check_out_time: now.toISOString(),
                        actual_hours: actualHours,
                        price: updatedPrice,
                        cleaner_pay: cleanerPay,
                        cleaner_id: form.cleaner_id || null,
                        skip_email: true
                      })
                    })
                    setShowModal(false)
                    setEditingBooking(null)
                    loadBookings()
                    setSaving(false)
                  }}
                  className="w-full py-2.5 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                >
                  Check Out (Admin)
                </button>
              </div>
            )}
            {editingBooking.check_in_time && editingBooking.check_out_time && (
              <div className="mb-3 space-y-1">
                <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                  Checked in: {new Date(editingBooking.check_in_time + (editingBooking.check_in_time.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                </p>
                <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                  Checked out: {new Date(editingBooking.check_out_time + (editingBooking.check_out_time.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                  {editingBooking.actual_hours ? ` (${editingBooking.actual_hours}hrs)` : ''}
                </p>
              </div>
            )}
            {(editingBooking.recurring_type || editingBooking.schedule_id) && (
              <p className="text-purple-600 text-sm mb-4 bg-purple-50 px-3 py-2 rounded-lg">🔄 Recurring: {editingBooking.recurring_type || 'Linked to schedule'}</p>
            )}
            {editingBooking.cleaner_token && (
              <button type="button" onClick={copyTeamLink} className="w-full mb-4 py-2 px-4 bg-[#A8F0DC]/20 text-[#1E2A4A]/70 border border-[#A8F0DC]/30 rounded-lg font-medium hover:bg-[#A8F0DC]/20">
                {copied ? 'Copied!' : 'Copy Team Link'}
              </button>
            )}
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Date</label>
                    <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Time</label>
                    <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]" />
                  </div>
                </div>
                
                {/* Service & Hours */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Service</label>
                    <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                      {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Hours</label>
                    <select value={form.hours} onChange={(e) => setForm({ ...form, hours: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                      {[1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>{h}hr</option>)}
                    </select>
                  </div>
                </div>

                {/* Rate */}
                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Rate</label>
                  <select value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                    <option value={49}>$49/hr</option>
                    <option value={65}>$65/hr (Intro)</option>
                    <option value={75}>$75/hr</option>
                  </select>
                </div>

                {/* 10% Discount Toggle */}
                <div className="flex justify-between items-center py-3 border-t border-b border-gray-200">
                  <h4 className="font-medium text-[#1E2A4A]">10% Discount</h4>
                  <div
                    onClick={() => setForm({ ...form, discount_enabled: !form.discount_enabled })}
                    className={`w-10 h-6 rounded-full transition-colors ${form.discount_enabled ? 'bg-green-600' : 'bg-gray-300'} relative cursor-pointer`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${form.discount_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </div>

                {/* Estimate display */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Estimate: ~{getEstimatedHoursRange(form.hours)}hrs × ${form.hourly_rate}/hr{form.discount_enabled ? ' − 10%' : ''}</span>
                    <span className="font-semibold text-[#1E2A4A]">~${(calculateEditPrice() / 100).toFixed(0)}</span>
                  </div>
                </div>
                {(form.status === 'completed' || form.actual_hours) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                    <p className="text-xs font-medium text-green-700">ACTUAL LABOR</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-green-700 mb-1">Hours Worked</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={form.actual_hours ?? ''}
                          onChange={(e) => {
                            const hrs = e.target.value ? parseFloat(e.target.value) : null
                            const cleanerRate = cleaners.find(c => c.id === form.cleaner_id)?.hourly_rate || 25
                            setForm({ ...form, actual_hours: hrs, cleaner_pay: hrs ? Math.round(hrs * cleanerRate * 100) : null })
                          }}
                          placeholder="e.g. 3"
                          className="w-full px-3 py-2 border border-green-300 rounded-lg text-[#1E2A4A] bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-green-700 mb-1">Team Pay ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.cleaner_pay != null ? (form.cleaner_pay / 100).toFixed(2) : ''}
                          onChange={(e) => {
                            const val = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null
                            setForm({ ...form, cleaner_pay: val })
                          }}
                          placeholder="auto"
                          className="w-full px-3 py-2 border border-green-300 rounded-lg text-[#1E2A4A] bg-white text-sm"
                        />
                      </div>
                    </div>
                    {form.actual_hours && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-700">Actual: {form.actual_hours}hrs × ${form.hourly_rate}/hr</span>
                        <span className="font-semibold text-green-700">${(form.actual_hours * form.hourly_rate).toFixed(0)}</span>
                      </div>
                    )}
                  </div>
                )}

                <RecurringOptions
                  startDate={form.start_date}
                  enabled={form.repeat_enabled}
                  onEnabledChange={(v) => setForm({ ...form, repeat_enabled: v })}
                  repeatType={form.repeat_type}
                  onRepeatTypeChange={(v) => setForm({ ...form, repeat_type: v })}
                  repeatEnd={form.repeat_end}
                  onRepeatEndChange={(v) => setForm({ ...form, repeat_end: v })}
                  repeatEndCount={form.repeat_end_count}
                  onRepeatEndCountChange={(v) => setForm({ ...form, repeat_end_count: v })}
                  repeatEndDate={form.repeat_end_date}
                  onRepeatEndDateChange={(v) => setForm({ ...form, repeat_end_date: v })}
                  customInterval={form.custom_interval}
                  onCustomIntervalChange={(v) => setForm({ ...form, custom_interval: v })}
                  previewDates={!(editingBooking?.recurring_type || editingBooking?.schedule_id) ? editRecurringDates : []}
                />

                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Cleaner</label>
                  <select value={form.cleaner_id} onChange={(e) => setForm({ ...form, cleaner_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                    <option value="">Select...</option>
                    {cleaners.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                    <option value="pending">Pending</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Payment</label>
                  <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Method</label>
                  <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                    <option value="">-</option>
                    <option value="zelle">Zelle</option>
                    <option value="apple_pay">Apple Pay</option>
                  </select>
                </div>
                {form.status === 'completed' && (
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Team Paid</label>
                    <select value={form.cleaner_paid ? 'paid' : 'not_paid'} onChange={(e) => setForm({ ...form, cleaner_paid: e.target.value === 'paid' })} className={'w-full px-3 py-2 border rounded-lg ' + (form.cleaner_paid ? 'border-green-300 text-green-700 bg-green-50' : 'border-gray-300 text-[#1E2A4A]')}>
                      <option value="not_paid">Not Paid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]" rows={6} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                {(editingBooking.recurring_type || editingBooking.schedule_id) ? (
                  <div className="relative group">
                    <button type="button" className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">Cancel ▾</button>
                    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-white border rounded-lg shadow-lg py-1 min-w-[180px]">
                      <button type="button" onClick={() => handleCancel('single')} className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 text-sm">This booking only</button>
                      <button type="button" onClick={() => handleCancel('all')} className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 text-sm">All future bookings</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => handleCancel('single')} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">Cancel Booking</button>
                )}
                <button type="button" onClick={() => { setShowModal(false); setEditingBooking(null) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">Close</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-[#1E2A4A] text-white rounded-lg">{saving ? '...' : 'Save'}</button>
              </div>
            </form>
        </SidePanel>
      )}

      {showUpdateChoice && (
        <div className="fixed inset-0 bg-[#1E2A4A]/50 flex items-center justify-center z-[10001]" onClick={() => setShowUpdateChoice(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#1E2A4A] mb-4">Update Recurring Booking</h3>
            <p className="text-gray-600 mb-6">Apply changes to:</p>
            <div className="space-y-3">
              <button onClick={() => saveBooking('single')} className="w-full py-3 px-4 border border-gray-300 rounded-lg text-[#1E2A4A] hover:bg-gray-50 text-left">
                <p className="font-medium">This booking only</p>
                <p className="text-sm text-gray-500">Only update this appointment</p>
              </button>
              <button onClick={() => saveBooking('all')} className="w-full py-3 px-4 border border-gray-300 rounded-lg text-[#1E2A4A] hover:bg-gray-50 text-left">
                <p className="font-medium">All future bookings</p>
                <p className="text-sm text-gray-500">Update this and all upcoming appointments</p>
              </button>
            </div>
            <button onClick={() => setShowUpdateChoice(false)} className="w-full mt-4 py-2 text-gray-500 hover:text-[#1E2A4A]">Cancel</button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <SidePanel open={showCreateModal} onClose={() => { setShowCreateModal(false); setShowClientDropdown(false) }} title="Create Booking" width="max-w-lg">
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Client *</label>
                  <input
                    type="text"
                    required={!createForm.client_id}
                    value={clientSearch}
                    onChange={(e) => handleClientSearchChange(e.target.value)}
                    onFocus={() => setShowClientDropdown(true)}
                    placeholder="Search by name or phone..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]"
                  />
                  
                  {showClientDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <button type="button" onClick={handleNewClientClick} className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-200 font-medium text-[#1E2A4A]">+ New Client</button>
                      {filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                          <button key={client.id} type="button" onClick={() => handleClientSelect(client)} className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                            <div className="font-medium text-[#1E2A4A]">{client.name}</div>
                            <div className="text-sm text-gray-500">{client.phone}</div>
                          </button>
                        ))
                      ) : clientSearch ? (
                        <div className="px-3 py-2 text-gray-500 text-sm">No clients found</div>
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">Start typing to search...</div>
                      )}
                    </div>
                  )}
                </div>

                {createForm.client_id && clients.find(c => c.id === createForm.client_id)?.do_not_service && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                    <p className="text-red-700 font-bold text-sm">DO NOT SERVICE</p>
                    <p className="text-red-600 text-sm">This client is flagged as Do Not Service. Check client notes before proceeding.</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Service</label>
                  <select value={createForm.service_type} onChange={(e) => {
                    const isEmergency = e.target.value === 'Emergency / Same-Day'
                    setCreateForm({ ...createForm, service_type: e.target.value, is_emergency: isEmergency, cleaner_id: isEmergency ? '' : createForm.cleaner_id })
                  }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                    {serviceTypes.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                {createForm.is_emergency ? (
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-700 mb-3">🚨 Broadcasts to all team - first to claim gets it</p>
                    <label className="block text-sm font-medium text-red-700 mb-1">Team Pay Rate</label>
                    <div className="flex items-center">
                      <span className="text-[#1E2A4A] text-lg mr-1">$</span>
                      <input
                        type="number"
                        step="1"
                        min="25"
                        max="100"
                        value={createForm.cleaner_pay_rate}
                        onChange={(e) => setCreateForm({ ...createForm, cleaner_pay_rate: parseInt(e.target.value) || 40 })}
                        className="w-24 px-3 py-2 border border-red-300 rounded-lg text-[#1E2A4A] text-center font-mono bg-white"
                      />
                      <span className="text-[#1E2A4A] ml-1">/hr</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Cleaner *</label>
                    <select required value={createForm.cleaner_id} onChange={(e) => setCreateForm({ ...createForm, cleaner_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                      <option value="">Select...</option>
                      {cleaners.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Hours</label>
                    <select value={createForm.hours} onChange={(e) => setCreateForm({ ...createForm, hours: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                      {[1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>{h}hr</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Rate</label>
                    <select value={createForm.hourly_rate} onChange={(e) => setCreateForm({ ...createForm, hourly_rate: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                      <option value={49}>$49/hr</option>
                      <option value={65}>$65/hr (Intro)</option>
                      <option value={75}>$75/hr</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Date *</label>
                    <input type="date" required value={createForm.start_date} onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Time *</label>
                    <input type="time" required value={createForm.start_time} onChange={(e) => setCreateForm({ ...createForm, start_time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]" />
                  </div>
                </div>

                <RecurringOptions
                  startDate={createForm.start_date}
                  enabled={createForm.repeat_enabled}
                  onEnabledChange={(v) => setCreateForm({ ...createForm, repeat_enabled: v })}
                  repeatType={createForm.repeat_type}
                  onRepeatTypeChange={(v) => setCreateForm({ ...createForm, repeat_type: v })}
                  repeatEnd={createForm.repeat_end}
                  onRepeatEndChange={(v) => setCreateForm({ ...createForm, repeat_end: v })}
                  repeatEndCount={createForm.repeat_end_count}
                  onRepeatEndCountChange={(v) => setCreateForm({ ...createForm, repeat_end_count: v })}
                  repeatEndDate={createForm.repeat_end_date}
                  onRepeatEndDateChange={(v) => setCreateForm({ ...createForm, repeat_end_date: v })}
                  customInterval={createForm.custom_interval}
                  onCustomIntervalChange={(v) => setCreateForm({ ...createForm, custom_interval: v })}
                  previewDates={recurringDates}
                />

                <div className="flex justify-between items-center py-3 border-t border-b border-gray-200">
                  <h4 className="font-medium text-[#1E2A4A]">10% Discount</h4>
                  <div
                    onClick={() => setCreateForm({ ...createForm, discount_enabled: !createForm.discount_enabled })}
                    className={`w-10 h-6 rounded-full transition-colors ${createForm.discount_enabled ? 'bg-green-600' : 'bg-gray-300'} relative cursor-pointer`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${createForm.discount_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-2">ESTIMATE{recurringDates.length > 1 ? ' (per visit)' : ''}</p>
                  <div className="flex justify-between">
                    <span>~{getEstimatedHoursRange(createForm.hours)}hrs × ${createForm.hourly_rate}/hr{createForm.discount_enabled ? ' − 10%' : ''}</span>
                    <span className="font-semibold">~${(calculatePrice() / 100).toFixed(0)}</span>
                  </div>
                  {recurringDates.length > 1 && <p className="text-xs text-gray-500 mt-1">Recurring schedule — billed per visit</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Status</label>
                  <select value={createForm.status} onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">
                    <option value="pending">Pending</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E2A4A] mb-1">Notes</label>
                  <textarea value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]" rows={2} placeholder="Access codes..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => { setShowCreateModal(false); setShowClientDropdown(false) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">Cancel</button>
                <button type="submit" disabled={saving || !createForm.client_id} className="flex-1 px-4 py-2 bg-[#1E2A4A] text-white rounded-lg disabled:bg-gray-300">
                  {saving ? 'Creating...' : recurringDates.length > 1 ? 'Create Schedule' : 'Create'}
                </button>
              </div>
            </form>
        </SidePanel>
      )}

      {showNewClientModal && (
        <div className="fixed inset-0 bg-[#1E2A4A]/50 flex items-center justify-center z-[60]" onClick={() => setShowNewClientModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#1E2A4A] mb-4">New Client</h3>
            <form onSubmit={handleNewClientSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" required value={newClientForm.name} onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-[#1E2A4A]" placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={newClientForm.email} onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-[#1E2A4A]" placeholder="john@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input type="tel" required value={newClientForm.phone} onChange={(e) => setNewClientForm({ ...newClientForm, phone: formatPhone(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-[#1E2A4A]" placeholder="212-555-1234" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <AddressAutocomplete value={newClientForm.address} onChange={(val) => setNewClientForm({ ...newClientForm, address: val })} placeholder="123 Main St, New York, NY 10001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit / Apt</label>
                <input type="text" value={newClientForm.unit} onChange={(e) => setNewClientForm({ ...newClientForm, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-[#1E2A4A]" placeholder="Apt 4B" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Referred By</label>
                <select value={newClientForm.referrer_id} onChange={(e) => setNewClientForm({ ...newClientForm, referrer_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-[#1E2A4A]">
                  <option value="">None</option>
                  {referrers.filter(ref => ref.active).map(ref => <option key={ref.id} value={ref.id}>{ref.name} ({ref.ref_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={newClientForm.notes} onChange={(e) => setNewClientForm({ ...newClientForm, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-[#1E2A4A]" rows={3} placeholder="Any special instructions..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewClientModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#1E2A4A]">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-[#1E2A4A] text-white rounded-lg">{saving ? '...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
