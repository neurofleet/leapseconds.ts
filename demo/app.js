const unixNtp1900Offset = 2_208_988_800_000;
const gpsTaiOffsetSeconds = -19;
const timelineStartUnix = Date.parse("1960-01-01T00:00:00Z");
const timelineEndUnix = Date.parse("2026-01-01T00:00:00Z");

const leapMarks = [
  { iso: "1972-01-01T00:00:00Z", label: "1972 +10s" },
  { iso: "1980-01-06T00:00:00Z", label: "GPS epoch" },
  { iso: "1999-01-01T00:00:00Z", label: "1999 +32s" },
  { iso: "2012-07-01T00:00:00Z", label: "2012 +35s" },
  { iso: "2015-07-01T00:00:00Z", label: "2015 +36s" },
  { iso: "2017-01-01T00:00:00Z", label: "2017 +37s" },
];

const sensorStyle = {
  imu: { row: 0, label: "IMU" },
  cam: { row: 1, label: "Camera" },
  lidar: { row: 2, label: "LiDAR" },
};

const el = {
  unixNow: document.getElementById("unixNow"),
  unixNowIso: document.getElementById("unixNowIso"),
  taiNow: document.getElementById("taiNow"),
  taiNowDelta: document.getElementById("taiNowDelta"),
  gpsNow: document.getElementById("gpsNow"),
  gpsNowDelta: document.getElementById("gpsNowDelta"),
  preset: document.getElementById("preset"),
  isoInput: document.getElementById("isoInput"),
  unixInput: document.getElementById("unixInput"),
  isoValidation: document.getElementById("isoValidation"),
  unixValidation: document.getElementById("unixValidation"),
  selectedUnix: document.getElementById("selectedUnix"),
  selectedTai: document.getElementById("selectedTai"),
  selectedGps: document.getElementById("selectedGps"),
  taiUtcOffset: document.getElementById("taiUtcOffset"),
  gpsUtcOffset: document.getElementById("gpsUtcOffset"),
  timeline: document.getElementById("timeline"),
  timelineCaption: document.getElementById("timelineCaption"),
  timelineGraph: document.getElementById("timelineGraph"),
  timelineGraphCaption: document.getElementById("timelineGraphCaption"),
  civilHealth: document.getElementById("civilHealth"),
  atomicHealth: document.getElementById("atomicHealth"),
  civilTrack: document.getElementById("civilTrack"),
  atomicTrack: document.getElementById("atomicTrack"),
  civilStats: document.getElementById("civilStats"),
  atomicStats: document.getElementById("atomicStats"),
  simSnippet: document.getElementById("simSnippet"),
};

let leap = null;
let selectedUnixMs = Date.now();
let simData = null;
let lastEditedField = "unix";
let offsetSeries = [];

function fmtMs(value) {
  return `${Math.trunc(value).toLocaleString()} ms`;
}

function fmtSeconds(value) {
  return `${value.toFixed(3)} s`;
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function pulseLiveMetrics() {
  document.querySelectorAll(".metric").forEach((m) => {
    m.classList.add("pulse");
    setTimeout(() => m.classList.remove("pulse"), 120);
  });
}

function setPreset() {
  const choice = el.preset.value;
  if (choice === "now") {
    selectedUnixMs = Date.now();
  } else if (choice === "gpsEpoch") {
    selectedUnixMs = Date.parse("1980-01-06T00:00:00Z");
  } else if (choice === "lastLeap") {
    selectedUnixMs = Date.parse("2017-01-01T00:00:00Z");
  } else {
    clearValidation();
    return;
  }
  el.isoInput.value = toIso(selectedUnixMs);
  el.unixInput.value = String(selectedUnixMs);
  clearValidation();
  renderSelected();
}

function setValidation(field, message) {
  const isIso = field === "iso";
  const input = isIso ? el.isoInput : el.unixInput;
  const target = isIso ? el.isoValidation : el.unixValidation;
  input.classList.toggle("invalid", Boolean(message));
  target.classList.toggle("error", Boolean(message));
  target.textContent = message || "";
}

function clearValidation() {
  setValidation("iso", "");
  setValidation("unix", "");
}

function parseIsoInput() {
  const raw = el.isoInput.value.trim();
  if (!raw) {
    return { state: "empty" };
  }
  const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d{1,3})?)?Z$/;
  if (!isoUtcPattern.test(raw)) {
    return { state: "invalid", message: "Use UTC ISO format, e.g. 2017-01-01T00:00:00Z" };
  }
  const unix = Date.parse(raw);
  if (!Number.isFinite(unix)) {
    return { state: "invalid", message: "Invalid ISO UTC. Example: 2017-01-01T00:00:00Z" };
  }
  return { state: "valid", value: unix };
}

function parseUnixInput() {
  const raw = el.unixInput.value.trim();
  if (!raw) {
    return { state: "empty" };
  }
  if (!/^-?\d+$/.test(raw)) {
    return { state: "invalid", message: "Use integer Unix milliseconds (e.g. 1483228800000)." };
  }
  const unix = Number(raw);
  if (!Number.isFinite(unix)) {
    return { state: "invalid", message: "Unix milliseconds must be a finite integer." };
  }
  return { state: "valid", value: unix };
}

function applyCustomUnix(unixMs, sourceField) {
  selectedUnixMs = unixMs;
  if (sourceField === "iso") {
    el.unixInput.value = String(Math.trunc(unixMs));
  } else {
    el.isoInput.value = toIso(unixMs);
  }
  renderSelected();
}

function handleCustomInput(sourceField) {
  const isoResult = parseIsoInput();
  const unixResult = parseUnixInput();

  setValidation("iso", isoResult.state === "invalid" ? isoResult.message : "");
  setValidation("unix", unixResult.state === "invalid" ? unixResult.message : "");

  if (sourceField === "iso") {
    if (isoResult.state === "valid") {
      applyCustomUnix(isoResult.value, "iso");
    }
    return;
  }

  if (unixResult.state === "valid") {
    applyCustomUnix(unixResult.value, "unix");
  }
}

function taiUtcSecondsAt(unixMs) {
  const taiMs = leap.TAI1900.fromUnix(unixMs);
  return (taiMs - (unixMs + unixNtp1900Offset)) / 1000;
}

function buildOffsetSeries() {
  const points = [];
  const stepMs = 30 * 24 * 60 * 60 * 1000;
  for (let unix = timelineStartUnix; unix <= timelineEndUnix; unix += stepMs) {
    points.push({ unix, offset: taiUtcSecondsAt(unix) });
  }
  if (points[points.length - 1].unix !== timelineEndUnix) {
    points.push({ unix: timelineEndUnix, offset: taiUtcSecondsAt(timelineEndUnix) });
  }
  offsetSeries = points;
}

function drawOffsetGraph() {
  const canvas = el.timelineGraph;
  if (!canvas || !offsetSeries.length) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(240, Math.floor(canvas.clientWidth));
  const height = Math.max(140, Math.floor(canvas.clientHeight));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { top: 10, right: 10, bottom: 20, left: 44 };
  const minOffset = Math.min(...offsetSeries.map((p) => p.offset));
  const maxOffset = Math.max(...offsetSeries.map((p) => p.offset));
  const spread = Math.max(1, maxOffset - minOffset);
  const xOf = (unix) => pad.left + ((unix - timelineStartUnix) / (timelineEndUnix - timelineStartUnix)) * (width - pad.left - pad.right);
  const yOf = (offset) => pad.top + (1 - (offset - minOffset) / spread) * (height - pad.top - pad.bottom);

  ctx.strokeStyle = "rgba(116, 165, 214, 0.24)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (i / 4) * (height - pad.top - pad.bottom);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#79d6ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  offsetSeries.forEach((point, i) => {
    const x = xOf(point.unix);
    const y = yOf(point.offset);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  const selectedOffset = taiUtcSecondsAt(selectedUnixMs);
  const selectedX = xOf(Math.max(timelineStartUnix, Math.min(timelineEndUnix, selectedUnixMs)));
  const clampedSelectedOffset = Math.max(minOffset, Math.min(maxOffset, selectedOffset));
  const selectedY = yOf(clampedSelectedOffset);
  ctx.strokeStyle = "#ffc857";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(selectedX, pad.top);
  ctx.lineTo(selectedX, height - pad.bottom);
  ctx.stroke();
  ctx.fillStyle = "#ffc857";
  ctx.beginPath();
  ctx.arc(selectedX, selectedY, 3.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8eb3da";
  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.fillText(`${minOffset.toFixed(1)}s`, 6, height - pad.bottom + 4);
  ctx.fillText(`${maxOffset.toFixed(1)}s`, 6, pad.top + 4);

  el.timelineGraphCaption.textContent = `TAI-UTC sampled monthly from 1960 to 2026. Selected offset: ${selectedOffset.toFixed(3)} s`;
}

function renderOffsets(unixMs, taiMs) {
  const ntpBase = unixMs + unixNtp1900Offset;
  const taiUtcSeconds = (taiMs - ntpBase) / 1000;
  const gpsUtcSeconds = taiUtcSeconds + gpsTaiOffsetSeconds;
  el.taiUtcOffset.textContent = fmtSeconds(taiUtcSeconds);
  el.gpsUtcOffset.textContent = fmtSeconds(gpsUtcSeconds);
}

function renderTimeline() {
  el.timeline.textContent = "";
  const clamp = (x) => Math.max(0, Math.min(100, x));

  leapMarks.forEach((m) => {
    const x = clamp(((Date.parse(m.iso) - timelineStartUnix) / (timelineEndUnix - timelineStartUnix)) * 100);
    const div = document.createElement("div");
    div.className = "mark";
    div.style.left = `${x}%`;
    const label = document.createElement("span");
    label.textContent = m.label;
    div.appendChild(label);
    el.timeline.appendChild(div);
  });

  const selectedX = clamp(((selectedUnixMs - timelineStartUnix) / (timelineEndUnix - timelineStartUnix)) * 100);
  const selected = document.createElement("div");
  selected.className = "selected-marker";
  selected.style.left = `${selectedX}%`;
  el.timeline.appendChild(selected);
  el.timelineCaption.textContent = `Selected timestamp: ${toIso(selectedUnixMs)} (${Math.trunc(selectedX)}% across 1960-2026 window)`;
  drawOffsetGraph();
}

function renderSelected() {
  const tai = leap.TAI1900.fromUnix(selectedUnixMs);
  const gps = leap.GPStime.fromTAI(tai);

  el.selectedUnix.textContent = `${fmtMs(selectedUnixMs)} | ${toIso(selectedUnixMs)}`;
  el.selectedTai.textContent = fmtMs(tai);
  el.selectedGps.textContent = fmtMs(gps);
  renderOffsets(selectedUnixMs, tai);
  renderTimeline();
}

function makeEvents() {
  const sensors = [
    { id: "imu", period: 120, drift: 0.00022, stepAt: 3200, stepMs: -180, slewStart: 0, slewEnd: 0, slewSlope: 0 },
    { id: "cam", period: 400, drift: -0.00009, stepAt: 0, stepMs: 0, slewStart: 2400, slewEnd: 3400, slewSlope: -0.04 },
    { id: "lidar", period: 700, drift: 0.00018, stepAt: 0, stepMs: 0, slewStart: 2900, slewEnd: 3900, slewSlope: -0.06 },
  ];

  const events = [];
  for (const sensor of sensors) {
    for (let t = 0; t <= 6000; t += sensor.period) {
      const jitter = Math.sin((t + sensor.period) / 330) * 3;
      const trueMs = t + jitter;
      let civil = trueMs + sensor.drift * trueMs;
      if (sensor.stepAt && trueMs >= sensor.stepAt) {
        civil += sensor.stepMs;
      }
      if (sensor.slewStart && trueMs >= sensor.slewStart && trueMs <= sensor.slewEnd) {
        civil += (trueMs - sensor.slewStart) * sensor.slewSlope;
      }
      const atomic = trueMs;
      events.push({
        sensor: sensor.id,
        trueMs,
        civilMs: civil,
        atomicMs: atomic,
      });
    }
  }
  events.sort((a, b) => a.trueMs - b.trueMs);
  return events;
}

function inversionCount(events, key) {
  const ordered = [...events].sort((a, b) => a[key] - b[key]);
  let inversions = 0;
  let maxSeen = -Infinity;
  for (let i = 0; i < ordered.length; i += 1) {
    const truthOrder = events.indexOf(ordered[i]);
    if (truthOrder < maxSeen) {
      inversions += 1;
    } else {
      maxSeen = truthOrder;
    }
  }
  return inversions;
}

function negativeDeltas(events, key) {
  let count = 0;
  const sensors = ["imu", "cam", "lidar"];
  for (const sensor of sensors) {
    const filtered = events.filter((e) => e.sensor === sensor);
    for (let i = 1; i < filtered.length; i += 1) {
      if (filtered[i][key] - filtered[i - 1][key] < 0) {
        count += 1;
      }
    }
  }
  return count;
}

function renderTrack(node, events, key) {
  node.textContent = "";
  const min = Math.min(...events.map((e) => e[key]));
  const max = Math.max(...events.map((e) => e[key]));
  const sample = events.filter((e) => e.trueMs >= 2300 && e.trueMs <= 3900).slice(0, 28);

  sample.forEach((ev) => {
    const dot = document.createElement("div");
    const row = sensorStyle[ev.sensor].row;
    const norm = max === min ? 0.5 : (ev[key] - min) / (max - min);
    dot.className = `event-dot ${ev.sensor}`;
    dot.style.left = `${8 + norm * 84}%`;
    dot.style.top = `${20 + row * 28}px`;
    dot.title = `${sensorStyle[ev.sensor].label} ${Math.round(ev[key])}ms`;
    node.appendChild(dot);
  });
}

function renderSim() {
  const events = makeEvents();
  const civilInv = inversionCount(events, "civilMs");
  const atomicInv = inversionCount(events, "atomicMs");
  const civilNeg = negativeDeltas(events, "civilMs");
  const atomicNeg = negativeDeltas(events, "atomicMs");

  renderTrack(el.civilTrack, events, "civilMs");
  renderTrack(el.atomicTrack, events, "atomicMs");

  el.civilHealth.textContent = civilInv > 0 || civilNeg > 0 ? "At risk" : "OK";
  el.civilHealth.className = `badge ${civilInv > 0 || civilNeg > 0 ? "bad" : "good"}`;
  el.atomicHealth.textContent = atomicInv > 0 || atomicNeg > 0 ? "At risk" : "OK";
  el.atomicHealth.className = `badge ${atomicInv > 0 || atomicNeg > 0 ? "bad" : "good"}`;

  el.civilStats.textContent = `Reordered events: ${civilInv}, negative per-sensor dt: ${civilNeg}`;
  el.atomicStats.textContent = `Reordered events: ${atomicInv}, negative per-sensor dt: ${atomicNeg}`;

  const snippetRows = events
    .filter((e) => e.trueMs >= 3000 && e.trueMs <= 3560)
    .slice(0, 7)
    .map((e) => {
      const civilFlag = e.civilMs < 3150 ? " <- stepped/slewed" : "";
      return `${e.sensor.padEnd(5)} true=${e.trueMs.toFixed(1).padStart(7)}  civil=${e.civilMs.toFixed(1).padStart(7)}  atomic=${e.atomicMs.toFixed(1).padStart(7)}${civilFlag}`;
    });
  el.simSnippet.textContent = [
    "// Around correction window, civil timestamps can move relative to true order",
    ...snippetRows,
  ].join("\n");

  simData = { civilInv, atomicInv, civilNeg, atomicNeg };
}

function renderLive() {
  const unix = Date.now();
  const tai = leap.TAI1900.now();
  const gps = leap.GPStime.now();

  el.unixNow.textContent = fmtMs(unix);
  el.unixNowIso.textContent = toIso(unix);
  el.taiNow.textContent = fmtMs(tai);
  el.gpsNow.textContent = fmtMs(gps);

  const ntpBase = unix + unixNtp1900Offset;
  const taiUtcSeconds = (tai - ntpBase) / 1000;
  const gpsUtcSeconds = taiUtcSeconds + gpsTaiOffsetSeconds;
  el.taiNowDelta.textContent = `TAI-UTC now: ${fmtSeconds(taiUtcSeconds)}`;
  el.gpsNowDelta.textContent = `GPS-UTC now: ${fmtSeconds(gpsUtcSeconds)}`;
}

function bindEvents() {
  el.preset.addEventListener("change", () => {
    setPreset();
  });

  el.isoInput.addEventListener("input", () => {
    el.preset.value = "custom";
    lastEditedField = "iso";
    handleCustomInput(lastEditedField);
  });

  el.unixInput.addEventListener("input", () => {
    el.preset.value = "custom";
    lastEditedField = "unix";
    handleCustomInput(lastEditedField);
  });

  window.addEventListener("resize", drawOffsetGraph);
}

function startLiveLoop() {
  let last = 0;
  function frame(ts) {
    if (ts - last > 125) {
      renderLive();
      pulseLiveMetrics();
      last = ts;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function main() {
  leap = window.LeapSeconds;
  if (!leap || !leap.TAI1900 || !leap.GPStime) {
    throw new Error("LeapSeconds API not found. Ensure leapseconds.js is loaded before app.js.");
  }
  buildOffsetSeries();
  bindEvents();
  setPreset();
  renderSim();
  renderLive();
  startLiveLoop();
  if (!simData || simData.atomicNeg > 0) {
    console.warn("Simulation sanity check failed for atomic path.");
  }
}

try {
  main();
} catch (err) {
  document.body.innerHTML = `<pre style="color:#ff9a9a;padding:1rem">Demo failed to initialize:\n${String(err)}</pre>`;
}
