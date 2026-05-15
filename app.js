'use strict';

// ── Storage ──────────────────────────────────────────────────────────────────

function loadEntries() {
  try { return JSON.parse(localStorage.getItem('weight_entries') || '[]'); }
  catch { return []; }
}

function saveEntries(entries) {
  localStorage.setItem('weight_entries', JSON.stringify(entries));
}

function loadUnit() {
  return localStorage.getItem('weight_unit') || 'kg';
}

function saveUnit(unit) {
  localStorage.setItem('weight_unit', unit);
}

function upsertEntry(date, weightKg) {
  const entries = loadEntries();
  const idx = entries.findIndex(e => e.date === date);
  if (idx >= 0) entries[idx].weight = weightKg;
  else entries.push({ date, weight: weightKg });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  saveEntries(entries);
}

function deleteEntry(date) {
  saveEntries(loadEntries().filter(e => e.date !== date));
}

// ── Unit conversion ───────────────────────────────────────────────────────────

function kgToDisplay(kg, unit) {
  return unit === 'lbs' ? +(kg * 2.20462).toFixed(1) : +kg.toFixed(1);
}

function displayToKg(val, unit) {
  return unit === 'lbs' ? +(val / 2.20462).toFixed(2) : +parseFloat(val).toFixed(2);
}

// ── ISO week helpers ──────────────────────────────────────────────────────────

function getISOWeekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function isoWeekBounds(weekKey) {
  const [year, wStr] = weekKey.split('-W');
  const w = parseInt(wStr, 10);
  const jan4 = new Date(parseInt(year, 10), 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function formatDate(d) {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function groupByWeek(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = getISOWeekKey(e.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return map;
}

function computeWeeklyAverages(grouped, todayStr) {
  const today = new Date(todayStr + 'T12:00:00');
  const result = [];
  for (const [key, entries] of [...grouped.entries()].sort()) {
    const { sunday } = isoWeekBounds(key);
    const complete = sunday < today || entries.length === 7;
    if (entries.length === 0) continue;
    const avg = entries.reduce((s, e) => s + e.weight, 0) / entries.length;
    result.push({ week: key, avg, count: entries.length, complete });
  }
  return result;
}

// ── Chart ─────────────────────────────────────────────────────────────────────

let chartInstance = null;

function renderChart(weeklyAverages, unit) {
  const wrap = document.getElementById('chart-wrap');
  const empty = document.getElementById('chart-empty');

  if (weeklyAverages.length === 0) {
    wrap.hidden = true;
    empty.hidden = false;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  wrap.hidden = false;
  empty.hidden = true;

  const labels = weeklyAverages.map(w => {
    const { monday, sunday } = isoWeekBounds(w.week);
    return `${formatDate(monday)}–${formatDate(sunday)}`;
  });

  const dataValues = weeklyAverages.map(w => kgToDisplay(w.avg, unit));
  const borderDash = weeklyAverages.map(w => w.complete ? [] : [6, 4]);
  const pointStyles = weeklyAverages.map(w => w.complete ? 'circle' : 'circle');
  const pointBg = weeklyAverages.map(w => w.complete ? '#4f8ef7' : '#fff');
  const pointBorder = weeklyAverages.map(w => w.complete ? '#4f8ef7' : '#4f8ef7');

  const allVals = dataValues.filter(v => v != null);
  const yMin = allVals.length ? Math.floor(Math.min(...allVals) - 1) : 0;
  const yMax = allVals.length ? Math.ceil(Math.max(...allVals) + 1) : 100;

  const ctx = document.getElementById('weight-chart').getContext('2d');

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = dataValues;
    chartInstance.data.datasets[0].pointBackgroundColor = pointBg;
    chartInstance.data.datasets[0].pointBorderColor = pointBorder;
    chartInstance.options.scales.y.min = yMin;
    chartInstance.options.scales.y.max = yMax;
    chartInstance.options.scales.y.title.text = unit;
    chartInstance.options.plugins.tooltip.callbacks.label = tooltipLabel(weeklyAverages, unit);
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Ø Gewicht (${unit})`,
        data: dataValues,
        borderColor: '#4f8ef7',
        backgroundColor: 'rgba(79,142,247,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: pointBg,
        pointBorderColor: pointBorder,
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        fill: true,
        tension: 0.35,
        segment: {
          borderDash: ctx => {
            const idx = ctx.p1DataIndex;
            return weeklyAverages[idx] && !weeklyAverages[idx].complete ? [6, 4] : [];
          }
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: tooltipLabel(weeklyAverages, unit)
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 11 }, color: '#6b7280', maxRotation: 30 }
        },
        y: {
          min: yMin,
          max: yMax,
          title: { display: true, text: unit, color: '#6b7280', font: { size: 12 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: { font: { size: 12 }, color: '#6b7280' }
        }
      }
    }
  });
}

function tooltipLabel(weeklyAverages, unit) {
  return function(ctx) {
    const w = weeklyAverages[ctx.dataIndex];
    const val = kgToDisplay(w.avg, unit);
    const suffix = w.complete ? '' : ' (laufend)';
    return ` ${val} ${unit}  (${w.count} Tag${w.count !== 1 ? 'e' : ''})${suffix}`;
  };
}

// ── History list ──────────────────────────────────────────────────────────────

function renderHistory(entries, unit, todayStr) {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const recent = [...entries].reverse().slice(0, 14);

  if (recent.length === 0) {
    list.hidden = true;
    empty.hidden = false;
    return;
  }

  list.hidden = false;
  empty.hidden = true;
  list.innerHTML = '';

  for (const e of recent) {
    const li = document.createElement('li');
    li.className = 'history-item';

    const dateObj = new Date(e.date + 'T12:00:00');
    const dateLabel = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    const isToday = e.date === todayStr;
    const displayWeight = kgToDisplay(e.weight, unit);

    li.innerHTML = `
      <div>
        <div class="date">${dateLabel}${isToday ? '<span class="today-badge">Heute</span>' : ''}</div>
        <div class="weight-val">${displayWeight} ${unit}</div>
      </div>
      <button class="btn-delete" aria-label="Eintrag löschen" data-date="${e.date}">✕</button>
    `;
    list.appendChild(li);
  }

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteEntry(btn.dataset.date);
      refresh();
      showToast('Eintrag gelöscht');
    });
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Main refresh ──────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function refresh() {
  const entries = loadEntries();
  const unit = loadUnit();
  const today = todayISO();
  const grouped = groupByWeek(entries);
  const averages = computeWeeklyAverages(grouped, today);

  renderChart(averages, unit);
  renderHistory(entries, unit, today);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('entry-form');
  const dateInput = document.getElementById('date-input');
  const weightInput = document.getElementById('weight-input');
  const unitToggle = document.getElementById('unit-toggle');

  // Set today as default date
  dateInput.value = todayISO();

  // Pre-fill today's weight if exists
  function prefillWeight() {
    const entries = loadEntries();
    const unit = loadUnit();
    const today = todayISO();
    const date = dateInput.value || today;
    const existing = entries.find(e => e.date === date);
    if (existing) {
      weightInput.value = kgToDisplay(existing.weight, unit);
    } else {
      weightInput.value = '';
    }
  }

  dateInput.addEventListener('change', prefillWeight);

  // Unit toggle
  function applyUnit(unit) {
    unitToggle.textContent = unit;
    document.querySelectorAll('.unit-label').forEach(el => el.textContent = unit);
    weightInput.placeholder = unit === 'lbs' ? '0.0 lbs' : '0.0';
    prefillWeight();
    refresh();
  }

  unitToggle.addEventListener('click', () => {
    const newUnit = loadUnit() === 'kg' ? 'lbs' : 'kg';
    saveUnit(newUnit);
    applyUnit(newUnit);
  });

  // Form submit
  form.addEventListener('submit', e => {
    e.preventDefault();
    const date = dateInput.value;
    const rawVal = parseFloat(weightInput.value);
    if (!date || isNaN(rawVal) || rawVal <= 0) return;
    const unit = loadUnit();
    const kg = displayToKg(rawVal, unit);
    upsertEntry(date, kg);
    refresh();
    showToast('Gewicht gespeichert ✓');
    weightInput.value = kgToDisplay(kg, unit);
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  applyUnit(loadUnit());
  prefillWeight();
  refresh();
});
