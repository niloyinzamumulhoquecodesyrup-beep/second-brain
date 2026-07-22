import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import PARACube from '../components/PARACube'
import MindMap from '../components/MindMap'
import TourOverlay from '../components/TourOverlay'
import CaptureModal from '../components/CaptureModal'
import { GoalArrowChart, RecommendationCardBody } from '../components/InsightCards'
import { requireSessionSSR } from '../lib/pageAuth'

// One report card visible at a time (ADHD constraint — same "read one-at-a-time"
// posture as the rest of the app's queues), with prev/next arrows through the set.
function FieldInvestigationReport({ recommendations }) {
  const [index, setIndex] = useState(0)

  if (recommendations.length === 0) {
    return (
      <div className="card p-6">
        <p className="label mb-4 !text-gold-400">Field Investigation Report</p>
        <p className="text-sm text-mist-400">Nothing investigated yet.</p>
      </div>
    )
  }

  const clamped = Math.min(index, recommendations.length - 1)
  const current = recommendations[clamped]
  const count = recommendations.length

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="label !text-gold-400">Field Investigation Report</p>
        {count > 1 && (
          <div className="flex items-center gap-2 text-xs text-mist-500">
            <button
              onClick={() => setIndex(i => (i - 1 + count) % count)}
              aria-label="Previous"
              className="rounded border border-ink-700 px-1.5 py-0.5 hover:text-gold-300"
            >
              ‹
            </button>
            <span>{clamped + 1} / {count}</span>
            <button
              onClick={() => setIndex(i => (i + 1) % count)}
              aria-label="Next"
              className="rounded border border-ink-700 px-1.5 py-0.5 hover:text-gold-300"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <RecommendationCardBody insight={current} />
    </div>
  )
}

// The Organize tab: the CODE method's Organize/Distill/Express stages collapsed into
// one cube-centric page, plus a one-tap Capture popup for anything new. Sorting
// happens by clicking any note on the cube and picking Distill or Move to in the
// action sheet; a distilled note can spin off tasks/packets right there instead of
// a separate Express page.
export default function Organize({ user }) {
  const router = useRouter()
  const [insights, setInsights] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const tag = typeof router.query.tag === 'string' ? router.query.tag : ''

  useEffect(() => {
    fetch('/api/mind/insights').then(r => r.json()).then(setInsights).catch(() => {})
  }, [])

  const goals = insights?.byKind?.inferred_goal || []
  const recommendations = insights?.byKind?.recommendation || []

  return (
    <Layout user={user}>
      {/* Tour overlays are self-contained full-screen mockups keyed by step, not tied
          to any real content on the page — all four CODE steps now route here. */}
      <TourOverlay step="capture" />
      <TourOverlay step="organize" />
      <TourOverlay step="distill" />
      <TourOverlay step="express" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label mb-2">Organize</p>
          <h1 className="font-serif text-4xl font-light text-mist-100">Sort, distill, act</h1>
        </div>
        <div className="flex items-center gap-2">
          {tag && (
            <button onClick={() => router.push('/')} className="chip">
              tag: {tag} ✕
            </button>
          )}
          <button onClick={() => setCapturing(true)} className="btn-primary">
            + Capture
          </button>
        </div>
      </div>

      <PARACube tag={tag} />

      <div className="mt-6">
        <MindMap />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GoalArrowChart goals={goals} />
        <FieldInvestigationReport recommendations={recommendations} />
      </div>

      {capturing && <CaptureModal onClose={() => setCapturing(false)} />}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
