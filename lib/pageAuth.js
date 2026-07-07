import { getSessionFromReq } from './auth'

export function requireSessionSSR(context) {
  const session = getSessionFromReq(context.req)
  if (!session) {
    return {
      redirect: { destination: '/login', permanent: false }
    }
  }
  return { props: { user: { email: session.email } } }
}
