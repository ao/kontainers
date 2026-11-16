// Server-rendered HTML. Every interpolated value goes through esc(); there is no inline script or style.

import type { Rule } from './proxy';
import { containerStatus, type UpdateState } from './updates';
import { EVENTS, EVENT_KINDS, maskUrl, type Target } from './notify';

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

type Html = { __html: string };
export const raw = (s: string): Html => ({ __html: s });
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0];
  values.forEach((val, i) => {
    const part = Array.isArray(val) ? val.map(x => (x && (x as Html).__html !== undefined ? (x as Html).__html : esc(x))).join('')
      : val && (val as Html).__html !== undefined ? (val as Html).__html : esc(val);
    out += part + strings[i + 1];
  });
  return raw(out);
}

export interface PageCtx {
  user?: string; csrf?: string; flash?: string; error?: string; proxyEnabled?: boolean;
  username?: string; token?: string; // re-filled after a failed login or setup (never the password)
}

const csrfField = (ctx: PageCtx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

function post(ctx: PageCtx, action: string, label: string, opts: { confirm?: string; cls?: string; fields?: Record<string, string> } = {}): Html {
  const extra = Object.entries(opts.fields || {}).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`);
  return html`<form method="post" action="${action}" class="inline"${opts.confirm ? raw(` data-confirm="${esc(opts.confirm)}"`) : raw('')}>${csrfField(ctx)}${extra}<button class="${opts.cls || ''}">${label}</button></form>`;
}

// The actions that make sense in each Docker state. Remove is offered only for stopped containers:
// Docker refuses to remove a running one without force, and kontainers never forces.
function containerActions(ctx: PageCtx, id: string, name: string, state: string, fromDetail = false): Html {
  const fields = fromDetail ? { back: 'detail' } : undefined;
  const a = (op: string, label: string, extra: { confirm?: string; cls?: string } = {}) => post(ctx, `/containers/${id}/${op}`, label, { ...extra, fields: op === 'remove' ? undefined : fields });
  if (state === 'running') return html`${a('stop', 'Stop')} ${a('restart', 'Restart')}`;
  if (state === 'paused') return html`${a('unpause', 'Unpause')}`;
  if (state === 'restarting') return html`${a('stop', 'Stop')}`;
  return html`${a('start', 'Start')} ${a('remove', 'Remove', { confirm: `Remove container ${name}?`, cls: 'danger' })}`;
}

export interface SelfInfo { id: string; project: string | null }

const labelsOf = (c: any): Record<string, string> => c?.Labels || c?.Config?.Labels || {};

// True for kontainers' own container and for the other containers of its compose project.
export function isSelf(c: any, me: SelfInfo | null): boolean {
  if (!me) return false;
  if (c?.Id === me.id) return true;
  return !!me.project && labelsOf(c)['com.docker.compose.project'] === me.project;
}

const selfNote = (c: any, me: SelfInfo | null) =>
  html`<small class="muted">${c?.Id === me?.id ? 'this is kontainers' : 'part of kontainers'}: manage it on the host</small>`;

// Docker lists a port published on all interfaces twice (0.0.0.0 and ::); show it once as "*".
export function formatPorts(ports: any[]): string {
  const groups = new Map<string, Set<string>>();
  for (const p of ports || []) {
    if (!p.PublicPort) continue;
    const k = `${p.PublicPort}->${p.PrivatePort}/${p.Type}`;
    (groups.get(k) || groups.set(k, new Set()).get(k)!).add(p.IP || '');
  }
  return [...groups].map(([k, ips]) => {
    const all = ips.has('0.0.0.0') && ips.has('::');
    const list = all ? ['*'] : [...ips].map(ip => (ip.includes(':') ? `[${ip}]` : ip || '*'));
    return list.map(ip => `${ip}:${k}`).join(', ');
  }).join(', ');
}

const SECTIONS = ['Containers', 'Images', 'Networks', 'Volumes', 'Proxy', 'Settings'];

// `section` marks the nav entry for pages whose title is not the section name (a container's page).
export function layout(title: string, ctx: PageCtx, body: Html, section = title): string {
  const links = SECTIONS.map(s => html`<a href="/${s.toLowerCase()}"${s === section ? raw(' aria-current="page"') : raw('')}>${s}</a>`);
  const nav = ctx.user ? html`
    <nav>
      ${links}
      <span class="spacer"></span>
      <span class="who">${ctx.user}</span>
      <form method="post" action="/logout" class="inline">${csrfField(ctx)}<button class="link">Log out</button></form>
    </nav>` : raw('');
  return '<!doctype html>' + html`<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - kontainers</title>
<link rel="stylesheet" href="/static/app.css"><script src="/static/app.js" defer></script></head>
<body><header><a class="brand" href="/">kontainers</a>${nav}</header><main>
<h1>${title}</h1>
${ctx.flash ? html`<p class="flash" role="status">${ctx.flash}</p>` : ''}
${ctx.error ? html`<p class="error" role="alert">${ctx.error}</p>` : ''}
${body}
</main></body></html>`.__html;
}

export function setupPage(ctx: PageCtx): string {
  return layout('First-run setup', ctx, html`
<p>Create the first account. The setup token is printed in the kontainers log
(<code>docker compose logs kontainers</code>, or <code>docker logs kontainers</code>). Every account has full control of the Docker host.</p>
<form method="post" action="/setup" class="stack">
  <label>Setup token <input name="token" required autocomplete="off" value="${ctx.token || ''}"></label>
  <label>Username <input name="username" required autocomplete="username" value="${ctx.username || ''}"></label>
  <label>Password (12 characters or more) <input name="password" type="password" required minlength="12" autocomplete="new-password"></label>
  <button>Create account</button>
</form>`);
}

export function loginPage(ctx: PageCtx): string {
  return layout('Log in', ctx, html`
<form method="post" action="/login" class="stack">
  <label>Username <input name="username" required autocomplete="username" value="${ctx.username || ''}"${ctx.username ? raw('') : raw(' autofocus')}></label>
  <label>Password <input name="password" type="password" required autocomplete="current-password"${ctx.username ? raw(' autofocus') : raw('')}></label>
  <button>Log in</button>
</form>`);
}

const shortId = (id: string) => String(id || '').replace(/^sha256:/, '').slice(0, 12);
const fmtTime = (s: number) => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 16);
const fmtSize = (b: number) => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`;

export interface UpdateView {
  get: (ref: string) => UpdateState | null;
  lastRun: number | null;
  scheduled: number | null; // hours between scheduled checks, or null when off
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

// ref: the image reference the container was created with; imageId: the image it runs.
const hasNewer = (u: UpdateView | null, ref: string, imageId: string | undefined) =>
  containerStatus(u?.get(ref) ?? null, imageId)?.status === 'available';
const updateBadge = (u: UpdateView | null, ref: string, imageId: string | undefined) =>
  hasNewer(u, ref, imageId) ? html`<small class="update">newer image available</small>` : '';

// The Containers page's search and filters, from its query string.
export type StateFilter = 'all' | 'running' | 'stopped' | 'attention';
export interface ListFilter { q: string; state: StateFilter; group: boolean }
export const DEFAULT_FILTER: ListFilter = { q: '', state: 'all', group: true };

export function parseFilter(params: URLSearchParams): ListFilter {
  const state = params.get('state');
  return {
    q: (params.get('q') || '').trim().slice(0, 100),
    state: state === 'running' || state === 'stopped' || state === 'attention' ? state : 'all',
    group: params.get('group') !== 'none',
  };
}

// Exit codes from a stop: 130 (SIGINT), 137 (SIGKILL, also after docker stop's timeout), 143 (SIGTERM).
const STOP_CODES = new Set(['0', '130', '137', '143']);

// A container someone should look at: restarting (a crash loop), dead, unhealthy, or exited with
// an error code. OOM kills show up as 137 here, like a stop; the container's page says which.
export function needsAttention(c: any): boolean {
  if (c.State === 'restarting' || c.State === 'dead') return true;
  if (/\(unhealthy\)/.test(c.Status || '')) return true;
  if (c.State === 'exited') {
    const m = /^Exited \((-?\d+)\)/.exec(c.Status || '');
    return !!m && !STOP_CODES.has(m[1]);
  }
  return false;
}

const nameOf = (c: any) => String(c.Names?.[0] || '').replace(/^\//, '');
const projectOf = (c: any): string => labelsOf(c)['com.docker.compose.project'] || '';
// What the search box matches: name, image and compose project, without case.
const searchText = (c: any) => `${nameOf(c)} ${c.Image || ''} ${projectOf(c)}`.toLowerCase();

export function matchesFilter(c: any, f: ListFilter): boolean {
  if (f.q && !searchText(c).includes(f.q.toLowerCase())) return false;
  if (f.state === 'running') return c.State === 'running';
  if (f.state === 'stopped') return c.State !== 'running' && c.State !== 'restarting';
  if (f.state === 'attention') return needsAttention(c);
  return true;
}

const filterQuery = (f: ListFilter, over: Partial<ListFilter> = {}) => {
  const g = { ...f, ...over };
  const p = new URLSearchParams();
  if (g.q) p.set('q', g.q);
  if (g.state !== 'all') p.set('state', g.state);
  if (!g.group) p.set('group', 'none');
  const s = p.toString();
  return s ? `/containers?${s}` : '/containers';
};

export function containersPage(ctx: PageCtx, list: any[], me: SelfInfo | null = null, updates: UpdateView | null = null, f: ListFilter = DEFAULT_FILTER): string {
  // Every container is rendered; the ones the filter leaves out carry `hidden`, so the page works
  // without script, and the search box can widen the filter as well as narrow it.
  const row = (c: any) => {
    const name = nameOf(c);
    const project = projectOf(c);
    return html`<tr data-name="${name}" data-state="${c.State}" data-search="${searchText(c)}"${needsAttention(c) ? raw(' data-attention="1"') : raw('')}${matchesFilter(c, f) ? raw('') : raw(' hidden')}>
  <td><a href="/containers/${c.Id}">${name}</a>${project && !f.group ? html`<small>compose project ${project}</small>` : ''}</td><td><span class="ref">${c.Image}</span>${updateBadge(updates, c.Image, c.ImageID)}</td>
  <td><span class="state ${c.State}">${c.State}</span><small>${c.Status}</small></td><td><span class="ref">${formatPorts(c.Ports)}</span></td>
  <td class="actions">${isSelf(c, me) ? selfNote(c, me) : containerActions(ctx, c.Id, name, c.State)}</td></tr>`;
  };
  const sorted = [...list].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const shown = sorted.filter(c => matchesFilter(c, f)).length;
  let rows: Html[];
  if (f.group) {
    // Compose projects first, by name, then the containers that are in none.
    const groups = new Map<string, any[]>();
    for (const c of sorted) (groups.get(projectOf(c)) || groups.set(projectOf(c), []).get(projectOf(c))!).push(c);
    const keys = [...groups.keys()].sort((a, b) => (a === '') !== (b === '') ? (a === '' ? 1 : -1) : a.localeCompare(b));
    rows = keys.flatMap(k => {
      const members = groups.get(k)!;
      const up = members.filter(c => c.State === 'running').length;
      const visible = members.some(c => matchesFilter(c, f));
      return [html`<tr class="group" data-group="${k}"${visible ? raw('') : raw(' hidden')}><th colspan="5" scope="rowgroup">${k ? html`compose project ${k}` : 'not in a compose project'} <small>${up} of ${members.length} running</small></th></tr>`, ...members.map(row)];
    });
  } else rows = sorted.map(row);

  const running = list.filter(c => c.State === 'running').length;
  const attention = list.filter(needsAttention).length;
  const newer = list.filter(c => hasNewer(updates, c.Image, c.ImageID)).length;
  const checked = updates
    ? html`<span class="muted">${newer ? `${newer} with a newer image; ` : ''}${updates.lastRun ? `checked for updates ${ago(updates.lastRun)}` : updates.scheduled ? 'not checked for updates yet' : 'update checks are off'}</span>
${post(ctx, '/updates/check', 'Check for updates')}`
    : '';
  const opt = (v: string, label: string, cur: string) => html`<option value="${v}"${v === cur ? raw(' selected') : raw('')}>${label}</option>`;
  const filters = list.length ? html`<form method="get" action="/containers" class="filters" role="search">
<label>Search <input type="search" name="q" id="q" value="${f.q}" placeholder="name, image or project" autocomplete="off"></label>
<label>Show <select name="state">${opt('all', 'all', f.state)}${opt('running', 'running', f.state)}${opt('stopped', 'stopped', f.state)}${opt('attention', 'needs attention', f.state)}</select></label>
<label>Group <select name="group">${opt('project', 'by compose project', f.group ? 'project' : 'none')}${opt('none', 'none', f.group ? 'project' : 'none')}</select></label>
<button>Apply</button>${f.q || f.state !== 'all' || !f.group ? html` <a href="/containers">Clear</a>` : ''}</form>` : '';
  const empty = html`<tr><td colspan="5">No containers yet. <a href="/containers/new">Create one</a>, or start one with docker and it appears here.</td></tr>`;
  return layout('Containers', ctx, html`
<div class="toolbar"><span class="muted">${running} of ${list.length} running${attention ? html`; <a href="${filterQuery(f, { state: 'attention' })}">${attention} ${attention === 1 ? 'needs' : 'need'} attention</a>` : ''}</span><span class="spread"></span>${checked}<a class="button primary" href="/containers/new">New container</a></div>
${filters}
<table id="containers"><thead><tr><th>Name</th><th>Image</th><th>State</th><th>Published ports</th><th></th></tr></thead>
<tbody>${rows.length ? rows : empty}</tbody></table>
<p class="muted" id="nomatch"${list.length && !shown ? raw('') : raw(' hidden')}>No container matches. <a href="/containers">Show all ${list.length}</a>.</p>`);
}

export interface AutoView { on: boolean; row: { last_at: number | null; last_result: string | null; held_image: string | null } | null }

// The automatic-update switch on a container's page, with the last result.
function autoForm(ctx: PageCtx, id: string, a: AutoView): Html {
  const last = a.row?.last_at ? html`<small class="muted">Last automatic update ${ago(a.row.last_at)}: ${a.row.last_result || ''}</small>` : '';
  const held = a.on && a.row?.held_image ? html`<small class="warn">Image ${shortId(a.row.held_image)} failed when it was tried and is held back; a newer image will be tried.</small>` : '';
  return html`<form method="post" action="/containers/${id}/autoupdate" class="autoupdate">${csrfField(ctx)}
<label class="check"><input type="checkbox" name="on"${a.on ? raw(' checked') : raw('')}> Update automatically when a check finds a newer image</label>
<button>Save</button>
<small class="muted">The new container is watched while it settles; if it stops, restarts or turns unhealthy, the old one is put back.</small>
${last}${held}</form>`;
}

export function containerPage(ctx: PageCtx, c: any, me: SelfInfo | null = null, updates: UpdateView | null = null, auto: AutoView | null = null): string {
  const raw = updates?.get(c.Config?.Image) ?? null;
  const upd = raw && { ...containerStatus(raw, c.Image)!, checkedAt: raw.checkedAt };
  const updText = !upd ? '' : upd.status === 'available' ? (raw!.status === 'available' ? 'a newer image is available for this tag' : upd.reason)
    : upd.status === 'current' ? 'the newest image for this tag' : `update status unknown: ${upd.reason || ''}`;
  const name = String(c.Name || '').replace(/^\//, '');
  const env = (c.Config?.Env || []).map((e: string) => html`<li><code>${e.replace(/=[\s\S]*/, '=…')}</code></li>`);
  const mounts = (c.Mounts || []).map((m: any) => html`<li><code>${m.Type} ${m.Name || m.Source} → ${m.Destination}${m.RW ? '' : ' (ro)'}</code></li>`);
  const nets = Object.keys(c.NetworkSettings?.Networks || {}).map(n => html`<li>${n}</li>`);
  return layout(name, ctx, html`
<p><a href="/containers">All containers</a></p>
<dl class="facts">
  <dt>ID</dt><dd><code>${shortId(c.Id)}</code></dd>
  <dt>Image</dt><dd><code>${c.Config?.Image}</code>${upd ? html`<small class="${upd.status === 'available' ? 'update' : 'muted'}">${updText} (checked ${ago(upd.checkedAt)})</small>` : ''}</dd>
  <dt>State</dt><dd><span class="state ${c.State?.Status}">${c.State?.Status}</span></dd>
  <dt>Started</dt><dd>${!c.State?.StartedAt || c.State.StartedAt.startsWith('0001-') ? 'never' : `${c.State.StartedAt.slice(0, 16).replace('T', ' ')} UTC`}</dd>
  ${c.State?.Health ? html`<dt>Health</dt><dd>${c.State.Health.Status}</dd>` : ''}
  ${c.State?.Status === 'exited' ? html`<dt>Exit code</dt><dd>${c.State.ExitCode}${c.State.OOMKilled ? ' (out of memory)' : ''}</dd>` : ''}
  <dt>Restart policy</dt><dd>${c.HostConfig?.RestartPolicy?.Name}</dd>
</dl>
<div class="actions">${isSelf(c, me) ? selfNote(c, me) : containerActions(ctx, c.Id, name, c.State?.Status || '', true)}
${isSelf(c, me) ? '' : c.Config?.Labels?.['kontainers.managed'] === 'true' && !c.Config?.Labels?.['com.docker.compose.project']
    ? html`${post(ctx, `/containers/${c.Id}/update`, 'Update image', { confirm: `Pull ${c.Config?.Image} and, if it changed, recreate ${name} with the same settings?`, cls: upd?.status === 'available' ? 'primary' : '' })} <a class="button" href="/containers/${c.Id}/edit">Edit settings</a>`
    : c.Config?.Labels?.['com.docker.compose.project'] ? html`<small class="muted">Part of compose project ${c.Config.Labels['com.docker.compose.project']}: update it with <code>docker compose pull &amp;&amp; docker compose up -d</code>.</small>` : ''}</div>
${auto && !isSelf(c, me) && c.Config?.Labels?.['kontainers.managed'] === 'true' && !c.Config?.Labels?.['com.docker.compose.project'] ? autoForm(ctx, c.Id, auto) : ''}
${c.State?.Status === 'running' ? html`<h2>Usage</h2>
<dl class="facts" id="stats" data-stats="/api/containers/${c.Id}/stats">
  <dt>CPU</dt><dd data-k="cpu">…</dd><dt>Memory</dt><dd data-k="mem">…</dd>
  <dt>Network in / out</dt><dd data-k="net">…</dd><dt>Processes</dt><dd data-k="pids">…</dd>
</dl>` : ''}
<h2>Environment (values hidden)</h2><ul>${env.length ? env : html`<li>none</li>`}</ul>
<h2>Mounts</h2><ul>${mounts.length ? mounts : html`<li>none</li>`}</ul>
<h2>Networks</h2><ul>${nets}</ul>
<h2>Logs</h2>
<p><label class="check"><input type="checkbox" id="follow" checked> Follow new lines</label></p>
<pre id="logs" data-logs="/api/containers/${c.Id}/logs?tail=300">loading…</pre>`, 'Containers');
}

export function newContainerPage(ctx: PageCtx, allowBind: boolean, autoUpdates = false): string {
  return layout('New container', ctx, html`
<form method="post" action="/containers" class="stack">${csrfField(ctx)}
  <label>Image <input name="image" required placeholder="nginx:1.27-alpine"></label>
  <label class="check"><input type="checkbox" name="pull" checked> Pull the image first</label>
  <label>Name <input name="name" placeholder="optional"></label>
  <label>Command <input name="cmd" placeholder='optional, e.g. sh -c "echo hi; sleep 60"'></label>
  <label>Ports, one per line: <code>[host-ip:]host:container[/udp]</code>. Without a host IP the port is published on 127.0.0.1.
    <textarea name="ports" rows="3" placeholder="8081:80"></textarea></label>
  <label>Environment, one <code>KEY=value</code> per line <textarea name="env" rows="3"></textarea></label>
  <label>Volumes, one per line: <code>volume-name:/path[:ro]</code>${allowBind ? raw(' or <code>/host/path:/path[:ro]</code>') : raw('. Host paths are disabled.')}
    <textarea name="volumes" rows="2"></textarea></label>
  <label>Restart policy <select name="restart"><option>no</option><option>unless-stopped</option><option>always</option><option>on-failure</option></select></label>
  <label class="check"><input type="checkbox" name="start" checked> Start after creating</label>
${autoUpdates ? html`  <label class="check"><input type="checkbox" name="autoupdate"> Update automatically when a check finds a newer image</label>\n` : ''}  <button>Create</button>
</form>`, 'Containers');
}


// Shell-style quoting that splitArgs in server.ts reads back to the same list.
export function quoteArgs(args: string[]): string {
  return args.map(a => (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ');
}

export interface EditSpec {
  image: string; cmd?: string[]; env?: string[]; restart?: string;
  ports?: { container: number; host: number; hostIp?: string; protocol?: string }[];
  volumes?: { source: string; target: string; readOnly?: boolean }[];
}

// Change the settings of a container kontainers created; saving recreates it.
export function editContainerPage(ctx: PageCtx, c: any, spec: EditSpec, allowBind: boolean): string {
  const name = String(c.Name || '').replace(/^\//, '');
  const ports = (spec.ports || []).map(p => `${p.hostIp ? (p.hostIp.includes(':') ? `[${p.hostIp}]` : p.hostIp) + ':' : ''}${p.host}:${p.container}${p.protocol === 'udp' ? '/udp' : ''}`).join('\n');
  const vols = (spec.volumes || []).map(m => `${m.source}:${m.target}${m.readOnly ? ':ro' : ''}`).join('\n');
  const opt = (v: string) => html`<option${v === (spec.restart || 'no') ? raw(' selected') : raw('')}>${v}</option>`;
  return layout(`Edit ${name}`, ctx, html`
<p><a href="/containers/${c.Id}">Back to ${name}</a></p>
<p>Saving recreates ${name} with these settings: it is stopped, a new container is made and started, and if the new one cannot start or stops within a few seconds, the old one is put back. The name and networks stay. Environment values are shown here so they can be edited.</p>
<form method="post" action="/containers/${c.Id}/edit" class="stack">${csrfField(ctx)}
  <label>Image <input name="image" required value="${spec.image}"></label>
  <label class="check"><input type="checkbox" name="pull"> Pull the image first</label>
  <label>Command <input name="cmd" value="${spec.cmd ? quoteArgs(spec.cmd) : ''}" placeholder="empty: the image's own command"></label>
  <label>Ports, one per line: <code>[host-ip:]host:container[/udp]</code>. Without a host IP the port is published on 127.0.0.1.
    <textarea name="ports" rows="3">${ports}</textarea></label>
  <label>Environment, one <code>KEY=value</code> per line <textarea name="env" rows="4">${(spec.env || []).join('\n')}</textarea></label>
  <label>Volumes, one per line: <code>volume-name:/path[:ro]</code>${allowBind ? raw(' or <code>/host/path:/path[:ro]</code>') : raw('. Host paths are disabled, except ones the container already has.')}
    <textarea name="volumes" rows="2">${vols}</textarea></label>
  <label>Restart policy <select name="restart">${opt('no')}${opt('unless-stopped')}${opt('always')}${opt('on-failure')}</select></label>
  <button class="primary">Save and recreate</button>
</form>`, 'Containers');
}
export function imagesPage(ctx: PageCtx, list: any[], pulls: { ref: string; state: string; error?: string }[] = []): string {
  const cleanup = html`<p><a href="/cleanup">Clean up</a> images, networks and volumes no container uses.</p>`;
  // One Remove per tag: removing a tag leaves the image while other tags point at it.
  const remove = (ref: string, label: string, what: string) => post(ctx, '/images/remove', label, { confirm: `Remove ${what}?`, cls: 'danger', fields: { ref } });
  const rows = list.map(i => {
    const tags: string[] = i.RepoTags?.filter((t: string) => t !== '<none>:<none>') || [];
    const tagCells = tags.length
      ? tags.map(t => html`<div>${t} ${remove(t, 'Remove', tags.length > 1 ? `the tag ${t}` : `image ${t}`)}</div>`)
      : html`<em>untagged</em> ${remove(i.Id, 'Remove', `untagged image ${shortId(i.Id)}`)}`;
    return html`<tr><td>${tagCells}</td><td><code>${shortId(i.Id)}</code></td>
<td>${fmtSize(i.Size)}</td><td>${fmtTime(i.Created)}</td></tr>`;
  });
  const pending = pulls.map(p => html`<li>${p.ref}: ${p.state === 'pulling' ? 'pulling…' : html`<span class="error">failed: ${p.error}</span>`}</li>`);
  return layout('Images', ctx, html`
<form method="post" action="/images/pull" class="row">${csrfField(ctx)}<input name="ref" required placeholder="alpine:3.20" aria-label="Image to pull"><button>Pull</button></form>
<p class="muted">Public images only: registry logins are not supported.</p>
${pending.length ? html`<ul class="pulls">${pending}</ul>` : ''}
<table><thead><tr><th>Tags</th><th>ID</th><th>Size</th><th>Created (UTC)</th></tr></thead><tbody>${rows}</tbody></table>
${cleanup}`);
}

export function networksPage(ctx: PageCtx, list: any[]): string {
  const builtin = new Set(['bridge', 'host', 'none']);
  const rows = list.map(n => html`<tr><td>${n.Name}</td><td>${n.Driver}</td><td>${n.Scope}</td>
<td>${builtin.has(n.Name) ? '' : post(ctx, `/networks/${n.Id}/remove`, 'Remove', { confirm: `Remove network ${n.Name}?`, cls: 'danger' })}</td></tr>`);
  return layout('Networks', ctx, html`
<form method="post" action="/networks" class="row">${csrfField(ctx)}<input name="name" required placeholder="network name" aria-label="Network name"><button>Create</button></form>
<table><thead><tr><th>Name</th><th>Driver</th><th>Scope</th><th></th></tr></thead><tbody>${rows}</tbody></table>`);
}

export function volumesPage(ctx: PageCtx, list: any[]): string {
  const rows = list.map(vol => html`<tr><td>${vol.Name}</td><td>${vol.Driver}</td><td>${vol.CreatedAt || ''}</td>
<td>${post(ctx, `/volumes/${vol.Name}/remove`, 'Remove', { confirm: `Remove volume ${vol.Name} and its data?`, cls: 'danger' })}</td></tr>`);
  return layout('Volumes', ctx, html`
<form method="post" action="/volumes" class="row">${csrfField(ctx)}<input name="name" required placeholder="volume name" aria-label="Volume name"><button>Create</button></form>
<table><thead><tr><th>Name</th><th>Driver</th><th>Created</th><th></th></tr></thead><tbody>${rows}</tbody></table>`);
}

export interface RuleStatus { target: string | null; cert: { notAfter: Date } | null; refused?: string | null }

function ruleState(r: Rule, st: RuleStatus): Html {
  if (!r.enabled) return html`off`;
  if (st.refused) return html`not served<br><small><span class="error">${st.refused}</span></small>`;
  const problems: Html[] = [];
  if (st.target === 'missing') problems.push(html`<span class="error">no container named ${r.target_container}</span>`);
  else if (st.target && st.target !== 'running') problems.push(html`<span class="error">target is ${st.target}</span>`);
  if (r.tls) {
    if (!st.cert) problems.push(html`<span class="warn">no certificate yet: DNS for ${r.hostname} must point at this host and ports 80 and 443 must be reachable from the internet; the kontainers log has the details</span>`);
    else if (st.cert.notAfter.getTime() < Date.now()) problems.push(html`<span class="error">certificate expired ${st.cert.notAfter.toISOString().slice(0, 10)}</span>`);
    else problems.push(html`certificate valid until ${st.cert.notAfter.toISOString().slice(0, 10)}`);
  }
  return html`on${problems.length ? html`<br><small>${problems.map((p, i) => html`${i ? html`; ` : ''}${p}`)}</small>` : ''}`;
}

export function proxyPage(ctx: PageCtx, rules: Rule[], status: { running: boolean; lastError: string | null }, ruleStatus: (r: Rule) => RuleStatus = () => ({ target: null, cert: null })): string {
  if (!ctx.proxyEnabled) {
    return layout('Proxy', ctx, html`<p>The proxy is off. Start kontainers with <code>KONTAINERS_PROXY=1</code> and publish ports 80 and 443
to route domains to containers with automatic HTTPS. See the README.</p>`);
  }
  const rows = rules.map(r => {
    const st = ruleStatus(r);
    const bad = r.enabled && (!!st.refused || st.target === 'missing' || (st.target && st.target !== 'running') || (r.tls && (!st.cert || st.cert.notAfter.getTime() < Date.now())));
    return html`<tr data-state="${!r.enabled ? 'exited' : bad ? 'restarting' : 'running'}"><td><a href="${r.tls ? 'https' : 'http'}://${r.hostname}${r.path === '/' ? '' : r.path}">${r.tls ? 'https' : 'http'}://${r.hostname}${r.path === '/' ? '' : r.path}</a></td>
<td><span class="ref">${r.target_container}:${r.target_port}</span></td><td>${ruleState(r, st)}</td>
<td class="actions"><a class="button" href="/proxy/${r.id}/edit">Edit</a> ${post(ctx, `/proxy/${r.id}/toggle`, r.enabled ? 'Disable' : 'Enable')}
${post(ctx, `/proxy/${r.id}/remove`, 'Remove', { confirm: `Remove the rule for ${r.hostname}?`, cls: 'danger' })}</td></tr>`;
  });
  return layout('Proxy', ctx, html`
<div class="toolbar"><span class="status${status.running ? raw(' on') : raw('')}">Proxy ${status.running ? 'running' : 'not running'}</span>${status.lastError ? html`<span class="error">${status.lastError}</span>` : ''}</div>
<table><thead><tr><th>Address</th><th>Target</th><th>State</th><th></th></tr></thead>
<tbody>${rows.length ? rows : html`<tr><td colspan="4">No rules yet. Add one below to send a domain to a container.</td></tr>`}</tbody></table>
<section class="add"><h2>Add a rule</h2>
<form method="post" action="/proxy" class="stack">${csrfField(ctx)}
  <label>Hostname <input name="hostname" required placeholder="app.example.com"></label>
  <label>Path prefix (sent to the container unchanged) <input name="path" value="/"></label>
  <label>Target container <input name="targetContainer" required placeholder="container name"></label>
  <label>Target port <input name="targetPort" type="number" min="1" max="65535" required></label>
  <label class="check"><input type="checkbox" name="tls" checked> HTTPS with an automatic certificate</label>
  <button>Add rule</button>
</form></section>`);
}

export function editRulePage(ctx: PageCtx, r: Rule): string {
  return layout(`Edit ${r.hostname}`, ctx, html`
<form method="post" action="/proxy/${r.id}/edit" class="stack">${csrfField(ctx)}
  <label>Hostname <input name="hostname" required value="${r.hostname}"></label>
  <label>Path prefix (sent to the container unchanged) <input name="path" value="${r.path}"></label>
  <label>Target container <input name="targetContainer" required value="${r.target_container}"></label>
  <label>Target port <input name="targetPort" type="number" min="1" max="65535" required value="${r.target_port}"></label>
  <label class="check"><input type="checkbox" name="tls"${r.tls ? raw(' checked') : raw('')}> HTTPS with an automatic certificate</label>
  <button>Save</button> <a href="/proxy">Cancel</a>
</form>`, 'Proxy');
}

export function settingsPage(ctx: PageCtx, users: { id: number; username: string }[], selfId: number, targets: Target[] | null = null, watch: { connected: boolean; error: string | null } | null = null): string {
  const rows = users.map(u => html`<tr><td>${u.username}</td>
<td>${u.id === selfId ? html`<em>you</em>` : post(ctx, `/settings/users/${u.id}/remove`, 'Remove', { confirm: `Remove user ${u.username}?`, cls: 'danger' })}</td></tr>`);
  return layout('Settings', ctx, html`
<h2>Change your password</h2>
<form method="post" action="/settings/password" class="stack">${csrfField(ctx)}
  <label>Current password <input name="current" type="password" required autocomplete="current-password"></label>
  <label>New password <input name="next" type="password" required minlength="12" autocomplete="new-password"></label>
  <button>Change password</button>
</form>
<h2>Users</h2>
<p>Every user has full control of the Docker host.</p>
<table><tbody>${rows}</tbody></table>
<form method="post" action="/settings/users" class="stack">${csrfField(ctx)}
  <label>Username <input name="username" required></label>
  <label>Password <input name="password" type="password" required minlength="12" autocomplete="new-password"></label>
  <button>Add user</button>
</form>
${targets ? notifySection(ctx, targets, watch) : ''}
<h2>Backup</h2>
<p><a href="/api/backup">Download a database snapshot</a>. Certificates are in the data volume; see the README for a full backup.</p>`);
}

function notifySection(ctx: PageCtx, targets: Target[], watch: { connected: boolean; error: string | null } | null): Html {
  const rows = targets.map(t => html`<tr><td>${t.kind}</td><td><code>${maskUrl(t.url)}</code>${t.token ? html` <small class="muted">with a token</small>` : ''}</td>
<td>${t.events.join(', ')}</td><td>${t.last_at ? html`${t.last_result} <small class="muted">${ago(t.last_at)}</small>` : html`<span class="muted">nothing sent yet</span>`}</td>
<td class="actions">${post(ctx, `/settings/notify/${t.id}/test`, 'Send test')} ${post(ctx, `/settings/notify/${t.id}/remove`, 'Remove', { confirm: 'Remove this notification target?', cls: 'danger' })}</td></tr>`);
  const boxes = EVENT_KINDS.map(k => html`<label class="check"><input type="checkbox" name="ev_${k}" checked> ${EVENTS[k]}</label>`);
  return html`<h2>Notifications</h2>
<p>kontainers sends a short message when one of these happens. A <strong>webhook</strong> gets a JSON POST with <code>title</code>, <code>message</code>, <code>event</code> and <code>container</code>, and the text again as <code>text</code> and <code>content</code>; an <strong>ntfy</strong> topic URL gets the message as plain text with a Title header. Only the address is shown here, because webhook paths often carry a secret.</p>
${watch && !watch.connected && watch.error ? html`<p class="warn">The Docker event stream is not connected (${watch.error}), so stopped and unhealthy containers are not reported until it is.</p>` : ''}
${rows.length ? html`<table><thead><tr><th>Kind</th><th>Address</th><th>Events</th><th>Last result</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">No notification targets yet.</p>`}
<form method="post" action="/settings/notify" class="stack">${csrfField(ctx)}
  <label>Kind <select name="kind"><option value="webhook">webhook (JSON POST)</option><option value="ntfy">ntfy topic</option></select></label>
  <label>URL <input name="url" type="url" required placeholder="https://ntfy.sh/your-topic" autocomplete="off"></label>
  <label>Token (optional) <input name="token" autocomplete="off" placeholder="sent as Authorization: Bearer"></label>
  <fieldset><legend>Send when</legend>${boxes}</fieldset>
  <button>Add target</button>
</form>`;
}

// What can be removed safely, with the size of each group.
export function cleanupPage(ctx: PageCtx, p: { dangling: { id: string; size: number }[]; unusedTagged: { id: string; tags: string[]; size: number }[]; networks: { name: string }[]; volumes: { name: string }[]; namedUnused: number }): string {
  const total = (items: { size: number }[]) => fmtSize(items.reduce((s, i) => s + i.size, 0));
  const tagged = p.unusedTagged.map(i => html`<tr><td>${i.tags.map((t, k) => html`${k ? html`<br>` : ''}<span class="ref">${t}</span>`)}</td><td><code>${shortId(i.id)}</code></td><td>${fmtSize(i.size)}</td></tr>`);
  return layout('Clean up', ctx, html`
<p>Only things no container uses are listed. A stopped container still uses its image and volumes, so they stay. Sizes count each image's shared layers in full, so less space may be freed than shown; the result says how much was.</p>
<h2>Images without a tag</h2>
${p.dangling.length ? html`<p>${p.dangling.length} image${p.dangling.length === 1 ? '' : 's'}, up to ${total(p.dangling)}. These are left behind when a tag moves to a newer image.</p>
${post(ctx, '/cleanup/images', `Remove ${p.dangling.length} untagged image${p.dangling.length === 1 ? '' : 's'}`, { confirm: `Remove ${p.dangling.length} untagged images?`, cls: 'danger', fields: { scope: 'dangling' } })}` : html`<p class="muted">None.</p>`}
<h2>Tagged images no container uses</h2>
${p.unusedTagged.length ? html`<table><thead><tr><th>Tags</th><th>ID</th><th>Size</th></tr></thead><tbody>${tagged}</tbody></table>
<p>${post(ctx, '/cleanup/images', `Remove these ${p.unusedTagged.length} and the untagged ones`, { confirm: 'Remove every image no container uses? They can be pulled again.', cls: 'danger', fields: { scope: 'unused' } })}</p>` : html`<p class="muted">None.</p>`}
<h2>Networks</h2>
${p.networks.length ? html`<p>${p.networks.map((n, k) => html`${k ? ', ' : ''}<span class="ref">${n.name}</span>`)}: no container is connected.</p>
${post(ctx, '/cleanup/networks', `Remove ${p.networks.length} unused network${p.networks.length === 1 ? '' : 's'}`, { confirm: 'Remove the networks no container is connected to?', cls: 'danger' })}` : html`<p class="muted">None unused.</p>`}
<h2>Anonymous volumes</h2>
${p.volumes.length ? html`<p>${p.volumes.length} anonymous volume${p.volumes.length === 1 ? '' : 's'} no container mounts (created by images that declare a volume, for containers since removed).</p>
${post(ctx, '/cleanup/volumes', `Remove ${p.volumes.length} anonymous volume${p.volumes.length === 1 ? '' : 's'}`, { confirm: 'Remove the unused anonymous volumes and their data?', cls: 'danger' })}` : html`<p class="muted">None unused.</p>`}
${p.namedUnused ? html`<p class="muted">${p.namedUnused} named volume${p.namedUnused === 1 ? ' is' : 's are'} not mounted by any container. Named volumes usually hold data, so they are not removed here; remove one on the <a href="/volumes">Volumes</a> page if you are sure.</p>` : ''}`, 'Images');
}
