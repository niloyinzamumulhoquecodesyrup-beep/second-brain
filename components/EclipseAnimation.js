// Onboarding's persistent backdrop: a dark eclipse-ring, glowing cyan/teal, with two
// asymmetric flare points along the rim (diamond-ring effect) — reference image supplied
// by the user. Renders behind the onboarding step content; `boosting` (set briefly on
// "Start") brightens and speeds the pulse as a tactile response to the tap.
export default function EclipseAnimation({ boosting = false, className = '' }) {
  return (
    <div className={`eclipse-wrap ${className}`}>
      <svg viewBox="0 0 400 400" className={`eclipse-svg ${boosting ? 'boosting' : ''}`}>
        <defs>
          <filter id="eclipse-blur-strong" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id="eclipse-blur-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id="eclipse-flare" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#eafffe" stopOpacity="1" />
            <stop offset="35%" stopColor="#5eead4" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="400" fill="#030405" />

        <g className="eclipse-ring">
          <circle cx="200" cy="200" r="150" fill="none" stroke="#2dd4d4" strokeWidth="16" filter="url(#eclipse-blur-strong)" opacity="0.45" />
          <circle cx="200" cy="200" r="150" fill="none" stroke="#5eead4" strokeWidth="3.5" filter="url(#eclipse-blur-soft)" opacity="0.85" />
          <circle cx="200" cy="200" r="150" fill="none" stroke="#eafffe" strokeWidth="1.2" opacity="0.75" />
        </g>

        <circle className="eclipse-flare eclipse-flare-a" cx="59" cy="149" r="16" fill="url(#eclipse-flare)" filter="url(#eclipse-blur-soft)" />
        <circle className="eclipse-flare eclipse-flare-b" cx="341" cy="251" r="13" fill="url(#eclipse-flare)" filter="url(#eclipse-blur-soft)" />
      </svg>

      <style jsx>{`
        .eclipse-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .eclipse-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .eclipse-ring {
          transform-origin: 200px 200px;
          animation: eclipse-breathe 6s ease-in-out infinite;
        }
        .eclipse-flare {
          transform-origin: center;
          animation: eclipse-twinkle 4.5s ease-in-out infinite;
        }
        .eclipse-flare-b {
          animation-duration: 5.5s;
          animation-delay: 0.8s;
        }
        .eclipse-svg.boosting .eclipse-ring {
          animation-duration: 1.2s;
        }
        .eclipse-svg.boosting .eclipse-flare {
          animation-duration: 0.9s;
        }
        @keyframes eclipse-breathe {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.02); opacity: 1; }
        }
        @keyframes eclipse-twinkle {
          0%, 100% { opacity: 0.55; transform: scale(0.92); }
          50% { opacity: 1; transform: scale(1.12); }
        }
      `}</style>
    </div>
  )
}
