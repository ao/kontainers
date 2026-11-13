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

export interface PageCtx { user?: string; csrf?: string; flash?: string; error?: string; proxyEnabled?: boolean }

const csrfField = (ctx: PageCtx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

function post(ctx: PageCtx, action: string, label: string, opts: { confirm?: string; cls?: string } = {}): Html {
  return html`<form method="post" action="${action}" class="inline"${opts.confirm ? raw(` data-confirm="${esc(opts.confirm)}"`) : raw('')}>${csrfField(ctx)}<button class="${opts.cls || ''}">${label}</button></form>`;
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
(<code>docker logs kontainers</code>). Every account has full control of the Docker host.</p>
<form method="post" action="/setup" class="stack">
  <label>Setup token <input name="token" required autocomplete="off"></label>
  <label>Username <input name="username" required autocomplete="username"></label>
  <label>Password (12 characters or more) <input name="password" type="password" required minlength="12" autocomplete="new-password"></label>
  <button>Create account</button>
</form>`);
}

export function loginPage(ctx: PageCtx): string {
  return layout('Log in', ctx, html`
<form method="post" action="/login" class="stack">
  <label>Username <input name="username" required autocomplete="username" autofocus></label>
  <label>Password <input name="password" type="password" required autocomplete="current-password"></label>
  <button>Log in</button>
</form>`);
}

const shortId = (id: string) => String(id || '').replace(/^sha256:/, '').slice(0, 12);
const fmtTime = (s: number) => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 16);
const fmtSize = (b: number) => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`;

export function containersPage(ctx: PageCtx, list: any[]): string {
  const rows = list.map(c => {
    const name = (c.Names?.[0] || '').replace(/^\//, '');
    const ports = (c.Ports || []).filter((p: any) => p.PublicPort).map((p: any) => `${p.IP}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`).join(', ');
    const running = c.State === 'running';
    return html`<tr data-name="${name}">
  <td><a href="/containers/${c.Id}">${name}</a></td><td>${c.Image}</td>
  <td><span class="state ${c.State}">${c.State}</span> <small>${c.Status}</small></td><td>${ports}</td>
  <td class="actions">${running ? post(ctx, `/containers/${c.Id}/stop`, 'Stop') : post(ctx, `/containers/${c.Id}/start`, 'Start')}
  ${post(ctx, `/containers/${c.Id}/restart`, 'Restart')}
  ${post(ctx, `/containers/${c.Id}/remove`, 'Remove', { confirm: `Remove container ${name}?`, cls: 'danger' })}</td></tr>`;
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
  <dt>Started</dt><dd>${c.State?.StartedAt}</dd>
  <dt>Restart policy</dt><dd>${c.HostConfig?.RestartPolicy?.Name}</dd>
</dl>
<p class="actions">${c.State?.Running ? post(ctx, `/containers/${c.Id}/stop`, 'Stop') : post(ctx, `/containers/${c.Id}/start`, 'Start')}
${post(ctx, `/containers/${c.Id}/restart`, 'Restart')}
${post(ctx, `/containers/${c.Id}/remove`, 'Remove', { confirm: `Remove container ${name}?`, cls: 'danger' })}</p>
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

export function imagesPage(ctx: PageCtx, list: any[]): string {
  const rows = list.map(i => {
    const tags: string[] = i.RepoTags?.filter((t: string) => t !== '<none>:<none>') || [];
    const ref = tags[0] || i.Id;
    return html`<tr><td>${tags.length ? tags.join(', ') : html`<em>untagged</em>`}</td><td><code>${shortId(i.Id)}</code></td>
<td>${fmtSize(i.Size)}</td><td>${fmtTime(i.Created)}</td>
<td><form method="post" action="/images/remove" class="inline" data-confirm="Remove image ${ref}?">${csrfField(ctx)}<input type="hidden" name="ref" value="${ref}"><button class="danger">Remove</button></form></td></tr>`;
  });
  return layout('Images', ctx, html`
<form method="post" action="/images/pull" class="row">${csrfField(ctx)}<input name="ref" required placeholder="alpine:3.20" aria-label="Image to pull"><button>Pull</button></form>
<table><thead><tr><th>Tags</th><th>ID</th><th>Size</th><th>Created (UTC)</th><th></th></tr></thead><tbody>${rows}</tbody></table>`);
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

export function proxyPage(ctx: PageCtx, rules: Rule[], status: { running: boolean; lastError: string | null }): string {
  if (!ctx.proxyEnabled) {
    return layout('Proxy', ctx, html`<p>The proxy is off. Start kontainers with <code>KONTAINERS_PROXY=1</code> and publish ports 80 and 443
to route domains to containers with automatic HTTPS. See the README.</p>`);
  }
  const rows = rules.map(r => html`<tr><td>${r.tls ? 'https' : 'http'}://${r.hostname}${r.path === '/' ? '' : r.path}</td>
<td>${r.target_container}:${r.target_port}</td><td>${r.enabled ? 'on' : 'off'}</td>
<td class="actions">${post(ctx, `/proxy/${r.id}/toggle`, r.enabled ? 'Disable' : 'Enable')}
${post(ctx, `/proxy/${r.id}/remove`, 'Remove', { confirm: `Remove the rule for ${r.hostname}?`, cls: 'danger' })}</td></tr>`);
  return layout('Proxy', ctx, html`
<p>Proxy: ${status.running ? 'running' : 'not running'}${status.lastError ? html` <span class="error">${status.lastError}</span>` : ''}</p>
<form method="post" action="/proxy" class="stack">${csrfField(ctx)}
  <label>Hostname <input name="hostname" required placeholder="app.example.com"></label>
  <label>Path prefix <input name="path" value="/"></label>
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
