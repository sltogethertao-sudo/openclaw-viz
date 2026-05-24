import { useEffect } from 'react'
import { useStore } from '../store'

export default function MetricsPanel() {
  const { metrics, fetchMetrics } = useStore()

  useEffect(() => {
    fetchMetrics()
  }, [])

  if (!metrics) {
    return <div className="text-gray-600 text-center py-4 text-sm">Loading metrics...</div>
  }

  const { overview, modules, hourlyTokens, recentErrors } = metrics

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-2">
        <MetricCard label="Total Sessions" value={overview.totalSessions} color="text-sky-400" />
        <MetricCard label="Active" value={overview.activeSessions} color="text-emerald-400" />
        <MetricCard label="Total Tokens" value={formatNumber(overview.totalTokens)} color="text-amber-400" />
        <MetricCard label="Total Cost" value={`$${overview.totalCost?.toFixed(3)}`} color="text-rose-400" />
        <MetricCard label="Modules" value={overview.moduleCount} color="text-indigo-400" />
        <MetricCard label="Error Rate" value={`${overview.errorRate}%`} color={overview.errorRate > 10 ? 'text-red-400' : 'text-gray-400'} />
        <MetricCard label="Avg Response" value={overview.avgResponseTime ? `${overview.avgResponseTime}ms` : 'N/A'} color="text-cyan-400" />
        <MetricCard label="Uptime" value="~14d" color="text-gray-400" />
      </div>

      {/* Module Breakdown */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">Module Performance</div>
        <div className="space-y-1">
          {modules.map(mod => (
            <div key={mod.module} className="glass-panel p-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-200">{mod.module}</span>
                  {mod.activeCount > 0 && (
                    <span className="badge badge--active text-[10px]">{mod.activeCount} active</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                  {mod.sessionCount} sessions · {formatNumber(mod.totalTokens)} tokens · ${mod.totalCost?.toFixed(4)}
                </div>
              </div>
              
              {/* Token bar */}
              <div className="w-24 shrink-0">
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-500 rounded-full"
                    style={{ width: `${Math.min(100, (mod.totalTokens / overview.totalTokens) * 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-600 text-right mt-0.5">
                  {((mod.totalTokens / overview.totalTokens) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly Token Trend */}
      {Object.keys(hourlyTokens).length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-400 mb-2">Token Activity (Hourly)</div>
          <div className="glass-panel p-3">
            <TokenChart data={hourlyTokens} />
          </div>
        </div>
      )}

      {/* Recent Errors */}
      {recentErrors.length > 0 && (
        <div>
          <div className="text-xs font-medium text-red-400 mb-2">Recent Errors ({recentErrors.length})</div>
          <div className="space-y-1 max-h-32 overflow-auto">
            {recentErrors.map((err, i) => (
              <div key={i} className="text-[10px] font-mono text-red-300/70 bg-red-500/5 p-1.5 rounded truncate">
                {err.message?.substring(0, 120)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, color }) {
  return (
    <div className="glass-panel p-2 text-center">
      <div className={`text-sm font-semibold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function TokenChart({ data }) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return null

  const maxVal = Math.max(...entries.map(([, v]) => v))
  const chartHeight = 48

  return (
    <div className="flex items-end gap-px" style={{ height: chartHeight }}>
      {entries.map(([hour, tokens], i) => {
        const height = maxVal > 0 ? (tokens / maxVal) * chartHeight : 0
        const timeLabel = hour.split('T')[1] + ':00'
        return (
          <div
            key={i}
            className="flex-1 bg-accent-500/40 rounded-t hover:bg-accent-500/60 transition-colors relative group cursor-pointer"
            style={{ height: Math.max(2, height), minWidth: 3 }}
            title={`${timeLabel}: ${formatNumber(tokens)} tokens`}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block tooltip whitespace-nowrap text-[10px]">
              {timeLabel}: {formatNumber(tokens)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatNumber(n) {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}
