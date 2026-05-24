import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useStore } from '../store'

const TYPE_COLORS = {
  project: { fill: '#6366f1', stroke: '#818cf8' },
  node: { fill: '#0ea5e9', stroke: '#38bdf8' },
  python: { fill: '#10b981', stroke: '#34d399' },
  docs: { fill: '#f59e0b', stroke: '#fbbf24' },
  unknown: { fill: '#64748b', stroke: '#94a3b8' },
}

const RELATION_STYLES = {
  references: { color: '#6366f1', dash: '' },
  evolved_into: { color: '#10b981', dash: '6,3' },
  shares_code: { color: '#f59e0b', dash: '3,3' },
  automates: { color: '#ef4444', dash: '' },
  monitors: { color: '#8b5cf6', dash: '8,4' },
}

export default function ProjectGraph() {
  const svgRef = useRef(null)
  const containerRef = useRef(null)

  const { projects, projectDeps, fetchProjects } = useStore()

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !projects.length) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    const defs = svg.append('defs')
    
    // Glow
    const glow = defs.append('filter').attr('id', 'proj-glow')
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur')
    const merge = glow.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Build nodes and links
    const nodes = projects.map(p => ({
      id: p.name,
      type: p.type,
      label: p.name,
      sublabel: `${p.tech.slice(0, 3).join(', ')} · ${p.files} files`,
      size: Math.min(40, 15 + Math.sqrt(p.size / 10000) * 5),
      tech: p.tech,
      fileCount: p.files,
    }))

    const links = (projectDeps || []).map(d => ({
      source: d.from,
      target: d.to,
      type: d.type,
    })).filter(l => nodes.find(n => n.id === l.source) && nodes.find(n => n.id === l.target))

    const zoomGroup = svg.append('g')
    
    svg.call(d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (e) => zoomGroup.attr('transform', e.transform))
    )

    // Grid
    const gridG = svg.append('g').attr('opacity', 0.03)
    for (let x = 0; x < width; x += 50) {
      gridG.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height).attr('stroke', '#fff')
    }
    for (let y = 0; y < height; y += 50) {
      gridG.append('line').attr('x1', 0).attr('y1', y).attr('x2', width).attr('y2', y).attr('stroke', '#fff')
    }

    // Simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(180).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-600))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.size + 30))

    // Draw links
    const linkG = zoomGroup.append('g')
    const link = linkG.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => RELATION_STYLES[d.type]?.color || '#6366f1')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => RELATION_STYLES[d.type]?.dash || '')
      .attr('opacity', 0.5)

    // Link labels
    const linkLabel = zoomGroup.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('font-size', 9)
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(d => d.type.replace('_', ' '))

    // Draw nodes
    const nodeG = zoomGroup.append('g')
    const node = nodeG.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
      )

    // Node hexagon shape
    node.append('circle')
      .attr('r', d => d.size)
      .attr('fill', d => TYPE_COLORS[d.type]?.fill || TYPE_COLORS.unknown.fill)
      .attr('stroke', d => TYPE_COLORS[d.type]?.stroke || TYPE_COLORS.unknown.stroke)
      .attr('stroke-width', 2)
      .attr('opacity', 0.85)
      .attr('filter', 'url(#proj-glow)')

    // Tech badges
    node.each(function(d) {
      const g = d3.select(this)
      d.tech.slice(0, 3).forEach((t, i) => {
        g.append('text')
          .attr('x', 0)
          .attr('y', -d.size + 8 + i * 10)
          .attr('text-anchor', 'middle')
          .attr('font-size', 7)
          .attr('fill', '#e2e8f0')
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(t)
      })
    })

    // File count icon
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', d => d.size * 0.6)
      .text(d => {
        if (d.type === 'node') return '📦'
        if (d.type === 'python') return '🐍'
        if (d.type === 'docs') return '📄'
        if (d.type === 'typescript') return '📘'
        return '📁'
      })

    // Label
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.size + 14)
      .attr('font-size', 11)
      .attr('fill', '#e2e8f0')
      .attr('font-weight', 500)
      .text(d => d.label)

    // Sublabel
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.size + 26)
      .attr('font-size', 8)
      .attr('fill', '#94a3b8')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(d => `${d.fileCount} files`)

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 8)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => simulation.stop()
  }, [projects, projectDeps])

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <div className="absolute top-3 left-3 glass-panel px-3 py-2 z-10">
        <div className="text-xs font-medium text-gray-400 mb-1">Project Dependencies</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(RELATION_STYLES).map(([type, style]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded" style={{ background: style.color, borderStyle: style.dash ? 'dashed' : 'solid' }} />
              <span className="text-[10px] text-gray-500">{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}
