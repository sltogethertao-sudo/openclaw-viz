import { useEffect } from 'react'
import { useStore } from '../store'

export default function RBACPanel() {
  const { rbacPermissions, currentRole, fetchRBAC } = useStore()

  useEffect(() => { fetchRBAC() }, [])

  const permissionColors = {
    view: 'text-sky-400', intervene: 'text-indigo-400', manage_cron: 'text-amber-400',
    manage_policies: 'text-rose-400', manage_users: 'text-emerald-400',
    replay: 'text-violet-400', export: 'text-cyan-400', delete: 'text-red-400',
    configure_cluster: 'text-orange-400', view_audit: 'text-pink-400',
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      <div className="text-xs font-medium text-gray-400">🛡️ RBAC Permission Matrix</div>

      {/* Current Role Badge */}
      <div className="glass-panel p-3 flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-400">Current Role:</span>
          <span className={`ml-2 text-sm font-semibold ${
            currentRole === 'admin' ? 'text-rose-400' :
            currentRole === 'operator' ? 'text-amber-400' : 'text-sky-400'
          }`}>{currentRole}</span>
        </div>
        <span className="badge badge--active text-[10px]">
          {rbacPermissions?.permissions ? 
            Object.values(rbacPermissions.permissions).filter(Boolean).length : 0
          }/10 permissions
        </span>
      </div>

      {/* Permission Grid */}
      <div className="grid grid-cols-2 gap-2">
        {rbacPermissions?.permissions && Object.entries(rbacPermissions.permissions).map(([key, allowed]) => {
          const label = {
            view: 'View Dashboard', intervene: 'Send Messages',
            manage_cron: 'Manage Cron', manage_policies: 'Manage Policies',
            manage_users: 'Manage Users', replay: 'Session Replay',
            export: 'Export Data', delete: 'Delete Resources',
            configure_cluster: 'Configure Clusters', view_audit: 'View Audit Log',
          }[key] || key

          return (
            <div key={key} className={`glass-panel p-2.5 border ${allowed ? 'border-emerald-500/20' : 'border-red-500/10'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-200 font-medium">{label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  allowed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                }`}>{allowed ? '✓' : '✗'}</span>
              </div>
              <div className="text-[10px] text-gray-600 font-mono mt-0.5">{key}</div>
            </div>
          )
        })}
      </div>

      {/* Role Hierarchy */}
      <div className="glass-panel p-3">
        <div className="text-xs font-medium text-gray-300 mb-2">Role Hierarchy</div>
        <div className="flex items-end gap-2 h-16">
          <div className="flex-1 bg-sky-500/20 rounded-t-lg border border-sky-500/30 text-center pt-2" style={{ height: '40%' }}>
            <div className="text-[10px] text-sky-300 font-medium">Viewer</div>
            <div className="text-[8px] text-sky-300/60">3 perms</div>
          </div>
          <div className="flex-1 bg-amber-500/20 rounded-t-lg border border-amber-500/30 text-center pt-4" style={{ height: '70%' }}>
            <div className="text-[10px] text-amber-300 font-medium">Operator</div>
            <div className="text-[8px] text-amber-300/60">6 perms</div>
          </div>
          <div className="flex-1 bg-rose-500/20 rounded-t-lg border border-rose-500/30 text-center pt-6" style={{ height: '100%' }}>
            <div className="text-[10px] text-rose-300 font-medium">Admin</div>
            <div className="text-[8px] text-rose-300/60">10 perms</div>
          </div>
        </div>
        <div className="flex justify-center mt-2 gap-2">
          <span className="text-[10px] text-gray-600">viewer ⊂ operator ⊂ admin</span>
        </div>
      </div>
    </div>
  )
}
