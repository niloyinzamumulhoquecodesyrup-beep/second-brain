import { Html, Head, Main, NextScript } from 'next/document'

// Runs before first paint (blocking, in <head>) so the site never flashes the wrong
// theme — reads the same localStorage key ThemeProvider writes to, falling back to
// the OS preference, and stamps data-theme on <html> before any CSS is applied.
const THEME_INIT = `
(function () {
  try {
    var stored = localStorage.getItem('sb_theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`

export default function Document() {
  return (
    <Html>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
