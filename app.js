const INSTANCES = [
  { url: "https://nuko-c.meowing.de", name: "meowing" },
  { url: "https://bergung-api.hoffnungfuerdiezukunft.net", name: "bergung" },
  { url: "https://apicobalt.girlskissing.top", name: "girlskissing" },
  { url: "https://cobalt-api.lamps-dev.dev", name: "lamps" },
  { url: "https://api.cobalt.rpkiinval.id", name: "rpkiinval" },
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
const progressEl = document.getElementById("progress");

function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = "status " + type;
}

function setProgress(pct, text) {
  if (!progressEl) return;
  progressEl.style.display = pct > 0 ? "block" : "none";
  progressEl.querySelector(".bar").style.width = pct + "%";
  progressEl.querySelector(".label").textContent = text || "";
}

async function tryInstance(instance, url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(instance.url + "/", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, videoQuality: "1080", audioFormat: "mp3" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error("HTTP " + res.status + (text ? ": " + text.slice(0, 80) : ""));
    }
    const data = await res.json();
    if (data.status === "error") {
      throw new Error(data.error?.code || data.error?.context || "error");
    }
    return data;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function analyze() {
  const url = urlInput.value.trim();
  if (!url) return setStatus("กรุณาวางลิงก์", "error");
  if (!/^https?:\/\//i.test(url)) return setStatus("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://", "error");

  setStatus("กำลังวิเคราะห์...", "info");
  setProgress(5, "เริ่มต้น");
  resultEl.classList.add("hidden");
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "กำลังทำ...";

  let lastError = null;
  const total = INSTANCES.length;

  for (let i = 0; i < total; i++) {
    const inst = INSTANCES[i];
    const pct = Math.round(((i) / total) * 80) + 10;
    setProgress(pct, "ลอง " + inst.name + " (" + (i + 1) + "/" + total + ")");
    setStatus("กำลังลอง " + inst.name + "...", "info");

    try {
      const data = await tryInstance(inst, url);
      setProgress(100, "สำเร็จ");
      renderResult(data, url, inst.name);
      setStatus("พร้อมดาวน์โหลด", "ok");
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "วิเคราะห์";
      setTimeout(() => setProgress(0), 800);
      return;
    } catch (e) {
      lastError = e;
      setStatus(inst.name + " ไม่ผ่าน: " + (e.message || "ข้อผิดพลาด"), "warn");
      await new Promise(r => setTimeout(r, 400));
    }
  }

  setProgress(0);
  setStatus("ไม่สามารถวิเคราะห์ได้จากทุกแหล่ง. ลิงก์อาจเป็นคลิปส่วนตัวหรือมี DRM. ลองใหม่ภายหลัง", "error");
  analyzeBtn.disabled = false;
  analyzeBtn.textContent = "วิเคราะห์";
}

function renderResult(data, originalUrl, source) {
  titleEl.textContent = data.filename || "Media";
  engineInfo.textContent = "แหล่ง: " + source;

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
    const div = document.createElement("div");
    div.className = "format-item";
    div.textContent = data.filename || "ไฟล์";
    formatsEl.appendChild(div);
  } else if (data.status === "picker" && Array.isArray(data.picker)) {
    data.picker.slice(0, 8).forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "format-item";
      div.textContent = item.thumb || ("รายการ " + (i + 1));
      if (item.url) {
        div.style.cursor = "pointer";
        div.onclick = () => {
          downloadLink.href = item.url;
          downloadLink.textContent = "ดาวน์โหลด";
          downloadLink.style.display = "inline-block";
        };
      }
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
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("fetch-theme", next);
};

const saved = localStorage.getItem("fetch-theme");
if (saved) document.documentElement.setAttribute("data-theme", saved);

setStatus("วางลิงก์แล้วกดวิเคราะห์", "info");
