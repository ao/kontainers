// The two static files, kept in code so the binary has no asset directory to find.
// app.js only adds confirm prompts and log polling; every page works without it.

const css = `
:root { --fg: #1d1f21; --muted: #666; --line: #ddd; --bg: #fff; --accent: #2563eb; --danger: #b91c1c; --ok: #15803d; }
@media (prefers-color-scheme: dark) { :root { --fg: #e5e5e5; --muted: #9a9a9a; --line: #333; --bg: #161616; --accent: #60a5fa; --danger: #f87171; --ok: #4ade80; } }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.45 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
header { display: flex; gap: 1.5rem; align-items: center; padding: .6rem 1.2rem; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.brand { font-weight: 600; color: inherit; text-decoration: none; }
nav { display: flex; gap: 1rem; align-items: center; flex: 1; flex-wrap: wrap; }
nav .spacer { flex: 1; }
.who { color: var(--muted); }
main { padding: 1rem 1.2rem; max-width: 72rem; }
h1 { font-size: 1.4rem; margin: .2rem 0 1rem; }
h2 { font-size: 1.1rem; margin-top: 1.6rem; }
a { color: var(--accent); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: .4rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 600; color: var(--muted); }
form.inline { display: inline; }
form.stack { display: grid; gap: .7rem; max-width: 34rem; }
form.stack label { display: grid; gap: .2rem; }
form.row { display: flex; gap: .5rem; margin-bottom: 1rem; }
input, select, textarea, button { font: inherit; color: inherit; }
input, select, textarea { padding: .35rem .5rem; border: 1px solid var(--line); border-radius: 4px; background: var(--bg); }
input[type=checkbox] { width: auto; }
button, a.button { padding: .3rem .8rem; border: 1px solid var(--line); border-radius: 4px; background: transparent; cursor: pointer; text-decoration: none; display: inline-block; }
button.danger { color: var(--danger); }
button.link { border: 0; padding: 0; color: var(--accent); }
.actions form { margin-right: .3rem; }
.flash { color: var(--ok); }
.muted { color: var(--muted); }
.warn { color: #b45309; }
div.actions { margin: .8rem 0; }
ul.pulls { margin: 0 0 1rem; }
.error { color: var(--danger); }
.state.running { color: var(--ok); }
.state.exited, .state.dead { color: var(--muted); }
pre#logs { background: #111; color: #ddd; padding: .8rem; max-height: 32rem; overflow: auto; font-size: 13px; white-space: pre-wrap; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: .2rem 1rem; }
dl.facts dt { color: var(--muted); }
code { font-size: .92em; }
`;

const js = `
document.addEventListener('submit', function (e) {
  var msg = e.target.getAttribute('data-confirm');
  if (msg && !window.confirm(msg)) e.preventDefault();
});
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
