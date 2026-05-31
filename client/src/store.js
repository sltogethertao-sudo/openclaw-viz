import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // Data
  topology: { nodes: [], edges: [] },
  sessions: [],
  cronJobs: [],
  cronRuns: [],
  subAgents: [],
  logs: [],
  stats: {},
  sessionHistory: [],
  metrics: null,
  searchResults: null,
  searchMeta: null,
  // V2.0
  projects: [],
  projectDeps: [],
  timeline: null,
  taskFlow: null,
  alerts: null,
  // V3.0
  users: null,
  auditLog: [],
  policies: [],
  triggeredAlerts: [],
  replaySessions: [],
  replayData: null,
  abTest: null,
  // V4.0
  rbacPermissions: null,
  currentRole: 'admin',
  immutableAudit: [],
  auditIntegrity: null,
  clusters: [],
  clusterHealth: [],
  prometheusMetrics: null,
  authToken: localStorage.getItem('viz-auth-token') || null,
  authUser: JSON.parse(localStorage.getItem('viz-auth-user') || 'null'),
  
  // UI State
  selectedNode: null,
  selectedSession: null,
  activePanel: 'sessions', // 'sessions' | 'intervention' | 'logs' | 'cron' | 'metrics'
  activeView: 'processing', // 'agent' | 'project' | 'timeline' | 'tasks' | 'alerts' | 'processing'
  wsConnected: false,
  isLoading: true,
  error: null,

  // Actions
  setTopology: (topology) => set({ topology }),
  setSessions: (sessions) => set({ sessions }),
  setCronJobs: (jobs) => set({ cronJobs: jobs }),
  setCronRuns: (runs) => set({ cronRuns: runs }),
  setSubAgents: (agents) => set({ subAgents: agents }),
  setLogs: (logs) => set({ logs }),
  setStats: (stats) => set({ stats }),
  setSessionHistory: (history) => set({ sessionHistory: history }),
  setMetrics: (metrics) => set({ metrics }),
  setSearchResults: (results, meta) => set({ searchResults: results, searchMeta: meta }),
  // V2.0
  setProjects: (projects, deps) => set({ projects, projectDeps: deps }),
  setTimeline: (timeline) => set({ timeline }),
  setTaskFlow: (taskFlow) => set({ taskFlow }),
  setAlerts: (alerts) => set({ alerts }),
  
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSelectedSession: (session) => set({ selectedSession: session }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setActiveView: (view) => set({ activeView: view }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // API helpers
  fetchSessions: async () => {
    try {
      const res = await fetch('/api/sessions')
      const data = await res.json()
      set({ sessions: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  fetchTopology: async () => {
    try {
      const res = await fetch('/api/topology')
      const data = await res.json()
      set({ topology: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  fetchSessionHistory: async (sessionKey) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/history`)
      const data = await res.json()
      set({ sessionHistory: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  fetchLogs: async () => {
    try {
      const res = await fetch('/api/logs')
      const data = await res.json()
      set({ logs: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  fetchStats: async () => {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      set({ stats: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  // V1.1: Search & Filter
  searchSessions: async (params = {}) => {
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`/api/sessions/search?${qs}`)
      const data = await res.json()
      set({ searchResults: data.sessions, searchMeta: data.meta })
    } catch (e) {
      set({ error: e.message })
    }
  },

  // V1.1: Cron management
  fetchCronJobs: async () => {
    try {
      const res = await fetch('/api/cron/jobs')
      const data = await res.json()
      set({ cronJobs: data.jobs, cronRuns: data.runs })
    } catch (e) {
      set({ error: e.message })
    }
  },

  toggleCronJob: async (jobId) => {
    try {
      const res = await fetch(`/api/cron/jobs/${jobId}/toggle`, { method: 'POST' })
      return await res.json()
    } catch (e) {
      return { error: e.message }
    }
  },

  triggerCronJob: async (jobId) => {
    try {
      const res = await fetch(`/api/cron/jobs/${jobId}/run`, { method: 'POST' })
      return await res.json()
    } catch (e) {
      return { error: e.message }
    }
  },

  // V1.1: Metrics
  fetchMetrics: async () => {
    try {
      const res = await fetch('/api/metrics')
      const data = await res.json()
      set({ metrics: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  // V1.1: Export
  exportSession: async (sessionKey, format = 'json') => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/export?format=${format}`)
      if (format === 'markdown') {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `session-export.md`
        a.click()
        URL.revokeObjectURL(url)
        return { success: true }
      }
      return await res.json()
    } catch (e) {
      return { error: e.message }
    }
  },

  // Intervention
  sendMessage: async (sessionKey, message) => {
    try {
      const res = await fetch('/api/intervene/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, message }),
      })
      return await res.json()
    } catch (e) {
      return { error: e.message }
    }
  },

  steerAgent: async (target, message) => {
    try {
      const res = await fetch('/api/intervene/steer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message }),
      })
      return await res.json()
    } catch (e) {
      return { error: e.message }
    }
  },

  killAgent: async (target) => {
    try {
      const res = await fetch('/api/intervene/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      })
      return await res.json()
    } catch (e) {
      return { error: e.message }
    }
  },

  // V2.0: Projects
  fetchProjects: async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      set({ projects: data.projects, projectDeps: data.dependencies })
    } catch (e) {
      set({ error: e.message })
    }
  },

  // V2.0: Timeline
  fetchTimeline: async () => {
    try {
      const res = await fetch('/api/timeline')
      const data = await res.json()
      set({ timeline: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  // V2.0: Task Flow
  fetchTaskFlow: async () => {
    try {
      const res = await fetch('/api/taskflow')
      const data = await res.json()
      set({ taskFlow: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  // V2.0: Alerts
  fetchAlerts: async () => {
    try {
      const res = await fetch('/api/alerts')
      const data = await res.json()
      set({ alerts: data })
    } catch (e) {
      set({ error: e.message })
    }
  },

  // V3.0: Users
  fetchUsers: async () => {
    try {
      const res = await fetch('/api/users')
      set({ users: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  registerUser: async (userId, name, role) => {
    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name, role }),
      })
      return await res.json()
    } catch (e) { return { error: e.message } }
  },

  fetchAuditLog: async () => {
    try {
      const res = await fetch('/api/audit')
      set({ auditLog: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  // V3.0: Policies
  fetchPolicies: async () => {
    try {
      const res = await fetch('/api/policies')
      const data = await res.json()
      set({ policies: data.policies, triggeredAlerts: data.triggeredAlerts })
    } catch (e) { set({ error: e.message }) }
  },

  togglePolicy: async (id) => {
    try {
      const res = await fetch(`/api/policies/${id}/toggle`, { method: 'POST' })
      return await res.json()
    } catch (e) { return { error: e.message } }
  },

  createPolicy: async (policy) => {
    try {
      const res = await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      })
      return await res.json()
    } catch (e) { return { error: e.message } }
  },

  deletePolicy: async (id) => {
    try {
      const res = await fetch(`/api/policies/${id}`, { method: 'DELETE' })
      return await res.json()
    } catch (e) { return { error: e.message } }
  },

  // V3.0: Replay
  fetchReplaySessions: async () => {
    try {
      const res = await fetch('/api/replay-sessions')
      set({ replaySessions: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  fetchReplay: async (sessionKey) => {
    try {
      const res = await fetch(`/api/replay/${encodeURIComponent(sessionKey)}`)
      set({ replayData: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  // V3.0: A/B Test
  fetchABTest: async () => {
    try {
      const res = await fetch('/api/abtest')
      set({ abTest: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  // V4.0: RBAC
  fetchRBAC: async () => {
    try {
      const role = useStore.getState().currentRole
      const res = await fetch(`/api/rbac/check?role=${role}`)
      set({ rbacPermissions: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  // V4.0: Immutable Audit
  fetchImmutableAudit: async () => {
    try {
      const res = await fetch('/api/audit/immutable')
      set({ immutableAudit: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  fetchAuditIntegrity: async () => {
    try {
      const res = await fetch('/api/audit/verify')
      set({ auditIntegrity: await res.json() })
    } catch (e) { set({ error: e.message }) }
  },

  exportAuditCSV: async () => {
    try {
      const res = await fetch('/api/audit/export/csv')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'audit-export.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { set({ error: e.message }) }
  },

  // V4.0: Multi-Cluster
  fetchClusters: async () => {
    try {
      const res = await fetch('/api/clusters')
      const data = await res.json()
      set({ clusters: data.clusters, clusterHealth: data.health })
    } catch (e) { set({ error: e.message }) }
  },

  addCluster: async (name, url, token) => {
    try {
      const res = await fetch('/api/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, token }),
      })
      return await res.json()
    } catch (e) { return { error: e.message } }
  },

  removeCluster: async (id) => {
    try {
      await fetch(`/api/clusters/${id}`, { method: 'DELETE' })
      useStore.getState().fetchClusters()
    } catch (e) { set({ error: e.message }) }
  },

  // V4.0: Prometheus
  fetchPrometheusMetrics: async () => {
    try {
      const res = await fetch('/api/metrics/prometheus')
      set({ prometheusMetrics: await res.text() })
    } catch (e) { set({ error: e.message }) }
  },

  // V4.0: Auth / SSO
  login: async (userId, name, role) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name, role }),
      })
      const data = await res.json()
      if (data.token) {
        localStorage.setItem('viz-auth-token', data.token)
        localStorage.setItem('viz-auth-user', JSON.stringify(data.user))
        set({ authToken: data.token, authUser: data.user, currentRole: data.user.role })
      }
      return data
    } catch (e) { return { error: e.message } }
  },

  logout: () => {
    localStorage.removeItem('viz-auth-token')
    localStorage.removeItem('viz-auth-user')
    set({ authToken: null, authUser: null, currentRole: 'viewer' })
  },
}))
