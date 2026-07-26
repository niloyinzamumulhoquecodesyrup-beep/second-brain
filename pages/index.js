import { getSessionFromReq } from '../lib/auth'

// "/" is just the entry point -- Work is the actual home tab (see
// components/Layout.js's NAV_ITEMS), Organize lives at /organize.
export default function Index() {
  return null
}

export async function getServerSideProps(context) {
  const session = getSessionFromReq(context.req)
  return {
    redirect: { destination: session ? '/work' : '/login', permanent: false }
  }
}
