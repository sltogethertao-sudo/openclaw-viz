import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { useStore } from '../store'

const NODE_COLORS = {
  agent: { fill: '#6366f1', stroke: '#818cf8' },
  session: { fill: '#0ea5e9', stroke: '#38bdf8' },
  cron: { fill: '#f59e0b', stroke: '#fbbf24' },
  module: { fill: '#10b981', stroke: '#34d399' },
}

const STATUS_COLORS = {
  active: '#34d399',
  running: '#8b5cf6',
  idle: '#fbbf24',
  stale: '#64748b',
  error: '#f87171',
  disabled: '#475569',
  completed: '#38bdf8',
}

const NODE_RADIUS = {
  agent: 28,
  session: 18,
  cron: 14,
  module: 20,
}

export default function TopologyGraph() {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const simulationRef = useRef(null)
  const { topology, selectedNode, setSelectedNode, setSelectedSession, sessions } = useStore()

  const handleClick = useCallback((event, d) => {
    setSelectedNode(d)
    if (d.type === 'session') {
      const session = sessions.find(s => `session:${s.key}` === d.id)
      if (session) setSelectedSession(session)
    }
  }, [sessions, setSelectedNode, setSelectedSession])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (!topology.nodes.length) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    // Defs for gradients and filters
    const defs = svg.append('defs')
    
    // Glow filter
    const glowFilter = defs.append('filter').attr('id', 'glow')
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const feMerge = glowFilter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Arrow markers
    Object.entries(STATUS_COLORS).forEach(([status, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${status}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 30)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color)
        .attr('opacity', 0.6)
    })

    // Background grid
    const gridGroup = svg.append('g').attr('class', 'grid')
    const gridSize = 40
    for (let x = 0; x < width; x += gridSize) {
      gridGroup.append('line')
        .attr('x1', x).attr('y1', 0)
        .attr('x2', x).attr('y2', height)
        .attr('stroke', 'rgba(255,255,255,0.02)')
        .attr('stroke-width', 0.5)
    }
    for (let y = 0; y < height; y += gridSize) {
      gridGroup.append('line')
        .attr('x1', 0).attr('y1', y)
        .attr('x2', width).attr('y2', y)
        .attr('stroke', 'rgba(255,255,255,0.02)')
        .attr('stroke-width', 0.5)
    }

    // Create zoom behavior
    const zoomGroup = svg.append('g')
    
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Prepare simulation data
    const nodes = topology.nodes.map(n => ({ ...n }))
    const edges = topology.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      label: e.label,
    }))

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(120).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => (NODE_RADIUS[d.type] || 16) + 20))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))

    simulationRef.current = simulation

    // Draw edges
    const linkGroup = zoomGroup.append('g').attr('class', 'links')
    
    const link = linkGroup.selectAll('line')
      .data(edges)
      .join('line')
      .attr('class', d => `graph-link ${d.type === 'manages' ? 'graph-link--active' : ''}`)
      .attr('stroke', d => {
        if (d.type === 'manages') return 'rgba(52, 211, 153, 0.3)'
        if (d.type === 'triggers') return 'rgba(251, 191, 36, 0.3)'
        return 'rgba(99, 102, 241, 0.2)'
      })
      .attr('stroke-width', d => d.type === 'manages' ? 2 : 1.5)
      .attr('stroke-dasharray', d => d.type === 'related' ? '4,4' : 'none')
      .attr('marker-end', d => {
        const targetNode = nodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id))
        return `url(#arrow-${targetNode?.status || 'active'})`
      })

    // Edge labels
    const linkLabel = zoomGroup.append('g')
      .selectAll('text')
      .data(edges)
      .join('text')
      .attr('class', 'graph-link-label')
      .text(d => d.label || '')
      .attr('opacity', 0.6)

    // Draw nodes
    const nodeGroup = zoomGroup.append('g').attr('class', 'nodes')
    
    const node = nodeGroup.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'graph-node')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded))
      .on('click', handleClick)

    // Node outer ring (status)
    node.append('circle')
      .attr('r', d => (NODE_RADIUS[d.type] || 16) + 4)
      .attr('fill', 'none')
      .attr('stroke', d => STATUS_COLORS[d.status] || '#64748b')
      .attr('stroke-width', 2)
      .attr('opacity', d => d.status === 'active' ? 0.8 : 0.3)
      .attr('filter', d => d.status === 'active' ? 'url(#glow)' : 'none')

    // Node body
    node.append('circle')
      .attr('r', d => NODE_RADIUS[d.type] || 16)
      .attr('fill', d => {
        const colors = NODE_COLORS[d.type] || NODE_COLORS.session
        return colors.fill
      })
      .attr('stroke', d => {
        const colors = NODE_COLORS[d.type] || NODE_COLORS.session
        return colors.stroke
      })
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.9)

    // Node icon
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', d => d.type === 'agent' ? '18px' : '12px')
      .text(d => {
        if (d.type === 'agent') return '🤖'
        if (d.type === 'cron') return '⏰'
        if (d.module === 'Heartbeat') return '💓'
        if (d.module === 'Dreaming') return '💭'
        if (d.module === 'Feishu') return '🐦'
        if (d.module === 'GroupChat') return '👥'
        if (d.module === 'Tasks') return '📋'
        if (d.module === 'Scheduler') return '📅'
        return '◉'
      })
      .attr('pointer-events', 'none')

    // Node label
    node.append('text')
      .attr('class', 'graph-node-label')
      .attr('dy', d => (NODE_RADIUS[d.type] || 16) + 16)
      .text(d => d.label)

    // Node sublabel
    node.append('text')
      .attr('class', 'graph-node-sublabel')
      .attr('dy', d => (NODE_RADIUS[d.type] || 16) + 28)
      .text(d => d.sublabel || '')

    // Status indicator dot
    node.append('circle')
      .attr('cx', d => (NODE_RADIUS[d.type] || 16) - 2)
      .attr('cy', d => -(NODE_RADIUS[d.type] || 16) + 2)
      .attr('r', 4)
      .attr('fill', d => STATUS_COLORS[d.status] || '#64748b')
      .attr('stroke', '#0a0e1a')
      .attr('stroke-width', 2)

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 6)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Drag handlers
    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(event, d) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [topology, handleClick])

  return (
    <div ref={containerRef} className="w-full h-full relative bg-surface-950">
      {/* Legend */}
      <div className="absolute top-4 left-4 glass-panel px-4 py-3 z-10">
        <div className="text-xs font-medium text-gray-400 mb-2">Agent Topology</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(NODE_COLORS).map(([type, colors]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: colors.fill }} />
              <span className="text-xs text-gray-400 capitalize">{type}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 mt-2 pt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(STATUS_COLORS).slice(0, 4).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-xs text-gray-500 capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-4 text-xs text-gray-600 font-mono">
        Scroll to zoom · Drag to pan · Click node for details
      </div>

      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}
