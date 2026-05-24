import { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function AlertsPanel() {
  const { alerts, fetchAlerts } = useStore()
  const [dismissed, setDismissed] = useState(new Set())

  useEffect(() => {
    fetchAlerts()
    // Auto-refresh every 30s
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [])

  const activeAlerts = (alerts?.alerts || []).filter(a => !dismissed.has(a.id))

  const handleDismiss = (id) => {
    setDismissed(prev => new Set([...prev, id]))
  }

  const severityConfig = {
    high: { icon: '🔴', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', badge: 'badge--error' },
    medium: { icon: '🟡', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', badge: 'badge--idle' },
    low: { icon: '🔵', bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-300', badge: 'badge--completed' },
  }

  return (
    <div className="space-y-3 h-full overflow-auto">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">🔔 Smart Alerts</div>
        <div className="flex gap-2">
          <span className="badge badge--error text-[10px]">{alerts?.summary?.high || 0} high</span>
          <span className="badge badge--idle text-[10px]">{alerts?.summary?.medium || 0} med</span>
          <span className="badge badge--completed text-[10px]">{alerts?.summary?.low || 0} low</span>
        </div>
      </div>

      {activeAlerts.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm text-gray-500">All systems nominal</div>
          <div className="text-xs text-gray-600 mt-1">No active alerts</div>
        </div>
      ) : (
        <div className="space-y-2">
          {activeAlerts.map((alert, i) => {
            const config = severityConfig[alert.severity] || severityConfig.low
            return (
              <div
                key={alert.id || i}
                className={`glass-panel p-3 ${config.bg} border ${config.border} animate-slide-in`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span>{config.icon}</span>
                    <span className={`text-xs font-semibold ${config.text}`}>{alert.title}</span>
                  </div>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="text-gray-600 hover:text-gray-300 text-xs transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="text-xs text-gray-400 mb-2">{alert.message}</div>

                {/* Details */}
                {alert.details && alert.details.length > 0 && (
                  <div className="space-y-0.5 mb-2">
                    {alert.details.map((d, j) => (
                      <div key={j} className="text-[10px] text-gray-500 font-mono truncate">
                        · {d}
                      </div>
                    ))}
                  </div>
                )}

                {/* Action suggestion */}
                {alert.actionable && alert.action && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-gray-500">Suggested:</span>
                    <span className={`text-[10px] ${config.text} font-medium`}>{alert.action}</span>
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-[10px] text-gray-600 mt-1.5 font-mono">
                  {formatTimeAgo(alert.timestamp)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Refresh button */}
      <div className="flex justify-center pt-2">
        <button onClick={fetchAlerts} className="btn btn--ghost text-xs">
          🔄 Refresh Alerts
        </button>
      </div>
    </div>
  )
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
