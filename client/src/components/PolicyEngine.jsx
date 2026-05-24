import { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function PolicyEngine() {
  const { policies, triggeredAlerts, fetchPolicies, togglePolicy, createPolicy, deletePolicy } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    conditionType: 'error_rate',
    threshold: 5,
    severity: 'high',
    description: '',
  })

  useEffect(() => { fetchPolicies() }, [])

  const handleCreate = async () => {
    if (!newPolicy.name.trim()) return
    const condition = { type: newPolicy.conditionType }
    switch (newPolicy.conditionType) {
      case 'error_rate': condition.threshold = newPolicy.threshold; condition.windowMinutes = 60; break
      case 'session_idle': condition.thresholdMinutes = newPolicy.threshold; break
      case 'token_budget': condition.thresholdTokens = newPolicy.threshold * 1000000; break
      case 'cost_limit': condition.thresholdUsd = newPolicy.threshold; break
      case 'model_failure': condition.consecutiveFailures = newPolicy.threshold; break
    }
    await createPolicy({
      name: newPolicy.name,
      condition,
      action: { type: 'notify', severity: newPolicy.severity },
      description: newPolicy.description,
    })
    setNewPolicy({ name: '', conditionType: 'error_rate', threshold: 5, severity: 'high', description: '' })
    setShowCreate(false)
    fetchPolicies()
  }

  const conditionLabels = {
    error_rate: 'Error Rate',
    session_idle: 'Session Idle',
    token_budget: 'Token Budget',
    cost_limit: 'Cost Limit',
    model_failure: 'Model Failures',
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">🛡️ Intervention Policies</div>
        <div className="flex gap-2">
          {triggeredAlerts?.length > 0 && (
            <span className="badge badge--error text-[10px]">{triggeredAlerts.length} triggered</span>
          )}
          <button onClick={() => setShowCreate(!showCreate)} className="btn btn--primary text-xs">
            {showCreate ? '✕ Cancel' : '+ New Policy'}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="glass-panel p-3 space-y-2 animate-slide-in">
          <div className="text-xs font-medium text-gray-300 mb-1">New Policy</div>
          <input
            value={newPolicy.name}
            onChange={e => setNewPolicy({ ...newPolicy, name: e.target.value })}
            placeholder="Policy name..."
            className="input text-xs"
          />
          <div className="flex gap-2">
            <select
              value={newPolicy.conditionType}
              onChange={e => setNewPolicy({ ...newPolicy, conditionType: e.target.value })}
              className="input text-xs flex-1"
            >
              {Object.entries(conditionLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="number"
              value={newPolicy.threshold}
              onChange={e => setNewPolicy({ ...newPolicy, threshold: parseFloat(e.target.value) || 0 })}
              className="input text-xs w-24"
              placeholder="Threshold"
            />
            <select
              value={newPolicy.severity}
              onChange={e => setNewPolicy({ ...newPolicy, severity: e.target.value })}
              className="input text-xs w-24"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <input
            value={newPolicy.description}
            onChange={e => setNewPolicy({ ...newPolicy, description: e.target.value })}
            placeholder="Description..."
            className="input text-xs"
          />
          <button onClick={handleCreate} className="btn btn--primary text-xs w-full">Create Policy</button>
        </div>
      )}

      {/* Triggered Alerts */}
      {triggeredAlerts?.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-red-400 font-medium">Active Triggers</div>
          {triggeredAlerts.map((a, i) => (
            <div key={i} className="glass-panel p-2 bg-red-500/5 border-red-500/20 flex items-center gap-2">
              <span className="text-red-400">⚠️</span>
              <span className="text-xs text-red-300 font-medium">{a.policyName}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{a.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* Policy List */}
      <div className="space-y-2">
        {(policies || []).map((policy, i) => (
          <div key={policy.id || i} className="glass-panel p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`status-dot ${policy.enabled ? 'status-dot--active' : 'status-dot--pending'}`} />
                <span className="text-xs font-medium text-gray-200">{policy.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge text-[10px] ${
                  policy.action?.severity === 'high' ? 'badge--error' :
                  policy.action?.severity === 'medium' ? 'badge--idle' : 'badge--completed'
                }`}>
                  {policy.action?.severity || 'low'}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-gray-500 font-mono space-y-0.5 mb-2">
              <div>Condition: <span className="text-accent-400">{policy.condition?.type}</span>
                {policy.condition?.threshold && ` ≥ ${policy.condition.threshold}`}
                {policy.condition?.thresholdMinutes && ` ≥ ${policy.condition.thresholdMinutes}m`}
                {policy.condition?.thresholdTokens && ` ≥ ${(policy.condition.thresholdTokens / 1000000).toFixed(0)}M`}
                {policy.condition?.thresholdUsd && ` ≥ $${policy.condition.thresholdUsd}`}
                {policy.condition?.consecutiveFailures && ` ≥ ${policy.condition.consecutiveFailures}x`}
              </div>
              {policy.description && <div className="text-gray-600">{policy.description}</div>}
            </div>

            <div className="flex gap-2">
              <button
                onClick={async () => { await togglePolicy(policy.id); fetchPolicies() }}
                className={`btn text-xs ${policy.enabled ? 'btn--ghost' : 'btn--primary'}`}
              >
                {policy.enabled ? '⏸ Disable' : '▶ Enable'}
              </button>
              <button
                onClick={async () => { await deletePolicy(policy.id); fetchPolicies() }}
                className="btn btn--ghost text-xs text-red-400 hover:text-red-300"
              >
                🗑 Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
