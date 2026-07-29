import Head from 'next/head'
import '../styles/globals.css'
import { TourProvider } from '../components/TourProvider'
import { ThemeProvider } from '../components/ThemeProvider'
import RouteLoader from '../components/RouteLoader'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Slay Task</title>
        <meta name="description" content="A private, connected knowledge system." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </Head>
      <RouteLoader />
      <ThemeProvider>
        <TourProvider>
          <Component {...pageProps} />
        </TourProvider>
      </ThemeProvider>
    </>
  )
}
