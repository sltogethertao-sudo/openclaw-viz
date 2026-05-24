import { useStore } from '../store'
import { useState, useEffect } from 'react'

export default function StatusBar() {
  const { wsConnected, sessions, stats, topology } = useStore()
  const [rateLimit, setRateLimit] = useState(null)

  useEffect(() => {
    fetch('/api/ratelimit/status')
      .then(r => r.json())
      .then(d => setRateLimit(d))
      .catch(() => {})
  }, [])

  const activeSessions = sessions.filter(s => s.status === 'active').length
  const nodeCount = topology.nodes?.length || 0
  const edgeCount = topology.edges?.length || 0

  return (
    <footer className="h-6 flex items-center justify-between px-4 border-t border-white/5 bg-surface-900/80 text-[10px] text-gray-500 font-mono shrink-0">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {wsConnected ? 'WS Connected' : 'WS Disconnected'}
        </span>
        <span>{nodeCount} nodes · {edgeCount} edges</span>
        <span>{sessions.length} sessions ({activeSessions} active)</span>
      </div>
      
      <div className="flex items-center gap-4">
        {stats.cpuLoad && <span>CPU: {stats.cpuLoad}</span>}
        {stats.memory && <span>MEM: {stats.memory}MB</span>}
        {rateLimit && (
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-accent-400" />
            {rateLimit.current.count}/{rateLimit.limits.requestsPerMinute}
          </span>
        )}
        <span>Node {stats.nodeVersion || 'v24'}</span>
        <span>OpenClaw {stats.openclawVersion || 'v2026.5.7'}</span>
      </div>
    </footer>
  )
}
