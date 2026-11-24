import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Delete, ShieldCheck, User as UserIcon } from 'lucide-react'
import type { User } from '@shared/types'
import { api, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'
import { TitleBar, Logo } from '@/components/Shell'
import { Spinner } from '@/components/Overlays'
import { useT } from '@/lib/i18n'

export function Login() {
  const t = useT()
  const me = useApp((s) => s.user)
  const login = useApp((s) => s.login)
  const storeName = useApp((s) => s.settings.storeName)
  const nav = useNavigate()
  const [users, setUsers] = useState<User[] | null>(null)
  const [sel, setSel] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    unwrap(api.auth.users())
      .then((u) => {
        setUsers(u)
        if (u.length === 1) setSel(u[0])
      })
      .catch((e) => setErr(String(e.message)))
  }, [])

  const submit = async (p: string): Promise<void> => {
    if (!sel || busy) return
    setBusy(true)
    try {
      await login(sel.id, p)
      nav('/')
    } catch (e) {
      setErr((e as Error).message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const press = (d: string): void => {
    setErr('')
    const next = (pin + d).slice(0, 8)
    setPin(next)
    if (next.length === 4) void submit(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!sel) return
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter' && pin.length >= 4) void submit(pin)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (me) return <Navigate to="/" replace />

  return (
    <div className="h-full flex flex-col">
      <TitleBar />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="card w-full max-w-4xl grid grid-cols-2 overflow-hidden animate-pop">
          <div className="bg-teal text-white p-10 flex flex-col">
            <div className="bg-white/95 rounded-2xl p-3 self-start">
              <Logo />
            </div>
            <h1 className="text-3xl font-extrabold mt-10 leading-tight">
              {t('Welcome back to')}
              <br />
              {storeName}
            </h1>
            <p className="text-white/75 mt-3">{t('Pick your name and enter your PIN to start selling.')}</p>
            <div className="mt-auto grid gap-2">
              {users === null ? (
                <Spinner />
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSel(u)
                      setPin('')
                      setErr('')
                    }}
                    className={`flex items-center gap-3 min-h-14 px-4 rounded-2xl text-left font-semibold transition active:scale-[0.98] ${
                      sel?.id === u.id ? 'bg-yellow text-on-yellow' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {u.role === 'admin' ? <ShieldCheck size={20} /> : <UserIcon size={20} />}
                    <span className="flex-1">{u.name}</span>
                    <span className="text-xs uppercase tracking-wider opacity-70">{t(u.role === 'admin' ? 'Admin' : 'Cashier')}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="p-10 flex flex-col items-center">
            <div className="text-muted font-semibold">{sel ? t('PIN for {name}', { name: sel.name }) : t('Select a user')}</div>
            <div className={`flex gap-4 my-6 ${err ? 'animate-pop' : ''}`} aria-label={t('PIN digits entered')}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`w-5 h-5 rounded-full transition ${i < pin.length ? 'bg-teal scale-110' : 'bg-line'}`} />
              ))}
            </div>
            <div className="h-6 text-rose-600 font-semibold text-sm" role="alert">
              {err}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} className="btn-ghost w-20 h-16 text-2xl" disabled={!sel || busy} onClick={() => press(d)}>
                  {d}
                </button>
              ))}
              <span />
              <button className="btn-ghost w-20 h-16 text-2xl" disabled={!sel || busy} onClick={() => press('0')}>
                0
              </button>
              <button className="btn-ghost w-20 h-16" disabled={!sel || !pin} onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t('Delete digit')}>
                <Delete />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
