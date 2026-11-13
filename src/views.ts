// Server-rendered HTML. Every interpolated value goes through esc(); there is no inline script or style.

import type { Rule } from './proxy';

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

export function layout(title: string, ctx: PageCtx, body: Html): string {
  const nav = ctx.user ? html`
    <nav>
      <a href="/containers">Containers</a>
      <a href="/images">Images</a>
      <a href="/networks">Networks</a>
      <a href="/volumes">Volumes</a>
      <a href="/proxy">Proxy</a>
      <a href="/settings">Settings</a>
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

export function containersPage(ctx: PageCtx, list: any[]): string {
  const rows = list.map(c => {
    const name = (c.Names?.[0] || '').replace(/^\//, '');
    const project = c.Labels?.['com.docker.compose.project'];
    return html`<tr data-name="${name}">
  <td><a href="/containers/${c.Id}">${name}</a>${project ? html` <small class="muted">compose: ${project}</small>` : ''}</td><td>${c.Image}</td>
  <td><span class="state ${c.State}">${c.State}</span> <small>${c.Status}</small></td><td>${formatPorts(c.Ports)}</td>
  <td class="actions">${containerActions(ctx, c.Id, name, c.State)}</td></tr>`;
  });
  return layout('Containers', ctx, html`
<p><a class="button" href="/containers/new">New container</a></p>
<table><thead><tr><th>Name</th><th>Image</th><th>State</th><th>Published ports</th><th></th></tr></thead>
<tbody>${rows.length ? rows : html`<tr><td colspan="5">No containers.</td></tr>`}</tbody></table>`);
}

export function containerPage(ctx: PageCtx, c: any): string {
  const name = String(c.Name || '').replace(/^\//, '');
  const env = (c.Config?.Env || []).map((e: string) => html`<li><code>${e.replace(/=.*/, '=…')}</code></li>`);
  const mounts = (c.Mounts || []).map((m: any) => html`<li><code>${m.Type} ${m.Name || m.Source} → ${m.Destination}${m.RW ? '' : ' (ro)'}</code></li>`);
  const nets = Object.keys(c.NetworkSettings?.Networks || {}).map(n => html`<li>${n}</li>`);
  return layout(name, ctx, html`
<dl class="facts">
  <dt>ID</dt><dd><code>${shortId(c.Id)}</code></dd>
  <dt>Image</dt><dd>${c.Config?.Image}</dd>
  <dt>State</dt><dd><span class="state ${c.State?.Status}">${c.State?.Status}</span></dd>
  <dt>Started</dt><dd>${!c.State?.StartedAt || c.State.StartedAt.startsWith('0001-') ? 'never' : c.State.StartedAt}</dd>
  ${c.State?.Health ? html`<dt>Health</dt><dd>${c.State.Health.Status}</dd>` : ''}
  ${c.State?.Status === 'exited' ? html`<dt>Exit code</dt><dd>${c.State.ExitCode}</dd>` : ''}
  <dt>Restart policy</dt><dd>${c.HostConfig?.RestartPolicy?.Name}</dd>
</dl>
<div class="actions">${containerActions(ctx, c.Id, name, c.State?.Status || '', true)}</div>
<h2>Environment (values hidden)</h2><ul>${env.length ? env : html`<li>none</li>`}</ul>
<h2>Mounts</h2><ul>${mounts.length ? mounts : html`<li>none</li>`}</ul>
<h2>Networks</h2><ul>${nets}</ul>
<h2>Logs</h2>
<p><label><input type="checkbox" id="follow" checked> Follow</label></p>
<pre id="logs" data-logs="/api/containers/${c.Id}/logs?tail=300">loading…</pre>`);
}

export function newContainerPage(ctx: PageCtx, allowBind: boolean): string {
  return layout('New container', ctx, html`
<form method="post" action="/containers" class="stack">${csrfField(ctx)}
  <label>Image <input name="image" required placeholder="nginx:1.27-alpine"></label>
  <label><input type="checkbox" name="pull" checked> Pull the image first</label>
  <label>Name <input name="name" placeholder="optional"></label>
  <label>Command <input name="cmd" placeholder='optional, e.g. sh -c "echo hi; sleep 60"'></label>
  <label>Ports, one per line: <code>[host-ip:]host:container[/udp]</code>. Without a host IP the port is published on 127.0.0.1.
    <textarea name="ports" rows="3" placeholder="8081:80"></textarea></label>
  <label>Environment, one <code>KEY=value</code> per line <textarea name="env" rows="3"></textarea></label>
  <label>Volumes, one per line: <code>volume-name:/path[:ro]</code>${allowBind ? raw(' or <code>/host/path:/path[:ro]</code>') : raw('. Host paths are disabled.')}
    <textarea name="volumes" rows="2"></textarea></label>
  <label>Restart policy <select name="restart"><option>no</option><option>unless-stopped</option><option>always</option><option>on-failure</option></select></label>
  <label><input type="checkbox" name="start" checked> Start after creating</label>
  <button>Create</button>
</form>`);
}

export function imagesPage(ctx: PageCtx, list: any[], pulls: { ref: string; state: string; error?: string }[] = []): string {
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
<table><thead><tr><th>Tags</th><th>ID</th><th>Size</th><th>Created (UTC)</th></tr></thead><tbody>${rows}</tbody></table>`);
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

export interface RuleStatus { target: string | null; cert: { notAfter: Date } | null }

function ruleState(r: Rule, st: RuleStatus): Html {
  if (!r.enabled) return html`off`;
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
  const rows = rules.map(r => html`<tr><td>${r.tls ? 'https' : 'http'}://${r.hostname}${r.path === '/' ? '' : r.path}</td>
<td>${r.target_container}:${r.target_port}</td><td>${ruleState(r, ruleStatus(r))}</td>
<td class="actions">${post(ctx, `/proxy/${r.id}/toggle`, r.enabled ? 'Disable' : 'Enable')}
${post(ctx, `/proxy/${r.id}/remove`, 'Remove', { confirm: `Remove the rule for ${r.hostname}?`, cls: 'danger' })}</td></tr>`);
  return layout('Proxy', ctx, html`
<p>Proxy: ${status.running ? 'running' : 'not running'}${status.lastError ? html` <span class="error">${status.lastError}</span>` : ''}</p>
<form method="post" action="/proxy" class="stack">${csrfField(ctx)}
  <label>Hostname <input name="hostname" required placeholder="app.example.com"></label>
  <label>Path prefix (sent to the container unchanged) <input name="path" value="/"></label>
  <label>Target container <input name="targetContainer" required placeholder="container name"></label>
  <label>Target port <input name="targetPort" type="number" min="1" max="65535" required></label>
  <label><input type="checkbox" name="tls" checked> HTTPS with an automatic certificate</label>
  <button>Add rule</button>
</form>
<table><thead><tr><th>Address</th><th>Target</th><th>State</th><th></th></tr></thead>
<tbody>${rows.length ? rows : html`<tr><td colspan="4">No rules.</td></tr>`}</tbody></table>`);
}

export function settingsPage(ctx: PageCtx, users: { id: number; username: string }[], selfId: number): string {
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
<h2>Backup</h2>
<p><a href="/api/backup">Download a database snapshot</a>. Certificates are in the data volume; see the README for a full backup.</p>`);
}
