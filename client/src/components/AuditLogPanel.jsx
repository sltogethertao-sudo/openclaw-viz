import { useEffect } from 'react'
import { useStore } from '../store'

export default function AuditLogPanel() {
  const { immutableAudit, auditIntegrity, fetchImmutableAudit, fetchAuditIntegrity, exportAuditCSV } = useStore()

  useEffect(() => { fetchImmutableAudit(); fetchAuditIntegrity() }, [])

  return (
    <div className="space-y-4 h-full overflow-auto">
      {/* V4.1: Session Audit Export */}
      <div className="glass-panel p-3">
        <div className="text-xs font-medium text-gray-300 mb-2">📄 Session Audit Export</div>
        <div className="text-[10px] text-gray-500 mb-2">Export detailed audit report for the current session with message metadata.</div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const res = await fetch('/api/audit/session/agent%3Amain%3Amain?format=json')
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'session-audit.json'; a.click()
              URL.revokeObjectURL(url)
            }}
            className="btn btn--ghost text-xs"
          >⬇ JSON</button>
          <button
            onClick={async () => {
              const res = await fetch('/api/audit/session/agent%3Amain%3Amain?format=csv')
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'session-audit.csv'; a.click()
              URL.revokeObjectURL(url)
            }}
            className="btn btn--ghost text-xs"
          >⬇ CSV</button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">📋 Immutable Audit Trail</div>
        <button onClick={exportAuditCSV} className="btn btn--ghost text-xs">⬇ CSV Export</button>
      </div>

      {/* Integrity Status */}
      {auditIntegrity && (
        <div className="glass-panel p-3 flex items-center gap-3">
          <span className={auditIntegrity.valid > 0 ? 'text-emerald-400' : 'text-gray-500'}>🔒</span>
          <div className="flex-1">
            <div className="text-xs text-gray-300">
              {auditIntegrity.valid} verified entries
              {auditIntegrity.invalid > 0 && (
                <span className="text-red-400 ml-2">⚠ {auditIntegrity.invalid} tampered!</span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 font-mono">
              Hash: SHA-256 based · File size: {(auditIntegrity.fileSize || 0) / 1024}KB
            </div>
          </div>
          {auditIntegrity.valid > 0 && <span className="badge badge--completed text-[10px]">Verified</span>}
        </div>
      )}

      {/* Audit Entries */}
      <div className="space-y-1 max-h-96 overflow-auto">
        {immutableAudit.length === 0 ? (
          <div className="text-gray-600 text-center py-6 text-sm">No audit entries yet</div>
        ) : (
          immutableAudit.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/3">
              <span className="text-gray-600 font-mono text-[10px] w-14 shrink-0 mt-0.5">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                entry.action === 'login' ? 'bg-sky-500/20 text-sky-300' :
                entry.action === 'intervene' ? 'bg-red-500/20 text-red-300' :
                entry.action === 'steer' ? 'bg-indigo-500/20 text-indigo-300' :
                entry.action === 'export' ? 'bg-emerald-500/20 text-emerald-300' :
                'bg-amber-500/20 text-amber-300'
              }`}>{entry.action}</span>
              <span className="text-xs text-accent-400 font-medium w-16 truncate">{entry.userId}</span>
              <span className="text-xs text-gray-400 truncate flex-1">{entry.target}</span>
              <span className="text-[8px] text-gray-600 font-mono shrink-0" title="Hash">{entry._hash?.substring(0, 8)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
