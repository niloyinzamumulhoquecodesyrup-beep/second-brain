import { useEffect, useState } from 'react'
import { toYMD, dayEntries } from '../lib/plannerDay'
import FocusPomodoro from './FocusPomodoro'
import CompletionCelebration from './CompletionCelebration'

function dateOnly(v) {
  return v ? String(v).slice(0, 10) : null
}
function fmtDue(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function fmtTime(min) {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function parseTime(str) {
  const [h, m] = str.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Flat, saturated card colors cycling red -> orange -> gold -> yellow -> green -> teal,
// same progression as llama life's preset task lists.
const CARD_COLORS = ['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-yellow-500', 'bg-lime-500', 'bg-teal-500']
const TEXT_COLORS = CARD_COLORS.map(c => c.replace('bg-', 'text-'))
const ICONS = ['\u{1F4DD}', '\u{2B50}', '\u{1F3AF}', '\u{1F514}', '\u{1F4CC}', '\u{2728}']

function pick(list, key) {
  let sum = 0
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i)
  return list[sum % list.length]
}

// A single task or routine instance rendered as a colorful preset-style card:
// icon, title, time, and inline actions. Draggable — drop it above or below
// another card to reorder, which opens the time popup for it.
function TodayCard({ item, color, icon, dragging, dropEdge, onToggle, onSecondary, secondaryLabel, onStart, dragHandlers }) {
  return (
    <div
      draggable
      {...dragHandlers}
      className={[
        'cursor-grab select-none rounded-xl px-3 py-2 text-white shadow-sm transition active:cursor-grabbing',
        color,
        item.done ? 'opacity-60' : '',
        dragging ? 'opacity-40' : '',
        dropEdge ? 'outline outline-2 outline-offset-2 outline-white' : ''
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm">
          {icon}
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${item.done ? 'line-through' : ''}`}>
          {item.title}
        </span>
        {!item.done && (
          <button
            onClick={onStart}
            aria-label="Start focus session"
            title="Start"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/25 text-xs hover:bg-white/40"
          >
            ▶
          </button>
        )}
        <button
          onClick={onToggle}
          aria-label={item.done ? 'Mark not done' : 'Mark done'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-xs hover:bg-white/20"
        >
          {item.done ? '✓' : ''}
        </button>
      </div>
      <div className="mt-1 flex items-center gap-3 pl-9 text-xs text-white/80">
        <span>{item.subtitle}</span>
        <button onClick={onSecondary} className="hover:text-white">{secondaryLabel}</button>
      </div>
    </div>
  )
}

// The color-matched popup for retiming a dragged card: type a time directly, or
// hand it to auto balance to space every card out back-to-back in drop order.
function TimePopup({ item, color, time, setTime, busy, onSave, onAutoBalance, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={`w-full max-w-sm rounded-2xl ${color} p-5 text-white shadow-xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-serif text-lg font-medium">{item.title}</p>
          <button onClick={onClose} className="shrink-0 text-white/70 hover:text-white">✕</button>
        </div>
        <p className="mt-1 text-sm text-white/80">Give it a time, or let auto balance space out today's cards in this order.</p>
        <div className="mt-4 flex items-center gap-2">
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="flex-1 rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
          />
          <button disabled={busy || !time} onClick={onSave} className="shrink-0 rounded-lg bg-white/25 px-3 py-2 text-sm font-medium hover:bg-white/35 disabled:opacity-50">
            Save time
          </button>
        </div>
        <button disabled={busy} onClick={onAutoBalance} className="mt-3 w-full rounded-lg border-2 border-white/70 px-3 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-50">
          ⚖ Auto balance today's times
        </button>
      </div>
    </div>
  )
}

// Today's tasks plus today's routine instances, rendered as one colorful,
// drag-to-reorder preset-style list (see llama life's task presets) instead of
// the plain bordered rows used for the other task groups.
export default function TodayCards({ tasks, onToggle: onToggleTask, onDelete: onDeleteTask, onUpdate, onCompletion, empty }) {
  const [planner, setPlanner] = useState(null)
  const [pendingOrder, setPendingOrder] = useState(null)
  const [draggedKey, setDraggedKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const [dragOverPos, setDragOverPos] = useState(null)
  const [popupKey, setPopupKey] = useState(null)
  const [popupTime, setPopupTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [focusItem, setFocusItem] = useState(null)
  const [focusStage, setFocusStage] = useState('list') // 'list' | 'toFocus' | 'focus' | 'toList'
  const [routinePieces, setRoutinePieces] = useState({})
  const [celebrating, setCelebrating] = useState(false)

  const today = toYMD(new Date())

  function loadPlanner() {
    fetch(`/api/planner?from=${today}&days=1`)
      .then(r => r.json())
      .then(d => setPlanner({ blocks: d.blocks || [], routines: d.routines || [] }))
      .catch(() => setPlanner({ blocks: [], routines: [] }))
  }
  useEffect(loadPlanner, []) // eslint-disable-line react-hooks/exhaustive-deps

  const routineEntries = planner ? dayEntries(today, planner.blocks, planner.routines).filter(e => e.status !== 'dismissed') : []

  const items = [
    ...routineEntries.map(entry => ({
      key: `routine-${entry.routine_id || entry.id}`,
      kind: 'routine',
      title: entry.title,
      start_min: entry.start_min,
      duration_min: entry.duration_min,
      done: entry.status === 'done',
      subtitle: `${fmtTime(entry.start_min)} – ${fmtTime(entry.start_min + entry.duration_min)}`,
      raw: entry
    })),
    ...tasks.map(t => {
      const due = dateOnly(t.due_date)
      const overdue = due && due < today && !t.done
      const subtitle = t.start_min != null
        ? (t.duration_min ? `${fmtTime(t.start_min)} – ${fmtTime(t.start_min + t.duration_min)}` : fmtTime(t.start_min))
        : (due ? (overdue ? `overdue — ${fmtDue(due)}` : fmtDue(due)) : 'No due date')
      return {
        key: `task-${t.id}`,
        kind: 'task',
        title: t.title,
        start_min: t.start_min ?? null,
        duration_min: t.duration_min ?? null,
        done: t.done,
        subtitle,
        raw: t
      }
    })
  ]
  const byKey = Object.fromEntries(items.map(i => [i.key, i]))

  const sortedKeys = [...items]
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      if (a.start_min == null && b.start_min == null) return a.title.localeCompare(b.title)
      if (a.start_min == null) return 1
      if (b.start_min == null) return -1
      return a.start_min - b.start_min
    })
    .map(i => i.key)

  const orderKeys = pendingOrder || sortedKeys
  const missingKeys = sortedKeys.filter(k => !orderKeys.includes(k))
  const finalItems = [...orderKeys, ...missingKeys].map(k => byKey[k]).filter(Boolean)

  const popupItem = popupKey ? byKey[popupKey] : null

  function resetDrag() {
    setDraggedKey(null)
    setDragOverKey(null)
    setDragOverPos(null)
  }

  function dragHandlersFor(key) {
    return {
      onDragStart: e => {
        setDraggedKey(key)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
      },
      onDragOver: e => {
        e.preventDefault()
        if (key === draggedKey) return
        const rect = e.currentTarget.getBoundingClientRect()
        setDragOverKey(key)
        setDragOverPos(e.clientY - rect.top < rect.height / 2 ? 'above' : 'below')
      },
      onDrop: e => {
        e.preventDefault()
        if (!draggedKey || draggedKey === key) { resetDrag(); return }
        const pos = dragOverPos || 'above'
        const current = finalItems.map(i => i.key)
        const withoutDragged = current.filter(k => k !== draggedKey)
        let targetIndex = withoutDragged.indexOf(key)
        if (pos === 'below') targetIndex += 1
        withoutDragged.splice(targetIndex, 0, draggedKey)
        setPendingOrder(withoutDragged)
        setPopupKey(draggedKey)
        const dragged = byKey[draggedKey]
        setPopupTime(dragged?.start_min != null ? fmtTime(dragged.start_min) : '')
        resetDrag()
      },
      onDragEnd: resetDrag
    }
  }

  async function toggleRoutine(item) {
    const entry = item.raw
    const nextStatus = entry.status === 'done' ? 'active' : 'done'
    if (entry.virtual) {
      await fetch('/api/planner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: entry.title, category: entry.category, plan_date: today,
          start_min: entry.start_min, duration_min: entry.duration_min,
          routine_id: entry.routine_id, status: nextStatus
        })
      })
    } else {
      await fetch(`/api/planner/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
    }
    loadPlanner()
  }

  async function skipRoutine(item) {
    const entry = item.raw
    if (entry.virtual) {
      await fetch('/api/planner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: entry.title, category: entry.category, plan_date: today,
          start_min: entry.start_min, duration_min: entry.duration_min,
          routine_id: entry.routine_id, status: 'skipped'
        })
      })
    } else {
      await fetch(`/api/planner/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' })
      })
    }
    loadPlanner()
  }

  // Marking done (not un-marking) fires the celebration — the card itself just
  // stays in the list afterward, ticked, instead of disappearing.
  async function toggleTaskDone(item) {
    if (!item.done) setCelebrating(true)
    await onToggleTask(item.raw)
  }
  async function toggleRoutineDone(item) {
    if (!item.done) setCelebrating(true)
    await toggleRoutine(item)
  }

  function startFocus(item) {
    setFocusItem(item)
    setFocusStage('toFocus')
  }
  function requestExitFocus() {
    setFocusStage('toList')
  }
  function handleFocusTransitionEnd(e) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (focusStage === 'toFocus') setFocusStage('focus')
    else if (focusStage === 'toList') { setFocusStage('list'); setFocusItem(null) }
  }

  function getPieces(item) {
    return item.kind === 'task' ? (item.raw.pieces || []) : (routinePieces[item.key] || [])
  }
  function setPiecesFor(item, pieces) {
    if (item.kind === 'task') onUpdate(item.raw, { pieces })
    else setRoutinePieces(prev => ({ ...prev, [item.key]: pieces }))
  }

  async function completeFocusItem(item) {
    if (item.kind === 'task') await toggleTaskDone(item)
    else await toggleRoutineDone(item)
  }

  function logFocusMinutes(item, minutes) {
    fetch('/api/activity/focus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'focus', minutes, task_id: item.kind === 'task' ? item.raw.id : null })
    }).catch(() => {})
    onCompletion?.('focus')
  }

  async function persistTime(item, start_min, duration_min) {
    if (item.kind === 'task') {
      await onUpdate(item.raw, { start_min, duration_min })
    } else {
      const entry = item.raw
      if (entry.virtual) {
        await fetch('/api/planner', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: entry.title, category: entry.category, plan_date: today,
            start_min, duration_min, routine_id: entry.routine_id,
            status: entry.status === 'done' ? 'done' : 'active'
          })
        })
      } else {
        await fetch(`/api/planner/${entry.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ start_min, duration_min })
        })
      }
    }
  }

  function closePopup() {
    setPopupKey(null)
    setPopupTime('')
    setPendingOrder(null)
  }

  async function saveManualTime() {
    if (!popupItem || !popupTime) return
    setBusy(true)
    await persistTime(popupItem, parseTime(popupTime), popupItem.duration_min ?? 30)
    loadPlanner()
    setBusy(false)
    closePopup()
  }

  async function autoBalance() {
    setBusy(true)
    const known = finalItems.map(i => i.start_min).filter(v => v != null)
    let cursor = known.length ? Math.min(...known) : 9 * 60
    await Promise.all(finalItems.map(item => {
      const start_min = cursor
      const duration_min = item.duration_min ?? 30
      cursor += duration_min
      return persistTime(item, start_min, duration_min)
    }))
    loadPlanner()
    setBusy(false)
    closePopup()
  }

  const total = finalItems.length
  // Merge the frozen focus-start snapshot with live data (pieces, done state) so the
  // focus view keeps updating while it's open, but still has something to render
  // during the fade-out after the underlying item disappears (e.g. on completion).
  const liveFocusItem = focusItem ? (byKey[focusItem.key] || focusItem) : null
  const showingList = focusStage === 'list' || focusStage === 'toFocus'

  return (
    <div>
      <p className="label mb-3">Today <span className="text-mist-500">({total})</span></p>

      <div
        className={`transition-opacity duration-500 ${focusStage === 'toFocus' || focusStage === 'toList' ? 'opacity-0' : 'opacity-100'}`}
        onTransitionEnd={handleFocusTransitionEnd}
      >
        {showingList ? (
          total === 0 ? (
            <p className="text-sm text-mist-400">{empty}</p>
          ) : (
            <div className="space-y-2">
              {finalItems.map(item => (
                <TodayCard
                  key={item.key}
                  item={item}
                  color={pick(CARD_COLORS, item.key)}
                  icon={pick(ICONS, item.key)}
                  dragging={draggedKey === item.key}
                  dropEdge={dragOverKey === item.key ? dragOverPos : null}
                  onToggle={item.kind === 'task' ? () => toggleTaskDone(item) : () => toggleRoutineDone(item)}
                  onSecondary={item.kind === 'task' ? () => onDeleteTask(item.raw) : () => skipRoutine(item)}
                  secondaryLabel={item.kind === 'task' ? 'Delete' : 'Skip today'}
                  onStart={() => startFocus(item)}
                  dragHandlers={dragHandlersFor(item.key)}
                />
              ))}
            </div>
          )
        ) : liveFocusItem ? (
          <FocusPomodoro
            item={liveFocusItem}
            bgColorClass={pick(CARD_COLORS, liveFocusItem.key)}
            textColorClass={pick(TEXT_COLORS, liveFocusItem.key)}
            pieces={getPieces(liveFocusItem)}
            onPiecesChange={pieces => setPiecesFor(liveFocusItem, pieces)}
            onExit={requestExitFocus}
            onComplete={async () => { await completeFocusItem(liveFocusItem); requestExitFocus() }}
            onLogFocus={minutes => logFocusMinutes(liveFocusItem, minutes)}
          />
        ) : null}
      </div>

      {popupItem && (
        <TimePopup
          item={popupItem}
          color={pick(CARD_COLORS, popupItem.key)}
          time={popupTime}
          setTime={setPopupTime}
          busy={busy}
          onSave={saveManualTime}
          onAutoBalance={autoBalance}
          onClose={closePopup}
        />
      )}

      {celebrating && <CompletionCelebration onDone={() => setCelebrating(false)} />}
    </div>
  )
}
