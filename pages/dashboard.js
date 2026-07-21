import { useState } from 'react'
import Layout from '../components/Layout'
import PomodoroWidget from '../components/PomodoroWidget'
import HowTodayLooks from '../components/HowTodayLooks'
import TasksPanel from '../components/TasksPanel'
import CaptureModal from '../components/CaptureModal'
import { requireSessionSSR } from '../lib/pageAuth'

// The Work tab: what's on today/this week/this month, a pomodoro clock, and a
// one-tap capture popup for anything that shows up mid-work. Organizing/distilling
// notes lives on the Organize tab now — this page is about doing the work itself.
export default function Work({ user }) {
  const [capturing, setCapturing] = useState(false)

  return (
    <Layout user={user}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2 !text-gold-400">Work</p>
          <h1 className="font-serif text-4xl font-light text-mist-100">What's on today</h1>
        </div>
        <button onClick={() => setCapturing(true)} className="btn-primary">
          + Capture
        </button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <HowTodayLooks />
          <PomodoroWidget />
        </div>

        <TasksPanel />
      </div>

      {capturing && <CaptureModal onClose={() => setCapturing(false)} />}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
