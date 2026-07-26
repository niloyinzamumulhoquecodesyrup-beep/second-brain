import { useEffect, useRef, useState } from 'react'

function pad(n) {
  return String(n).padStart(2, '0')
}
function toYMD(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function fromYMD(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDDMMYYYY(ymd) {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// A calendar-grid date picker, always displaying dd/mm/yyyy regardless of the
// visitor's browser/OS locale. Replaces native <input type="date">, whose text
// segments accept free-typed garbage (e.g. a 6-digit year) with no validation
// until blur, and whose displayed format isn't controllable at all.
export default function DatePicker({ value, onChange, placeholder = 'dd/mm/yyyy', className, buttonClassName, title }) {
  const [open, setOpen] = useState(false)
  const selected = value ? fromYMD(value) : null
  const [viewYear, setViewYear] = useState((selected || new Date()).getFullYear())
  const [viewMonth, setViewMonth] = useState((selected || new Date()).getMonth())
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function openPicker() {
    const base = value ? fromYMD(value) : new Date()
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
    setOpen(true)
  }

  function pick(day) {
    onChange(toYMD(new Date(viewYear, viewMonth, day)))
    setOpen(false)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7 // Monday-first
  const totalDays = daysInMonth(viewYear, viewMonth)
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)]
  const todayYMD = toYMD(new Date())

  return (
    <div ref={rootRef} className={`relative inline-block ${className || ''}`}>
      <button
        type="button"
        title={title}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={buttonClassName || 'input !w-auto text-left'}
      >
        {value ? fmtDDMMYYYY(value) : <span className="text-mist-400">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-64 rounded-lg border border-ink-700 bg-ink-900 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded px-2 py-1 text-sm text-mist-300 hover:bg-ink-800 hover:text-mist-100">‹</button>
            <span className="text-sm font-medium text-mist-100">
              {new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" onClick={nextMonth} className="rounded px-2 py-1 text-sm text-mist-300 hover:bg-ink-800 hover:text-mist-100">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-mist-500">
            {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day == null) return <span key={i} />
              const ymd = toYMD(new Date(viewYear, viewMonth, day))
              const isSelected = value === ymd
              const isToday = ymd === todayYMD
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => pick(day)}
                  className={[
                    'rounded py-1 text-xs transition hover:bg-emerald-500/20',
                    isSelected ? 'bg-emerald-500 font-semibold text-ink-950' : 'text-mist-200',
                    isToday && !isSelected ? 'ring-1 ring-emerald-400/60' : ''
                  ].join(' ')}
                >
                  {day}
                </button>
              )
            })}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="mt-2 w-full rounded border border-ink-700 py-1 text-xs text-mist-400 hover:text-mist-200"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
