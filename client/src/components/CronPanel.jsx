import { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function CronPanel() {
  const { cronJobs, cronRuns, fetchCronJobs, toggleCronJob, triggerCronJob } = useStore()
  const [actionResult, setActionResult] = useState(null)

  useEffect(() => {
    fetchCronJobs()
  }, [])

  const handleToggle = async (jobId) => {
    const res = await toggleCronJob(jobId)
    setActionResult(res)
    if (res.success) fetchCronJobs()
    setTimeout(() => setActionResult(null), 3000)
  }

  const handleTrigger = async (jobId) => {
    const res = await triggerCronJob(jobId)
    setActionResult(res)
    setTimeout(() => setActionResult(null), 3000)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">⏰ Cron Jobs ({cronJobs.length})</div>
        {actionResult && (
          <span className={`text-xs ${actionResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
            {actionResult.success ? '✅' : '❌'} {actionResult.message || actionResult.error}
          </span>
        )}
      </div>

      {cronJobs.length === 0 ? (
        <div className="text-gray-600 text-center py-4 text-sm">No cron jobs configured</div>
      ) : (
        <div className="space-y-2">
          {cronJobs.map(job => (
            <div key={job.id} className="glass-panel p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`status-dot ${job.enabled ? 'status-dot--active' : 'status-dot--pending'}`} />
                  <span className="text-xs font-medium text-gray-200">{job.name}</span>
                </div>
                <span className={`badge ${job.enabled ? 'badge--active' : 'badge--idle'}`}>
                  {job.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              
              <div className="text-xs text-gray-500 font-mono space-y-0.5 mb-2">
                <div>Schedule: <span className="text-accent-400">{job.schedule?.expr || 'manual'}</span></div>
                <div>Target: {job.sessionTarget || 'isolated'}</div>
                {job.description && (
                  <div className="text-gray-600 truncate max-w-xs" title={job.description}>
                    {job.description.substring(0, 80)}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleToggle(job.id)}
                  className={`btn text-xs ${job.enabled ? 'btn--ghost' : 'btn--primary'}`}
                >
                  {job.enabled ? '⏸ Disable' : '▶ Enable'}
                </button>
                <button
                  onClick={() => handleTrigger(job.id)}
                  className="btn btn--ghost text-xs"
                >
                  🚀 Run Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Runs */}
      {cronRuns.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-400 mb-2">Recent Runs</div>
          <div className="space-y-1">
            {cronRuns.slice(0, 5).map((run, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                <span className={run.success ? 'text-emerald-400' : 'text-red-400'}>
                  {run.success ? '✅' : '❌'}
                </span>
                <span className="truncate">{run.jobName || run.jobId}</span>
                <span className="ml-auto text-gray-600">
                  {run.duration ? `${run.duration}ms` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
