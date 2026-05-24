import { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function MultiUserPanel() {
  const { users, auditLog, fetchUsers, fetchAuditLog } = useStore()
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('viewer')

  useEffect(() => {
    fetchUsers()
    fetchAuditLog()
  }, [])

  const handleRegister = async () => {
    if (!newName.trim()) return
    const userId = newName.toLowerCase().replace(/\s+/g, '-')
    await useStore.getState().registerUser(userId, newName, newRole)
    setNewName('')
    fetchUsers()
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      {/* Online Users */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-gray-400">👥 Connected Users ({users?.total || 0})</div>
          <span className="badge badge--active text-[10px]">{users?.online || 0} online</span>
        </div>
        <div className="space-y-1.5">
          {(users?.users || []).map((u, i) => (
            <div key={i} className="glass-panel p-2.5 flex items-center gap-3">
              <div className={`status-dot ${u.online ? 'status-dot--active' : 'status-dot--idle'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-200">{u.name}</span>
                  <span className={`badge text-[10px] ${u.role === 'admin' ? 'badge--running' : 'badge--idle'}`}>
                    {u.role}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {u.online ? 'Active now' : `Last seen ${formatTimeAgo(u.lastSeen)}`}
                  {u.interventions > 0 && ` · ${u.interventions} interventions`}
                </div>
              </div>
            </div>
          ))}
          {(!users?.users || users.users.length === 0) && (
            <div className="text-gray-600 text-center py-4 text-xs">No registered users</div>
          )}
        </div>
      </div>

      {/* Register New User */}
      <div className="glass-panel p-3">
        <div className="text-xs font-medium text-gray-400 mb-2">Register User</div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="User name..."
            className="input text-xs flex-1"
            onKeyDown={e => e.key === 'Enter' && handleRegister()}
          />
          <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input text-xs w-24">
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={handleRegister} className="btn btn--primary text-xs shrink-0">Add</button>
        </div>
      </div>

      {/* Audit Log */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">📋 Audit Log</div>
        <div className="space-y-1 max-h-48 overflow-auto">
          {(auditLog || []).length === 0 ? (
            <div className="text-gray-600 text-center py-4 text-xs">No audit entries yet</div>
          ) : (
            auditLog.slice(0, 20).map((entry, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/3 text-xs">
                <span className="text-gray-600 font-mono text-[10px] w-16 shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-accent-400 font-medium w-16 truncate">{entry.userId}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  entry.action === 'intervene' ? 'bg-red-500/20 text-red-300' :
                  entry.action === 'steer' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-sky-500/20 text-sky-300'
                }`}>
                  {entry.action}
                </span>
                <span className="text-gray-400 truncate flex-1">{entry.target}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function formatTimeAgo(ts) {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
