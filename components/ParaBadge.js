import { PARA_THEME } from '../lib/paraTheme'

export default function ParaBadge({ para }) {
  const theme = PARA_THEME[para] || PARA_THEME.resource
  return (
    <span className={`${theme.chip} capitalize`}>{para}</span>
  )
}
