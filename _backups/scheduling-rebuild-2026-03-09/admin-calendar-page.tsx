'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'

interface Client { id: string; name: string; phone: string; address: string }
interface Cleaner { id: string; name: string }
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
  clients: Client | null
  cleaners: Cleaner | null
}

interface BookingEvent {
  id: string
  title: string
  start: string
  end: string
  backgroundColor: string
  borderColor?: string
  editable?: boolean
  classNames?: string[]
  textColor?: string
  extendedProps: {
    booking: Booking | null
    cleanerId?: string
  }
}

const CLEANER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316'
]

export default function CalendarPage() {
  useEffect(() => { document.title = 'Calendar | The NYC Maid' }, []);
  const [bookings, setBookings] = useState<BookingEvent[]>([])
  const [allBookings, setAllBookings] = useState<Booking[]>([])
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedCleaner, setSelectedCleaner] = useState<string>('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['pending', 'scheduled', 'in_progress', 'completed'])
  const [cleanerColors, setCleanerColors] = useState<Record<string, string>>({})
  useEffect(() => {
    loadBookings()
    loadClients()
    loadCleaners()
  }, [])

  useEffect(() => {
    filterBookings()
  }, [allBookings, selectedCleaner, selectedStatuses, cleanerColors])

  const loadBookings = async () => {
    const res = await fetch('/api/bookings')
    if (res.ok) {
      const data = await res.json()
      setAllBookings(data)
    }
  }

  const loadClients = async () => {
    const res = await fetch('/api/clients')
    if (res.ok) setClients(await res.json())
  }

  const loadCleaners = async () => {
    const res = await fetch('/api/cleaners')
    if (res.ok) {
      const data = await res.json()
      setCleaners(data)

      const colors: Record<string, string> = {}
      data.forEach((cleaner: Cleaner, index: number) => {
        colors[cleaner.id] = CLEANER_COLORS[index % CLEANER_COLORS.length]
      })
      setCleanerColors(colors)
    }
  }

  const filterBookings = () => {
    let filtered = [...allBookings]

    if (selectedCleaner) {
      filtered = filtered.filter(b => b.cleaner_id === selectedCleaner)
    }

    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(b => selectedStatuses.includes(b.status))
    }

    const events: BookingEvent[] = filtered.map((b: Booking) => {
      const prefix = b.status === 'pending' ? '⏳ ' : b.status === 'in_progress' ? '▶️ ' : ''
      const bg = b.status === 'pending' ? '#dc2626' : cleanerColors[b.cleaner_id] || '#000000'
      const clientName = (b.clients?.name || 'Client').split(' ')[0]
      // Format time from start_time
      const [, timePart] = b.start_time.split('T')
      const [h, m] = (timePart || '00:00').split(':').map(Number)
      const ampm = h >= 12 ? 'p' : 'a'
      const hr = h % 12 || 12
      const timeStr = m > 0 ? `${hr}:${String(m).padStart(2, '0')}${ampm}` : `${hr}${ampm}`
      return {
        id: b.id,
        title: `${timeStr} ${prefix}${clientName}`,
        start: b.start_time,
        end: b.end_time,
        backgroundColor: bg,
        borderColor: bg,
        extendedProps: { booking: b, cleanerId: b.cleaner_id }
      }
    })

    setBookings(events)
  }

  const toggleStatus = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status))
    } else {
      setSelectedStatuses([...selectedStatuses, status])
    }
  }

  const toLocalISOString = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  const handleEventClick = (info: any) => {
    window.location.href = `/admin/bookings?edit=${info.event.id}`
  }

  const handleSelect = (info: any) => {
    const date = info.start as Date
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
    const timeStr = pad(date.getHours()) + ':' + pad(date.getMinutes())
    window.location.href = `/admin/bookings?date=${dateStr}&time=${timeStr}`
  }

  const handleEventDrop = async (info: any) => {
    const booking = info.event.extendedProps.booking as Booking
    const newStart = toLocalISOString(info.event.start)
    const newEnd = toLocalISOString(info.event.end)
    const clientName = booking.clients?.name || 'this client'
    const newDateLabel = info.event.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    if (!confirm(`Move ${clientName} to ${newDateLabel}?`)) {
      info.revert()
      return
    }
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: booking.status,
        payment_status: booking.payment_status,
        payment_method: booking.payment_method,
        notes: booking.notes,
        cleaner_id: booking.cleaner_id,
        start_time: newStart,
        end_time: newEnd,
        service_type: booking.service_type,
        price: booking.price,
        hourly_rate: (booking as any).hourly_rate
      })
    })
    if (res.ok) {
      loadBookings()
    } else {
      info.revert()
    }
  }

  const handleEventResize = async (info: any) => {
    const booking = info.event.extendedProps.booking as Booking
    const newStart = toLocalISOString(info.event.start)
    const newEnd = toLocalISOString(info.event.end)
    const hours = Math.round((info.event.end.getTime() - info.event.start.getTime()) / (1000 * 60 * 60))
    const clientName = booking.clients?.name || 'this client'
    if (!confirm(`Resize ${clientName} to ${hours} hours?`)) {
      info.revert()
      return
    }
    const hourlyRate = (booking as any).hourly_rate || 75
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: booking.status,
        payment_status: booking.payment_status,
        payment_method: booking.payment_method,
        notes: booking.notes,
        cleaner_id: booking.cleaner_id,
        start_time: newStart,
        end_time: newEnd,
        service_type: booking.service_type,
        price: hours * hourlyRate * 100,
        hourly_rate: hourlyRate
      })
    })
    if (res.ok) {
      loadBookings()
    } else {
      info.revert()
    }
  }

  return (
      <main className="p-3 md:p-6">
        {/* Filters - compact */}
        <div className="mb-2 flex flex-col md:flex-row flex-wrap gap-4 items-start md:items-center bg-gray-50 px-3 py-2 rounded-lg overflow-x-hidden">
          {/* Cleaner Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Team Member</label>
            <select
              value={selectedCleaner}
              onChange={(e) => setSelectedCleaner(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-[#1E2A4A] text-sm"
            >
              <option value="">All Team</option>
              {cleaners.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Status Checkboxes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('pending')}
                  onChange={() => toggleStatus('pending')}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-sm text-red-700 font-medium">Pending</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('scheduled')}
                  onChange={() => toggleStatus('scheduled')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">Scheduled</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('in_progress')}
                  onChange={() => toggleStatus('in_progress')}
                  className="w-4 h-4 accent-[#1E2A4A]"
                />
                <span className="text-sm text-[#1E2A4A]/70 font-medium">In Progress</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('completed')}
                  onChange={() => toggleStatus('completed')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">Completed</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('cancelled')}
                  onChange={() => toggleStatus('cancelled')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">Cancelled</span>
              </label>
            </div>
          </div>

          {/* Color Legend */}
          <div className="w-full md:w-auto md:ml-auto">
            <label className="block text-xs font-medium text-gray-600 mb-1">Team Colors</label>
            <div className="flex gap-2 flex-wrap">
              {cleaners.map(cleaner => (
                <div key={cleaner.id} className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: cleanerColors[cleaner.id] }}
                  />
                  <span className="text-xs text-gray-600">{cleaner.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Calendar */}
        <div className="hidden md:block">
          <style>{`
            .fc .fc-icon-chevron-left::before { content: '\\2039' !important; }
            .fc .fc-icon-chevron-right::before { content: '\\203A' !important; }
            .fc-daygrid-day-number {
              font-size: 12px !important;
              font-weight: 600 !important;
              padding: 2px 4px !important;
              color: #666 !important;
            }
            .fc-daygrid-day-events {
              display: grid !important;
              grid-template-columns: 1fr 1fr !important;
              gap: 1px !important;
              padding: 0 2px !important;
            }
            .fc-daygrid-event-harness {
              margin-top: 0 !important;
              margin-bottom: 0 !important;
              min-width: 0 !important;
            }
            .fc-daygrid-event {
              font-size: 9px !important;
              line-height: 1.2 !important;
              padding: 1px 2px !important;
              border-radius: 3px !important;
              overflow: hidden !important;
              margin: 0 !important;
            }
            .fc-daygrid-event .fc-event-main {
              padding: 0 !important;
              overflow: hidden !important;
              white-space: nowrap !important;
              text-overflow: ellipsis !important;
            }
            .fc-daygrid-event .fc-event-title { font-size: 9px !important; font-weight: 500 !important; }
            .fc-daygrid-event .fc-event-time { display: none !important; }
            .fc-daygrid-more-link { font-size: 9px !important; grid-column: 1 / -1 !important; }
          `}</style>
          <div className="border border-gray-200 rounded-lg p-2 bg-white">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
              }}
              events={bookings}
              eventClick={handleEventClick}
              select={handleSelect}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              editable={true}
              selectable={true}
              selectMirror={true}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              height="calc(100vh - 140px)"
              eventDisplay="block"
              eventTimeFormat={{
                hour: 'numeric',
                minute: '2-digit',
                meridiem: 'short'
              }}
              dayMaxEvents={6}
              snapDuration="00:30:00"
              slotDuration="00:30:00"
              firstDay={1}
              fixedWeekCount={false}
              showNonCurrentDates={false}
              eventOrder={(a: any, b: any) => {
                const aId = a.extendedProps?.cleanerId || a.extendedProps?.booking?.cleaner_id || ''
                const bId = b.extendedProps?.cleanerId || b.extendedProps?.booking?.cleaner_id || ''
                if (aId !== bId) return aId < bId ? -1 : 1
                return 0
              }}
            />
          </div>

          {/* Compact stats inline */}
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>Click to edit • Drag to move</span>
            <span className="ml-auto">
              {allBookings.filter(b => b.status === 'pending' && (selectedCleaner ? b.cleaner_id === selectedCleaner : true)).length > 0 && (
                <>
                  <span className="text-red-600 font-medium">{allBookings.filter(b => b.status === 'pending' && (selectedCleaner ? b.cleaner_id === selectedCleaner : true)).length}</span> pending
                  <span className="mx-2">•</span>
                </>
              )}
              <span className="text-[#1E2A4A] font-medium">{allBookings.filter(b => b.status === 'scheduled' && (selectedCleaner ? b.cleaner_id === selectedCleaner : true)).length}</span> scheduled
              <span className="mx-2">•</span>
              <span className="text-[#1E2A4A] font-medium">{allBookings.filter(b => b.status === 'in_progress' && (selectedCleaner ? b.cleaner_id === selectedCleaner : true)).length}</span> in progress
              <span className="mx-2">•</span>
              <span className="text-green-600 font-medium">{allBookings.filter(b => b.status === 'completed' && (selectedCleaner ? b.cleaner_id === selectedCleaner : true)).length}</span> completed
              <span className="mx-2">•</span>
              <span className="font-medium">{allBookings.filter(b => (selectedCleaner ? b.cleaner_id === selectedCleaner : true)).length}</span> total
            </span>
          </div>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden">
          {(() => {
            // Filter the same way as the calendar
            let filtered = [...allBookings]
            if (selectedCleaner) filtered = filtered.filter(b => b.cleaner_id === selectedCleaner)
            if (selectedStatuses.length > 0) filtered = filtered.filter(b => selectedStatuses.includes(b.status))

            // Sort by start_time
            filtered.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

            // Only show upcoming (today onward)
            const todayStr = new Date().toISOString().split('T')[0]
            filtered = filtered.filter(b => b.start_time.split('T')[0] >= todayStr)

            // Group by date
            const grouped: Record<string, Booking[]> = {}
            for (const b of filtered) {
              const dateKey = b.start_time.split('T')[0]
              if (!grouped[dateKey]) grouped[dateKey] = []
              grouped[dateKey].push(b)
            }

            const dateKeys = Object.keys(grouped).sort()
            if (dateKeys.length === 0) {
              return <p className="text-center text-gray-500 py-8">No upcoming appointments</p>
            }

            return dateKeys.map(dateKey => {
              const dayDate = new Date(dateKey + 'T12:00:00')
              const isToday = dateKey === todayStr
              const label = isToday
                ? 'Today'
                : dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

              const dayBookings = grouped[dateKey]

              return (
                <div key={dateKey} className="mb-4">
                  <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1.5 px-1 ${isToday ? 'text-[#1E2A4A]' : 'text-gray-400'}`}>{label}</h3>
                  <div className="space-y-1.5">
                    {dayBookings.map((b, idx) => {
                      const color = b.status === 'pending' ? '#dc2626' : cleanerColors[b.cleaner_id] || '#000'
                      const [, st] = b.start_time.split('T'); const [sh, sm] = (st || '00:00').split(':').map(Number)
                      const [, et] = b.end_time.split('T'); const [eh, em] = (et || '00:00').split(':').map(Number)
                      const time = new Date(2000, 0, 1, sh, sm).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      const endTime = new Date(2000, 0, 1, eh, em).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

                      return (
                        <div key={b.id}>
                          <a
                            href={`/admin/bookings?edit=${b.id}`}
                            className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-100 active:bg-gray-50"
                          >
                            <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-[#1E2A4A] truncate">
                                {b.status === 'pending' && '⏳ '}{b.status === 'in_progress' && '▶️ '}{b.clients?.name || 'Client'}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{b.service_type} • {b.cleaners?.name || 'Unassigned'}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-medium text-[#1E2A4A]">{time}</p>
                              <p className="text-xs text-gray-400">{endTime}</p>
                            </div>
                          </a>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </main>
  )
}
