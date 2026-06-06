'use strict';

// ── Login page ────────────────────────────────────────────────
function generateLoginHtml(hasError) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Smart Care Portal — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; color: #e2e8f0; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px;
            padding: 40px 36px; width: 100%; max-width: 400px; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
    .logo-text { font-size: 15px; font-weight: 700; color: #f1f5f9; }
    .logo-sub  { font-size: 12px; color: #64748b; margin-top: 1px; }
    h1 { font-size: 22px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 28px; }
    .error { background: #7f1d1d; border: 1px solid #ef4444; border-radius: 6px;
             padding: 10px 14px; font-size: 13px; color: #fca5a5; margin-bottom: 20px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #94a3b8;
            text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    input { display: block; width: 100%; background: #0f172a; border: 1px solid #334155;
            border-radius: 6px; padding: 10px 14px; font-size: 14px; color: #f1f5f9;
            outline: none; margin-bottom: 20px; }
    input:focus { border-color: #3b82f6; }
    button { width: 100%; background: #3b82f6; color: #fff; border: none; border-radius: 6px;
             padding: 11px; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #2563eb; }
    .hint { margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 18px; }
    .hint-title { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase;
                  letter-spacing: 0.06em; margin-bottom: 10px; }
    .hint-row { font-size: 12px; color: #64748b; margin-bottom: 6px; }
    .hint-row code { color: #94a3b8; background: #0f172a; padding: 1px 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
      <div>
        <div class="logo-text">CareConnect</div>
        <div class="logo-sub">Smart Care Facility</div>
      </div>
    </div>
    <h1>Sign in</h1>
    <p class="subtitle">Smart Care Portal — Rooms, Patients &amp; Nursing</p>
    ${hasError ? '<div class="error">Incorrect email or password. Try the demo credentials below.</div>' : ''}
    <form method="POST" action="/auth/login">
      <label for="email">Email address</label>
      <input id="email" type="email" name="email" placeholder="name@careconnect.demo" required autofocus />
      <label for="password">Password</label>
      <input id="password" type="password" name="password" placeholder="••••••••••••••" required />
      <button type="submit">Sign in →</button>
    </form>
    <div class="hint">
      <div class="hint-title">Demo accounts</div>
      <div class="hint-row"><code>nurse@careconnect.demo</code> — Nurse</div>
      <div class="hint-row"><code>doctor@careconnect.demo</code> — Physician</div>
      <div class="hint-row"><code>admin@careconnect.demo</code> — Administrator</div>
      <div class="hint-row" style="margin-top:8px;">Password: <code>Demo123!</code></div>
    </div>
  </div>
</body>
</html>`;
}

// ── Smart Care Portal (4-tab dashboard) ──────────────────────
function generatePortalHtml(user) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Smart Care Portal — CareConnect</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; color: #e2e8f0; min-height: 100vh; }

    /* ── Header ── */
    header { background: #1e293b; border-bottom: 1px solid #334155;
             padding: 0 28px; display: flex; align-items: center; gap: 14px; height: 52px; }
    .header-logo { display: flex; align-items: center; gap: 9px; }
    .header-logo span { font-size: 15px; font-weight: 700; color: #f1f5f9; }
    .header-badge { background: #22c55e; color: #fff; font-size: 10px; font-weight: 700;
                    padding: 2px 7px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    .header-clock { margin-left: auto; font-size: 13px; color: #94a3b8; }
    .header-user { display: flex; align-items: center; gap: 8px; margin-left: 20px; }
    .user-avatar { width: 28px; height: 28px; border-radius: 50%; background: #3b82f6;
                   display: flex; align-items: center; justify-content: center;
                   font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
    .user-info span { display: block; font-size: 12px; font-weight: 600; color: #f1f5f9; }
    .user-info small { font-size: 11px; color: #64748b; }
    .logout-btn { background: none; border: 1px solid #334155; border-radius: 5px;
                  color: #94a3b8; font-size: 12px; padding: 5px 10px; cursor: pointer;
                  margin-left: 10px; }
    .logout-btn:hover { background: #334155; color: #e2e8f0; }

    /* ── Tab nav ── */
    nav { background: #1e293b; border-bottom: 1px solid #334155;
          padding: 0 28px; display: flex; gap: 0; }
    .tab-btn { background: none; border: none; color: #94a3b8; font-size: 13px; font-weight: 500;
               padding: 13px 18px; cursor: pointer; border-bottom: 2px solid transparent;
               display: flex; align-items: center; gap: 7px; white-space: nowrap; }
    .tab-btn:hover { color: #e2e8f0; }
    .tab-btn.active { color: #f1f5f9; border-bottom-color: #3b82f6; font-weight: 600; }
    .tab-btn svg { flex-shrink: 0; }

    /* ── Layout ── */
    .container { max-width: 1500px; margin: 0 auto; padding: 22px 28px; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
    .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px 18px; }
    .stat-card.hl { border-color: #3b82f6; }
    .stat-card .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; }
    .stat-card .val { font-size: 28px; font-weight: 700; }
    .stat-card .sub { font-size: 11px; color: #64748b; margin-top: 3px; }
    .c-green  { color: #22c55e; } .c-yellow { color: #f59e0b; }
    .c-red    { color: #ef4444; } .c-blue   { color: #3b82f6; }
    .c-teal   { color: #2dd4bf; } .c-purple { color: #a78bfa; }
    .c-muted  { color: #94a3b8; }

    /* ── Two-column panels ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .panel { background: #1e293b; border: 1px solid #334155; border-radius: 8px; }
    .panel.full { grid-column: 1 / -1; }
    .panel-hdr { padding: 13px 18px; border-bottom: 1px solid #334155;
                 display: flex; align-items: center; justify-content: space-between; }
    .panel-hdr h2 { font-size: 13px; font-weight: 600; color: #f1f5f9; }
    .panel-hdr .cnt { font-size: 12px; color: #64748b; }
    .empty { padding: 26px 18px; text-align: center; color: #64748b; font-size: 13px; }
    .unavail { padding: 26px 18px; text-align: center; color: #ef4444; font-size: 13px; }

    /* ── Session items ── */
    .session-item { padding: 11px 18px; border-bottom: 1px solid #0f172a;
                    display: flex; align-items: center; gap: 10px; }
    .session-item:last-child { border-bottom: none; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-active     { background: #22c55e; box-shadow: 0 0 5px #22c55e; }
    .dot-hold       { background: #f59e0b; }
    .dot-connecting { background: #3b82f6; animation: blink 1s infinite; }
    .dot-completed  { background: #475569; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .si-nurse { font-size: 13px; font-weight: 500; color: #f1f5f9;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .si-patient { font-size: 12px; color: #94a3b8; margin-top: 1px; }
    .si-room { font-size: 11px; color: #64748b; }
    .si-dur { font-size: 12px; color: #64748b; white-space: nowrap; }

    /* ── Type / severity badges ── */
    .badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px;
             text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    .type-nursing_consult      { background: #1e3a5f; color: #93c5fd; }
    .type-virtual_sitter       { background: #14532d; color: #86efac; }
    .type-care_team_conference { background: #3b0764; color: #d8b4fe; }
    .type-provider_rounding    { background: #451a03; color: #fcd34d; }
    .sev-critical { background: #7f1d1d; color: #fca5a5; }
    .sev-warning  { background: #78350f; color: #fcd34d; }
    .sev-info     { background: #1e3a5f; color: #93c5fd; }
    .esc-badge { background: #ef4444; color: #fff; }

    /* ── Alert items ── */
    .alert-item { padding: 9px 18px; border-bottom: 1px solid #0f172a; }
    .alert-item:last-child { border-bottom: none; }
    .alert-msg { font-size: 12px; color: #cbd5e1; line-height: 1.4; margin-top: 3px; }
    .alert-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
    .src-scfp { background: #0f2a1a; color: #4ade80; }
    .src-cpm  { background: #1a1a2e; color: #818cf8; }

    /* ── Room grid (Tab 2) ── */
    .room-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; margin-bottom: 18px; }
    .room-card { background: #1e293b; border: 1px solid #334155; border-radius: 6px;
                 padding: 10px; min-height: 70px; position: relative; }
    .room-card.risk-high     { border-color: #ef4444; background: #180d0d; }
    .room-card.risk-moderate { border-color: #f59e0b; background: #18140a; }
    .room-card.risk-low      { border-color: #22c55e22; }
    .room-card.unoccupied    { opacity: 0.38; }
    .room-card.has-sitter    { outline: 2px solid #3b82f6; outline-offset: 1px; }
    .room-num { font-size: 13px; font-weight: 700; color: #f1f5f9; }
    .room-pt  { font-size: 11px; color: #94a3b8; margin-top: 2px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .room-risk-tag { position: absolute; top: 7px; right: 7px;
                     font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 2px;
                     text-transform: uppercase; letter-spacing: 0.03em; }
    .rtag-high     { background: #7f1d1d; color: #fca5a5; }
    .rtag-moderate { background: #78350f; color: #fcd34d; }
    .rtag-low      { background: #14532d; color: #86efac; }
    .sitter-icon   { position: absolute; bottom: 7px; right: 7px; }

    /* ── Patient table (Tab 3) ── */
    .patient-table { width: 100%; border-collapse: collapse; }
    .patient-table th { font-size: 11px; font-weight: 600; color: #64748b;
                        text-transform: uppercase; letter-spacing: 0.05em;
                        padding: 9px 12px; border-bottom: 1px solid #334155; text-align: left; }
    .patient-table td { font-size: 12px; padding: 9px 12px; border-bottom: 1px solid #0f172a;
                        color: #cbd5e1; vertical-align: middle; }
    .patient-table tr:hover td { background: #162032; }
    .ews-badge { display: inline-block; font-size: 11px; font-weight: 700;
                 padding: 2px 7px; border-radius: 12px; }
    .ews-high   { background: #7f1d1d; color: #fca5a5; }
    .ews-medium { background: #78350f; color: #fcd34d; }
    .ews-low    { background: #14532d; color: #86efac; }
    .adl-badge  { display: inline-block; font-size: 10px; font-weight: 600;
                  padding: 2px 6px; border-radius: 3px; }
    .adl-high   { background: #3b0764; color: #d8b4fe; }
    .adl-moderate { background: #1e3a5f; color: #93c5fd; }
    .adl-low    { background: #0f2a1a; color: #4ade80; }
    .trend-up   { color: #ef4444; }
    .trend-down { color: #22c55e; }
    .trend-stable { color: #64748b; }

    /* ── Assessment / escalation items ── */
    .assess-item { padding: 10px 18px; border-bottom: 1px solid #0f172a; }
    .assess-item:last-child { border-bottom: none; }
    .assess-nurse { font-size: 12px; font-weight: 500; color: #f1f5f9; }
    .assess-detail { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .assess-ehr { display: inline-block; font-size: 10px; font-weight: 600;
                  padding: 1px 5px; border-radius: 3px; margin-left: 6px; }
    .ehr-yes { background: #14532d; color: #86efac; }
    .ehr-no  { background: #1e293b; color: #475569; }
    .esc-item { padding: 10px 18px; border-bottom: 1px solid #0f172a; }
    .esc-item:last-child { border-bottom: none; }
    .esc-row1 { display: flex; align-items: center; gap: 7px; font-size: 12px; }
    .esc-patient { font-weight: 500; color: #f1f5f9; }
    .esc-detail { font-size: 11px; color: #94a3b8; margin-top: 3px; }

    .refresh-note { text-align: center; font-size: 11px; color: #475569; margin-top: 18px; padding-bottom: 10px; }
    .shift-badge { background: #1e293b; border: 1px solid #334155; border-radius: 4px;
                   padding: 3px 8px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>

<header>
  <div class="header-logo">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
    <span>Smart Care Portal</span>
  </div>
  <span class="header-badge">Live</span>
  <span class="shift-badge" id="hdr-shift">—</span>
  <span class="header-clock" id="clock"></span>
  <div class="header-user">
    <div class="user-avatar">${user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
    <div class="user-info">
      <span>${user.name}</span>
      <small>${user.role}</small>
    </div>
    <form method="POST" action="/auth/logout" style="display:inline">
      <button class="logout-btn" type="submit">Sign out</button>
    </form>
  </div>
</header>

<nav>
  <button class="tab-btn active" data-tab="command" onclick="switchTab('command')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    Command Center
  </button>
  <button class="tab-btn" data-tab="rooms" onclick="switchTab('rooms')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    Rooms &amp; Sensors
  </button>
  <button class="tab-btn" data-tab="patients" onclick="switchTab('patients')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    Patient Monitoring
  </button>
  <button class="tab-btn" data-tab="sessions" onclick="switchTab('sessions')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14"/><rect x="1" y="6" width="14" height="12" rx="2"/></svg>
    Nursing Sessions
  </button>
</nav>

<div class="container">

  <!-- ── Tab 1: Command Center ──────────────────────────────── -->
  <div id="tab-command" class="tab-panel active">
    <div class="stats-row">
      <div class="stat-card hl"><div class="lbl">Occupied Rooms</div><div class="val c-blue" id="cc-rooms">—</div><div class="sub" id="cc-rooms-sub">of ? total</div></div>
      <div class="stat-card hl"><div class="lbl">High EWS Patients</div><div class="val c-red" id="cc-ews">—</div><div class="sub" id="cc-ews-sub">? ADL high-risk</div></div>
      <div class="stat-card hl"><div class="lbl">Virtual Sitters</div><div class="val c-teal" id="cc-sitters">—</div><div class="sub" id="cc-sitters-sub">? % high-risk coverage</div></div>
      <div class="stat-card hl"><div class="lbl">Combined Critical</div><div class="val c-red" id="cc-crit">—</div><div class="sub" id="cc-crit-sub">? escalation(s) active</div></div>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="lbl">Active Sessions</div><div class="val c-green" id="cc-active">—</div></div>
      <div class="stat-card"><div class="lbl">Escalations Active</div><div class="val c-yellow" id="cc-esc">—</div></div>
      <div class="stat-card"><div class="lbl">Assessments Today</div><div class="val c-blue" id="cc-assess">—</div></div>
      <div class="stat-card"><div class="lbl">Deteriorating Trend</div><div class="val c-purple" id="cc-detr">—</div></div>
    </div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-hdr"><h2>Active Sessions</h2><span class="cnt" id="cmd-sess-cnt">—</span></div>
        <div id="cmd-sess-list"><div class="empty">Loading…</div></div>
      </div>
      <div class="panel">
        <div class="panel-hdr"><h2>Alert Queue</h2><span class="cnt" id="cmd-alert-cnt">—</span></div>
        <div id="cmd-alert-list"><div class="empty">Loading…</div></div>
      </div>
    </div>
    <div class="refresh-note" id="cmd-refresh-note">Auto-refreshes every 15 s</div>
  </div>

  <!-- ── Tab 2: Rooms & Sensors ─────────────────────────────── -->
  <div id="tab-rooms" class="tab-panel">
    <div class="stats-row">
      <div class="stat-card"><div class="lbl">Total Rooms</div><div class="val c-blue" id="rm-total">—</div></div>
      <div class="stat-card"><div class="lbl">Occupied</div><div class="val c-green" id="rm-occ">—</div><div class="sub" id="rm-occ-pct">?%</div></div>
      <div class="stat-card"><div class="lbl">High Fall Risk</div><div class="val c-red" id="rm-fr">—</div></div>
      <div class="stat-card"><div class="lbl">Sitters Active</div><div class="val c-teal" id="rm-sit">—</div></div>
    </div>
    <div class="room-grid" id="room-grid"><div class="empty" style="grid-column:1/-1">Loading rooms…</div></div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-hdr"><h2>Virtual Sitters</h2><span class="cnt" id="rm-sit-cnt">—</span></div>
        <div id="rm-sit-list"><div class="empty">Loading…</div></div>
      </div>
      <div class="panel">
        <div class="panel-hdr"><h2>Recent Fall Events</h2><span class="cnt" id="rm-fall-cnt">—</span></div>
        <div id="rm-fall-list"><div class="empty">Loading…</div></div>
      </div>
    </div>
    <div class="refresh-note">Auto-refreshes every 15 s · SCFP — Smart Care Facility Platform</div>
  </div>

  <!-- ── Tab 3: Patient Monitoring ─────────────────────────── -->
  <div id="tab-patients" class="tab-panel">
    <div class="stats-row">
      <div class="stat-card"><div class="lbl">Monitored Patients</div><div class="val c-blue" id="pm-total">—</div></div>
      <div class="stat-card"><div class="lbl">High NEWS2</div><div class="val c-red" id="pm-high">—</div><div class="sub" id="pm-high-sub">? medium</div></div>
      <div class="stat-card"><div class="lbl">ADL High-Risk</div><div class="val c-purple" id="pm-adl">—</div></div>
      <div class="stat-card"><div class="lbl">Critical Alerts</div><div class="val c-red" id="pm-crit">—</div></div>
    </div>
    <div class="panel full" style="margin-bottom:14px">
      <div class="panel-hdr"><h2>Patients — NEWS2 &amp; ADL Overview</h2><span class="cnt" id="pm-pt-cnt">—</span></div>
      <div style="overflow-x:auto">
        <table class="patient-table">
          <thead>
            <tr>
              <th>Patient</th><th>Room</th><th>Unit</th><th>Diagnosis</th>
              <th>EWS</th><th>ADL Risk</th><th>HR</th><th>SpO₂</th><th>Trend</th>
            </tr>
          </thead>
          <tbody id="pm-tbody"><tr><td colspan="9" class="empty">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-hdr"><h2>Monitoring Alerts</h2><span class="cnt" id="pm-alert-cnt">—</span></div>
        <div id="pm-alert-list"><div class="empty">Loading…</div></div>
      </div>
      <div class="panel">
        <div class="panel-hdr"><h2>ADL Behavioral Summary</h2><span class="cnt" id="pm-adl-cnt">—</span></div>
        <div id="pm-adl-list"><div class="empty">Loading…</div></div>
      </div>
    </div>
    <div class="refresh-note">Auto-refreshes every 15 s · CPM — Continuous Patient Monitoring</div>
  </div>

  <!-- ── Tab 4: Nursing Sessions ───────────────────────────── -->
  <div id="tab-sessions" class="tab-panel">
    <div class="stats-row">
      <div class="stat-card"><div class="lbl">Active</div><div class="val c-green" id="ns-active">—</div></div>
      <div class="stat-card"><div class="lbl">On Hold</div><div class="val c-yellow" id="ns-hold">—</div></div>
      <div class="stat-card"><div class="lbl">Escalations Active</div><div class="val c-red" id="ns-esc">—</div></div>
      <div class="stat-card"><div class="lbl">Assessments Today</div><div class="val c-blue" id="ns-assess">—</div></div>
    </div>
    <div class="two-col" style="margin-bottom:14px">
      <div class="panel">
        <div class="panel-hdr"><h2>All Sessions</h2><span class="cnt" id="ns-sess-cnt">—</span></div>
        <div id="ns-sess-list"><div class="empty">Loading…</div></div>
      </div>
      <div class="panel">
        <div class="panel-hdr"><h2>Recent Assessments</h2><span class="cnt" id="ns-assess-cnt">—</span></div>
        <div id="ns-assess-list"><div class="empty">Loading…</div></div>
      </div>
    </div>
    <div class="panel full">
      <div class="panel-hdr"><h2>Escalations</h2><span class="cnt" id="ns-esc-cnt">—</span></div>
      <div id="ns-esc-list"><div class="empty">No escalations recorded</div></div>
    </div>
    <div class="refresh-note">Auto-refreshes every 15 s · VNS — Virtual Nursing Station</div>
  </div>

</div><!-- /container -->

<script>
  // ── Utilities ─────────────────────────────────────────────
  const fmt = iso => new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  const dur = s => { const m = Math.floor(s/60); return m > 0 ? m+'m '+(s%60)+'s' : s+'s'; };
  const dotCls = s => ({ active:'dot-active', hold:'dot-hold', connecting:'dot-connecting', completed:'dot-completed' }[s] || 'dot-completed');
  const sevCls = s => ({ critical:'sev-critical', warning:'sev-warning', info:'sev-info' }[s] || 'sev-info');
  const typeLabel = t => ({ nursing_consult:'Consult', virtual_sitter:'Sitter', care_team_conference:'Conference', provider_rounding:'Rounding' }[t] || t);
  const ewsCls = r => ({ high:'ews-high', medium:'ews-medium', low:'ews-low' }[r] || 'ews-low');
  const adlCls = r => ({ high:'adl-high', moderate:'adl-moderate', low:'adl-low' }[r] || 'adl-low');
  const trendCls = t => t === 'deteriorating' ? 'trend-up' : t === 'improving' ? 'trend-down' : 'trend-stable';
  const trendArrow = t => t === 'deteriorating' ? '↑' : t === 'improving' ? '↓' : '→';

  function set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; }
  function setHtml(id, v) { const el = document.getElementById(id); if (el) el.innerHTML = v; }

  // ── Clock + header shift ──────────────────────────────────
  function tick() { set('clock', new Date().toLocaleTimeString()); }
  setInterval(tick, 1000); tick();

  // ── Tab switching ─────────────────────────────────────────
  let activeTab = 'command';
  let refreshTimer = null;

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'tab-' + name);
    });
    clearInterval(refreshTimer);
    activeTab = name;
    loadTab(name);
    refreshTimer = setInterval(() => loadTab(activeTab), 15000);
  }

  function loadTab(name) {
    if (name === 'command')  loadCommand();
    if (name === 'rooms')    loadRooms();
    if (name === 'patients') loadPatients();
    if (name === 'sessions') loadSessions();
  }

  // ── Tab 1: Command Center ─────────────────────────────────
  async function loadCommand() {
    try {
      const [cc, sess, alerts] = await Promise.all([
        fetch('/api/command-center').then(r => r.json()),
        fetch('/api/sessions').then(r => r.json()),
        fetch('/api/alerts').then(r => r.json()),
      ]);

      const c = cc.combined || {};
      set('cc-rooms',      c.occupied_rooms ?? '—');
      set('cc-rooms-sub',  'of ' + (c.total_monitored_rooms ?? '?') + ' total');
      set('cc-ews',        c.high_ews_patients ?? '—');
      set('cc-ews-sub',    (c.adl_high_risk ?? '?') + ' ADL high-risk');
      set('cc-sitters',    c.virtual_sitters_active ?? '—');
      set('cc-sitters-sub',(c.sitter_coverage_pct ?? '?') + '% high-risk coverage');
      set('cc-crit',       c.critical_alerts_facility ?? '—');
      set('cc-crit-sub',   (c.escalations_active ?? '?') + ' escalation(s) active');
      set('cc-active',     c.active_nursing_sessions ?? '—');
      set('cc-esc',        c.escalations_active ?? '—');
      set('cc-assess',     cc.vns?.assessments_today ?? '—');
      set('cc-detr',       cc.cpm?.deteriorating_trend ?? '—');

      if (cc.shift) set('hdr-shift', cc.shift.name + ' Shift');

      set('cmd-sess-cnt', (sess.count ?? 0) + ' sessions');
      setHtml('cmd-sess-list', renderSessions(sess.sessions || [], 6));

      set('cmd-alert-cnt', (alerts.count ?? 0) + ' alerts');
      setHtml('cmd-alert-list', renderAlerts(alerts.alerts || [], 8));

      set('cmd-refresh-note', 'Last updated ' + new Date().toLocaleTimeString() + ' · auto-refreshes every 15 s');
    } catch (e) { console.error('Command center error:', e); }
  }

  // ── Tab 2: Rooms & Sensors ────────────────────────────────
  async function loadRooms() {
    try {
      const [roomsData, sittersData, stats, fallData] = await Promise.all([
        fetch('/proxy/scfp/api/rooms').then(r => r.json()),
        fetch('/proxy/scfp/api/sitters').then(r => r.json()),
        fetch('/proxy/scfp/api/stats').then(r => r.json()),
        fetch('/proxy/scfp/api/events/falls?limit=12').then(r => r.json()),
      ]);

      if (roomsData.error || sittersData.error) throw new Error(roomsData.error || sittersData.error);

      set('rm-total', stats.total_rooms ?? '—');
      set('rm-occ', stats.occupied_rooms ?? '—');
      const pct = stats.total_rooms ? Math.round(stats.occupied_rooms / stats.total_rooms * 100) : '?';
      set('rm-occ-pct', pct + '% occupancy');
      set('rm-fr', stats.high_fall_risk_patients ?? '—');
      set('rm-sit', stats.virtual_sitters_active ?? '—');

      const sitterRooms = new Set((sittersData.sitters || []).map(s => s.room_id));
      setHtml('room-grid', renderRoomGrid(roomsData.rooms || [], sitterRooms));

      const sitters = sittersData.sitters || [];
      set('rm-sit-cnt', sitters.length + ' active');
      setHtml('rm-sit-list', sitters.length === 0
        ? '<div class="empty">No active sitters</div>'
        : sitters.map(s => \`
            <div class="session-item">
              <div class="dot dot-active"></div>
              <div style="flex:1;min-width:0">
                <div class="si-nurse">\${s.assigned_to} — Room \${s.room_number}</div>
                <div class="si-patient">\${s.indication?.replace(/_/g,' ') ?? 'monitoring'}</div>
                <div class="si-room">Since \${fmt(s.started_at)} · \${s.events_observed ?? 0} events observed</div>
              </div>
              <span class="badge type-virtual_sitter">SITTER</span>
            </div>
          \`).join(''));

      const falls = fallData.fall_events || [];
      set('rm-fall-cnt', falls.length + ' events');
      setHtml('rm-fall-list', falls.length === 0
        ? '<div class="empty">No fall events recorded</div>'
        : falls.map(f => \`
            <div class="alert-item">
              <div><span class="badge sev-critical">FALL</span> <span style="font-size:12px;color:#f1f5f9">Room \${f.room_number} · \${f.unit}</span></div>
              <div class="alert-msg">\${f.patient_name ?? 'Unoccupied room'} — \${f.message ?? 'fall_detected'}</div>
              <div class="alert-meta">\${fmt(f.timestamp)}</div>
            </div>
          \`).join(''));

    } catch (e) {
      setHtml('room-grid', '<div class="unavail" style="grid-column:1/-1">SCFP unavailable: ' + e.message + '</div>');
    }
  }

  function renderRoomGrid(rooms, sitterRooms) {
    if (!rooms.length) return '<div class="empty" style="grid-column:1/-1">No rooms available</div>';
    return rooms.map(r => {
      const risk = r.fall_risk || 'none';
      let cls = r.occupied ? ('risk-' + risk) : 'unoccupied';
      if (sitterRooms.has(r.id)) cls += ' has-sitter';
      const riskTag = r.occupied && risk !== 'none' && risk !== 'low'
        ? \`<div class="room-risk-tag rtag-\${risk}">\${risk}</div>\`
        : (r.occupied ? '<div class="room-risk-tag rtag-low">low</div>' : '');
      const sitterBadge = sitterRooms.has(r.id)
        ? \`<div class="sitter-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>\`
        : '';
      const ptName = r.patient_name ? r.patient_name.split(' ').slice(-1)[0] + ', ' + r.patient_name.split(' ')[0][0] + '.' : '';
      return \`<div class="room-card \${cls}">\${riskTag}<div class="room-num">Rm \${r.room_number}</div><div class="room-pt">\${r.occupied ? ptName : 'Unoccupied'}</div>\${sitterBadge}</div>\`;
    }).join('');
  }

  // ── Tab 3: Patient Monitoring ─────────────────────────────
  async function loadPatients() {
    try {
      const [ptsData, alertData, adlData] = await Promise.all([
        fetch('/proxy/cpm/api/patients').then(r => r.json()),
        fetch('/proxy/cpm/api/alerts?limit=20').then(r => r.json()),
        fetch('/proxy/cpm/api/adl').then(r => r.json()),
      ]);

      if (ptsData.error) throw new Error(ptsData.error);

      const pts = (ptsData.patients || []).slice().sort((a, b) => (b.current_ews ?? 0) - (a.current_ews ?? 0));
      const stats = { high: 0, medium: 0, adlHigh: 0 };
      pts.forEach(p => {
        if (p.current_risk === 'high') stats.high++;
        if (p.current_risk === 'medium') stats.medium++;
        if (p.adl_risk === 'high') stats.adlHigh++;
      });
      const alerts = alertData.alerts || [];
      const critAlerts = alerts.filter(a => a.severity === 'critical').length;

      set('pm-total', pts.length);
      set('pm-high', stats.high);
      set('pm-high-sub', stats.medium + ' medium');
      set('pm-adl', stats.adlHigh);
      set('pm-crit', critAlerts);
      set('pm-pt-cnt', pts.length + ' patients · sorted by EWS');

      setHtml('pm-tbody', pts.map(p => {
        const vit = p.latest_vitals || {};
        const trendCls2 = trendCls(p.trend);
        return \`<tr>
          <td><strong>\${p.name}</strong><br><span style="color:#64748b;font-size:11px">\${p.id}</span></td>
          <td>\${p.room_number}</td>
          <td>\${p.unit}</td>
          <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="\${p.diagnosis}">\${p.diagnosis ?? '—'}</td>
          <td><span class="ews-badge \${ewsCls(p.current_risk)}">\${p.current_ews ?? '—'}</span></td>
          <td>\${p.adl_risk ? '<span class="adl-badge ' + adlCls(p.adl_risk) + '">' + p.adl_risk + '</span>' : '<span style="color:#475569">—</span>'}</td>
          <td>\${vit.hr ?? '—'} bpm</td>
          <td>\${vit.spo2 ?? '—'}%</td>
          <td class="\${trendCls2}">\${trendArrow(p.trend)} \${p.trend ?? 'stable'}</td>
        </tr>\`;
      }).join('') || '<tr><td colspan="9" class="empty">No patients</td></tr>');

      set('pm-alert-cnt', alerts.length + ' alerts');
      setHtml('pm-alert-list', renderAlerts(alerts, 10));

      const adlPts = (adlData.patients || []).filter(p => p.adl_risk !== 'low');
      set('pm-adl-cnt', adlData.high_risk_count + ' high-risk');
      setHtml('pm-adl-list', adlPts.length === 0
        ? '<div class="empty">No high-risk ADL deviations</div>'
        : adlPts.slice(0, 8).map(p => \`
            <div class="assess-item">
              <div class="assess-nurse">\${p.patient_id} <span class="adl-badge \${adlCls(p.adl_risk)}">\${p.adl_risk}</span></div>
              <div class="assess-detail">Score: \${p.adl_composite_score ?? '?'} · Flagged: \${(p.flagged_domains || []).map(d => d.domain).join(', ') || 'none'}</div>
            </div>
          \`).join(''));

    } catch (e) {
      setHtml('pm-tbody', '<tr><td colspan="9" class="unavail">CPM unavailable: ' + e.message + '</td></tr>');
    }
  }

  // ── Tab 4: Nursing Sessions ───────────────────────────────
  async function loadSessions() {
    try {
      const [sessData, assessData, escData] = await Promise.all([
        fetch('/api/sessions').then(r => r.json()),
        fetch('/api/assessments?limit=10').then(r => r.json()),
        fetch('/api/escalations?limit=20').then(r => r.json()),
      ]);

      const sessList = sessData.sessions || [];
      const active = sessList.filter(s => s.status === 'active').length;
      const onHold = sessList.filter(s => s.status === 'hold').length;
      const escs = (escData.escalations || []).filter(e => e.status === 'dispatched');

      set('ns-active', active);
      set('ns-hold', onHold);
      set('ns-esc', escs.length);
      set('ns-assess', assessData.count ?? '—');

      set('ns-sess-cnt', sessList.length + ' sessions');
      setHtml('ns-sess-list', renderSessions(sessList, 8));

      const assessList = assessData.assessments || [];
      set('ns-assess-cnt', assessList.length + ' recent');
      setHtml('ns-assess-list', assessList.length === 0
        ? '<div class="empty">No assessments yet</div>'
        : assessList.map(a => \`
            <div class="assess-item">
              <div class="assess-nurse">\${a.nurse}
                <span class="assess-ehr \${a.ehr_documented ? 'ehr-yes' : 'ehr-no'}">\${a.ehr_documented ? 'EHR ✓' : 'EHR —'}</span>
              </div>
              <div class="assess-detail">Room \${a.room_number} · \${a.patient_name} · \${fmt(a.timestamp)}</div>
              <div class="assess-detail">Pain: \${a.pain_score ?? '—'} · Mobility: \${a.mobility ?? '—'}\${a.escalation_required ? ' · <strong style="color:#ef4444">Escalated</strong>' : ''}</div>
            </div>
          \`).join(''));

      set('ns-esc-cnt', escData.escalations?.length + ' total');
      const allEsc = escData.escalations || [];
      setHtml('ns-esc-list', allEsc.length === 0
        ? '<div class="empty">No escalations recorded</div>'
        : allEsc.map(e => \`
            <div class="esc-item">
              <div class="esc-row1">
                <span class="badge \${e.status === 'dispatched' ? 'sev-critical' : 'sev-info'}">\${e.status?.toUpperCase()}</span>
                <span class="esc-patient">Room \${e.room_number} · \${e.patient_name}</span>
                <span style="font-size:11px;color:#64748b;margin-left:auto">\${fmt(e.dispatched_at)}</span>
              </div>
              <div class="esc-detail">\${e.reason} · Responder: \${e.responder_type?.replace(/_/g,' ')} · Priority: \${e.priority}</div>
              <div class="esc-detail">Initiated by \${e.initiated_by}</div>
            </div>
          \`).join(''));

    } catch (e) { console.error('Sessions load error:', e); }
  }

  // ── Shared renderers ──────────────────────────────────────
  function renderSessions(list, maxRows) {
    if (!list.length) return '<div class="empty">No sessions</div>';
    return list.slice(0, maxRows).map(s => \`
      <div class="session-item">
        <div class="dot \${dotCls(s.status)}"></div>
        <div style="flex:1;min-width:0">
          <div class="si-nurse">\${s.nurse}\${s.escalated ? ' <span class="badge esc-badge">ESC</span>' : ''}</div>
          <div class="si-patient">\${s.patient_name}</div>
          <div class="si-room">Rm \${s.room_number} · \${s.unit} · \${s.reason}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="badge type-\${s.type}">\${typeLabel(s.type)}</span>
          <span class="si-dur">\${s.status === 'active' ? dur(s.duration_seconds) : s.status}</span>
        </div>
      </div>
    \`).join('');
  }

  function renderAlerts(list, maxRows) {
    if (!list.length) return '<div class="empty">No active alerts</div>';
    return list.slice(0, maxRows).map(a => \`
      <div class="alert-item">
        <div>
          \${a.source ? '<span class="badge src-' + a.source + '">' + a.source.toUpperCase() + '</span> ' : ''}
          <span class="badge \${sevCls(a.severity)}">\${a.severity}</span>
        </div>
        <div class="alert-msg">\${a.message || a.type}</div>
        <div class="alert-meta">\${fmt(a.timestamp)}\${a.alert_category ? ' · ' + a.alert_category.replace(/_/g,' ') : ''}\${a.room_number ? ' · Rm ' + a.room_number : ''}</div>
      </div>
    \`).join('');
  }

  // ── Boot ──────────────────────────────────────────────────
  switchTab('command');
</script>
</body>
</html>`;
}

module.exports = { generateLoginHtml, generatePortalHtml };
