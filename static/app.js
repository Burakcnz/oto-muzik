let ws = null;
let queue = [];
let completed = [];
let isDownloading = false;
let dragSrcEl = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function connectWS() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.onopen = () => console.log("WS bağlandı");
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => setTimeout(connectWS, 2000);
    ws.onerror = () => {};
}

function handleMessage(msg) {
    switch (msg.type) {
        case "queue_updated":
            queue = msg.queue || [];
            completed = msg.completed || [];
            renderAll();
            break;
        case "searching":
            updateSongSearching(msg.song_id, msg.query);
            refreshDownloadColumn();
            break;
        case "found":
            updateSongFound(msg.song_id, msg);
            break;
        case "progress":
            updateProgress(msg.song_id, msg);
            break;
        case "converting":
            updateConverting(msg.song_id);
            break;
        case "completed":
            toast(msg.file_name + " indirildi!", "success");
            removeSongEl(msg.song_id);
            break;
        case "error":
            toast("Hata: " + msg.error, "error");
            removeSongEl(msg.song_id);
            break;
        case "need_selection":
            showSelectionModal(msg.song_id, msg.query, msg.options);
            break;
        case "selection_made":
            hideSelectionModal();
            break;
    }
}

function renderAll() {
    renderQueueColumn();
    renderDownloadColumn();
    renderCompletedColumn();
    renderErrorColumn();
    updateStats();
    updateGlobalProgress();
}

function removeSongEl(songId) {
    const el = document.querySelector(`.song-item[data-id="${songId}"]`);
    if (el) {
        el.style.opacity = "0";
        el.style.transform = "translateX(20px)";
        el.style.transition = "0.3s ease";
        setTimeout(() => el.remove(), 300);
    }
    setTimeout(() => {
        renderDownloadColumn();
        renderCompletedColumn();
        renderErrorColumn();
        updateStats();
        updateGlobalProgress();
        updateControlButtons();
    }, 350);
}

// ─── SIRA BEKLEYENLER ───
function renderQueueColumn() {
    const list = $("#queueList");
    const empty = $("#queueEmpty");
    const count = $("#queueCount");

    const pending = queue.filter(s => s.status === "pending");
    count.textContent = pending.length;
    empty.style.display = pending.length === 0 ? "flex" : "none";

    const existing = new Map();
    list.querySelectorAll(".song-item").forEach(el => existing.set(el.dataset.id, el));
    const ids = new Set(pending.map(s => s.id));
    existing.forEach((el, id) => { if (!ids.has(id)) el.remove(); });

    pending.forEach((song, i) => {
        let el = list.querySelector(`.song-item[data-id="${song.id}"]`);
        if (el) { updateSongElement(el, song, i + 1); }
        else { el = createSongElement(song, i + 1); list.appendChild(el); }
    });

    enableDragDrop();
}

// ─── İNDİRİLİYOR ───
function renderDownloadColumn() {
    const list = $("#downloadList");
    const empty = $("#downloadEmpty");

    const active = queue.filter(s => ["searching", "downloading", "converting"].includes(s.status));
    $("#downloadingCount").textContent = active.length;
    empty.style.display = active.length === 0 ? "flex" : "none";

    const existing = new Map();
    list.querySelectorAll(".song-item").forEach(el => existing.set(el.dataset.id, el));
    const ids = new Set(active.map(s => s.id));
    existing.forEach((el, id) => { if (!ids.has(id)) el.remove(); });

    active.forEach((song, i) => {
        let el = list.querySelector(`.song-item[data-id="${song.id}"]`);
        if (el) { updateSongElement(el, song, i + 1); }
        else { el = createSongElement(song, i + 1, true); list.appendChild(el); }
    });
}

function refreshDownloadColumn() {
    const list = $("#downloadList");
    const empty = $("#downloadEmpty");
    const active = queue.filter(s => ["searching", "downloading", "converting"].includes(s.status));
    empty.style.display = active.length === 0 ? "flex" : "none";
    $("#downloadingCount").textContent = active.length;
}

// ─── TAMAMLANANLAR ───
function renderCompletedColumn() {
    const list = $("#doneList");
    const empty = $("#doneEmpty");
    const count = $("#doneCount");

    const done = completed.filter(s => s.status === "completed");
    count.textContent = done.length;
    empty.style.display = done.length === 0 ? "flex" : "none";

    list.querySelectorAll(".done-item").forEach(el => el.remove());

    done.forEach(song => {
        const div = document.createElement("div");
        div.className = "done-item";
        div.dataset.id = song.id;
        div.innerHTML = `
            <div class="check-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg></div>
            <div class="done-info">
                <div class="done-title" title="${escapeHtml(song.file_name)}">${escapeHtml(song.file_name || song.query)}</div>
                <div class="done-size">${song.file_size ? song.file_size + " MB" : ""} ${song.youtube_channel ? "• " + escapeHtml(song.youtube_channel) : ""}</div>
            </div>
            <div class="done-actions">
                <button class="btn-icon" onclick="openFile('${song.id}')" title="Dosyayı Aç">📂</button>
            </div>`;
        list.appendChild(div);
    });
}

// ─── HATALAR ───
function renderErrorColumn() {
    const list = $("#errorList");
    const empty = $("#errorEmpty");
    const count = $("#errorCount");

    const errors = completed.filter(s => s.status === "error");
    count.textContent = errors.length;
    empty.style.display = errors.length === 0 ? "flex" : "none";

    list.querySelectorAll(".error-item").forEach(el => el.remove());

    errors.forEach(song => {
        const div = document.createElement("div");
        div.className = "error-item";
        div.dataset.id = song.id;
        div.innerHTML = `
            <div class="error-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
            <div class="error-info">
                <div class="error-title" title="${escapeHtml(song.query)}">${escapeHtml(song.query)}</div>
                <div class="error-msg">${escapeHtml(song.error || "Bilinmeyen hata")}</div>
            </div>
            <div class="error-actions">
                <button class="btn-icon" onclick="retrySong('${song.id}')" title="Tekrar Dene">🔄</button>
                <button class="btn-icon" onclick="removeError('${song.id}')" title="Kaldır">✕</button>
            </div>`;
        list.appendChild(div);
    });
}

// ─── ŞARKI ELEMANLARI ───
function createSongElement(song, num, inDownload) {
    const div = document.createElement("div");
    div.className = "song-item";
    div.dataset.id = song.id;
    if (!inDownload) div.draggable = true;
    updateSongElement(div, song, num);
    return div;
}

function updateSongElement(el, song, num) {
    const s = song.status || "pending";
    let meta = song.query;
    if (song.youtube_title) {
        meta = song.youtube_title;
        if (song.youtube_channel) meta += " — " + song.youtube_channel;
        if (song.youtube_views) meta += " • " + formatViews(song.youtube_views);
    }
    if (song.error) meta = "Hata: " + song.error;

    let progress = "";
    if (s === "downloading") {
        progress = `<div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>
        <div class="progress-text"><span>Aranıyor...</span><span></span></div>`;
    } else if (s === "converting") {
        progress = `<div class="progress-bar"><div class="progress-fill" style="width:100%;background:var(--warning)"></div></div>
        <div class="progress-text"><span>MP3'e dönüştürülüyor...</span><span></span></div>`;
    }

    el.innerHTML = `
        <span class="drag-handle" title="Sürükle">⠿</span>
        <span class="song-num">#${num}</span>
        ${song.is_url ? '<span class="badge link" title="YouTube Linki">🔗</span>' : ''}
        <div class="song-info">
            <div class="song-title">${escapeHtml(song.query)}</div>
            <div class="song-meta">${escapeHtml(meta)}</div>
            ${progress}
        </div>
        <span class="song-status ${s}">${statusLabel(s)}</span>
        <div class="song-actions">
            <button class="btn-icon" onclick="removeSong('${song.id}')" title="Kaldır">✕</button>
        </div>`;
}

function updateSongSearching(songId, query) {
    const el = document.querySelector(`.song-item[data-id="${songId}"]`);
    if (!el) return;
    const meta = el.querySelector(".song-meta");
    if (meta) meta.textContent = `"${query}" aranıyor...`;
    setStatus(el, "searching", "ARANIYOR");
}

function updateSongFound(songId, data) {
    const el = document.querySelector(`.song-item[data-id="${songId}"]`);
    if (!el) return;
    const meta = el.querySelector(".song-meta");
    if (meta) meta.textContent = data.youtube_title + " — " + data.channel + " • " + formatViews(data.views);
    const title = el.querySelector(".song-title");
    if (title) title.textContent = data.youtube_title;
    setStatus(el, "downloading", "İNDİRİLİYOR");
}

function updateProgress(songId, data) {
    const el = document.querySelector(`.song-item[data-id="${songId}"]`);
    if (!el) return;
    const fill = el.querySelector(".progress-fill");
    const text = el.querySelector(".progress-text");
    if (fill) fill.style.width = data.percent + "%";
    if (text) {
        text.children[0].textContent = data.percent + "%";
        text.children[1].textContent = data.eta ? data.eta + "s kalan" : data.speed + " MB/s";
    }
}

function updateConverting(songId) {
    const el = document.querySelector(`.song-item[data-id="${songId}"]`);
    if (!el) return;
    const fill = el.querySelector(".progress-fill");
    if (fill) { fill.style.width = "100%"; fill.style.background = "var(--warning)"; }
    const text = el.querySelector(".progress-text");
    if (text) text.children[0].textContent = "MP3'e dönüştürülüyor...";
    setStatus(el, "converting", "DÖNÜŞTÜRÜLÜYOR");
}

function setStatus(el, cls, text) {
    const badge = el.querySelector(".song-status");
    if (badge) { badge.className = "song-status " + cls; badge.textContent = text; }
}

// ─── İSTATİSTİKLER ───
function updateStats() {
    const pending = queue.filter(s => s.status === "pending").length;
    const active = queue.filter(s => ["searching", "downloading", "converting"].includes(s.status)).length;
    const done = completed.filter(s => s.status === "completed").length;
    const errors = completed.filter(s => s.status === "error").length + queue.filter(s => s.status === "error").length;

    $("#statTotal").textContent = queue.length + completed.length;
    $("#statPending").textContent = pending;
    $("#statDone").textContent = done;
    $("#statError").textContent = errors;

    isDownloading = active > 0;
    updateControlButtons();
}

function updateControlButtons() {
    const hasPending = queue.some(s => s.status === "pending");
    const startBtn = $("#btnStartAll");
    const pauseBtn = $("#btnPause");
    const stopBtn = $("#btnStop");

    if (isDownloading) {
        startBtn.style.display = "none";
        pauseBtn.style.display = "inline-flex";
        stopBtn.style.display = "inline-flex";
    } else {
        startBtn.style.display = "inline-flex";
        startBtn.disabled = !hasPending;
        pauseBtn.style.display = "none";
        stopBtn.style.display = "none";
        $("#btnPauseText").textContent = "Duraklat";
    }
}

function updateGlobalProgress() {
    const total = queue.length + completed.length;
    const done = completed.filter(s => s.status === "completed").length;
    const bar = $("#progressGlobal");
    if (total === 0) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    $("#progressGlobalFill").style.width = Math.round((done / total) * 100) + "%";
    $("#progressGlobalText").textContent = done + " / " + total + " tamamlandı";
}

// ─── YARDIMCI ───
function statusLabel(status) {
    const map = { pending: "BEKLİYOR", searching: "ARANIYOR", downloading: "İNDİRİLİYOR", converting: "DÖNÜŞTÜRÜLÜYOR", completed: "TAMAMLANDI", error: "HATA", paused: "DURAKLATILDI", cancelled: "İPTAL" };
    return map[status] || status.toUpperCase();
}

function formatViews(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
    return n.toString();
}

function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}

function toast(message, type = "info") {
    const container = $("#toasts");
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => { t.style.animation = "slideOut 0.3s ease forwards"; setTimeout(() => t.remove(), 300); }, 4000);
}

// ─── SEÇİM MODALI ───
function showSelectionModal(songId, query, options) {
    hideSelectionModal();
    const overlay = document.createElement("div");
    overlay.className = "selection-overlay";
    overlay.id = "selectionModal";

    const modal = document.createElement("div");
    modal.className = "selection-modal";
    modal.innerHTML = `
        <div class="selection-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
                <h3>Hangisini indirelim?</h3>
                <p class="selection-query">"${escapeHtml(query)}"</p>
            </div>
        </div>
        <div class="selection-options">
            ${options.map((opt, i) => `
                <div class="selection-card" onclick="selectVideo('${songId}', ${i})">
                    <img class="selection-thumb" src="${escapeHtml(opt.thumbnail || `https://img.youtube.com/vi/${opt.id}/mqdefault.jpg`)}" alt="" onerror="this.style.display='none'">
                    <div class="selection-info">
                        <div class="selection-title">${escapeHtml(opt.title)}</div>
                        <div class="selection-meta">${escapeHtml(opt.channel || '')} • ${formatViews(opt.views || 0)} izlenme</div>
                    </div>
                    <button class="btn btn-primary selection-btn">Seç</button>
                </div>
            `).join("")}
        </div>
        <div class="selection-footer">
            <button class="btn btn-ghost" onclick="selectVideo('${songId}', 0)">İlkini seç</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) selectVideo(songId, 0); });
}

function hideSelectionModal() {
    const existing = document.getElementById("selectionModal");
    if (existing) existing.remove();
}

async function selectVideo(songId, index) {
    hideSelectionModal();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "select_video", song_id: songId, index: index }));
    }
    try {
        const formData = new FormData();
        formData.append("song_id", songId);
        formData.append("index", index);
        await fetch("/api/select-video", { method: "POST", body: formData });
    } catch (e) {}
}

// ─── DRAG & DROP ───
function enableDragDrop() {
    document.querySelectorAll("#queueList .song-item").forEach(item => {
        item.addEventListener("dragstart", handleDragStart);
        item.addEventListener("dragover", handleDragOver);
        item.addEventListener("dragenter", handleDragEnter);
        item.addEventListener("dragleave", handleDragLeave);
        item.addEventListener("drop", handleDrop);
        item.addEventListener("dragend", handleDragEnd);
    });
}

function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", this.dataset.id);
}

function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== dragSrcEl) this.classList.add("drag-over");
}

function handleDragLeave() { this.classList.remove("drag-over"); }

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove("drag-over");
    if (dragSrcEl === this) return;
    const list = $("#queueList");
    const items = [...list.querySelectorAll(".song-item")];
    const fromId = e.dataTransfer.getData("text/plain");
    const toId = this.dataset.id;
    const fromIdx = items.findIndex(el => el.dataset.id === fromId);
    const toIdx = items.findIndex(el => el.dataset.id === toId);
    if (fromIdx !== -1 && toIdx !== -1) {
        const fromItem = items[fromIdx];
        if (fromIdx < toIdx) { this.parentNode.insertBefore(fromItem, this.nextSibling); }
        else { this.parentNode.insertBefore(fromItem, this); }
        sendReorder();
    }
}

function handleDragEnd() {
    $$(".song-item").forEach(el => el.classList.remove("dragging", "drag-over"));
}

function sendReorder() {
    const order = [...document.querySelectorAll("#queueList .song-item")].map(el => el.dataset.id);
    fetch("/api/queue/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ order: order }),
    }).catch(console.error);
}

// ─── API ÇAĞRILARI ───
async function removeSong(songId) {
    try { await fetch("/api/queue/" + songId + "/remove", { method: "POST" }); } catch (e) {}
}

async function openFile(songId) {
    try { await fetch("/api/open-file/" + songId, { method: "POST" }); } catch (e) {}
}

async function clearCompleted() {
    if (!confirm("Tamamlanan listesini temizlemek istediğinize emin misiniz?")) return;
    try { await fetch("/api/completed/clear", { method: "POST" }); toast("Tamamlanan listesi temizlendi", "info"); } catch (e) {}
}

async function clearErrors() {
    if (!confirm("Hatalı şarkıları temizlemek istediğinize emin misiniz?")) return;
    try { await fetch("/api/errors/clear", { method: "POST" }); toast("Hatalı şarkılar temizlendi", "info"); } catch (e) {}
}

async function retrySong(songId) {
    try {
        await fetch("/api/errors/" + songId + "/retry", { method: "POST" });
        toast("Şarkı tekrar denenecek", "info");
    } catch (e) { toast("Tekrar deneme hatası", "error"); }
}

async function removeError(songId) {
    try { await fetch("/api/errors/" + songId + "/remove", { method: "POST" }); } catch (e) {}
}

async function parseInput() {
    const text = $("#songInput").value.trim();
    if (!text) { toast("Lütfen şarkı listesi girin", "error"); return; }
    const formData = new FormData();
    formData.append("text", text);
    try {
        const res = await fetch("/api/parse", { method: "POST", body: formData });
        const data = await res.json();
        toast(data.total + " şarkı listeye eklendi", "success");
        $("#songInput").value = "";
        updateLineCount();
    } catch (e) { toast("Liste ayrıştırma hatası", "error"); }
}

async function parseFile(file) {
    const formData = new FormData();
    formData.append("file", file);
    try {
        const res = await fetch("/api/parse", { method: "POST", body: formData });
        const data = await res.json();
        toast(data.total + " şarkı listeye eklendi", "success");
    } catch (e) { toast("Dosya ayrıştırma hatası", "error"); }
}

function updateLineCount() {
    const text = $("#songInput").value.trim();
    const count = text ? text.split("\n").filter(l => l.trim() && !l.trim().startsWith("#")).length : 0;
    $("#lineCount").textContent = count + " şarkı";
}

// ─── BAŞLAT ───
document.addEventListener("DOMContentLoaded", () => {
    connectWS();

    $$(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            $$(".tab").forEach(t => t.classList.remove("active"));
            $$(".tab-content").forEach(tc => tc.classList.remove("active"));
            tab.classList.add("active");
            $("#tab" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.add("active");
        });
    });

    $("#songInput").addEventListener("input", updateLineCount);
    $("#btnParse").addEventListener("click", parseInput);

    $("#btnStartAll").addEventListener("click", async () => {
        try {
            await fetch("/api/download/start", { method: "POST" });
            toast("İndirme başlatıldı", "info");
        } catch (e) { toast("İndirme başlatma hatası", "error"); }
    });

    $("#btnPause").addEventListener("click", async () => {
        try {
            const res = await fetch("/api/download/pause", { method: "POST" });
            const data = await res.json();
            const text = $("#btnPauseText");
            if (data.paused) {
                text.textContent = "Devam Et";
                toast("İndirme duraklatıldı", "info");
            } else {
                text.textContent = "Duraklat";
                toast("İndirme devam ediyor", "info");
            }
        } catch (e) {}
    });

    $("#btnStop").addEventListener("click", async () => {
        try {
            await fetch("/api/download/stop", { method: "POST" });
            isDownloading = false;
            updateControlButtons();
            toast("İndirme durduruldu", "info");
        } catch (e) {}
    });

    $("#btnClearQueue").addEventListener("click", async () => {
        if (!confirm("Tüm listeyi temizlemek istediğinize emin misiniz?")) return;
        try { await fetch("/api/queue/clear", { method: "POST" }); toast("Liste temizlendi", "info"); } catch (e) {}
    });

    $("#btnOpenFolder").addEventListener("click", async () => {
        try { await fetch("/api/open-folder", { method: "POST" }); } catch (e) {}
    });

    const dropZone = $("#dropZone");
    const fileInput = $("#fileInput");

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", e => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", e => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

    function handleFile(file) {
        if (!file.name.endsWith(".txt") && !file.name.endsWith(".csv")) {
            toast("Lütfen .txt veya .csv dosyası yükleyin", "error"); return;
        }
        $("#fileName").textContent = file.name;
        $("#fileInfo").style.display = "flex";
        dropZone.style.display = "none";
        parseFile(file);
    }

    $("#btnRemoveFile").addEventListener("click", () => {
        $("#fileInfo").style.display = "none";
        dropZone.style.display = "flex";
        fileInput.value = "";
    });
});
