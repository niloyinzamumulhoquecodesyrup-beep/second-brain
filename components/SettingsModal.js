import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import PhotoCropModal from './PhotoCropModal'

function minToTime(min) {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToMin(str) {
  const [h, m] = str.split(':').map(Number)
  return h * 60 + m
}

export default function SettingsModal({ user, avatarVersion, onClose, onProfileUpdate }) {
  const router = useRouter()

  const [name, setName] = useState(user?.name || '')
  const [nameStatus, setNameStatus] = useState({ saving: false, error: '', success: false })

  const [showCropModal, setShowCropModal] = useState(false)
  const [photoStatus, setPhotoStatus] = useState({ working: false, error: '' })

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwStatus, setPwStatus] = useState({ saving: false, error: '', success: false })

  const [deactivatePassword, setDeactivatePassword] = useState('')
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)
  const [deactivateStatus, setDeactivateStatus] = useState({ working: false, error: '' })

  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [prefsStatus, setPrefsStatus] = useState({ saving: false, error: '', success: false })

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    fetch('/api/notification-prefs')
      .then(r => r.json())
      .then(p => {
        setQuietStart(minToTime(p.quiet_start_min))
        setQuietEnd(minToTime(p.quiet_end_min))
      })
      .catch(() => {})
  }, [])

  async function saveQuietHours(e) {
    e.preventDefault()
    setPrefsStatus({ saving: true, error: '', success: false })
    try {
      const res = await fetch('/api/notification-prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quiet_start_min: timeToMin(quietStart), quiet_end_min: timeToMin(quietEnd) })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setPrefsStatus({ saving: false, error: data.error || 'Could not save', success: false })
        return
      }
      setPrefsStatus({ saving: false, error: '', success: true })
    } catch {
      setPrefsStatus({ saving: false, error: 'Something went wrong', success: false })
    }
  }

  async function saveName(e) {
    e.preventDefault()
    setNameStatus({ saving: true, error: '', success: false })
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNameStatus({ saving: false, error: data.error || 'Could not save name', success: false })
        return
      }
      onProfileUpdate({ name: data.name })
      setNameStatus({ saving: false, error: '', success: true })
    } catch {
      setNameStatus({ saving: false, error: 'Something went wrong', success: false })
    }
  }

  async function removePhoto() {
    setPhotoStatus({ working: true, error: '' })
    try {
      const res = await fetch('/api/auth/avatar', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setPhotoStatus({ working: false, error: body.error || 'Could not remove photo' })
        return
      }
      onProfileUpdate({ hasAvatar: false, bumpAvatarVersion: true })
      setPhotoStatus({ working: false, error: '' })
    } catch {
      setPhotoStatus({ working: false, error: 'Something went wrong' })
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwStatus({ saving: false, error: 'New passwords do not match', success: false })
      return
    }
    setPwStatus({ saving: true, error: '', success: false })
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPwStatus({ saving: false, error: data.error || 'Could not change password', success: false })
        return
      }
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPwStatus({ saving: false, error: '', success: true })
    } catch {
      setPwStatus({ saving: false, error: 'Something went wrong', success: false })
    }
  }

  async function deactivate(e) {
    e.preventDefault()
    setDeactivateStatus({ working: true, error: '' })
    try {
      const res = await fetch('/api/auth/deactivate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: deactivatePassword })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeactivateStatus({ working: false, error: data.error || 'Could not deactivate account' })
        return
      }
      router.push('/login')
    } catch {
      setDeactivateStatus({ working: false, error: 'Something went wrong' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="label !text-emerald-300">Settings</p>
          <button onClick={onClose} className="text-mist-400 hover:text-mist-100" aria-label="Close">✕</button>
        </div>

        <div className="card space-y-8 p-7">
          <section className="space-y-4">
            <p className="text-xs uppercase tracking-wider text-mist-400">Edit profile</p>

            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-mist-500/50 bg-gradient-to-br from-violet-500/20 via-emerald-500/10 to-gold-500/20 text-sm font-medium text-mist-100">
                {user?.hasAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/auth/avatar${avatarVersion ? `?v=${avatarVersion}` : ''}`} alt="" className="h-full w-full object-cover" />
                ) : (
                  (name || user?.email || '?').slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCropModal(true)}
                    disabled={photoStatus.working}
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    Change photo
                  </button>
                  {user?.hasAvatar && (
                    <button
                      type="button"
                      onClick={removePhoto}
                      disabled={photoStatus.working}
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                    >
                      {photoStatus.working ? 'Working…' : 'Remove'}
                    </button>
                  )}
                </div>
                {photoStatus.error && <p className="text-xs text-red-400">{photoStatus.error}</p>}
              </div>
            </div>

            <form onSubmit={saveName} className="space-y-2">
              <label className="block text-xs uppercase tracking-wider text-mist-400">Display name</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={80}
                />
                <button type="submit" disabled={nameStatus.saving} className="btn-secondary !px-4 !py-2.5 text-xs shrink-0">
                  {nameStatus.saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {nameStatus.error && <p className="text-xs text-red-400">{nameStatus.error}</p>}
              {nameStatus.success && <p className="text-xs text-emerald-400">Saved.</p>}
              <p className="text-xs text-mist-400">Account email: {user?.email}</p>
            </form>
          </section>

          <section className="space-y-2 border-t border-ink-700 pt-6">
            <p className="text-xs uppercase tracking-wider text-mist-400">Change password</p>
            <form onSubmit={savePassword} className="space-y-3">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                placeholder="Current password"
                required
              />
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="New password"
                required
              />
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={pwForm.confirmPassword}
                onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                required
              />
              {pwStatus.error && <p className="text-xs text-red-400">{pwStatus.error}</p>}
              {pwStatus.success && <p className="text-xs text-emerald-400">Password updated.</p>}
              <button type="submit" disabled={pwStatus.saving} className="btn-secondary w-full !py-2 text-xs">
                {pwStatus.saving ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </section>

          <section className="space-y-3 border-t border-ink-700 pt-6">
            <p className="text-xs uppercase tracking-wider text-mist-400">Notifications</p>
            <p className="text-xs text-mist-400">Quiet hours — no nudges fire during this window; they just wait until it ends.</p>
            <form onSubmit={saveQuietHours} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1.5 block text-xs text-mist-400">From</label>
                <input className="input !w-auto" type="time" value={quietStart} onChange={e => setQuietStart(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-mist-400">To</label>
                <input className="input !w-auto" type="time" value={quietEnd} onChange={e => setQuietEnd(e.target.value)} />
              </div>
              <button type="submit" disabled={prefsStatus.saving} className="btn-secondary !px-4 !py-2.5 text-xs">
                {prefsStatus.saving ? 'Saving…' : 'Save'}
              </button>
            </form>
            {prefsStatus.error && <p className="text-xs text-red-400">{prefsStatus.error}</p>}
            {prefsStatus.success && <p className="text-xs text-emerald-400">Saved.</p>}
          </section>

          <section className="space-y-2 border-t border-ink-700 pt-6">
            <p className="text-xs uppercase tracking-wider text-red-400">Deactivate account</p>
            <p className="text-xs text-mist-400">
              This signs you out and blocks login. Your data is kept, but you won't be able to access it. Contact support to reactivate.
            </p>
            {!confirmingDeactivate ? (
              <button
                type="button"
                onClick={() => setConfirmingDeactivate(true)}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 hover:border-red-400/60"
              >
                Deactivate my account
              </button>
            ) : (
              <form onSubmit={deactivate} className="space-y-2">
                <input
                  className="input"
                  type="password"
                  value={deactivatePassword}
                  onChange={e => setDeactivatePassword(e.target.value)}
                  placeholder="Enter your password to confirm"
                  required
                />
                {deactivateStatus.error && <p className="text-xs text-red-400">{deactivateStatus.error}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={deactivateStatus.working}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 hover:border-red-400/60"
                  >
                    {deactivateStatus.working ? 'Deactivating…' : 'Confirm deactivation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmingDeactivate(false); setDeactivatePassword(''); setDeactivateStatus({ working: false, error: '' }) }}
                    className="btn-secondary !px-4 !py-2 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>

      {showCropModal && (
        <PhotoCropModal
          onClose={() => setShowCropModal(false)}
          onUploaded={patch => {
            onProfileUpdate(patch)
            setPhotoStatus({ working: false, error: '' })
          }}
        />
      )}
    </div>
  )
}
