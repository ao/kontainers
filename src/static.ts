// The two static files, kept in code so the binary has no asset directory to find.
// app.js only adds confirm prompts and log polling; every page works without it.

// Container-yard palette: marine blue for the frame and primary actions, and signal paint for
// container states (green running, amber restarting or paused, steel stopped, rust for danger).
// The one bold device is the painted stripe on each container row's left edge.
const css = `
:root {
  --ground: #f5f7f6; --panel: #ffffff; --ink: #1c2329; --muted: #5b6670; --line: #d8dedb;
  --marine: #14456e; --marine-ink: #ffffff; --link: #14456e;
  --run: #1f7a4a; --warn: #b26a00; --stop: #8a949c; --rust: #a63a2b;
  --focus: #2f7fd1; --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --ground: #12171b; --panel: #192026; --ink: #e3e8ea; --muted: #97a3ab; --line: #2c363d;
    --marine: #0f3654; --link: #8cc0ec; --run: #4cc283; --warn: #e3a440; --stop: #6f7a82; --rust: #e07a68; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--ground); font-variant-numeric: tabular-nums; }
a { color: var(--link); text-underline-offset: .15em; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

header { display: flex; align-items: stretch; gap: 2rem; padding: 0 1.25rem; background: var(--marine); color: var(--marine-ink); flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: .55rem; color: inherit; text-decoration: none; font-weight: 650; font-size: 1.05rem; letter-spacing: .01em; padding: .7rem 0; }
.brand::before { content: ""; width: 1.05rem; height: .8rem; border: 2px solid currentColor; border-radius: 2px;
  background: repeating-linear-gradient(90deg, transparent 0 3px, currentColor 3px 4px); opacity: .9; }
nav { display: flex; align-items: stretch; gap: .25rem; flex: 1; flex-wrap: wrap; }
nav a { color: rgba(255,255,255,.78); text-decoration: none; padding: .75rem .65rem .65rem; border-bottom: 3px solid transparent; }
nav a:hover { color: #fff; }
nav a[aria-current="page"] { color: #fff; border-bottom-color: #fff; }
nav .spacer { flex: 1; }
nav .who { align-self: center; color: rgba(255,255,255,.7); margin-right: .9rem; }
nav form.inline { align-self: center; }
nav button.link { color: #fff; }

main { padding: 1.5rem 1.25rem 3rem; max-width: 76rem; }
h1 { font-size: 1.5rem; font-weight: 650; margin: 0 0 1.1rem; letter-spacing: -.01em; }
h2 { font-size: 1.05rem; font-weight: 650; margin: 2rem 0 .6rem; }
p { max-width: 70ch; }

table { border-collapse: separate; border-spacing: 0; width: 100%; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
th, td { text-align: left; padding: .6rem .75rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
th { font-weight: 600; font-size: .85rem; color: var(--muted); background: var(--ground); }
tbody tr:hover td { background: color-mix(in srgb, var(--panel) 92%, var(--marine)); }
td a { font-weight: 600; text-decoration: none; }
td a:hover { text-decoration: underline; }
td small, .sub { display: block; color: var(--muted); font-size: .82rem; margin-top: .1rem; }
td code, .ref { font-family: var(--mono); font-size: .84rem; }

/* The painted stripe: the state of each container, readable down the left edge of the table. */
tr[data-state] td:first-child { box-shadow: inset 5px 0 0 var(--stripe, var(--stop)); padding-left: 1.1rem; }
tr[data-state="running"] { --stripe: var(--run); }
tr[data-state="restarting"], tr[data-state="paused"] { --stripe: var(--warn); }
tr[data-state="dead"] { --stripe: var(--rust); }
.state { display: inline-flex; align-items: center; gap: .4rem; font-weight: 600; }
.state::before { content: ""; width: .55rem; height: .55rem; border-radius: 50%; background: var(--stripe, var(--stop)); }
.state.running { --stripe: var(--run); color: var(--run); }
.state.restarting, .state.paused { --stripe: var(--warn); color: var(--warn); }
.state.dead { --stripe: var(--rust); color: var(--rust); }
.state.exited, .state.created { color: var(--muted); }

form.inline { display: inline; }
form.stack { display: grid; gap: .9rem; max-width: 36rem; }
form.stack label { display: grid; gap: .3rem; font-weight: 550; }
form.stack label.check, label.check { display: flex; align-items: center; gap: .5rem; font-weight: 500; }
form.row { display: flex; gap: .5rem; margin-bottom: 1.2rem; max-width: 36rem; }
form.row input { flex: 1; }
input, select, textarea, button { font: inherit; color: inherit; }
input, select, textarea { padding: .5rem .6rem; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); font-weight: 400; }
input:focus, select:focus, textarea:focus { border-color: var(--focus); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 25%, transparent); }
input[type=checkbox] { width: 1rem; height: 1rem; accent-color: var(--marine); }
code { font-family: var(--mono); font-size: .88em; }

button, a.button { display: inline-block; padding: .45rem .9rem; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); cursor: pointer; text-decoration: none; font-weight: 550; color: var(--ink); }
button:hover, a.button:hover { border-color: var(--muted); }
form.stack > button, form.row > button, a.button.primary { background: var(--marine); color: var(--marine-ink); border-color: var(--marine); justify-self: start; }
button.danger { color: var(--rust); }
button.danger:hover { border-color: var(--rust); }
button.link { border: 0; padding: 0; background: none; color: var(--link); font-weight: 500; }
.actions { white-space: nowrap; }
.actions form, .actions a.button { margin-right: .3rem; }
.actions button, .actions a.button { padding: .3rem .7rem; font-size: .88rem; }
div.actions { margin: 1rem 0; white-space: normal; }

.flash, .error { padding: .6rem .9rem; border-radius: 5px; border-left: 4px solid; background: var(--panel); max-width: 70ch; }
.flash { border-color: var(--run); }
.error { border-color: var(--rust); color: var(--ink); }
span.error, small .error { padding: 0; border: 0; background: none; color: var(--rust); }
.warn { color: var(--warn); }
.muted { color: var(--muted); }
.toolbar { display: flex; align-items: center; gap: .9rem; margin-bottom: 1rem; flex-wrap: wrap; }
.toolbar .spread { flex: 1; }
.toolbar form.inline button { padding: .35rem .8rem; font-size: .88rem; }
small.update { display: block; color: var(--warn); font-weight: 600; font-size: .82rem; margin-top: .15rem; }
small.update::before { content: "\\2191 "; }
button.primary { background: var(--marine); color: var(--marine-ink); border-color: var(--marine); }
.status { display: inline-flex; align-items: center; gap: .45rem; font-weight: 600; }
.status::before { content: ""; width: .6rem; height: .6rem; border-radius: 50%; background: var(--stop); }
.status.on::before { background: var(--run); }
section.add { margin: 1.75rem 0 0; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: .3rem 1.25rem 1.25rem; max-width: 40rem; }
section.add h2 { margin-top: .9rem; }
ul.pulls { margin: 0 0 1rem; padding-left: 1.2rem; }

dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1.5rem; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: .9rem 1.1rem; max-width: 46rem; }
dl.facts dt { color: var(--muted); }
dl.facts dd { margin: 0; }
pre#logs { background: #0f1418; color: #d7dee2; padding: .9rem 1rem; max-height: 32rem; overflow: auto; font: .82rem/1.5 var(--mono); white-space: pre-wrap; border-radius: 6px; }

@media (max-width: 720px) {
  header { gap: .5rem; } nav a { padding: .55rem .45rem; }
  th:nth-child(4), td:nth-child(4) { display: none; }
  .actions { white-space: normal; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

const js = `
document.addEventListener('submit', function (e) {
  var msg = e.target.getAttribute('data-confirm');
  if (msg && !window.confirm(msg)) e.preventDefault();
});
(function () {
  var box = document.getElementById('stats');
  if (!box) return;
  var url = box.getAttribute('data-stats');
  function size(b) { return b == null ? '-' : b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' kB'; }
  function set(k, v) { var e = box.querySelector('[data-k="' + k + '"]'); if (e) e.textContent = v; }
  var stopped = false;
  function load() {
    fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 404 || r.status === 401) { stopped = true; throw new Error('unavailable'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (s) {
      set('cpu', s.cpuPercent == null ? '-' : s.cpuPercent.toFixed(1) + ' %');
      var lim = s.memLimit && s.memLimit < 1e15 ? ' of ' + size(s.memLimit) : '';
      set('mem', size(s.memBytes) + lim);
      set('net', size(s.netRx) + ' / ' + size(s.netTx));
      set('pids', s.pids == null ? '-' : String(s.pids));
    }).catch(function (err) { set('cpu', 'could not load: ' + err.message); });
  }
  load();
  setInterval(function () { if (!stopped && !document.hidden) load(); }, 5000);
})();
(function () {
  var pre = document.getElementById('logs');
  if (!pre) return;
  var url = pre.getAttribute('data-logs');
  var follow = document.getElementById('follow');
  var gone = false;
  // Terminal colour and cursor codes are removed; the text is shown as plain text.
  var ansi = /\\u001b\\[[0-9;?]*[A-Za-z]|\\u001b\\][^\\u0007]*\\u0007/g;
  function load() {
    fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 404) { gone = true; throw new Error('the container no longer exists'); }
      if (r.status === 401) { gone = true; throw new Error('your session has ended; reload the page to log in'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      var atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
      pre.textContent = t.replace(ansi, '') || '(no output)';
      if (atEnd) pre.scrollTop = pre.scrollHeight;
    }).catch(function (err) { pre.textContent = 'could not load logs: ' + err.message; });
  }
  load();
  setInterval(function () { if (!gone && follow && follow.checked && !document.hidden) load(); }, 2000);
})();
`;

export const STATIC: Record<string, { body: string; type: string }> = {
  '/static/app.css': { body: css, type: 'text/css; charset=utf-8' },
  '/static/app.js': { body: js, type: 'text/javascript; charset=utf-8' },
};
