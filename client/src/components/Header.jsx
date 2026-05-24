import { useStore } from '../store'

export default function Header() {
  const { wsConnected, sessions, stats, topology } = useStore()
  
  const activeSessions = sessions.filter(s => s.status === 'active').length
  const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0)
  const totalCost = sessions.reduce((sum, s) => sum + (s.estimatedCost || 0), 0)

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-white/5 bg-surface-900/80 backdrop-blur-xl shrink-0">
      {/* Left - Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌀</span>
          <span className="font-semibold text-sm tracking-wide">OpenClaw Viz</span>
          <span className="text-xs text-gray-500 font-mono ml-1">v1.0</span>
        </div>
        
        <div className="h-4 w-px bg-white/10 mx-2" />
        
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-500">{wsConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Center - Quick Stats */}
      <div className="flex items-center gap-6">
        <StatBadge label="Agents" value={topology.nodes?.filter(n => n.type === 'agent').length || 1} color="text-indigo-400" />
        <StatBadge label="Sessions" value={sessions.length} color="text-sky-400" />
        <StatBadge label="Active" value={activeSessions} color="text-emerald-400" />
        <StatBadge label="Tokens" value={formatNumber(totalTokens)} color="text-amber-400" />
        <StatBadge label="Cost" value={`$${totalCost.toFixed(3)}`} color="text-rose-400" />
      </div>

      {/* Right - System */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {stats.cpuLoad && (
          <span className="font-mono">CPU: {stats.cpuLoad}</span>
        )}
        {stats.memory && (
          <span className="font-mono">MEM: {stats.memory}MB</span>
        )}
        <span className="font-mono text-gray-600">{stats.openclawVersion || 'v2026.5.7'}</span>
      </div>
    </header>
  )
}

function StatBadge({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold font-mono ${color}`}>{value}</span>
    </div>
  )
}

function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
