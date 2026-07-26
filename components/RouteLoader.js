import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'

// A thin top-of-viewport progress bar for page transitions (getServerSideProps
// pages, e.g. clicking between tabs or the / -> /work redirect, have no visual
// feedback otherwise). Creeps toward 90% while a navigation is in flight, then
// snaps to 100% and fades out on completion -- the classic NProgress shape,
// without the dependency.
export default function RouteLoader() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const creepRef = useRef(null)
  const hideTimeoutRef = useRef(null)

  useEffect(() => {
    function start() {
      clearInterval(creepRef.current)
      clearTimeout(hideTimeoutRef.current)
      setVisible(true)
      setProgress(8)
      document.body.style.cursor = 'progress'
      creepRef.current = setInterval(() => {
        setProgress(p => (p < 90 ? p + (90 - p) * 0.1 : p))
      }, 200)
    }
    function done() {
      clearInterval(creepRef.current)
      setProgress(100)
      document.body.style.cursor = ''
      hideTimeoutRef.current = setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 200)
    }

    router.events.on('routeChangeStart', start)
    router.events.on('routeChangeComplete', done)
    router.events.on('routeChangeError', done)
    return () => {
      router.events.off('routeChangeStart', start)
      router.events.off('routeChangeComplete', done)
      router.events.off('routeChangeError', done)
      clearInterval(creepRef.current)
      clearTimeout(hideTimeoutRef.current)
      document.body.style.cursor = ''
    }
  }, [router])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent">
      <div
        className="h-full bg-emerald-400 shadow-[0_0_8px_rgb(var(--emerald-400))] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
