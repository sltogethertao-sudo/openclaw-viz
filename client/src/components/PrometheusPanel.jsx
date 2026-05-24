import { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function PrometheusPanel() {
  const { prometheusMetrics, fetchPrometheusMetrics } = useStore()
  const [tab, setTab] = useState('raw')

  useEffect(() => { fetchPrometheusMetrics() }, [])

  const parsed = prometheusMetrics ? parseMetrics(prometheusMetrics) : {}

  return (
    <div className="space-y-4 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">📈 Prometheus / Grafana</div>
        <div className="flex gap-1">
          <button onClick={() => setTab('dashboard')} className={`btn text-[10px] ${tab === 'dashboard' ? 'btn--primary' : 'btn--ghost'}`}>Dashboard</button>
          <button onClick={() => setTab('raw')} className={`btn text-[10px] ${tab === 'raw' ? 'btn--primary' : 'btn--ghost'}`}>Raw</button>
        </div>
      </div>

      {tab === 'dashboard' && (
        <>
          {/* Overview Gauges */}
          <div className="grid grid-cols-3 gap-2">
            <div className="glass-panel p-3 text-center">
              <div className={`text-lg font-bold font-mono ${parsed.sessions_active > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                {parsed.sessions_active ?? '?'}
              </div>
              <div className="text-[10px] text-gray-500">Active Sessions</div>
            </div>
            <div className="glass-panel p-3 text-center">
              <div className="text-lg font-bold font-mono text-amber-400">{parsed.sessions_total ?? '?'}</div>
              <div className="text-[10px] text-gray-500">Total Sessions</div>
            </div>
            <div className="glass-panel p-3 text-center">
              <div className="text-lg font-bold font-mono text-rose-400">{parsed.errors_total ?? '?'}</div>
              <div className="text-[10px] text-gray-500">Total Errors</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="glass-panel p-3 text-center">
              <div className="text-sm font-bold font-mono text-indigo-400">{formatMetric(parsed.tokens_total)}</div>
              <div className="text-[10px] text-gray-500">Tokens Consumed</div>
            </div>
            <div className="glass-panel p-3 text-center">
              <div className="text-sm font-bold font-mono text-emerald-400">${parsed.cost_total?.toFixed(3) || '0'}</div>
              <div className="text-[10px] text-gray-500">Estimated Cost</div>
            </div>
          </div>

          {/* Per-Module Table */}
          {Object.keys(parsed.modules || {}).length > 0 && (
            <div className="glass-panel p-3">
              <div className="text-xs font-medium text-gray-300 mb-2">Module Breakdown</div>
              <div className="space-y-1">
                {Object.entries(parsed.modules).map(([mod, tokens]) => (
                  <div key={mod} className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-20 truncate">{mod}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-accent-500 rounded-full" style={{ width: `${(tokens / Math.max(...Object.values(parsed.modules))) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono w-20 text-right">{formatMetric(tokens)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grafana Embed Info */}
          <div className="glass-panel p-3">
            <div className="text-xs font-medium text-gray-300 mb-1">📊 Grafana Integration</div>
            <div className="text-[10px] text-gray-500 font-mono space-y-1">
              <div>Scrape URL: <span className="text-accent-400">http://localhost:3000/api/metrics/prometheus</span></div>
              <div>Format: <span className="text-emerald-400">OpenMetrics (Prometheus text)</span></div>
              <div className="mt-2 text-gray-600">Add this as a Prometheus scrape target in your grafana.yml:</div>
              <pre className="text-gray-600 bg-surface-800 p-2 rounded mt-1 overflow-x-auto">
{`scrape_configs:
  - job_name: 'openclaw-viz'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics/prometheus'`}</pre>
            </div>
            <div className="mt-3 space-y-2">
              <button
                onClick={async () => {
                  const res = await fetch('/api/grafana/dashboard')
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'openclaw-viz-grafana.json'
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="btn btn--primary text-xs w-full"
              >⬇ Export Grafana Dashboard JSON</button>
              <div className="text-[10px] text-gray-600 text-center">
                7 panels: Stats, Gauges, Bar Gauge, Time Series
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'raw' && (
        <pre className="glass-panel p-3 text-[10px] font-mono text-gray-400 overflow-auto max-h-96 whitespace-pre-wrap">
          {prometheusMetrics || 'Loading...'}
        </pre>
      )}
    </div>
  )
}

function parseMetrics(raw) {
  if (!raw) return {}
  const parsed = {}
  const lines = raw.split('\n').filter(l => !l.startsWith('#') && l.includes(' '))
  lines.forEach(line => {
    const [name, val] = line.split(' ')
    if (name?.includes('module_tokens')) {
      const match = name.match(/module="(\w+)"/)
      if (match) {
        if (!parsed.modules) parsed.modules = {}
        parsed.modules[match[1]] = parseFloat(val)
      }
    } else if (name === 'openclaw_viz_sessions_total') parsed.sessions_total = parseInt(val)
    else if (name === 'openclaw_viz_sessions_active') parsed.sessions_active = parseInt(val)
    else if (name === 'openclaw_viz_tokens_total') parsed.tokens_total = parseFloat(val)
    else if (name === 'openclaw_viz_cost_total') parsed.cost_total = parseFloat(val)
    else if (name === 'openclaw_viz_errors_total') parsed.errors_total = parseInt(val)
  })
  return parsed
}

function formatMetric(val) {
  if (!val || isNaN(val)) return '0'
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`
  return String(Math.round(val))
}
