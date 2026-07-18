import { useState } from 'react'
import Layout from '../components/Layout'
import OtherBrainsTab from '../components/OtherBrainsTab'
import MindcordTab from '../components/MindcordTab'
import { requireSessionSSR } from '../lib/pageAuth'

export default function OtherBrains({ user }) {
  const [tab, setTab] = useState('community')

  return (
    <Layout user={user}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Cross-account, anonymous</p>
          <h1 className="font-serif text-4xl font-light text-mist-100">MINDVERSE</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab('community')}
            className={`chip capitalize ${tab === 'community' ? 'border-emerald-400/50 text-emerald-300' : ''}`}
          >
            Other Brains
          </button>
          <button
            onClick={() => setTab('mindcord')}
            className={`chip capitalize ${tab === 'mindcord' ? 'border-orange-400/50 text-orange-300' : ''}`}
          >
            Mindcord
          </button>
        </div>
      </div>

      {tab === 'community' ? <OtherBrainsTab /> : <MindcordTab />}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
