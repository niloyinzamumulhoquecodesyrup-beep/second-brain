import Head from 'next/head'
import '../styles/globals.css'
import { TourProvider } from '../components/TourProvider'
import { ThemeProvider } from '../components/ThemeProvider'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Second Brain</title>
        <meta name="description" content="A private, connected knowledge system." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <ThemeProvider>
        <TourProvider>
          <Component {...pageProps} />
        </TourProvider>
      </ThemeProvider>
    </>
  )
}
