// Server-rendered HTML. Every interpolated value goes through esc(); there is no inline script or style.

import type { Rule } from './proxy';
import { domainToUnicode } from 'node:url';
import { containerStatus, type UpdateState } from './updates';
import { EVENTS, EVENT_KINDS, maskUrl, type Target } from './notify';
import type { RegistryLogin } from './registries';
import { DAY_NAMES, describeSchedule, formTime, type Schedule } from './schedule';

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

type Html = { __html: string };
export const raw = (s: string): Html => ({ __html: s });

// Long names, image references, addresses and hashes get places where a line may break (after
// - _ . / : @ , = and every 16 characters of an unbroken run), so a table fits a narrow screen
// without breaking ordinary words or short names. Up to 20 characters are left whole.
export function brk(v: unknown): Html {
  const s = String(v ?? '');
  if (s.length <= 20) return raw(esc(s));
  const chunks: string[] = [];
  // By code point, so a character outside the Basic Multilingual Plane is never cut in two.
  for (const part of s.split(/(?<=[-_./:@,=])/)) { const cp = Array.from(part); for (let i = 0; i < cp.length; i += 16) chunks.push(esc(cp.slice(i, i + 16).join(''))); }
  return raw(chunks.join('<wbr>'));
}
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
  form?: Record<string, string>; // a failed form, to fill in again
  alert?: string | null; // trouble with kontainers itself, shown on every page
  busy?: (name: string) => string | null; // what is being done to a container right now, if anything
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

// apiId: the container that serves kontainers' Docker API (the socket proxy), when there is one.
export interface SelfInfo { id: string; project: string | null; apiId?: string | null }

const labelsOf = (c: any): Record<string, string> => c?.Labels || c?.Config?.Labels || {};

// True for kontainers' own container and the one that serves its Docker API: stopping either from
// the UI would kill the page or cut it off from Docker. Other services in the same compose project
// are ordinary containers.
export function isSelf(c: any, me: SelfInfo | null): boolean {
  if (!me) return false;
  return c?.Id === me.id || (!!me.apiId && c?.Id === me.apiId);
}

const selfNote = (c: any, me: SelfInfo | null) =>
  html`<small class="muted">${c?.Id === me?.id ? 'this is kontainers' : "kontainers' Docker API"}: manage it on the host</small>`;

// Docker lists a port published on all interfaces twice (0.0.0.0 and ::); show it once as "*".
export function formatPorts(ports: any[]): string {
  const groups = new Map<string, Set<string>>();
  for (const p of ports || []) {
    if (!p.PublicPort) continue;
    const k = `${p.PublicPort}->${p.PrivatePort}/${p.Type}`;
    (groups.get(k) || groups.set(k, new Set()).get(k)!).add(p.IP || '');
  }
  // By host port, so a container with many ports reads in order.
  return [...groups].sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10)).map(([k, ips]) => {
    const all = ips.has('0.0.0.0') && ips.has('::');
    const list = all ? ['*'] : [...ips].map(ip => (ip.includes(':') ? `[${ip}]` : ip || '*'));
    return list.map(ip => `${ip}:${k}`).join(', ');
  }).join(', ');
}

const SECTIONS = ['Containers', 'Images', 'Networks', 'Volumes', 'Proxy', 'Activity', 'Settings'];

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
${ctx.alert ? html`<p class="warn" role="alert">${ctx.alert}</p>` : ''}
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

// The second step of a login with two-factor on.
export function twoFactorPage(ctx: PageCtx & { token: string }): string {
  return layout('Log in', ctx, html`
<form method="post" action="/login/code" class="stack">
  <input type="hidden" name="token" value="${ctx.token}">
  <label>Code from your authenticator app, or a recovery code <input name="code" required autocomplete="one-time-code" inputmode="text" autofocus></label>
  <button>Log in</button>
</form>`);
}

export function twoFactorSetupPage(ctx: PageCtx, secret: string, uri: string): string {
  const grouped = secret.match(/.{1,4}/g)!.join(' ');
  return layout('Two-factor login', ctx, html`
<p>Add kontainers to an authenticator app (one that makes six-digit codes, such as those from Google, Microsoft or 2FAS, or a password manager that does): open <a href="${uri}">this link</a> on the phone, or enter the key by hand.</p>
<dl class="facts"><dt>Key</dt><dd><code>${grouped}</code></dd><dt>Account</dt><dd>${ctx.user}</dd><dt>Kind</dt><dd>time-based, 6 digits, every 30 s</dd></dl>
<form method="post" action="/settings/2fa/confirm" class="stack">${csrfField(ctx)}
  <label>The code the app shows now <input name="code" required autocomplete="one-time-code" inputmode="numeric" pattern="[0-9 ]{6,7}"></label>
  <button class="primary">Turn on two-factor login</button>
</form>
<p><a href="/settings">Cancel</a></p>`, 'Settings');
}

export function recoveryCodesPage(ctx: PageCtx, codes: string[]): string {
  return layout('Two-factor login is on', ctx, html`
<p class="flash" role="status">From now on, logging in asks for a code from the app after the password. Your other sessions were logged out.</p>
<p>These recovery codes each let you log in once without the app. Keep them somewhere safe, away from the phone; they are not shown again.</p>
<ul class="codes">${codes.map(c => html`<li><code>${c}</code></li>`)}</ul>
<p>Locked out without them? Another account can turn your two-factor login off on its Settings page, or on the host: <code>docker exec kontainers bun src/main.ts reset-2fa ${ctx.user}</code>.</p>
<p><a class="button" href="/settings">Done</a></p>`, 'Settings');
}

const shortId = (id: string) => String(id || '').replace(/^sha256:/, '').slice(0, 12);
const fmtTime = (s: number) => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 16);
const fmtSize = (b: number) => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`;

export interface UpdateView {
  get: (ref: string) => UpdateState | null;
  // The image an automatic update held back for an opted-in container (by name and ID), if any.
  held?: (name: string, id: string) => string | null;
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
// The newer image the tag points at here is the one an automatic update tried and held back, and
// the registry has nothing newer: recommending it would recommend the image that failed.
export function heldBack(u: UpdateView | null, name: string, id: string, ref: string): string | null {
  const held = u?.held?.(name, id);
  const st = u?.get(ref);
  return held && st && st.imageId === held && st.status !== 'available' ? held : null;
}

const updateBadge = (u: UpdateView | null, ref: string, imageId: string | undefined, name = '', id = '') =>
  !hasNewer(u, ref, imageId) ? '' : heldBack(u, name, id, ref) ? html`<small class="muted">newest image held back</small>` : html`<small class="update">newer image available</small>`;

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
// The name in URLs: it survives a recreation (docker compose up, Update image), so a page left open
// keeps working; the ID only when a name is unusable.
// By name, so a page survives a recreation; by ID when the name is not one kontainers accepts in a
// URL (Docker allows names longer than 128 characters, which compose makes from long project names).
const urlId = (c: any): string => { const n = String(c.Names?.[0] || c.Name || '').replace(/^\//, ''); return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(n) ? n : c.Id; };
// The image reference a listed container was created with (Ref, from listContainersWithRefs), or the
// list's own Image field.
const refOf = (c: any): string => String(c.Ref ?? c.Image ?? '');
const projectOf = (c: any): string => labelsOf(c)['com.docker.compose.project'] || '';
// What the search box matches: name, image and compose project, without case.
const searchText = (c: any) => `${nameOf(c)} ${refOf(c)} ${projectOf(c)}`.toLowerCase();

export function matchesFilter(c: any, f: ListFilter): boolean {
  if (f.q && !searchText(c).includes(f.q.toLowerCase())) return false;
  // Paused containers count as running, as in docker ps: their processes are still there.
  if (f.state === 'running') return c.State === 'running' || c.State === 'paused';
  if (f.state === 'stopped') return c.State !== 'running' && c.State !== 'restarting' && c.State !== 'paused';
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
    return html`<tr data-name="${name}" data-state="${c.State}"${/\(unhealthy\)/.test(c.Status || '') ? raw(' data-health="unhealthy"') : raw('')} data-search="${searchText(c)}"${needsAttention(c) ? raw(' data-attention="1"') : raw('')}${matchesFilter(c, f) ? raw('') : raw(' hidden')}>
  <td><a href="/containers/${urlId(c)}">${brk(name)}</a>${project && !f.group ? html`<small>compose project ${brk(project)}</small>` : ''}<small class="phone-only"><span class="sr-only">Image: </span><span class="ref">${brk(refOf(c))}</span>${ctx.busy?.(name) ? '' : updateBadge(updates, refOf(c), c.ImageID, name, c.Id)}</small></td><td><span class="ref">${brk(refOf(c))}</span>${ctx.busy?.(name) ? '' : updateBadge(updates, refOf(c), c.ImageID, name, c.Id)}</td>
  <td><span class="state ${c.State}">${c.State}</span><small>${c.Status}</small></td><td><span class="ref">${brk(formatPorts(c.Ports))}</span></td>
  <td class="actions">${isSelf(c, me) ? selfNote(c, me) : ctx.busy?.(name) ? html`<small class="muted">${ctx.busy(name)}</small>` : containerActions(ctx, urlId(c), name, c.State)}</td></tr>`;
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
      // A compose project's header can start, stop or restart its containers together (kontainers
      // and its Docker API container are skipped).
      const others = members.filter(c => !isSelf(c, me));
      const acts = k && others.length ? html`<span class="groupacts">${others.some(c => c.State !== 'running') ? post(ctx, `/projects/${k}/start`, 'Start all') : ''} ${others.some(c => c.State === 'running') ? html`${post(ctx, `/projects/${k}/restart`, 'Restart all', { confirm: `Restart every container of ${k}?` })} ${post(ctx, `/projects/${k}/stop`, 'Stop all', { confirm: `Stop every container of ${k}?` })}` : ''}</span>` : '';
      return [html`<tr class="group" data-group="${k}"${visible ? raw('') : raw(' hidden')}><th colspan="5" scope="rowgroup">${k ? html`compose project ${brk(k)}` : 'not in a compose project'} <small>${up} of ${members.length} running</small>${acts}</th></tr>`, ...members.map(row)];
    });
  } else rows = sorted.map(row);

  const running = list.filter(c => c.State === 'running').length;
  const attention = list.filter(needsAttention).length;
  const newer = list.filter(c => hasNewer(updates, refOf(c), c.ImageID)).length;
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
<div class="toolbar"><span class="muted">${running} of ${list.length} running${attention ? html`; <a href="${filterQuery(f, { state: 'attention', q: '' })}">${attention} ${attention === 1 ? 'needs' : 'need'} attention</a>` : ''}</span><span class="spread"></span>${checked}<a class="button primary" href="/containers/new">New container</a></div>
${filters}
<div class="scroll"><table id="containers"><thead><tr><th>Name</th><th>Image</th><th>State</th><th>Published ports</th><th></th></tr></thead>
<tbody>${rows.length ? rows : empty}</tbody></table></div>
<p class="muted" id="nomatch"${list.length && !shown ? raw('') : raw(' hidden')}>No container matches. <a href="/containers">Show all ${list.length}</a>.</p>`);
}

export interface AutoView { on: boolean; row: { last_at: number | null; last_result: string | null; held_image: string | null } | null; waiting?: { until: number; why: 'window' | 'delay' } | null }

// The automatic-update switch on a container's page, with the last result.
function autoForm(ctx: PageCtx, id: string, a: AutoView): Html {
  const last = a.row?.last_at ? html`<small class="muted">Last automatic update ${ago(a.row.last_at)}: ${a.row.last_result || ''}</small>` : '';
  const held = a.on && a.row?.held_image ? html`<small class="warn">Image ${shortId(a.row.held_image)} failed when it was tried and is held back; a newer image will be tried.</small>` : '';
  const at = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const waiting = a.on && a.waiting ? html`<small class="muted">A newer image is waiting ${a.waiting.why === 'window' ? 'for the update window' : 'out the delay set on the Settings page'}; it is installed from ${at(a.waiting.until)}.${a.waiting.why === 'delay' ? ' The delay counts from when a check first saw this image; if the tag moves on to another one meanwhile, that one waits its own delay.' : ''}</small>` : '';
  return html`<form method="post" action="/containers/${id}/autoupdate" class="autoupdate">${csrfField(ctx)}
<label class="check"><input type="checkbox" name="on"${a.on ? raw(' checked') : raw('')}> Update automatically when a check finds a newer image</label>
<button>Save</button>
<small class="muted">The new container is watched while it settles; if it stops, restarts or turns unhealthy, the old one is put back.</small>
${last}${held}${waiting}</form>`;
}

export function containerPage(ctx: PageCtx, c: any, me: SelfInfo | null = null, updates: UpdateView | null = null, auto: AutoView | null = null): string {
  const raw = updates?.get(c.Config?.Image) ?? null;
  // While it is being replaced, what the last check said is about the container going away.
  const upd = raw && !ctx.busy?.(String(c.Name || '').replace(/^\//, '')) ? { ...containerStatus(raw, c.Image)!, checkedAt: raw.checkedAt } : null;
  const name = String(c.Name || '').replace(/^\//, '');
  const held = upd?.status === 'available' ? heldBack(updates, name, c.Id, c.Config?.Image) : null;
  const updText = !upd ? '' : held ? `the newest image for this tag (${shortId(held)}) failed when it was tried automatically and is held back; a newer one will be tried`
    : upd.status === 'available' ? (raw!.status === 'available' ? 'a newer image is available for this tag' : upd.reason)
    : upd.status === 'current' ? 'the newest image for this tag' : `update status unknown: ${upd.reason || ''}`;
  const env = (c.Config?.Env || []).map((e: string) => html`<li><code>${e.replace(/=[\s\S]*/, '=…')}</code></li>`);
  const mounts = (c.Mounts || []).map((m: any) => html`<li><code>${m.Type} ${m.Name || m.Source} → ${m.Destination}${m.RW ? '' : ' (ro)'}</code></li>`);
  const nets = Object.keys(c.NetworkSettings?.Networks || {}).map(n => html`<li>${n}</li>`);
  return layout(name, ctx, html`
<p><a href="/containers">All containers</a></p>
<dl class="facts">
  <dt>ID</dt><dd><code>${shortId(c.Id)}</code></dd>
  <dt>Image</dt><dd><code>${c.Config?.Image}</code>${upd ? html`<small class="${upd.status === 'available' && !held ? 'update' : 'muted'}">${updText} (checked ${ago(upd.checkedAt)})</small>` : ''}</dd>
  <dt>State</dt><dd><span class="state ${c.State?.Status}">${c.State?.Status}</span></dd>
  <dt>Started</dt><dd>${!c.State?.StartedAt || c.State.StartedAt.startsWith('0001-') ? 'never' : `${c.State.StartedAt.slice(0, 16).replace('T', ' ')} UTC`}</dd>
  ${c.State?.Health ? html`<dt>Health</dt><dd>${c.State.Health.Status}${healthNote(c.State.Health)}</dd>` : ''}
  ${c.State?.Status === 'exited' ? html`<dt>Exit code</dt><dd>${c.State.ExitCode}${c.State.OOMKilled ? ' (out of memory)' : ''}</dd>` : ''}
  <dt>Restart policy</dt><dd>${c.HostConfig?.RestartPolicy?.Name}${c.RestartCount ? html`<small class="warn">restarted ${c.RestartCount} time${c.RestartCount === 1 ? '' : 's'}</small>` : ''}</dd>
  ${[...(c.Config?.Entrypoint || []), ...(c.Config?.Cmd || [])].length ? html`<dt>Command</dt><dd><code>${brk(quoteArgs([...(c.Config?.Entrypoint || []), ...(c.Config?.Cmd || [])]))}</code></dd>` : ''}
  ${inspectPorts(c) ? html`<dt>Ports</dt><dd><span class="ref">${inspectPorts(c)}</span></dd>` : ''}
</dl>
<div class="actions">${isSelf(c, me) ? selfNote(c, me) : ctx.busy?.(name) ? html`<p class="muted">${ctx.busy(name)}; reload in a moment.</p>` : containerActions(ctx, urlId(c), name, c.State?.Status || '', true)}
${isSelf(c, me) || ctx.busy?.(name) ? '' : c.Config?.Labels?.['kontainers.managed'] === 'true' && !c.Config?.Labels?.['com.docker.compose.project']
    ? html`${post(ctx, `/containers/${urlId(c)}/update`, 'Update image', { confirm: `Pull ${c.Config?.Image} and, if it changed, recreate ${name} with the same settings?`, cls: upd?.status === 'available' && !held ? 'primary' : '' })} <a class="button" href="/containers/${urlId(c)}/edit">Edit settings</a>`
    : c.Config?.Labels?.['com.docker.compose.project'] ? html`<small class="muted">Part of compose project ${c.Config.Labels['com.docker.compose.project']}: update it with <code>docker compose pull &amp;&amp; docker compose up -d</code>.</small>` : ''}</div>
${auto && !isSelf(c, me) && !ctx.busy?.(name) && c.Config?.Labels?.['kontainers.managed'] === 'true' && !c.Config?.Labels?.['com.docker.compose.project'] ? autoForm(ctx, urlId(c), auto) : ''}
${c.State?.Status === 'running' ? html`<h2>Usage</h2>
<dl class="facts" id="stats" data-stats="/api/containers/${urlId(c)}/stats">
  <dt>CPU</dt><dd data-k="cpu">…</dd><dt>Memory</dt><dd data-k="mem">…</dd>
  <dt>Network in / out</dt><dd data-k="net">…</dd><dt>Processes</dt><dd data-k="pids">…</dd>
</dl>` : ''}
<h2>Environment (values hidden)</h2><ul>${env.length ? env : html`<li>none</li>`}</ul>
<h2>Mounts</h2><ul>${mounts.length ? mounts : html`<li>none</li>`}</ul>
<h2>Networks</h2><ul>${nets}</ul>
<h2>Logs</h2>
<div class="logbar">
  <label>Filter <input type="search" id="logfilter" placeholder="text to look for" autocomplete="off"></label>
  <label>Lines <select id="loglines"><option>300</option><option>1000</option><option>5000</option></select></label>
  <label class="check"><input type="checkbox" id="logts" checked> Timestamps</label>
  <label class="check"><input type="checkbox" id="follow" checked> Follow new lines</label>
  <a href="/api/containers/${urlId(c)}/logs.txt?tail=10000" id="logdl" download>Download the last 10000 lines</a>
  <span class="muted" id="logcount" aria-live="polite"></span>
</div>
<pre id="logs" tabindex="0" role="region" aria-label="Logs of ${name}" data-logs="/api/containers/${urlId(c)}/logs">loading…</pre>`, 'Containers');
}

export function newContainerPage(ctx: PageCtx, allowBind: boolean, autoUpdates = false): string {
  // After a failed create, the form comes back as it was sent.
  const f = ctx.form;
  const val = (k: string) => f?.[k] ?? '';
  const box = (k: string, dflt: boolean) => ((f ? !!f[k] : dflt) ? raw(' checked') : raw(''));
  const opt = (v: string) => html`<option${v === (f?.restart || 'no') ? raw(' selected') : raw('')}>${v}</option>`;
  return layout('New container', ctx, html`
<form method="post" action="/containers" class="stack">${csrfField(ctx)}
  <label>Image <input name="image" required placeholder="nginx:1.27-alpine" value="${val('image')}"></label>
  <label class="check"><input type="checkbox" name="pull"${box('pull', true)}> Pull the image first</label>
  <label>Name <input name="name" placeholder="optional" value="${val('name')}"></label>
  <label>Command <input name="cmd" placeholder='optional, e.g. sh -c "echo hi; sleep 60"' value="${val('cmd')}"></label>
  <label>Ports, one per line: <code>[host-ip:]host:container[/udp]</code>. Without a host IP the port is published on 127.0.0.1.
    <textarea name="ports" rows="3" placeholder="8081:80">${val('ports')}</textarea></label>
  <label>Environment, one <code>KEY=value</code> per line <textarea name="env" rows="3">${val('env')}</textarea></label>
  <label>Volumes, one per line: <code>volume-name:/path[:ro]</code>${allowBind ? raw(' or <code>/host/path:/path[:ro]</code>') : raw('. Host paths are disabled.')}
    <textarea name="volumes" rows="2">${val('volumes')}</textarea></label>
  <label>Restart policy <select name="restart">${opt('no')}${opt('unless-stopped')}${opt('always')}${opt('on-failure')}</select></label>
  <label class="check"><input type="checkbox" name="start"${box('start', true)}> Start after creating</label>
${autoUpdates ? html`  <label class="check"><input type="checkbox" name="autoupdate"${box('autoupdate', false)}> Update automatically when a check finds a newer image</label>\n` : ''}  <button>Create</button>
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
export function editContainerPage(ctx: PageCtx, c: any, spec: EditSpec, allowBind: boolean, imageGone = false): string {
  const name = String(c.Name || '').replace(/^\//, '');
  // After a failed save, the form comes back as it was sent (only on this container's page).
  const k = ctx.form?._edit;
  const f = k && (k === name || String(c.Id || '').startsWith(k)) ? ctx.form! : null;
  const ports = f ? f.ports ?? '' : (spec.ports || []).map(p => `${p.hostIp ? (p.hostIp.includes(':') ? `[${p.hostIp}]` : p.hostIp) + ':' : ''}${p.host}:${p.container}${p.protocol === 'udp' ? '/udp' : ''}`).join('\n');
  const vols = f ? f.volumes ?? '' : (spec.volumes || []).map(m => `${m.source}:${m.target}${m.readOnly ? ':ro' : ''}`).join('\n');
  const restart = f ? f.restart : spec.restart;
  const opt = (v: string) => html`<option${v === (restart || 'no') ? raw(' selected') : raw('')}>${v}</option>`;
  return layout(`Edit ${name}`, ctx, html`
<p><a href="/containers/${urlId(c)}">Back to ${name}</a></p>
<p>Saving recreates ${name} with these settings: it is stopped, a new container is made and started, and if the new one cannot start or stops within a few seconds, the old one is put back. The name and networks stay. Environment values are shown here so they can be edited.</p>
${imageGone ? html`<p class="warn">The image ${name} was created from is no longer on this host, so its own environment and command cannot be told apart from the ones set for ${name}: the fields below may include the old image's values (PATH, version variables). Remove the ones that belong to the image before saving.</p>` : ''}
<form method="post" action="/containers/${urlId(c)}/edit" class="stack">${csrfField(ctx)}
  <label>Image <input name="image" required value="${f ? f.image ?? '' : spec.image}"></label>
  <label class="check"><input type="checkbox" name="pull"${f?.pull ? raw(' checked') : raw('')}> Pull the image first</label>
  <label>Command <input name="cmd" value="${f ? f.cmd ?? '' : spec.cmd ? quoteArgs(spec.cmd) : ''}" placeholder="empty: the image's own command"></label>
  <label>Ports, one per line: <code>[host-ip:]host:container[/udp]</code>. Without a host IP the port is published on 127.0.0.1.
    <textarea name="ports" rows="3">${ports}</textarea></label>
  <label>Environment, one <code>KEY=value</code> per line <textarea name="env" rows="4">${f ? f.env ?? '' : (spec.env || []).join('\n')}</textarea></label>
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
      ? tags.map(t => html`<div>${brk(t)} ${remove(t, 'Remove', tags.length > 1 ? `the tag ${t}` : `image ${t}`)}</div>`)
      : html`<em>untagged</em> ${remove(i.Id, 'Remove', `untagged image ${shortId(i.Id)}`)}`;
    return html`<tr><td>${tagCells}</td><td><code class="id">${shortId(i.Id)}</code></td>
<td>${fmtSize(i.Size)}</td><td class="wide">${fmtTime(i.Created)}</td></tr>`;
  });
  const pending = pulls.map(p => html`<li>${p.ref}: ${p.state === 'pulling' ? 'pulling…' : html`<span class="error">failed: ${p.error}</span>`}</li>`);
  return layout('Images', ctx, html`
<form method="post" action="/images/pull" class="row">${csrfField(ctx)}<input name="ref" required placeholder="alpine:3.20" aria-label="Image to pull"><button>Pull</button></form>
<p class="muted">For a private image, add a registry login on the <a href="/settings">Settings</a> page first.</p>
${pending.length ? html`<ul class="pulls">${pending}</ul>` : ''}
<div class="scroll"><table><thead><tr><th>Tags</th><th>ID</th><th>Size</th><th class="wide">Created (UTC)</th></tr></thead><tbody>${rows}</tbody></table></div>
${cleanup}`);
}

// users: container names per network or volume name, from the container list.
const usedBy = (names: string[] | undefined) => names?.length
  ? html`${names.slice(0, 3).map((n, i) => html`${i ? ', ' : ''}<a href="/containers/${n}">${brk(n)}</a>`)}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`
  : html`<span class="muted">none</span>`;

export function networksPage(ctx: PageCtx, list: any[], users: Map<string, string[]> = new Map()): string {
  const builtin = new Set(['bridge', 'host', 'none']);
  const rows = [...list].sort((a, b) => String(a.Name).localeCompare(String(b.Name))).map(n => html`<tr><td>${brk(n.Name)}</td><td class="wide">${n.Driver}</td><td class="wide">${n.Scope}</td><td>${usedBy(users.get(n.Name))}</td>
<td>${builtin.has(n.Name) ? '' : post(ctx, `/networks/${n.Id}/remove`, 'Remove', { confirm: `Remove network ${n.Name}?`, cls: 'danger' })}</td></tr>`);
  return layout('Networks', ctx, html`
<form method="post" action="/networks" class="row">${csrfField(ctx)}<input name="name" required placeholder="network name" aria-label="Network name"><button>Create</button></form>
<div class="scroll"><table><thead><tr><th>Name</th><th class="wide">Driver</th><th class="wide">Scope</th><th>Containers</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
<p><a href="/cleanup">Clean up</a> networks no container uses.</p>`);
}
export function volumesPage(ctx: PageCtx, list: any[], users: Map<string, string[]> = new Map()): string {
  const rows = [...list].sort((a, b) => String(a.Name).localeCompare(String(b.Name))).map(vol => html`<tr><td>${brk(vol.Name)}</td><td class="wide">${vol.Driver}</td><td class="wide">${vol.CreatedAt || ''}</td><td>${usedBy(users.get(vol.Name))}</td>
<td>${post(ctx, `/volumes/${vol.Name}/remove`, 'Remove', { confirm: `Remove volume ${vol.Name} and its data?`, cls: 'danger' })}</td></tr>`);
  return layout('Volumes', ctx, html`
<form method="post" action="/volumes" class="row">${csrfField(ctx)}<input name="name" required placeholder="volume name" aria-label="Volume name"><button>Create</button></form>
<div class="scroll"><table><thead><tr><th>Name</th><th class="wide">Driver</th><th class="wide">Created</th><th>Mounted by</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
<p><a href="/cleanup">Clean up</a> anonymous volumes no container mounts.</p>`);
}

export interface RuleStatus { target: string | null; cert: { notAfter: Date } | null; refused?: string | null; port?: string | null }

function ruleState(r: Rule, st: RuleStatus): Html {
  if (!r.enabled) return html`off`;
  if (st.refused) return html`not served<br><small><span class="error">${st.refused}</span></small>`;
  const problems: Html[] = [];
  if (st.target === 'missing') problems.push(html`<span class="error">no container named ${r.target_container}</span>`);
  else if (st.target && st.target !== 'running') problems.push(html`<span class="error">target is ${st.target}</span>`);
  else if (st.port) problems.push(html`<span class="error">nothing answers on port ${r.target_port} of ${r.target_container} (${st.port}), so visitors get an error 502</span>`);
  if (r.tls) {
    if (!st.cert) problems.push(html`<span class="warn">no certificate yet: DNS for ${r.hostname} must point at this host and ports 80 and 443 must be reachable from the internet; the kontainers log has the details</span>`);
    else if (st.cert.notAfter.getTime() < Date.now()) problems.push(html`<span class="error">certificate expired ${st.cert.notAfter.toISOString().slice(0, 10)}</span>`);
    else problems.push(html`certificate valid until ${st.cert.notAfter.toISOString().slice(0, 10)}`);
  }
  return html`on${problems.length ? html`<br><small>${problems.map((p, i) => html`${i ? html`; ` : ''}${p}`)}</small>` : ''}`;
}

export function proxyPage(ctx: PageCtx, rules: Rule[], status: { running: boolean; lastError: string | null; networkError?: string | null }, ruleStatus: (r: Rule) => RuleStatus = () => ({ target: null, cert: null })): string {
  if (!ctx.proxyEnabled) {
    return layout('Proxy', ctx, html`<p>The proxy is off. Start kontainers with <code>KONTAINERS_PROXY=1</code> and publish ports 80 and 443
to route domains to containers with automatic HTTPS. See the README.</p>`);
  }
  const rows = rules.map(r => {
    const st = ruleStatus(r);
    const bad = r.enabled && (!!st.refused || !!st.port || st.target === 'missing' || (st.target && st.target !== 'running') || (r.tls && (!st.cert || st.cert.notAfter.getTime() < Date.now())));
    const addr = `${r.tls ? 'https' : 'http'}://${r.hostname}${r.path === '/' ? '' : r.path}`;
    // International names are stored in punycode and shown as written.
    const shown = `${r.tls ? 'https' : 'http'}://${domainToUnicode(r.hostname) || r.hostname}${r.path === '/' ? '' : r.path}`;
    // A wildcard is not an address to visit.
    return html`<tr data-state="${!r.enabled ? 'exited' : bad ? 'restarting' : 'running'}"><td class="addr">${r.hostname.startsWith('*') ? html`<span class="ref">${brk(shown)}</span>` : html`<a href="${addr}">${brk(shown)}</a>`}</td>
<td><span class="ref">${brk(`${r.target_container}:${r.target_port}`)}</span></td><td class="free">${ruleState(r, st)}</td>
<td class="actions"><a class="button" href="/proxy/${r.id}/edit">Edit</a> ${post(ctx, `/proxy/${r.id}/toggle`, r.enabled ? 'Disable' : 'Enable')}
${post(ctx, `/proxy/${r.id}/remove`, 'Remove', { confirm: `Remove the rule for ${addr}?`, cls: 'danger' })}</td></tr>`;
  });
  return layout('Proxy', ctx, html`
<div class="toolbar"><span class="status${status.running ? raw(' on') : raw('')}">Proxy ${status.running ? 'running' : 'not running'}</span>${status.lastError ? html`<span class="error">${status.lastError}</span>` : ''}${status.networkError ? html`<span class="error">${status.networkError}; kontainers tries again every 10 seconds</span>` : ''}</div>
<div class="scroll"><table><thead><tr><th>Address</th><th>Target</th><th>State</th><th></th></tr></thead>
<tbody>${rows.length ? rows : html`<tr><td colspan="4">No rules yet. Add one below to send a domain to a container.</td></tr>`}</tbody></table></div>
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

export function settingsPage(ctx: PageCtx, users: { id: number; username: string }[], selfId: number, targets: Target[] | null = null, watch: { connected: boolean; error: string | null } | null = null, logins: RegistryLogin[] | null = null, schedule: Schedule | null = null, tf: { mine: boolean; left: number; users: Set<number> } | null = null): string {
  const rows = users.map(u => html`<tr><td>${u.username}${tf?.users.has(u.id) ? html` <small class="muted">two-factor</small>` : ''}</td>
<td class="actions">${u.id === selfId ? html`<em>you</em>` : html`${post(ctx, `/settings/users/${u.id}/remove`, 'Remove', { confirm: `Remove user ${u.username}?`, cls: 'danger' })}${tf?.users.has(u.id) ? html` ${post(ctx, `/settings/users/${u.id}/2fa-reset`, 'Turn off two-factor', { confirm: `Turn off two-factor login for ${u.username}? They log in with the password alone until they set it up again.` })}` : ''}`}</td></tr>`);
  const twoFactor = !tf ? '' : tf.mine
    ? html`<h2>Two-factor login</h2><p>On: logging in asks for a code from your authenticator app. ${tf.left} recovery code${tf.left === 1 ? '' : 's'} left.</p>
<form method="post" action="/settings/2fa/disable" class="stack">${csrfField(ctx)}<label>Your password, to turn it off <input name="password" type="password" required autocomplete="current-password"></label><button class="danger">Turn off two-factor login</button></form>
<form method="post" action="/settings/2fa/start" class="stack">${csrfField(ctx)}<label>Your password, to set it up again <input name="password" type="password" required autocomplete="current-password"></label><button>Set it up again (new key and recovery codes)</button></form>`
    : html`<h2>Two-factor login</h2><p>Off. With it on, logging in also asks for a code from an authenticator app on your phone, so a password alone is not enough.</p>
<form method="post" action="/settings/2fa/start" class="inline">${csrfField(ctx)}<button class="primary">Set up two-factor login</button></form>`;
  return layout('Settings', ctx, html`
<h2>Change your password</h2>
<form method="post" action="/settings/password" class="stack">${csrfField(ctx)}
  <label>Current password <input name="current" type="password" required autocomplete="current-password"></label>
  <label>New password <input name="next" type="password" required minlength="12" autocomplete="new-password"></label>
  <button>Change password</button>
</form>
${twoFactor}
<h2>Users</h2>
<p>Every user has full control of the Docker host.</p>
<div class="scroll"><table><tbody>${rows}</tbody></table></div>
<form method="post" action="/settings/users" class="stack">${csrfField(ctx)}
  <label>Username <input name="username" required></label>
  <label>Password <input name="password" type="password" required minlength="12" autocomplete="new-password"></label>
  <button>Add user</button>
</form>
${schedule ? scheduleSection(ctx, schedule) : ''}
${targets ? notifySection(ctx, targets, watch) : ''}
${logins ? registrySection(ctx, logins) : ''}
<h2>Backup</h2>
<p><a href="/api/backup">Download a database snapshot</a>. Certificates are in the data volume; see the README for a full backup.${logins?.length ? ' The snapshot holds registry passwords encrypted; the key, registry.key, stays in the data volume, so after restoring on another host enter them again.' : ''}</p>`);
}

function scheduleSection(ctx: PageCtx, s: Schedule): Html {
  const days = DAY_NAMES.map((d, i) => html`<label class="check"><input type="checkbox" name="day_${i}"${s.days.includes(i) ? raw(' checked') : raw('')}> ${d}</label>`);
  return html`<h2>Automatic updates</h2>
<p>Containers that are updated automatically get a newer image ${describeSchedule(s)}. The time now is ${new Date().toISOString().slice(11, 16)} UTC.</p>
<form method="post" action="/settings/autoupdate" class="stack">${csrfField(ctx)}
  <fieldset><legend>Update window (UTC); leave both empty for any time</legend>
    <label>From <input name="start" type="time" value="${formTime(s.start)}"></label>
    <label>Until <input name="end" type="time" value="${formTime(s.end)}"></label>
  </fieldset>
  <fieldset><legend>On these days (none ticked: every day); a window past midnight counts for the day it starts</legend>${days}</fieldset>
  <label>Wait this many hours after a newer image is first seen (0: at once) <input name="delay" type="number" min="0" max="720" value="${s.delayHours}"></label>
  <button>Save</button>
</form>`;
}

function registrySection(ctx: PageCtx, logins: RegistryLogin[]): Html {
  const rows = logins.map(l => html`<tr><td><span class="ref">${brk(l.registry)}</span></td><td>${brk(l.username)}</td>
<td class="free">${l.last_used_at ? html`${l.last_result} <small class="muted">${ago(l.last_used_at)}</small>` : html`<span class="muted">not used yet</span>`}</td>
<td class="actions">${post(ctx, `/settings/registries/${l.id}/remove`, 'Remove', { confirm: `Remove the login for ${l.registry}?`, cls: 'danger' })}</td></tr>`);
  return html`<h2>Registry logins</h2>
<p>For private images: kontainers gives the login to Docker for each pull and update check of an image on that registry. Logins made with <code>docker login</code> on the host are not visible to kontainers. Passwords are stored encrypted and never shown again; a token with read access is enough.</p>
${rows.length ? html`<div class="scroll"><table><thead><tr><th>Registry</th><th>Username</th><th>Last used</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : html`<p class="muted">No registry logins.</p>`}
<form method="post" action="/settings/registries" class="stack">${csrfField(ctx)}
  <label>Registry <input name="registry" required placeholder="ghcr.io, docker.io or registry.example.com:5000" autocomplete="off"></label>
  <label>Username <input name="username" required autocomplete="off"></label>
  <label>Password or token <input name="password" type="password" required autocomplete="new-password"></label>
  <button>Save login</button>
</form>`;
}

function notifySection(ctx: PageCtx, targets: Target[], watch: { connected: boolean; error: string | null } | null): Html {
  const rows = targets.map(t => html`<tr><td>${t.kind}</td><td><code>${brk(maskUrl(t.url))}</code>${t.token ? html` <small class="muted">with a token</small>` : ''}</td>
<td class="wide">${t.events.join(', ')}</td><td class="free">${t.last_at ? html`${t.last_result} <small class="muted">${ago(t.last_at)}</small>` : html`<span class="muted">nothing sent yet</span>`}</td>
<td class="actions">${post(ctx, `/settings/notify/${t.id}/test`, 'Send test')} ${post(ctx, `/settings/notify/${t.id}/remove`, 'Remove', { confirm: 'Remove this notification target?', cls: 'danger' })}</td></tr>`);
  const boxes = EVENT_KINDS.map(k => html`<label class="check"><input type="checkbox" name="ev_${k}" checked> ${EVENTS[k]}</label>`);
  return html`<h2>Notifications</h2>
<p>kontainers sends a short message when one of these happens. A <strong>webhook</strong> gets a JSON POST with <code>title</code>, <code>message</code>, <code>event</code> and <code>container</code>, and the text again as <code>text</code> and <code>content</code>; an <strong>ntfy</strong> topic URL gets the message as plain text with a Title header. Only the address is shown here, because webhook paths often carry a secret.</p>
${watch && !watch.connected && watch.error ? html`<p class="warn">The Docker event stream is not connected (${watch.error}), so stopped and unhealthy containers are not reported until it is.</p>` : ''}
${rows.length ? html`<div class="scroll"><table><thead><tr><th>Kind</th><th>Address</th><th class="wide">Events</th><th>Last result</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : html`<p class="muted">No notification targets yet.</p>`}
<form method="post" action="/settings/notify" class="stack">${csrfField(ctx)}
  <label>Kind <select name="kind"><option value="webhook">webhook (JSON POST)</option><option value="ntfy">ntfy topic</option></select></label>
  <label>URL <input name="url" type="url" required placeholder="https://ntfy.sh/your-topic" autocomplete="off"></label>
  <label>Token (optional) <input name="token" autocomplete="off" placeholder="sent as Authorization: Bearer"></label>
  <fieldset><legend>Send when</legend>${boxes}</fieldset>
  <button>Add target</button>
</form>`;
}

// What can be removed safely, with the size of each group.
export function cleanupPage(ctx: PageCtx, p: { dangling: { id: string; size: number }[]; unusedTagged: { id: string; tags: string[]; size: number }[]; localUnused?: { id: string; tags: string[]; size: number }[]; networks: { name: string }[]; volumes: { name: string; created?: string | null }[]; namedUnused: number }): string {
  const total = (items: { size: number }[]) => fmtSize(items.reduce((s, i) => s + i.size, 0));
  const tagged = p.unusedTagged.map(i => html`<tr><td>${i.tags.map((t, k) => html`${k ? html`<br>` : ''}<span class="ref">${brk(t)}</span>`)}</td><td><code class="id">${shortId(i.id)}</code></td><td>${fmtSize(i.size)}</td></tr>`);
  return layout('Clean up', ctx, html`
<p>Only things no container uses are listed. A stopped container still uses its image and volumes, so they stay. Sizes count each image's shared layers in full, so less space may be freed than shown; the result says how much was.</p>
<h2>Images without a tag</h2>
${p.dangling.length ? html`<p>${p.dangling.length} image${p.dangling.length === 1 ? '' : 's'}, up to ${total(p.dangling)}. These are left behind when a tag moves to a newer image.</p>
${post(ctx, '/cleanup/images', `Remove ${p.dangling.length} untagged image${p.dangling.length === 1 ? '' : 's'}`, { confirm: `Remove ${p.dangling.length} untagged images?`, cls: 'danger', fields: { scope: 'dangling' } })}` : html`<p class="muted">None.</p>`}
<h2>Tagged images no container uses</h2>
${p.unusedTagged.length ? html`<div class="scroll"><table><thead><tr><th>Tags</th><th>ID</th><th>Size</th></tr></thead><tbody>${tagged}</tbody></table></div>
<p>${post(ctx, '/cleanup/images', `Remove these ${p.unusedTagged.length} and the untagged ones`, { confirm: 'Remove every image no container uses? They can be pulled again.', cls: 'danger', fields: { scope: 'unused' } })}</p>` : html`<p class="muted">None.</p>`}
${p.localUnused?.length ? html`<h2>Images built on this host</h2>
<p>${p.localUnused.map((i, k) => html`${k ? ', ' : ''}<span class="ref">${i.tags.join(', ')}</span> (${fmtSize(i.size)})`)}: no container uses ${p.localUnused.length === 1 ? 'it' : 'them'}, but ${p.localUnused.length === 1 ? 'it was' : 'they were'} built here and cannot be pulled again, so ${p.localUnused.length === 1 ? 'it is' : 'they are'} not removed in bulk. Remove one on the <a href="/images">Images</a> page if you are sure.</p>` : ''}
<h2>Networks</h2>
${p.networks.length ? html`<p>${p.networks.map((n, k) => html`${k ? ', ' : ''}<span class="ref">${n.name}</span>`)}: no container is connected.</p>
${post(ctx, '/cleanup/networks', `Remove ${p.networks.length} unused network${p.networks.length === 1 ? '' : 's'}`, { confirm: 'Remove the networks no container is connected to?', cls: 'danger' })}` : html`<p class="muted">None unused.</p>`}
<h2>Anonymous volumes</h2>
${p.volumes.length ? html`<p>${p.volumes.length} anonymous volume${p.volumes.length === 1 ? '' : 's'} no container mounts. An image that declares a volume (a database's data directory, say) gets one, and it is left behind when its container is removed, or by an update in kontainers 0.3 and earlier. It can hold the only copy of that data: choose each one you are sure of. None is selected to start with.</p>
<form method="post" action="/cleanup/volumes" class="stack" data-confirm="Remove the selected volumes and the data in them?">${csrfField(ctx)}
<fieldset><legend>Anonymous volumes no container mounts</legend>${p.volumes.map(vol => html`<label class="check"><input type="checkbox" name="vol_${vol.name}"> <code>${vol.name.slice(0, 12)}</code> <small class="muted">created ${vol.created ? vol.created.slice(0, 16).replace('T', ' ') : 'at an unknown time'}</small></label>`)}</fieldset>
<button class="danger">Remove the selected volumes</button></form>` : html`<p class="muted">None unused.</p>`}
${p.namedUnused ? html`<p class="muted">${p.namedUnused} named volume${p.namedUnused === 1 ? ' is' : 's are'} not mounted by any container. Named volumes usually hold data, so they are not removed here; remove one on the <a href="/volumes">Volumes</a> page if you are sure.</p>` : ''}`, 'Images');
}

// What each audit action means, for the Activity page.
const ACTIONS: Record<string, string> = {
  'login': 'logged in', 'login-failed': 'failed to log in', 'logout': 'logged out', 'setup': 'created the first account',
  'password-change': 'changed their password', 'user-create': 'added a user', 'user-remove': 'removed a user', 'backup': 'downloaded a backup',
  'container-create': 'created a container', 'container-start': 'started', 'container-stop': 'stopped', 'container-restart': 'restarted',
  'container-unpause': 'unpaused', 'container-remove': 'removed', 'container-update': 'updated the image of', 'container-edit': 'edited the settings of',
  'autoupdate-on': 'turned on automatic updates for', 'autoupdate-off': 'turned off automatic updates for', 'auto-update': 'updated automatically',
  'recover': 'tidied up after an interrupted update of',
  'update-check': 'checked for updates', 'image-pull': 'pulled', 'image-remove': 'removed the image',
  'network-create': 'created the network', 'network-remove': 'removed the network', 'volume-create': 'created the volume', 'volume-remove': 'removed the volume',
  'proxy-create': 'added the proxy rule', 'proxy-edit': 'edited proxy rule', 'proxy-toggle': 'turned on or off proxy rule', 'proxy-remove': 'removed proxy rule',
  'notify-add': 'added a notification target', 'notify-test': 'tested notification target', 'notify-remove': 'removed notification target',
  'registry-add': 'saved the registry login for', 'registry-remove': 'removed the registry login for',
  'schedule-set': 'set automatic updates to run',
  '2fa-enable': 'turned on two-factor login for', '2fa-disable': 'turned off two-factor login for', '2fa-reset': 'turned off two-factor login of user',
  'project-start': 'started every container of', 'project-stop': 'stopped every container of', 'project-restart': 'restarted every container of',
  'cleanup-images': 'cleaned up images', 'cleanup-networks': 'cleaned up networks', 'cleanup-volumes': 'cleaned up anonymous volumes',
};

export interface AuditRow { id: number; at: number; username: string | null; action: string; target: string | null; ip: string | null; result: string | null }

export function activityPage(ctx: PageCtx, rows: AuditRow[], q: string, older: number | null): string {
  const who = (r: AuditRow) => r.username ?? (r.ip ? html`<span class="muted">not logged in</span>` : html`<span class="muted">kontainers</span>`);
  // A result that starts with "note: " is something kontainers did and says more about, not a failure.
  const failed = (r: AuditRow) => !!r.result && !r.result.startsWith('note: ');
  const list = rows.map(r => html`<tr${failed(r) ? raw(' class="failed"') : raw('')}><td>${new Date(r.at).toISOString().slice(0, 19).replace('T', ' ')}</td><td>${who(r)}</td>
<td>${ACTIONS[r.action] || r.action}${r.target ? html` <span class="ref">${brk(r.target)}</span>` : ''}${r.result ? html`<br><small class="${failed(r) ? 'error' : 'muted'}">${failed(r) ? r.result : r.result.slice(6)}</small>` : ''}</td><td><span class="ref addr">${brk(r.ip || '')}</span></td></tr>`);
  return layout('Activity', ctx, html`
<p>Who did what, newest first, including failed attempts and what kontainers did on its own. Entries older than a year are removed.</p>
<form method="get" action="/activity" class="filters" role="search"><label>Search <input type="search" name="q" value="${q}" placeholder="user, action or name"></label><button>Apply</button>${q ? html` <a href="/activity">Clear</a>` : ''}</form>
${list.length ? html`<div class="scroll"><table><thead><tr><th>When (UTC)</th><th>Who</th><th>What</th><th>From</th></tr></thead><tbody>${list}</tbody></table></div>` : html`<p class="muted">${q ? 'Nothing matches.' : 'Nothing yet.'}</p>`}
${older ? html`<p><a href="/activity?before=${older}${q ? `&q=${encodeURIComponent(q)}` : ''}">Older</a></p>` : ''}`);
}

// Action names whose description contains `q`, so the search finds "stopped" as well as "container-stop".
export function actionsMatching(q: string): string[] {
  const t = q.toLowerCase();
  return t ? Object.entries(ACTIONS).filter(([k, label]) => label.includes(t) || k.includes(t)).map(([k]) => k) : [];
}

// The last healthcheck's output, when it failed, so "unhealthy" comes with its reason.
function healthNote(h: any): Html | string {
  const last = (h?.Log || []).at(-1);
  if (!last || h.Status === 'healthy') return '';
  const out = String(last.Output || '').trim().slice(0, 300);
  return html`<small class="muted">${h.FailingStreak ? `failed ${h.FailingStreak} check${h.FailingStreak === 1 ? '' : 's'} in a row` : 'last check'}${last.ExitCode != null ? `, exit code ${last.ExitCode}` : ''}${out ? html`: <code>${out}</code>` : ''}</small>`;
}

// Published ports from an inspected container, in the list's format.
function inspectPorts(c: any): string {
  const ports: any[] = [];
  for (const [key, binds] of Object.entries(c?.NetworkSettings?.Ports || {}) as [string, any[] | null][]) {
    const [port, proto] = key.split('/');
    for (const b of binds || []) ports.push({ IP: b.HostIp, PublicPort: Number(b.HostPort), PrivatePort: Number(port), Type: proto });
  }
  return formatPorts(ports);
}
