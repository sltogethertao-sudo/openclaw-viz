import { useState, useEffect, useRef } from 'react'

// ====== COMPONENTS ======

function LiveDot({ color }) {
  return (
    <span className="relative inline-flex w-2 h-2">
      <span className={`absolute inset-0 rounded-full ${color} opacity-75 animate-ping`} />
      <span className={`relative inline-block w-2 h-2 rounded-full ${color}`} />
    </span>
  )
}

function ProjectHeader({ project }) {
  const steps = project.steps
  const total = steps.length
  const done = steps.filter(s => s.phase === 'done').length
  const pct = Math.round((done / total) * 100)
  const currentStep = steps.find(s => s.phase === 'current')
  const running = project.status === 'running'

  const statusMap = {
    running: { label: currentStep?.title || '执行中', color: 'bg-accent-500/10 border-accent-500/20 text-accent-400', dot: 'bg-accent-400' },
    completed: { label: '已完成', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400' },
    idle: { label: '等待启动', color: 'bg-amber-500/10 border-amber-500/20 text-amber-400', dot: 'bg-amber-400' },
  }
  const st = statusMap[project.status] || statusMap.idle

  return (
    <div className="glass-panel p-4 mb-4 border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-violet-500 flex items-center justify-center text-sm font-bold shrink-0">
            {project.badge}
          </div>
          <div>
            <h2 className="text-base font-semibold">{project.title}</h2>
            <p className="text-[11px] text-gray-500">{project.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${st.color}`}>
            {running ? <LiveDot color={st.dot} /> : <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />}
            <span className="text-[11px]">{st.label}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-2">
        <div className="flex gap-3 text-xs">
          <span className="text-gray-500">总步骤 <strong className="text-gray-300">{total}</strong></span>
          <span className="text-emerald-400">✅ {done}</span>
          <span className="text-accent-400">⚡ {steps.filter(s => s.phase === 'current').length}</span>
          <span className="text-gray-500">⏳ {steps.filter(s => s.phase === 'pending').length}</span>
          {project.session?.compressionRatio > 0 && (
            <span className="text-cyan-400">压缩 {project.session.compressionRatio.toFixed(1)}x</span>
          )}
          {project.session?.totalLatency > 0 && (
            <span className="text-amber-400">{project.session.totalLatency.toFixed(0)}s</span>
          )}
        </div>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden max-w-[200px]">
          <div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {project.session?.query && (
        <div className="bg-white/[0.03] rounded-lg px-3 py-1.5 text-[11px]">
          <span className="text-gray-500 font-mono">查询: </span>
          <span className="text-gray-400">{project.session.query}</span>
          <span className="text-gray-500 ml-2">({project.session.model})</span>
        </div>
      )}
    </div>
  )
}

/* ─── 逻辑链───
   水平排列 8 个步骤卡片，箭头连接。
   当前步骤 (⚡) 下方嵌入实时执行流面板（仅显示当前步骤细节）。
*/

const STEP_META = {
  s1:    { label: 'S₁ 直觉层',     color: 'violet' },
  s2:    { label: 'S₂ 理性层',     color: 'blue' },
  s3:    { label: 'S₃ 反思层',     color: 'amber' },
  syn:   { label: 'Folded Synthesis', color: 'emerald' },
  eng:   { label: 'VerticalStackingEngine', color: 'cyan' },
  trace: { label: 'TracingLayer',  color: 'indigo' },
  ana:   { label: 'TraceAnalyzer', color: 'pink' },
  eff:   { label: '效率计算',       color: 'orange' },
}

function LogicChain({ steps, stream }) {
  const currentIdx = steps.findIndex(s => s.phase === 'current')
  const currentStep = currentIdx >= 0 ? steps[currentIdx] : null
  const running = currentStep !== null

  const dotMap = { ok: 'bg-emerald-400', run: 'bg-accent-400', wait: 'bg-amber-400', err: 'bg-red-400' }
  const stepPrefix = { s1:'S₁', s2:'S₂', hbe:'HBE', s3:'S₃', syn:'Fusion' }

  return (
    <div className="glass-panel p-4 border border-white/5 overflow-x-auto">
      <h3 className="text-[11px] font-semibold text-gray-400 mb-3">推理流水线</h3>

      {/* Cards row */}
      <div className="flex items-start gap-1 min-w-fit">
        {steps.map((step, i) => {
          const meta = STEP_META[step.id]
          const isDone = step.phase === 'done'
          const isCurrent = step.phase === 'current'

          const borderColor = isDone ? 'border-emerald-500/30' : isCurrent ? 'border-accent-500/60' : 'border-white/10'
          const bgColor = isDone ? 'bg-emerald-500/[0.04]' : isCurrent ? 'bg-accent-500/[0.06]' : 'bg-white/[0.02]'
          const shadow = isCurrent ? 'shadow-[0_0_16px_rgba(99,102,241,0.18)]' : ''
          const icon = isDone ? '✅' : isCurrent ? '⚡' : '⏳'
          const badgeText = isDone ? '已完成' : isCurrent ? '进行中' : '待办'
          const badgeColor = isDone
            ? 'bg-emerald-500/15 text-emerald-300'
            : isCurrent
              ? 'bg-accent-500/15 text-accent-300'
              : 'bg-white/[0.04] text-gray-400'

          return (
            <div key={step.id} className="flex items-start gap-0">
              {/* Step Card */}
              <div className="relative w-[170px] shrink-0">
                <div className={`rounded-xl border ${borderColor} ${bgColor} ${shadow} p-3 transition-all ${isCurrent ? 'z-10' : ''}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs">{icon}</span>
                    <span className={`text-xs font-semibold ${isDone ? 'text-emerald-300' : isCurrent ? 'text-accent-300' : 'text-gray-400'}`}>
                      {meta?.label || step.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed mb-2">{step.desc}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeColor}`}>{badgeText}</span>
                    {isCurrent && <LiveDot color="bg-accent-400" />}
                  </div>
                  {step.metrics && (step.metrics.latency !== '—' || step.metrics.confidence !== '—') && (
                    <div className="mt-1.5 pt-1.5 border-t border-white/[0.04] flex gap-1.5 text-[9px] font-mono text-gray-300 flex-wrap">
                      {Object.entries(step.metrics).map(([k, v]) => (
                        <span key={k}>{k}={v}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Current step live stream — 只显示当前步骤的细节 */}
                {isCurrent && running && (
                  <div className="mt-2 ml-0.5 animate-fade-in">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-2 h-2 rounded-full bg-accent-400 shadow-[0_0_6px_rgba(99,102,241,0.5)] animate-ping" />
                      <div className="h-px flex-1 bg-gradient-to-r from-accent-500/40 to-transparent" />
                      <span className="text-[9px] text-accent-400/60 font-mono">执行流</span>
                    </div>
                    <div className="space-y-1 pl-3 border-l-2 border-accent-500/20">
                      {(() => {
                        const currentPrefix = stepPrefix[step.id]
                        const filtered = (stream || []).filter(e => {
                          if (e.msg.startsWith(currentPrefix)) return true
                          if (e.msg.startsWith('贯穿回溯')) return true
                          return false
                        })
                        return filtered.length > 0 ? (
                          filtered.map((e, i) => (
                            <div key={i} className="flex items-center gap-2 py-1">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotMap[e.status] || 'bg-gray-600'}`} />
                              <span className="text-[10px] text-gray-400 truncate">{e.msg}</span>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-center gap-2 py-1">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent-400 animate-pulse" />
                            <span className="text-[10px] text-accent-400/70">⚡ {meta?.label || step.title} · 执行中</span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Arrow connector */}
              {i < steps.length - 1 && (
                <div className="flex items-center pt-6 px-1 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="text-gray-500">
                    <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ====== FALLBACK ======

const FALLBACK_PROJECT = {
  id: 'logicfolding-q1',
  title: 'LogicFolding Q1',
  subtitle: 'Phase 1 · VerticalStackingEngine 核心引擎',
  badge: 'LF',
  status: 'idle',
  steps: [
    { id: 's1', phase: 'pending', title: 'S₁ 直觉层', desc: 'System 1 — 快思考', tag: '直觉' },
    { id: 's2', phase: 'pending', title: 'S₂ 理性层', desc: 'System 2 — 慢思考', tag: '理性' },
    { id: 'hbe', phase: 'pending', title: 'HBE 审计', desc: '硬熔断边界审计 — 公式检查', tag: '审计' },
    { id: 's3', phase: 'pending', title: 'S₃ 反思层', desc: 'System 3 — 元认知', tag: '元认知' },
    { id: 'syn', phase: 'pending', title: 'Folded Synthesis', desc: '三层融合输出', tag: '融合' },
    { id: 'eng', phase: 'pending', title: 'VerticalStackingEngine', desc: '引擎协调器', tag: '引擎' },
    { id: 'trace', phase: 'pending', title: 'TracingLayer', desc: '追踪层', tag: '追踪' },
    { id: 'ana', phase: 'pending', title: 'TraceAnalyzer', desc: '批量分析', tag: '分析' },
    { id: 'eff', phase: 'pending', title: '效率计算', desc: '折叠效率', tag: '指标' },
  ],
}

// ====== MAIN ======

export default function ProcessingPanel() {
  const [project, setProject] = useState(FALLBACK_PROJECT)
  const wsReceived = useRef(false)

  // 统一获取步骤数据：兼容新旧格式
  const extractSingle = (data) => {
    if (!data) return null
    if (data.isMulti && data.subProblems?.length) {
      return data.subProblems[0]  // 多问题暂取第一个
    }
    if (data.steps?.length) {
      return { steps: data.steps, stream: data.stream }
    }
    return null
  }

  const applyUpdate = (data) => {
    const single = extractSingle(data)
    if (!single?.steps?.length) return
    setProject(p => ({
      ...p, status: data.status,
      session: data.session || {},
      steps: single.steps,
      stream: single.stream || [],
    }))
  }

  const projectFromData = (data) => {
    const single = extractSingle(data)
    if (!single?.steps?.length) return null
    return {
      id: 'logicfolding-q1', title: 'LogicFolding Q1',
      subtitle: 'Phase 1 · VerticalStackingEngine 核心引擎', badge: 'LF',
      status: data.status,
      session: data.session || {},
      steps: single.steps,
      stream: single.stream || [],
    }
  }

  // 1. 首次加载
  useEffect(() => {
    fetch('/api/processing/status')
      .then(r => r.json())
      .then(data => {
        const p = projectFromData(data)
        if (p) setProject(p)
      })
      .catch(() => {})
  }, [])

  // 2. WebSocket 实时推送
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let ws = null, timer = null
    function connect() {
      try {
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data)
            if (msg.type === 'processing:update' && msg.data) {
              const single = extractSingle(msg.data)
              if (single?.steps?.length) {
                wsReceived.current = true
                applyUpdate(msg.data)
              }
            }
          } catch {}
        }
        ws.onclose = () => { timer = setTimeout(connect, 5000) }
      } catch {}
    }
    connect()
    return () => { if (ws) ws.close(); if (timer) clearTimeout(timer) }
  }, [])

  // 3. 轮询兜底（每 5s）
  useEffect(() => {
    const timer = setInterval(() => {
      fetch('/api/processing/status')
        .then(r => r.json())
        .then(data => {
          const single = extractSingle(data)
          if (single?.steps?.length) {
            const cur = project
            const newSteps = single.steps
            const curSteps = cur.steps || []
            const hasNew = JSON.stringify(newSteps) !== JSON.stringify(curSteps)
            if (hasNew) applyUpdate(data)
          }
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [project])

  return (
    <div className="h-full flex flex-col overflow-hidden p-4">
      <div className="flex-1 flex flex-col min-h-0 gap-3 overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          <ProjectHeader project={project} />

          {/* 架构流水线 */}
          <div className="glass-panel p-4 border border-white/5">
            <h3 className="text-[11px] font-semibold text-gray-400 mb-3">架构流水线</h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: 'S₁ 直觉', color: 'text-violet-300 bg-violet-500/20 border-violet-500/30' },
                { arrow: true }, { label: 'S₂ 理性', color: 'text-blue-300 bg-blue-500/20 border-blue-500/30' },
                { arrow: true }, { label: 'HBE 审计', color: 'text-rose-300 bg-rose-500/20 border-rose-500/30' },
                { arrow: true }, { label: 'S₃ 反思', color: 'text-amber-300 bg-amber-500/20 border-amber-500/30' },
                { arrow: true }, { label: '融合输出', color: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30' },
              ].map((s, i) =>
                s.arrow ? <span key={i} className="text-gray-600 text-lg">→</span>
                : <span key={i} className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${s.color}`}>{s.label}</span>
              )}
            </div>
            <div className="bg-gray-500/10 rounded-lg p-3 text-[11px] text-gray-300 leading-relaxed mt-3">
              📋 {project.status === 'idle'
                ? '等待启动。运行推理后各步骤状态将自动更新。'
                : project.status === 'running'
                  ? '推理进行中，实时追踪每步进度。'
                  : `最新推理已完成：压缩 ${project.session?.compressionRatio?.toFixed(1) || '?'}x，耗时 ${project.session?.totalLatency?.toFixed(0) || '?'}s`}
            </div>
          </div>

          <LogicChain steps={project.steps} stream={project.stream} />

          {/* 工程状态 */}
          <div className="glass-panel p-4 border border-white/5">
            <h3 className="text-[11px] font-semibold text-gray-400 mb-3">工程状态</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'P0 技术方案', status: '✅ 已完成', color: 'text-emerald-300' },
                { label: 'VerticalStackingEngine', status: project.status !== 'idle' ? '✅ 可用' : '⏳ 待实现', color: project.status !== 'idle' ? 'text-emerald-300' : 'text-amber-300' },
                { label: 'TracingLayer', status: project.status !== 'idle' ? '✅ 可用' : '⏳ 待实现', color: project.status !== 'idle' ? 'text-emerald-300' : 'text-amber-300' },
                { label: 'Thinking Logs', status: project.session?.dir ? `📁 ${project.session.date}` : '⏳ 无数据', color: project.session?.dir ? 'text-cyan-300' : 'text-gray-500' },
                { label: '语义通孔 (Vias)', status: '⏳ P1 阶段', color: 'text-gray-500' },
                { label: 'S₄ 创新层', status: '⏳ P1 阶段', color: 'text-gray-500' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-2">
                  <span className="text-gray-400">{s.label}</span>
                  <span className={`font-mono ${s.color}`}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
