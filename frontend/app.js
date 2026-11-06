const API = "";

const urlInput = document.getElementById("url-input");
const analyzeBtn = document.getElementById("analyze-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const thumb = document.getElementById("thumb");
const titleEl = document.getElementById("title");
const engineInfo = document.getElementById("engine-info");
const extraMeta = document.getElementById("extra-meta");
const formatsEl = document.getElementById("formats");
const downloadBtn = document.getElementById("download-btn");
const downloadBest = document.getElementById("download-best");
const historyEl = document.getElementById("history");
const themeToggle = document.getElementById("theme-toggle");
const clearHistory = document.getElementById("clear-history");

let currentData = null;
let selectedFormat = null;

function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.style.color = type === "error" ? "#f87171" : type === "ok" ? "var(--lime)" : "var(--muted)";
}

async function analyze() {
  const url = urlInput.value.trim();
  if (!url) return setStatus("Enter a URL", "error");
  setStatus("Analyzing…");
  resultEl.classList.add("hidden");
  analyzeBtn.disabled = true;
  try {
    const res = await fetch(`${API}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || res.statusText);
    }
    currentData = await res.json();
    renderResult(currentData);
    setStatus("Ready to download", "ok");
  } catch (e) {
    setStatus(e.message || "Analysis failed", "error");
  } finally {
    analyzeBtn.disabled = false;
  }
}

function renderResult(data) {
  titleEl.textContent = data.title || "Untitled";
  const eng = data.detected_engine || data.engine || "unknown";
  engineInfo.textContent = `Engine: ${eng}`;
  let extra = [];
  if (data.duration) extra.push(`${Math.floor(data.duration/60)}:${String(data.duration%60).padStart(2,"0")}`);
  if (data.uploader) extra.push(data.uploader);
  if (data.count) extra.push(`${data.count} items`);
  extraMeta.textContent = extra.join(" · ");
  if (data.thumbnail) {
    thumb.src = data.thumbnail;
    thumb.style.display = "block";
  } else {
    thumb.style.display = "none";
  }
  formatsEl.innerHTML = "";
  selectedFormat = null;
  const formats = data.formats || [];
  if (formats.length === 0) {
    formatsEl.innerHTML = "<p style='color:var(--muted);font-size:0.85rem'>Direct download available (no selectable formats)</p>";
  } else {
    formats.forEach((f, i) => {
      const div = document.createElement("div");
      div.className = "format-item";
      const size = f.filesize ? ` · ${Math.round(f.filesize/1024/1024)}MB` : "";
      div.textContent = `${f.resolution || f.ext || "format"}${size}`;
      div.title = f.format_id || "";
      div.onclick = () => {
        document.querySelectorAll(".format-item").forEach(el => el.classList.remove("selected"));
        div.classList.add("selected");
        selectedFormat = f.format_id;
      };
      if (i === 0) {
        div.classList.add("selected");
        selectedFormat = f.format_id;
      }
      formatsEl.appendChild(div);
    });
  }
  resultEl.classList.remove("hidden");
}

async function doDownload(formatId) {
  if (!currentData) return;
  setStatus("Downloading…");
  downloadBtn.disabled = true;
  downloadBest.disabled = true;
  try {
    const res = await fetch(`${API}/api/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentData.webpage_url || urlInput.value,
        format_id: formatId || selectedFormat,
        engine: currentData.detected_engine,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Download failed");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1] : "download";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    setStatus("Download complete", "ok");
    loadHistory();
  } catch (e) {
    setStatus(e.message || "Download error", "error");
  } finally {
    downloadBtn.disabled = false;
    downloadBest.disabled = false;
  }
}

async function loadHistory() {
  try {
    const res = await fetch(`${API}/api/downloads`);
    const data = await res.json();
    if (!data.files || data.files.length === 0) {
      historyEl.innerHTML = "<li style='color:var(--muted)'>No downloads yet</li>";
      return;
    }
    historyEl.innerHTML = data.files.slice(0, 12).map(f => 
      `<li><span>${f.name}</span><span>${(f.size/1024/1024).toFixed(1)} MB</span></li>`
    ).join("");
  } catch {
    historyEl.innerHTML = "<li style='color:var(--muted)'>History unavailable</li>";
  }
}

analyzeBtn.onclick = analyze;
downloadBtn.onclick = () => doDownload(selectedFormat);
downloadBest.onclick = () => doDownload(null);
urlInput.onkeydown = (e) => { if (e.key === "Enter") analyze(); };
themeToggle.onclick = () => {
  const cur = document.documentElement.getAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", cur === "light" ? "dark" : "light");
  localStorage.setItem("fetch-theme", cur === "light" ? "dark" : "light");
};
clearHistory.onclick = async () => {
  if (!confirm("Clear download history display? (files remain on disk)")) return;
  historyEl.innerHTML = "<li style='color:var(--muted)'>Cleared</li>";
};

const saved = localStorage.getItem("fetch-theme");
if (saved) document.documentElement.setAttribute("data-theme", saved);

loadHistory();
setStatus("Ready — paste a URL");
