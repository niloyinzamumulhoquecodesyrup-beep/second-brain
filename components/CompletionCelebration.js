import { useEffect } from 'react'

// A brief, self-dismissing "done" celebration: spinning gradient ring around a
// green checkmark badge. Fired once when a task/routine flips to done — the card
// itself stays in the list afterward, just ticked, instead of vanishing.
//
// variant="bonus" is the rare, bigger surprise version (variable-ratio reward
// system on the Work page, see RewardPanel.js/pages/work.js): a warmer multi-color
// ring, a larger badge, an optional message line, longer on screen, and a higher
// z-index so it sits above a plain celebration if both happen to land at once.
export default function CompletionCelebration({ onDone, variant = 'normal', message }) {
  const isBonus = variant === 'bonus'

  useEffect(() => {
    const t = setTimeout(onDone, isBonus ? 2000 : 1400)
    return () => clearTimeout(t)
  }, [onDone, isBonus])

  return (
    <div className={`celebrate-backdrop ${isBonus ? 'celebrate-backdrop-bonus z-[70]' : 'z-[60]'} fixed inset-0 flex items-center justify-center bg-black/40`}>
      <div className="flex flex-col items-center gap-3">
        <div className={`relative flex items-center justify-center ${isBonus ? 'h-40 w-40' : 'h-32 w-32'}`}>
          <div className={`celebrate-ring absolute inset-0 rounded-full ${isBonus ? 'celebrate-ring-bonus' : ''}`} />
          <div className={`celebrate-badge relative flex items-center justify-center rounded-full shadow-lg ${isBonus ? 'h-32 w-32' : 'h-24 w-24'}`}>
            <svg viewBox="0 0 24 24" className={isBonus ? 'h-14 w-14' : 'h-10 w-10'}>
              <path d="M5 13l4 4L19 7" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="celebrate-check" />
            </svg>
          </div>
        </div>
        {isBonus && message && (
          <p className="max-w-[240px] text-center text-sm font-medium text-gold-200">✨ {message}</p>
        )}
      </div>
    </div>
  )
}
