// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import Fastify, { type FastifyInstance } from 'fastify';
import type { EmsIntentEnvelope } from '../contracts/ems-intent-envelope.js';
import type { EmsStationSnapshot } from '../contracts/ems-control-plan.js';
import type { EmsAddonRuntimeConfig } from './config.js';
import type { EmsAddonRuntime } from './ems-addon-runtime.js';
import type { RuntimeMutableConfig } from './ems-addon-runtime.js';

export function buildEmsAddonApp(
  runtime: EmsAddonRuntime,
  config: EmsAddonRuntimeConfig,
): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  app.get('/', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return buildAdminHtml();
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'ems-addon',
  }));

  app.post('/intents', async (request, reply) => {
    if (!runtime.isRestIngressEnabled()) {
      reply.status(503);
      return {
        status: 'disabled',
        reason: 'REST ingress disabled',
      };
    }

    const envelope = request.body as EmsIntentEnvelope;
    try {
      const plan = await runtime.processEnvelope(envelope);
      return {
        status: 'accepted',
        stationTargetCount: plan.stationTargets.length,
        derActionCount: plan.derActions.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ingress error';
      reply.status(400);
      return {
        status: 'rejected',
        message,
      };
    }
  });

  app.get('/admin/state', async () => runtime.getSnapshot());

  app.get('/admin/config', async () => runtime.getMutableConfig());

  app.patch('/admin/config', async (request, reply) => {
    const body = request.body as Partial<{
      enableRestIngress: boolean;
      dryRun: boolean;
      defaultChargingProfileId: number;
      stationSnapshots: EmsStationSnapshot[];
      stationSnapshotsJson: string;
    }>;

    const patch: Partial<RuntimeMutableConfig> = {
      enableRestIngress: body.enableRestIngress,
      dryRun: body.dryRun,
      defaultChargingProfileId:
        typeof body.defaultChargingProfileId === 'number'
          ? body.defaultChargingProfileId
          : undefined,
      stationSnapshots: body.stationSnapshots,
    };

    if (typeof body.stationSnapshotsJson === 'string') {
      try {
        const parsed = JSON.parse(body.stationSnapshotsJson) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error('stationSnapshotsJson must be a JSON array');
        }

        patch.stationSnapshots = parsed as EmsStationSnapshot[];
      } catch (error) {
        reply.status(400);
        return {
          status: 'rejected',
          message: error instanceof Error ? error.message : 'Invalid stationSnapshotsJson',
        };
      }
    }

    const updated = runtime.patchConfig(patch);
    return {
      status: 'updated',
      config: updated,
    };
  });

  app.post('/admin/restart', async (_request, reply) => {
    if (!config.enableRestartEndpoint) {
      reply.status(403);
      return {
        status: 'forbidden',
        reason: 'Restart endpoint disabled',
      };
    }

    setTimeout(() => {
      process.exit(0);
    }, 200);

    return {
      status: 'restarting',
    };
  });

  return app;
}

function buildAdminHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EMS Add-on Console</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --card: #ffffff;
      --text: #1f2933;
      --muted: #5f6c7b;
      --accent: #0f766e;
      --warning: #b45309;
      --error: #b91c1c;
      --border: #d6dde5;
      --mono: "Cascadia Code", "Consolas", monospace;
      --sans: "Segoe UI", "Trebuchet MS", sans-serif;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--sans);
      color: var(--text);
      background:
        radial-gradient(circle at 20% 15%, #d8f1ee 0, transparent 45%),
        radial-gradient(circle at 85% 85%, #fdeccf 0, transparent 38%),
        var(--bg);
    }

    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 20px;
      display: grid;
      gap: 16px;
    }

    .header {
      padding: 18px;
      background: linear-gradient(135deg, #0f766e, #0b4f70);
      color: #fff;
      border-radius: 14px;
      box-shadow: 0 10px 24px rgba(15, 118, 110, 0.2);
    }

    .header h1 { margin: 0; font-size: 1.4rem; }
    .header p { margin: 6px 0 0; opacity: 0.9; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 6px 16px rgba(31, 41, 51, 0.08);
    }

    .card h2 { margin: 0 0 10px; font-size: 1rem; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 6px 0; }
    .label { color: var(--muted); }

    textarea, input, select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      font: inherit;
      margin-top: 6px;
      background: #fff;
    }

    textarea {
      min-height: 110px;
      font-family: var(--mono);
      font-size: 0.82rem;
    }

    .buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    button {
      border: none;
      border-radius: 8px;
      padding: 9px 12px;
      font-weight: 600;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
    }

    button.warn { background: var(--warning); }
    button.err { background: var(--error); }

    pre {
      font-family: var(--mono);
      font-size: 0.77rem;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 8px;
      padding: 10px;
      overflow: auto;
      margin: 0;
      max-height: 220px;
    }

    .pulse {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #16a34a;
      box-shadow: 0 0 0 rgba(22, 163, 74, 0.5);
      animation: pulse 1.8s infinite;
      display: inline-block;
      margin-right: 6px;
      vertical-align: middle;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.5); }
      70% { box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); }
      100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
    }

    @media (max-width: 640px) {
      .wrap { padding: 12px; }
      .header h1 { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="header">
      <h1><span class="pulse"></span>EMS Add-on Console</h1>
      <p>Live snapshot and runtime configuration (no restart for most settings).</p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Runtime Snapshot</h2>
        <div class="row"><span class="label">Accepted</span><strong id="accepted">0</strong></div>
        <div class="row"><span class="label">Rejected</span><strong id="rejected">0</strong></div>
        <div class="row"><span class="label">Published</span><strong id="published">0</strong></div>
        <div class="row"><span class="label">Topic Messages</span><strong id="topics">0</strong></div>
        <div class="row"><span class="label">Last Update</span><strong id="lastUpdate">-</strong></div>
        <div class="buttons">
          <button id="refreshBtn">Refresh</button>
        </div>
      </article>

      <article class="card">
        <h2>Runtime Configuration</h2>
        <label><input type="checkbox" id="dryRun" /> Dry run</label>
        <label><input type="checkbox" id="enableRestIngress" /> Enable REST ingress</label>
        <label>Default Charging Profile ID
          <input id="defaultChargingProfileId" type="number" min="1" step="1" />
        </label>
        <label>Station Snapshots JSON
          <textarea id="stationSnapshotsJson"></textarea>
        </label>
        <div class="buttons">
          <button id="saveConfigBtn">Apply Config</button>
          <button id="restartBtn" class="warn">Restart Add-on</button>
        </div>
      </article>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Last Plan</h2>
        <pre id="lastPlan">{}</pre>
      </article>
      <article class="card">
        <h2>Last Error</h2>
        <pre id="lastError">-</pre>
      </article>
    </section>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);

    async function fetchState() {
      const res = await fetch('/admin/state');
      if (!res.ok) throw new Error('Failed to fetch state');
      return res.json();
    }

    function render(state) {
      $('accepted').textContent = String(state.metrics.acceptedCount);
      $('rejected').textContent = String(state.metrics.rejectedCount);
      $('published').textContent = String(state.metrics.publishedCount);
      $('topics').textContent = String(state.metrics.topicMessageCount);
      $('lastUpdate').textContent = state.lastUpdateAt || '-';

      $('dryRun').checked = Boolean(state.config.dryRun);
      $('enableRestIngress').checked = Boolean(state.config.enableRestIngress);
      $('defaultChargingProfileId').value = String(state.config.defaultChargingProfileId || 1001);
      $('stationSnapshotsJson').value = JSON.stringify(state.config.stationSnapshots || [], null, 2);

      $('lastPlan').textContent = JSON.stringify(state.lastPlan || {}, null, 2);
      $('lastError').textContent = state.lastError || '-';
    }

    async function refresh() {
      try {
        const state = await fetchState();
        render(state);
      } catch (error) {
        $('lastError').textContent = error.message;
      }
    }

    async function saveConfig() {
      const payload = {
        dryRun: $('dryRun').checked,
        enableRestIngress: $('enableRestIngress').checked,
        defaultChargingProfileId: Number($('defaultChargingProfileId').value),
        stationSnapshotsJson: $('stationSnapshotsJson').value,
      };

      const res = await fetch('/admin/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update config');
      }

      await refresh();
    }

    async function restartAddon() {
      const ok = window.confirm('Restart the EMS add-on process now?');
      if (!ok) return;

      const res = await fetch('/admin/restart', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.reason || 'Restart rejected');
      }

      $('lastError').textContent = 'Restart requested; wait for container to recover.';
    }

    $('refreshBtn').addEventListener('click', () => { void refresh(); });
    $('saveConfigBtn').addEventListener('click', async () => {
      try { await saveConfig(); } catch (e) { $('lastError').textContent = e.message; }
    });
    $('restartBtn').addEventListener('click', async () => {
      try { await restartAddon(); } catch (e) { $('lastError').textContent = e.message; }
    });

    setInterval(() => { void refresh(); }, 5000);
    void refresh();
  </script>
</body>
</html>`;
}
