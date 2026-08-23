export const cssText = `
:root {
  color-scheme: dark;
  --bg: #07100f;
  --panel: #0b1715;
  --panel-strong: #0e1c19;
  --panel-soft: #11221e;
  --line: rgba(157, 190, 178, 0.14);
  --line-strong: rgba(157, 190, 178, 0.24);
  --text: #e8f0ed;
  --muted: #7f9990;
  --faint: #526b63;
  --green: #41dda0;
  --green-soft: rgba(65, 221, 160, 0.12);
  --red: #ff6b78;
  --red-soft: rgba(255, 107, 120, 0.12);
  --amber: #f6ba55;
  --amber-soft: rgba(246, 186, 85, 0.12);
  --cyan: #5ccfe6;
  --mono: "SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, monospace;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }

html, body { margin: 0; min-height: 100%; background: var(--bg); }

body {
  color: var(--text);
  font-family: var(--sans);
  font-size: 13px;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 80% -10%, rgba(65, 221, 160, 0.08), transparent 32rem),
    linear-gradient(180deg, #081210 0%, #060d0c 100%);
}

button { font: inherit; }

.terminal-shell { min-height: 100vh; padding-bottom: 34px; }

.topbar {
  height: 58px;
  display: grid;
  grid-template-columns: 220px 1fr auto;
  align-items: center;
  gap: 22px;
  padding: 0 22px;
  border-bottom: 1px solid var(--line-strong);
  background: rgba(7, 16, 15, 0.9);
  backdrop-filter: blur(16px);
  position: sticky;
  top: 0;
  z-index: 20;
}

.brand { display: flex; align-items: center; gap: 11px; letter-spacing: 0.04em; }
.brand-mark {
  width: 29px; height: 29px; border-radius: 8px; display: grid; place-items: center;
  color: #06110d; background: var(--green); font-weight: 900; box-shadow: 0 0 25px rgba(65,221,160,.18);
}
.brand-name { font-size: 13px; font-weight: 760; }
.brand-name span { color: var(--muted); font-weight: 500; }

.command-bar {
  max-width: 600px; width: 100%; height: 34px; display: flex; align-items: center; gap: 9px;
  border: 1px solid var(--line); border-radius: 7px; padding: 0 11px;
  background: rgba(255,255,255,.025); color: var(--muted);
}
.command-key { color: var(--amber); font-family: var(--mono); font-size: 11px; }
.command-placeholder { flex: 1; color: var(--faint); }
.command-shortcut { border: 1px solid var(--line); border-radius: 4px; padding: 2px 6px; font: 10px var(--mono); }

.market-status { display: flex; align-items: center; gap: 14px; white-space: nowrap; }
.live-pill { display: flex; align-items: center; gap: 7px; color: var(--green); font: 11px var(--mono); letter-spacing: .07em; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 5px rgba(65,221,160,.08), 0 0 16px var(--green); }
.market-time { color: var(--muted); font: 11px var(--mono); }

.ticker-tape {
  height: 36px; display: flex; align-items: center; gap: 28px; overflow: hidden;
  padding: 0 22px; border-bottom: 1px solid var(--line); background: #091411;
  font-family: var(--mono); white-space: nowrap;
}
.tape-item { display: flex; align-items: center; gap: 8px; }
.tape-symbol { color: #c9d8d3; font-weight: 700; }
.tape-price { color: var(--text); }

.app-grid { display: grid; grid-template-columns: 58px minmax(620px, 1fr) 310px; min-height: calc(100vh - 94px); }

.rail { border-right: 1px solid var(--line); padding: 13px 9px; background: rgba(8,18,16,.72); }
.rail-nav { display: flex; flex-direction: column; align-items: center; gap: 8px; position: sticky; top: 108px; }
.rail-button {
  width: 38px; height: 38px; border: 1px solid transparent; border-radius: 9px; background: transparent;
  color: var(--faint); cursor: pointer; display: grid; place-items: center; font: 12px var(--mono);
}
.rail-button:hover { color: var(--text); background: rgba(255,255,255,.035); }
.rail-button.active { color: var(--green); border-color: rgba(65,221,160,.2); background: var(--green-soft); }
.rail-separator { width: 24px; height: 1px; margin: 5px 0; background: var(--line); }

.workspace { min-width: 0; padding: 18px; }
.workspace-heading { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; }
.eyebrow { color: var(--amber); font: 10px var(--mono); letter-spacing: .13em; text-transform: uppercase; margin-bottom: 5px; }
h1 { margin: 0; font-size: 22px; letter-spacing: -.025em; font-weight: 680; }
.session-note { color: var(--muted); font: 11px var(--mono); }

.index-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin-bottom: 12px; }
.index-card { border: 1px solid var(--line); border-radius: 9px; background: linear-gradient(145deg, rgba(17,34,30,.9), rgba(9,20,18,.9)); padding: 12px; min-width: 0; }
.index-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
.index-label { color: var(--muted); font: 10px var(--mono); letter-spacing: .08em; }
.index-value { font: 17px var(--mono); font-weight: 650; letter-spacing: -.03em; }
.index-bottom { display: flex; justify-content: space-between; align-items: flex-end; }
.mini-chart { width: 75px; height: 24px; overflow: visible; }
.mini-chart path { fill: none; stroke-width: 1.6; vector-effect: non-scaling-stroke; }

.panel { border: 1px solid var(--line); border-radius: 10px; background: rgba(10,23,20,.9); overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.12); }
.panel-toolbar { height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 13px; border-bottom: 1px solid var(--line); }
.view-tabs { display: flex; align-items: center; gap: 5px; }
.view-tab { border: 0; border-radius: 6px; padding: 7px 10px; color: var(--muted); background: transparent; cursor: pointer; font-size: 11px; }
.view-tab:hover { color: var(--text); }
.view-tab.active { color: var(--text); background: rgba(255,255,255,.055); }
.toolbar-tools { display: flex; gap: 7px; }
.tool-button { border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 6px; padding: 6px 9px; font: 10px var(--mono); cursor: pointer; }
.tool-button:hover { color: var(--green); border-color: rgba(65,221,160,.25); }

.quote-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.quote-table th { height: 32px; padding: 0 10px; text-align: right; color: var(--faint); font: 9px var(--mono); letter-spacing: .08em; text-transform: uppercase; border-bottom: 1px solid var(--line); font-weight: 500; }
.quote-table th:first-child, .quote-table th:nth-child(2) { text-align: left; }
.quote-table td { height: 42px; padding: 0 10px; text-align: right; border-bottom: 1px solid rgba(157,190,178,.075); font: 11px var(--mono); white-space: nowrap; }
.quote-table tr:last-child td { border-bottom: 0; }
.quote-table tbody tr { transition: background .15s ease; cursor: pointer; position: relative; }
.quote-table tbody tr:hover { background: rgba(255,255,255,.027); }
.quote-table tbody tr.selected { background: rgba(65,221,160,.055); box-shadow: inset 2px 0 var(--green); }
.quote-table tbody tr.selected .symbol { color: var(--green); }
.star { color: #3e574f; font-size: 14px; text-align: center !important; }
.symbol-cell { text-align: left !important; }
.symbol { display: block; color: var(--text); font-weight: 760; font-size: 11px; letter-spacing: .02em; }
.company { display: block; color: var(--faint); font: 9px var(--sans); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; }
.last-price { color: #dce8e4; font-weight: 650; }
.positive { color: var(--green) !important; }
.negative { color: var(--red) !important; }
.change-chip { display: inline-block; min-width: 54px; padding: 4px 6px; border-radius: 5px; text-align: right; }
.change-chip.positive { background: var(--green-soft); }
.change-chip.negative { background: var(--red-soft); }
.volume { color: var(--muted); }
.row-chart { width: 68px; height: 22px; vertical-align: middle; overflow: visible; }
.row-chart path { fill: none; stroke-width: 1.25; vector-effect: non-scaling-stroke; }

.side-panel { position: relative; border-left: 1px solid var(--line); background: rgba(8,18,16,.74); min-width: 0; }
.selection-applied-marker { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.side-section { padding: 16px; border-bottom: 1px solid var(--line); }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
.section-title { font-size: 11px; font-weight: 700; letter-spacing: .04em; }
.section-meta { color: var(--faint); font: 9px var(--mono); }
.hero-quote { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
.hero-symbol { color: var(--amber); font: 10px var(--mono); margin-bottom: 5px; }
.hero-price { font: 25px var(--mono); font-weight: 620; letter-spacing: -.04em; }
.hero-chart { width: 100%; height: 105px; border: 1px solid var(--line); border-radius: 7px; background: linear-gradient(180deg, rgba(65,221,160,.035), transparent); }
.hero-chart path { fill: none; stroke: var(--green); stroke-width: 1.4; vector-effect: non-scaling-stroke; }
.chart-grid { stroke: rgba(157,190,178,.09); stroke-width: .5; }

.mover-list { display: flex; flex-direction: column; gap: 4px; }
.mover-row { display: grid; grid-template-columns: 1fr auto auto; gap: 9px; align-items: center; padding: 8px; border-radius: 6px; background: rgba(255,255,255,.022); }
.mover-symbol { font: 10px var(--mono); font-weight: 700; }
.mover-price { color: var(--muted); font: 10px var(--mono); }
.mover-change { min-width: 49px; text-align: right; font: 10px var(--mono); }

.news-list { display: flex; flex-direction: column; }
.news-item { padding: 10px 0; border-bottom: 1px solid rgba(157,190,178,.08); }
.news-item:last-child { border-bottom: 0; padding-bottom: 0; }
.news-time { color: var(--amber); font: 9px var(--mono); margin-bottom: 4px; }
.news-title { color: #bdcbc6; font-size: 11px; line-height: 1.45; }

.footer-status {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 9px 18px;
  border-top: 1px solid var(--line-strong);
  color: var(--faint);
  font: 9px var(--mono);
  background: rgba(7, 16, 15, 0.94);
  backdrop-filter: blur(16px);
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.18);
}
.status-group { display: flex; align-items: center; gap: 16px; }
.status-good { color: var(--green); }

@media (max-width: 1180px) {
  .app-grid { grid-template-columns: 52px minmax(600px, 1fr); }
  .side-panel { display: none; }
}

@media (max-width: 780px) {
  .topbar { grid-template-columns: 1fr auto; padding: 0 14px; }
  .command-bar { display: none; }
  .ticker-tape { padding: 0 14px; gap: 20px; }
  .app-grid { display: block; }
  .rail { display: none; }
  .workspace { padding: 12px; overflow-x: auto; }
  .workspace-heading { min-width: 690px; }
  .index-grid { min-width: 690px; }
  .panel { min-width: 690px; }
  .market-time { display: none; }
}
`;
