import { useEffect } from 'react'
import CaptureSection from './CaptureSection'

// The Organize tab's quick-capture popup — same form as the old standalone Capture
// page, just reachable from a button instead of a swipe. Left open after a save
// (status message shows inline) so a burst of captures doesn't require reopening
// the modal each time; the user closes it themselves when done.
export default function CaptureModal({ onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="label !text-emerald-300">Capture</p>
          <button onClick={onClose} className="text-mist-400 hover:text-mist-100" aria-label="Close">✕</button>
        </div>
        <CaptureSection />
      </div>
    </div>
  )
}
