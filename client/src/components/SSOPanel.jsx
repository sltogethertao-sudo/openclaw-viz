import { useState } from 'react'
import { useStore } from '../store'

export default function SSOPanel() {
  const { authUser, authToken, currentRole, login, logout } = useStore()
  const [form, setForm] = useState({ userId: '', name: '', role: 'viewer' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async () => {
    if (!form.userId || !form.name) return
    setLoading(true)
    setError(null)
    const res = await login(form.userId, form.name, form.role)
    if (res.error) setError(res.error)
    setLoading(false)
  }

  const copyToken = () => {
    if (authToken) navigator.clipboard.writeText(authToken)
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      <div className="text-xs font-medium text-gray-400">🔐 Authentication & SSO</div>

      {!authUser ? (
        <div className="glass-panel p-4 space-y-3">
          <div className="text-sm font-medium text-gray-200">Login</div>
          <input value={form.userId} onChange={e => setForm({...form, userId: e.target.value})} placeholder="User ID" className="input text-xs" />
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Display Name" className="input text-xs" />
          <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="input text-xs">
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button onClick={handleLogin} disabled={loading} className="btn btn--primary w-full text-xs">
            {loading ? '⏳...' : '🔐 Sign In'}
          </button>
          <div className="text-[10px] text-gray-600 text-center">
            Local JWT auth · No external provider configured
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* User Info */}
          <div className="glass-panel p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-accent-600 flex items-center justify-center text-lg font-bold">
                {authUser.name?.[0] || '?'}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-200">{authUser.name}</div>
                <div className="text-xs text-gray-500">{authUser.id}</div>
              </div>
              <span className={`badge ml-auto ${
                currentRole === 'admin' ? 'badge--running' : currentRole === 'operator' ? 'badge--idle' : 'badge--completed'
              }`}>{currentRole}</span>
            </div>

            <div className="space-y-1 text-[10px] text-gray-500 font-mono">
              <div>Signed in with local JWT</div>
              {authToken && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-600">Token:</span>
                  <code className="flex-1 truncate bg-surface-800 px-2 py-1 rounded text-[10px]">{authToken.substring(0, 50)}...</code>
                  <button onClick={copyToken} className="text-accent-400 hover:text-accent-300">📋</button>
                </div>
              )}
            </div>
          </div>

          {/* V4.1: OIDC SSO Configuration */}
          <div className="glass-panel p-3">
            <div className="text-xs font-medium text-gray-300 mb-2">🔗 OIDC SSO Providers</div>
            <div className="space-y-2">
              {['google', 'github', 'microsoft'].map(p => (
                <div key={p} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5">
                  <span className="text-xs text-gray-300 flex-1 capitalize">{p}</span>
                  <span className="badge badge--idle text-[10px]">Not Configured</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-gray-500 space-y-1">
              <div>Configure credentials in:</div>
              <code className="text-accent-400 bg-surface-800 px-2 py-0.5 rounded">~/.openclaw/viz-sso.json</code>
              <div className="mt-1">Redirect URI:</div>
              <code className="text-accent-400 bg-surface-800 px-2 py-0.5 rounded block text-[9px]">http://localhost:3000/api/auth/google/callback</code>
            </div>
            <button
              onClick={async () => {
                const res = await fetch('/api/auth/google')
                const data = await res.json()
                if (data.redirectUrl) window.open(data.redirectUrl, '_blank')
                else alert('Google SSO not configured. Set up viz-sso.json first.')
              }}
              className="btn btn--ghost text-xs w-full mt-2"
            >🔑 Test Google Login</button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={logout} className="btn btn--danger text-xs flex-1">🚪 Sign Out</button>
          </div>
        </div>
      )}
    </div>
  )
}
