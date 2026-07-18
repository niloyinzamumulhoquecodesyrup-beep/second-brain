import Layout from '../components/Layout'
import OtherBrainsTab from '../components/OtherBrainsTab'
import { requireSessionSSR } from '../lib/pageAuth'

export default function OtherBrains({ user }) {
  return (
    <Layout user={user}>
      <div className="mb-8">
        <p className="label mb-2">Cross-account, anonymous</p>
        <h1 className="font-serif text-4xl font-light text-mist-100">Other Brains</h1>
      </div>
      <OtherBrainsTab />
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
