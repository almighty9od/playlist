(() => {
  "use strict";

  const listEl   = document.getElementById("list");
  const searchEl = document.getElementById("search");
  const countEl  = document.getElementById("count");
  const statusEl = document.getElementById("status");
  const expandAllBtn   = document.getElementById("expand-all");
  const collapseAllBtn = document.getElementById("collapse-all");

  const adminToggle = document.getElementById("admin-toggle");
  const adminBar    = document.getElementById("admin-bar");
  const adminExport = document.getElementById("admin-export");
  const adminReset  = document.getElementById("admin-reset");

  const LS_KEY = "playlist_aliases_v1";

  let tracks = [];
  let grouped = {};
  const openState = {};
  let aliases = {};

  // ==== АДМИН-РЕЖИМ ====
  const params = new URLSearchParams(location.search);
  let admin = params.get("admin") === "1" || localStorage.getItem("admin") === "1";
  applyAdminUI();

  adminToggle.addEventListener("click", () => {
    admin = !admin;
    localStorage.setItem("admin", admin ? "1" : "0");
    applyAdminUI();
  });

  function applyAdminUI() {
    document.body.classList.toggle("admin", admin);
    adminToggle.classList.toggle("active", admin);
    adminBar.hidden = !admin;
  }

  // ==== ЗАГРУЗКА ====
  Promise.all([
    fetch("aliases.json", { cache: "no-cache" })
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({})),
    fetch("tracks.json", { cache: "no-cache" })
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
        return r.json();
      }),
  ])
    .then(([fileAliases, data]) => {
      if (!Array.isArray(data)) throw new Error("tracks.json — не массив");
      tracks = data;

      let localAliases = {};
      try { localAliases = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch {}

      aliases = { ...(fileAliases || {}), ...localAliases };

      buildGroups();
      render();
      setStatus(`Загружено ${tracks.length} треков. Жми «Скопировать» и вставляй в чат.`, "ok");
    })
    .catch(err => {
      console.error("[catalog] ошибка:", err);
      listEl.innerHTML = `<div class="error">
        Не удалось загрузить <b>tracks.json</b>: ${escapeHtml(err.message)}.<br><br>
        Проверь:<br>
        1. файл лежит рядом с index.html;<br>
        2. открываешь через <b>http(s)</b>, а не file://;<br>
        3. на GitHub Pages подожди минуту и обнови Ctrl+F5.
      </div>`;
      setStatus("Ошибка загрузки каталога", "err");
    });

  // ==== ГРУППИРОВКА ====
  function buildGroups() {
    grouped = {};
    for (const t of tracks) {
      const key = (t.folder && t.folder.trim()) || "Без папки";
      (grouped[key] ||= []).push(t);
    }
    const sorted = {};
    Object.keys(grouped)
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "ru"))
      .forEach(k => { sorted[k] = grouped[k]; });
    grouped = sorted;
  }

  function displayName(folder) {
    const a = aliases[folder];
    return (a && a.trim()) || folder;
  }

  // ==== РЕНДЕР ====
  function render() {
    const q = searchEl.value.trim().toLowerCase();

    const visibleGroups = {};
    let totalVisible = 0;

    for (const [folder, items] of Object.entries(grouped)) {
      const filtered = q
        ? items.filter(t => {
            const hay = `${t.artist} ${t.title} ${t.album} ${t.folder} ${displayName(t.folder)}`.toLowerCase();
            return hay.includes(q);
          })
        : items;
      if (filtered.length) {
        visibleGroups[folder] = filtered;
        totalVisible += filtered.length;
      }
    }

    countEl.textContent = q
      ? `Найдено: ${totalVisible} из ${tracks.length}`
      : `${tracks.length} треков • ${Object.keys(grouped).length} плейлистов`;

    const entries = Object.entries(visibleGroups);
    if (!entries.length) {
      listEl.innerHTML = `<div class="empty">Ничего не найдено 🤷</div>`;
      return;
    }

    listEl.innerHTML = entries.map(([folder, items]) => {
      const isOpen = q ? true : !!openState[folder];
      const name = displayName(folder);
      const renamed = aliases[folder] && aliases[folder].trim() && aliases[folder].trim() !== folder;

      return `
        <section class="playlist ${isOpen ? "open" : ""}" data-folder="${escapeAttr(folder)}">
          <div class="playlist-head">
            <span class="arrow">▶</span>
            <span class="name" title="${escapeAttr(folder)}">${escapeHtml(name)}${renamed ? ' <small style="color:#6f6f7a;font-weight:400">('+escapeHtml(folder)+')</small>' : ''}</span>
            <button class="edit" type="button" title="Переименовать">✎</button>
            <span class="count">${items.length}</span>
          </div>
          <div class="playlist-body">
            ${items.map(t => {
              const idx = tracks.indexOf(t);
              return `
                <div class="track">
                  <div class="meta">
                    <b>${escapeHtml(t.artist)}</b> — <span class="t">${escapeHtml(t.title)}</span>
                    <small>${escapeHtml(t.album || "")}</small>
                  </div>
                  <div class="actions">
                    <button class="yt" data-yt="${idx}" title="Искать на YouTube">▶ YouTube</button>
                    <button data-idx="${idx}" title="Скопировать и вставить в чат">Скопировать</button>
                  </div>
                </div>`;
            }).join("")}
          </div>
        </section>`;
    }).join("");
  }

  // ==== ФОРМАТ ДЛЯ ЧАТА ====
  function formatForChat(t) {
    return `${t.artist} — ${t.title}`;
  }

  // ==== КЛИКИ ====
  listEl.addEventListener("click", (e) => {
    // ✎ переименовать плейлист
    const editBtn = e.target.closest(".playlist-head .edit");
    if (editBtn) {
      e.stopPropagation();
      startRename(editBtn.closest(".playlist"));
      return;
    }

    // ▶ YouTube
    const ytBtn = e.target.closest("button[data-yt]");
    if (ytBtn) {
      e.stopPropagation();
      const t = tracks[Number(ytBtn.dataset.yt)];
      if (t) youtubeSearch(t);
      return;
    }

    // раскрыть/свернуть плейлист
    const head = e.target.closest(".playlist-head");
    if (head && !e.target.closest("input")) {
      const pl = head.parentElement;
      pl.classList.toggle("open");
      openState[pl.dataset.folder] = pl.classList.contains("open");
      return;
    }

    // скопировать трек
    const btn = e.target.closest("button[data-idx]");
    if (btn) {
      const t = tracks[Number(btn.dataset.idx)];
      if (t) copyTrack(t, btn);
    }
  });

  // ==== ПЕРЕИМЕНОВАНИЕ ====
  function startRename(pl) {
    if (!pl || pl.querySelector("input.rename")) return;
    const folder = pl.dataset.folder;
    const nameEl = pl.querySelector(".playlist-head .name");
    const current = displayName(folder);

    const input = document.createElement("input");
    input.className = "rename";
    input.value = current;
    input.spellcheck = false;

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = (save) => {
      const val = input.value.trim();
      if (save) {
        if (!val || val === folder) {
          delete aliases[folder];
        } else {
          aliases[folder] = val;
        }
        saveAliasesLocal();
        buildGroups();
      }
      render();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  function saveAliasesLocal() {
    const clean = {};
    for (const [k, v] of Object.entries(aliases)) {
      if (v && v.trim() && v.trim() !== k) clean[k] = v.trim();
    }
    aliases = clean;
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
  }

  // ==== ЭКСПОРТ / СБРОС ====
  adminExport.addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify(aliases, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aliases.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("aliases.json скачан — закинь его в репо рядом с tracks.json", "ok");
  });

  adminReset.addEventListener("click", () => {
    if (!confirm("Сбросить ВСЕ переименования? (локально)")) return;
    aliases = {};
    localStorage.removeItem(LS_KEY);
    buildGroups();
    render();
    setStatus("Локальные переименования сброшены", "ok");
  });

  // ==== КОПИРОВАНИЕ ====
  async function copyTrack(t, btn) {
    const text = formatForChat(t);

    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = fallbackCopy(text);
      }
    } catch {
      ok = fallbackCopy(text);
    }

    if (ok) {
      showToast(`Скопировано: «${text}». Вставь в чат 👉 Ctrl+V`);
      setStatus(`Скопировано: ${text}`, "ok");
      if (btn) {
        const old = btn.textContent;
        btn.textContent = "✓ Скопировано";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1400);
      }
    } else {
      prompt("Скопируй вручную и вставь в чат:", text);
      setStatus("Скопируй вручную (Ctrl+C)", "err");
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }

  // ==== YOUTUBE ====
  function youtubeSearch(t) {
    const q = `${t.artist} ${t.title}`.trim();
    const url = "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(q) + "&sp=EgIQAQ%253D%253D";
    window.open(url, "_blank", "noopener");
  }

  // ==== ТОСТ ====
  let toastEl, toastTimer;
  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  // ==== РАЗВЕРНУТЬ / СВЕРНУТЬ ====
  expandAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".playlist").forEach(pl => {
      pl.classList.add("open");
      openState[pl.dataset.folder] = true;
    });
  });
  collapseAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".playlist").forEach(pl => {
      pl.classList.remove("open");
      openState[pl.dataset.folder] = false;
    });
  });

  // ==== ПОИСК ====
  let tmr;
  searchEl.addEventListener("input", () => {
    clearTimeout(tmr);
    tmr = setTimeout(render, 120);
  });

  // ==== УТИЛЫ ====
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }
  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls || "";
  }
})();
