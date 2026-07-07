const STYLES = {
  project: 'border-emerald-400/40 text-emerald-300',
  area: 'border-violet-400/40 text-violet-300',
  resource: 'border-gold-400/40 text-gold-400',
  archive: 'border-mist-400/30 text-mist-400'
}

export default function ParaBadge({ para }) {
  const cls = STYLES[para] || STYLES.resource
  return (
    <span className={`chip border ${cls} capitalize`}>{para}</span>
  )
}
