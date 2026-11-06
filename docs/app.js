const INSTANCES = [
  "https://nuko-c.meowing.de",
  "https://bergung-api.hoffnungfuerdiezukunft.net",
  "https://apicobalt.girlskissing.top",
  "https://cobalt-api.lamps-dev.dev",
];

const urlInput = document.getElementById("url-input");
const analyzeBtn = document.getElementById("analyze-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const thumb = document.getElementById("thumb");
const titleEl = document.getElementById("title");
const engineInfo = document.getElementById("engine-info");
const formatsEl = document.getElementById("formats");
const downloadLink = document.getElementById("download-link");
const themeToggle = document.getElementById("theme-toggle");

function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.style.color = type === "error" ? "#f87171" : type === "ok" ? "var(--lime)" : "var(--muted)";
}

async function tryInstance(instance, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(instance + "/", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, videoQuality: "1080" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status === "error") throw new Error(data.error?.code || "error");
    return data;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function analyze() {
  const url = urlInput.value.trim();
  if (!url) return setStatus("กรุณาวางลิงก์", "error");
  if (!url.startsWith("http")) return setStatus("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://", "error");

  setStatus("กำลังวิเคราะห์...");
  resultEl.classList.add("hidden");
  analyzeBtn.disabled = true;

  let lastError = null;
  for (const instance of INSTANCES) {
    try {
      setStatus("กำลังลอง " + new URL(instance).hostname + "...");
      const data = await tryInstance(instance, url);
      renderResult(data, url);
      setStatus("พร้อมดาวน์โหลด", "ok");
      analyzeBtn.disabled = false;
      return;
    } catch (e) {
      lastError = e;
    }
  }
  setStatus("ไม่สามารถวิเคราะห์ได้: " + (lastError?.message || "ลองใหม่ภายหลัง"), "error");
  analyzeBtn.disabled = false;
}

function renderResult(data, originalUrl) {
  titleEl.textContent = data.filename || "Media";
  engineInfo.textContent = "แหล่ง: Cobalt";

  if (data.thumbnail) {
    thumb.src = data.thumbnail;
    thumb.style.display = "block";
  } else {
    thumb.style.display = "none";
  }

  formatsEl.innerHTML = "";
  let downloadUrl = null;

  if (data.status === "tunnel" || data.status === "redirect") {
    downloadUrl = data.url;
    formatsEl.innerHTML = `<div class="format-item">${data.filename || "ไฟล์"}</div>`;
  } else if (data.status === "picker" && data.picker) {
    data.picker.slice(0, 10).forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "format-item";
      div.textContent = item.thumb || ("รายการ " + (i+1));
      formatsEl.appendChild(div);
    });
    if (data.picker[0]?.url) downloadUrl = data.picker[0].url;
  }

  if (downloadUrl) {
    downloadLink.href = downloadUrl;
    downloadLink.textContent = "ดาวน์โหลด";
    downloadLink.style.display = "inline-block";
  } else {
    downloadLink.style.display = "none";
  }

  resultEl.classList.remove("hidden");
}

analyzeBtn.onclick = analyze;
urlInput.onkeydown = (e) => { if (e.key === "Enter") analyze(); };

themeToggle.onclick = () => {
  const cur = document.documentElement.getAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", cur === "light" ? "dark" : "light");
  localStorage.setItem("fetch-theme", cur === "light" ? "dark" : "light");
};

const saved = localStorage.getItem("fetch-theme");
if (saved) document.documentElement.setAttribute("data-theme", saved);

setStatus("วางลิงก์แล้วกดวิเคราะห์");
