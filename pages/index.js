import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import ParaBadge from '../components/ParaBadge'
import MetricPeaksChart from '../components/MetricPeaksChart'
import { requireSessionSSR } from '../lib/pageAuth'

export default function Dashboard({ user }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => {
        setStats(data)
        setLoading(false)
      })
  }, [])

  async function completeTask(task) {
    setStats(prev => ({
      ...prev,
      openTasks: prev.openTasks.filter(t => t.id !== task.id),
      tasksOpen: prev.tasksOpen - 1,
      tasksDone: prev.tasksDone + 1
    }))
    await fetch('/api/tasks/' + task.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: true })
    })
  }

  return (
    <Layout user={user}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Overview</p>
          <h1 className="font-serif text-4xl font-light text-mist-100">
            Welcome back{user?.email ? <>, <span className="text-gradient">{user.email.split('@')[0]}</span></> : ''}
          </h1>
        </div>
        <Link href="/capture" className="btn-primary">
          + Capture something
        </Link>
      </div>

      {loading && <p className="text-mist-400">Loading your second brain…</p>}

      {stats && (
        <>
          {stats.para.inbox > 0 && (
            <Link
              href="/organize"
              className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 transition hover:border-rose-400/50"
            >
              <span className="text-sm text-rose-200">
                <strong className="text-rose-300">{stats.para.inbox}</strong> {stats.para.inbox === 1 ? 'item is' : 'items are'} waiting in your Inbox — a five-minute weekly review keeps it from piling up.
              </span>
              <span className="whitespace-nowrap text-sm text-rose-300">Process it →</span>
            </Link>
          )}

          <MetricPeaksChart stats={stats} />

          <div className="card mb-10 p-6">
            <div className="mb-5 flex items-center justify-between">
              <p className="label">Open tasks</p>
              <Link href="/express" className="btn-ghost">
                View all →
              </Link>
            </div>
            {stats.openTasks.length === 0 ? (
              <p className="text-sm text-mist-400">Nothing open. Add the next small step on a project in Express.</p>
            ) : (
              <div className="divide-y divide-ink-700">
                {stats.openTasks.map(t => {
                  const overdue = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())
                  return (
                    <div key={t.id} className="flex items-start gap-3 py-3">
                      <input type="checkbox" checked={false} onChange={() => completeTask(t)} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-mist-100">{t.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist-500">
                          {t.note_title && (
                            <Link href={`/notes/${t.note_id}`} className="hover:text-emerald-300">↳ {t.note_title}</Link>
                          )}
                          {t.due_date && (
                            <span className={overdue ? 'text-red-400' : ''}>
                              due {new Date(t.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card p-6 lg:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <p className="label">Recent captures</p>
                <Link href="/organize" className="btn-ghost">
                  View all →
                </Link>
              </div>
              {stats.recent.length === 0 ? (
                <p className="text-sm text-mist-400">Nothing captured yet. Start with your last 24 hours of ideas.</p>
              ) : (
                <div className="divide-y divide-ink-700">
                  {stats.recent.map(n => (
                    <Link
                      key={n.id}
                      href={`/notes/${n.id}`}
                      className="flex items-center justify-between gap-4 py-3 transition hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-mist-100">{n.title}</p>
                        <p className="text-xs text-mist-400">{new Date(n.created_at).toLocaleDateString()}</p>
                      </div>
                      <ParaBadge para={n.para} />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-6">
              <p className="label mb-5">Top tags</p>
              {stats.topTags.length === 0 ? (
                <p className="text-sm text-mist-400">Tag your captures to see patterns emerge here.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {stats.topTags.map(t => (
                    <Link key={t.tag} href={`/organize?tag=${encodeURIComponent(t.tag)}`} className="chip hover:border-emerald-400/50 hover:text-emerald-300">
                      {t.tag} <span className="ml-1 text-mist-500">{t.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
