import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import ParaBadge from '../components/ParaBadge'
import { requireSessionSSR } from '../lib/pageAuth'

const PARA_LABELS = {
  project: 'Projects',
  area: 'Areas',
  resource: 'Resources',
  archive: 'Archives'
}

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

  return (
    <Layout user={user}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Overview</p>
          <h1 className="font-serif text-4xl font-light text-white">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
        </div>
        <Link href="/capture" className="btn-primary">
          + Capture something
        </Link>
      </div>

      {loading && <p className="text-mist-400">Loading your second brain…</p>}

      {stats && (
        <>
          <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {['project', 'area', 'resource', 'archive'].map(key => (
              <div key={key} className="card p-5">
                <p className="label mb-2">{PARA_LABELS[key]}</p>
                <p className="font-serif text-4xl font-light text-white">{stats.para[key] ?? 0}</p>
              </div>
            ))}
          </div>

          <div className="mb-10 grid gap-4 md:grid-cols-3">
            <div className="card p-5">
              <p className="label mb-2">Knowledge assets</p>
              <p className="font-serif text-3xl font-light text-white">{stats.totalNotes}</p>
              <p className="mt-1 text-xs text-mist-400">total captures</p>
            </div>
            <div className="card p-5">
              <p className="label mb-2">Distilled</p>
              <p className="font-serif text-3xl font-light text-white">{stats.distilled}</p>
              <p className="mt-1 text-xs text-mist-400">refined to their essence</p>
            </div>
            <div className="card p-5">
              <p className="label mb-2">Connections</p>
              <p className="font-serif text-3xl font-light text-white">{stats.links}</p>
              <p className="mt-1 text-xs text-mist-400">note-to-note links · {stats.packets} packets shipped</p>
            </div>
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
