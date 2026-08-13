/**
 * Sankey / Flow view — sankey.html
 *
 * Renders a Sankey diagram showing how applications flow through statuses.
 * The diagram models a pipeline:
 *   Total Applications → [each status bucket]
 *
 * Uses D3.js + d3-sankey loaded from CDN (esm.sh).
 */

import { apiFetch } from './api.js';

// ---------------------------------------------------------------------------
// Constants — status pipeline order and colors
// ---------------------------------------------------------------------------

const STATUSES = [
  'Applied',
  'Phone Screen',
  'Interview 1',
  'Interview 2',
  'Interview 3',
  'Interview 4',
  'Interview 5',
  'Interviewing',
  'Offer',
  'Moving Forward',
  'Passed On',
  'Rescinded',
  'Pulled',
  'Ghosted',
  'Withdrawn',
];

const STATUS_COLORS = {
  'Applied': '#2563eb',
  'Phone Screen': '#7c3aed',
  'Interview 1': '#d97706',
  'Interview 2': '#b45309',
  'Interview 3': '#92400e',
  'Interview 4': '#78350f',
  'Interview 5': '#451a03',
  'Interviewing': '#ea580c',
  'Offer': '#16a34a',
  'Moving Forward': '#0d9488',
  'Passed On': '#e11d48',
  'Rescinded': '#991b1b',
  'Pulled': '#475569',
  'Ghosted': '#6b7280',
  'Withdrawn': '#64748b',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Sankey data building
// ---------------------------------------------------------------------------

/**
 * Build Sankey nodes and links from application data.
 * Model: "All Applications" source node → each status as a target node.
 * Only statuses with at least one application get a link.
 */
function buildSankeyData(applications) {
  // Count applications per status
  const statusCounts = new Map();
  for (const app of applications) {
    statusCounts.set(app.status, (statusCounts.get(app.status) || 0) + 1);
  }

  // Build nodes: source + one per status that has applications
  const nodes = [{ name: `All Applications (${applications.length})` }];
  const links = [];

  for (const status of STATUSES) {
    const count = statusCounts.get(status) || 0;
    if (count > 0) {
      const targetIndex = nodes.length;
      nodes.push({ name: `${status} (${count})`, status });
      links.push({ source: 0, target: targetIndex, value: count });
    }
  }

  return { nodes, links };
}

// ---------------------------------------------------------------------------
// Rendering with D3 + d3-sankey
// ---------------------------------------------------------------------------

async function renderSankey(applications) {
  const app = document.getElementById('app');

  if (applications.length === 0) {
    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Application Flow</h1>
      </div>
      <div class="empty-state">
        <p>No applications recorded yet. Add some applications to see the flow diagram.</p>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Application Flow</h1>
    </div>
    <div class="sankey-container" id="sankey-chart"></div>
  `;

  // Dynamically import D3 and d3-sankey from CDN
  const [d3Module, sankeyModule] = await Promise.all([
    import('https://esm.sh/d3@7'),
    import('https://esm.sh/d3-sankey@0.12'),
  ]);

  const d3 = d3Module;
  const { sankey, sankeyLinkHorizontal } = sankeyModule;

  const container = document.getElementById('sankey-chart');
  const width = container.clientWidth || 900;
  const height = Math.max(400, applications.length * 20 + 100);

  const margin = { top: 20, right: 200, bottom: 20, left: 20 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const data = buildSankeyData(applications);

  // Create Sankey layout
  const sankeyLayout = sankey()
    .nodeId((d, i) => i)
    .nodeWidth(24)
    .nodePadding(16)
    .nodeAlign(d3.sankeyLeft || sankeyModule.sankeyLeft)
    .extent([[0, 0], [innerWidth, innerHeight]]);

  const { nodes, links } = sankeyLayout({
    nodes: data.nodes.map(d => ({ ...d })),
    links: data.links.map(d => ({ ...d })),
  });

  // Create SVG
  const svg = d3.select('#sankey-chart')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Sankey diagram showing application status breakdown')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Draw links
  const link = svg.append('g')
    .attr('fill', 'none')
    .attr('stroke-opacity', 0.4)
    .selectAll('g')
    .data(links)
    .join('g');

  link.append('path')
    .attr('d', sankeyLinkHorizontal())
    .attr('stroke', d => {
      const status = d.target.status;
      return STATUS_COLORS[status] || '#94a3b8';
    })
    .attr('stroke-width', d => Math.max(1, d.width))
    .append('title')
    .text(d => `${d.target.name}: ${d.value}`);

  // Draw nodes
  const node = svg.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g');

  node.append('rect')
    .attr('x', d => d.x0)
    .attr('y', d => d.y0)
    .attr('height', d => d.y1 - d.y0)
    .attr('width', d => d.x1 - d.x0)
    .attr('fill', d => {
      if (d.status) return STATUS_COLORS[d.status] || '#94a3b8';
      return '#1e293b'; // source node color
    })
    .attr('rx', 3)
    .attr('ry', 3)
    .append('title')
    .text(d => d.name);

  // Draw labels
  node.append('text')
    .attr('x', d => d.x1 + 8)
    .attr('y', d => (d.y1 + d.y0) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'start')
    .attr('font-size', '13px')
    .attr('font-weight', '500')
    .attr('fill', '#1a1d23')
    .text(d => d.name);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');
  try {
    const applications = await apiFetch('/applications');
    await renderSankey(applications);
  } catch (err) {
    app.innerHTML = `
      <div class="error-banner" role="alert">
        <span>⚠</span>
        <span>${escapeHtml('Failed to load applications. Please try again.')}</span>
      </div>
    `;
  }
});
