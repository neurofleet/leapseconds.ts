const unixNtp1900Offset = 2_208_988_800_000;
const gpsTaiOffsetSeconds = -19;

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
  convertBtn: document.getElementById("convertBtn"),
  convertError: document.getElementById("convertError"),
  selectedUnix: document.getElementById("selectedUnix"),
  selectedTai: document.getElementById("selectedTai"),
  selectedGps: document.getElementById("selectedGps"),
  taiUtcOffset: document.getElementById("taiUtcOffset"),
  gpsUtcOffset: document.getElementById("gpsUtcOffset"),
  timeline: document.getElementById("timeline"),
  timelineCaption: document.getElementById("timelineCaption"),
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
    return;
  }
  el.isoInput.value = toIso(selectedUnixMs);
  el.unixInput.value = String(selectedUnixMs);
  renderSelected();
}

function parseCustomInput() {
  let unix = Number.parseInt(el.unixInput.value, 10);
  const isoText = el.isoInput.value.trim();
  if (!Number.isFinite(unix) && isoText) {
    unix = Date.parse(isoText);
  }
  if (!Number.isFinite(unix)) {
    throw new Error("Provide a valid Unix ms value or an ISO UTC timestamp.");
  }
  return unix;
}

function renderOffsets(unixMs, taiMs) {
  const ntpBase = unixMs + unixNtp1900Offset;
  const taiUtcSeconds = (taiMs - ntpBase) / 1000;
  const gpsUtcSeconds = taiUtcSeconds + gpsTaiOffsetSeconds;
  el.taiUtcOffset.textContent = fmtSeconds(taiUtcSeconds);
  el.gpsUtcOffset.textContent = fmtSeconds(gpsUtcSeconds);
}

function renderTimeline() {
  const min = Date.parse("1960-01-01T00:00:00Z");
  const max = Date.parse("2026-01-01T00:00:00Z");
  el.timeline.textContent = "";
  const clamp = (x) => Math.max(0, Math.min(100, x));

  leapMarks.forEach((m) => {
    const x = clamp(((Date.parse(m.iso) - min) / (max - min)) * 100);
    const div = document.createElement("div");
    div.className = "mark";
    div.style.left = `${x}%`;
    const label = document.createElement("span");
    label.textContent = m.label;
    div.appendChild(label);
    el.timeline.appendChild(div);
  });

  const selectedX = clamp(((selectedUnixMs - min) / (max - min)) * 100);
  const selected = document.createElement("div");
  selected.className = "selected-marker";
  selected.style.left = `${selectedX}%`;
  el.timeline.appendChild(selected);
  el.timelineCaption.textContent = `Selected timestamp: ${toIso(selectedUnixMs)} (${Math.trunc(selectedX)}% across 1960-2026 window)`;
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
    el.convertError.textContent = "";
  });

  el.convertBtn.addEventListener("click", () => {
    try {
      selectedUnixMs = parseCustomInput();
      el.preset.value = "custom";
      el.convertError.textContent = "";
      renderSelected();
    } catch (err) {
      el.convertError.textContent = err.message || "Invalid input.";
    }
  });
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
