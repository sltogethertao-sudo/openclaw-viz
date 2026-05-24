import { useEffect } from 'react'
import { useStore } from '../store'

export default function ABTestPanel() {
  const { abTest, fetchABTest } = useStore()

  useEffect(() => { fetchABTest() }, [])

  if (!abTest) return <div className="text-gray-600 text-center py-8 text-sm">Loading comparison data...</div>

  const { models, channels, modules, timeComparison } = abTest

  return (
    <div className="space-y-4 h-full overflow-auto">
      <div className="text-xs font-medium text-gray-400">🔬 A/B Test Comparison</div>

      {/* Time Comparison */}
      <div className="glass-panel p-3">
        <div className="text-xs font-medium text-gray-300 mb-3">📊 This Week vs Last Week</div>
        <div className="grid grid-cols-3 gap-3">
          <CompareMetric
            label="Sessions"
            current={timeComparison.thisWeek.sessions}
            previous={timeComparison.lastWeek.sessions}
          />
          <CompareMetric
            label="Tokens"
            current={timeComparison.thisWeek.tokens}
            previous={timeComparison.lastWeek.tokens}
            format="number"
          />
          <CompareMetric
            label="Cost"
            current={timeComparison.thisWeek.cost}
            previous={timeComparison.lastWeek.cost}
            format="usd"
          />
        </div>
      </div>

      {/* Model Comparison */}
      {models.length > 0 && (
        <div className="glass-panel p-3">
          <div className="text-xs font-medium text-gray-300 mb-3">🤖 Model Performance</div>
          <div className="space-y-2">
            {models.map((m, i) => {
              const errorRate = m.calls > 0 ? ((m.errors / m.calls) * 100).toFixed(1) : 0
              const successRate = m.calls > 0 ? ((m.successes / m.calls) * 100).toFixed(1) : 0
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-200 font-medium truncate">{m.model}</div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      {m.calls} calls · {successRate}% success
                    </div>
                  </div>
                  <div className="w-24">
                    <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                      <div className="bg-emerald-500" style={{ width: `${successRate}%` }} />
                      <div className="bg-red-500" style={{ width: `${errorRate}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-emerald-400">{successRate}%</span>
                      <span className="text-red-400">{errorRate}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Channel Comparison */}
      <div className="glass-panel p-3">
        <div className="text-xs font-medium text-gray-300 mb-3">📡 Channel Breakdown</div>
        <div className="space-y-2">
          {channels.map((ch, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-200 font-medium">{ch.channel}</span>
                  {ch.active > 0 && <span className="badge badge--active text-[10px]">{ch.active} active</span>}
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {ch.sessions} sessions · {formatNumber(ch.tokens)} tokens · ${ch.cost?.toFixed(4)}
                </div>
              </div>
              <div className="w-20">
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-accent-500 rounded-full"
                    style={{ width: `${Math.min(100, (ch.tokens / Math.max(...channels.map(c => c.tokens))) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Module Comparison */}
      <div className="glass-panel p-3">
        <div className="text-xs font-medium text-gray-300 mb-3">📦 Module Comparison</div>
        <div className="space-y-2">
          {modules.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-200 font-medium">{m.module}</div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {m.sessions} sessions · avg {formatNumber(m.avgTokens)} tokens/session · ${m.cost?.toFixed(4)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono text-gray-300">{formatNumber(m.tokens)}</div>
                <div className="text-[10px] text-gray-600">total</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CompareMetric({ label, current, previous, format = 'raw' }) {
  const change = previous > 0 ? (((current - previous) / previous) * 100).toFixed(1) : null
  const isUp = change > 0
  const fmtVal = (v) => {
    if (format === 'number') return formatNumber(v)
    if (format === 'usd') return `$${v?.toFixed(3)}`
    return String(v)
  }

  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-semibold font-mono text-gray-200">{fmtVal(current)}</div>
      <div className="text-[10px] text-gray-500 font-mono">vs {fmtVal(previous)}</div>
      {change !== null && (
        <div className={`text-[10px] font-mono mt-0.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUp ? '▲' : '▼'} {Math.abs(change)}%
        </div>
      )}
    </div>
  )
}

function formatNumber(n) {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}
