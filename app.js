(() => {
  "use strict";

  const CATEGORIES = {
    "ЖАНР": [
      "Witch House", "HEXD Trance", "hexd",
      "Trance/Techno", "Trance Techno Club", "Euphoric Paradise", "Dark Techno",
      "Dance/Mash core", "Breakcore / Mashcore / Dancecore", 
      "Постпанк", "Ambient", "Ambient (по исключению)"
    ],
    "ИСПОЛНИТЕЛЬ": [
      "Гражданская Оборона",
      "Чёрный Лукич", 
      "Янка",
      "Свидетельство О Смерти",
      "Коммунизм",
      "КИНО", 
      "Где Фантом",
      "Буерак", 
      "Перемотка",
      "Алексей Вишня", 
      "Андрей Губин", 
      "niteboi", 
      "Crystal Castles", 
      "Snow Strippers",
      "Russian Village Boys", 
      "Fratii din Carbuna", 
      "Серега Пират", 
      "CMH",
      "plenka", 
      "Inna", 
      "Сплин", 
      "Король и Шут", 
      "KnyaZz",  
      "Bring Me the Horizon", 
      "ABBA", 
      "Queen"  
    ],
    "ОСТАЛЬНОЕ": [
      "moy", 
      "Arthas"
    ]
  };

  const NEW_PLAYLISTS = [
    "Sidewalks And Skeletons", 
    "Янка", 
    "Snow Strippers"
  ];

  const listEl   = document.getElementById("list");
  const searchEl = document.getElementById("search");
  const countEl  = document.getElementById("count");
  const statusEl = document.getElementById("status");
  const expandAllBtn   = document.getElementById("expand-all");
  const collapseAllBtn = document.getElementById("collapse-all");

  const adminBar    = document.getElementById("admin-bar");
  const adminExport = document.getElementById("admin-export");
  const adminReset  = document.getElementById("admin-reset");

  const LS_KEY = "playlist_aliases_v1";

  let tracks = [];
  let grouped = {};
  let downloads = {};
  const openState = {};
  let aliases = {};

  const params = new URLSearchParams(location.search);
  let admin = params.get("admin") === "1" || localStorage.getItem("admin") === "1";
  applyAdminUI();

  function applyAdminUI() {
    document.body.classList.toggle("admin", admin);
    if (adminBar) adminBar.hidden = !admin;
  }

  // Защита от кеша (добавляем ?t=Date.now())
  Promise.all([
    fetch("aliases.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch("downloads.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch("tracks.json?t=" + Date.now(), { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
      return r.json();
    }),
  ])
    .then(([fileAliases, dlData, data]) => {
      if (!Array.isArray(data)) throw new Error("tracks.json — не массив");
      tracks = data;
      downloads = dlData || {};

      let localAliases = {};
      try { localAliases = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch {}

      aliases = { ...(fileAliases || {}), ...localAliases };

      buildGroups();
      render();
      setStatus(`Загружено ${tracks.length} треков.`, "ok");
    })
    .catch(err => {
      console.error("[catalog] ошибка:", err);
      listEl.innerHTML = `<div class="error">
        Не удалось загрузить <b>tracks.json</b>: ${escapeHtml(err.message)}.<br><br>
        Проверь, что файл лежит рядом с index.html и ты открываешь сайт через http(s).
      </div>`;
      setStatus("Ошибка загрузки каталога", "err");
    });

  function buildGroups() {
    grouped = {};
    for (const t of tracks) {
      const key = (t.folder && t.folder.trim()) || "Без папки";
      (grouped[key] ||= []).push(t);
    }

    const categorized = {
      "🔥 НОВОЕ": [],
      "🎵 ЖАНР": [],
      "🎤 ИСПОЛНИТЕЛЬ": [],
      "📦 ОСТАЛЬНОЕ": []
    };
    
    const allFolders = Object.keys(grouped);
    const usedFolders = new Set();

    const findFolder = (name) => {
      return allFolders.find(f => 
        f.toLowerCase() === name.toLowerCase() || 
        displayName(f).toLowerCase() === name.toLowerCase()
      );
    };

    for (const newName of NEW_PLAYLISTS) {
      const actualFolder = findFolder(newName);
      if (actualFolder && !usedFolders.has(actualFolder)) {
        categorized["🔥 НОВОЕ"].push(actualFolder);
        usedFolders.add(actualFolder);
      }
    }

    for (const [catName, folderList] of Object.entries(CATEGORIES)) {
      const targetCat = catName === "ЖАНР" ? "🎵 ЖАНР" : 
                        catName === "ИСПОЛНИТЕЛЬ" ? "🎤 ИСПОЛНИТЕЛЬ" : "📦 ОСТАЛЬНОЕ";
      
      for (const name of folderList) {
        const actualFolder = findFolder(name);
        if (actualFolder && !usedFolders.has(actualFolder)) {
          categorized[targetCat].push(actualFolder);
          usedFolders.add(actualFolder);
        }
      }
    }

    const leftovers = allFolders.filter(f => !usedFolders.has(f));
    if (leftovers.length) {
      leftovers.sort((a, b) => displayName(a).localeCompare(displayName(b), "ru"));
      categorized["🎤 ИСПОЛНИТЕЛЬ"] = categorized["🎤 ИСПОЛНИТЕЛЬ"].concat(leftovers);
    }

    for (const key in categorized) {
      if (categorized[key].length === 0) delete categorized[key];
    }

    grouped = { categorized, rawData: grouped };
  }

  function displayName(folder) {
    const a = aliases[folder];
    return (a && a.trim()) || folder;
  }

  function render() {
    const q = searchEl.value.trim().toLowerCase();

    let totalVisible = 0;
    let html = "";

    if (q) {
      for (const [folder, items] of Object.entries(grouped.rawData)) {
        const filtered = items.filter(t => {
          const hay = `${t.artist} ${t.title} ${t.album} ${t.folder} ${displayName(t.folder)}`.toLowerCase();
          return hay.includes(q);
        });
        if (filtered.length) {
          totalVisible += filtered.length;
          html += renderPlaylist(folder, filtered, true, false, q);
        }
      }
    } else {
      for (const [catName, folders] of Object.entries(grouped.categorized)) {
        html += `<div class="category-title">${catName}</div>`;
        for (const folder of folders) {
          const items = grouped.rawData[folder];
          totalVisible += items.length;
          html += renderPlaylist(folder, items, !!openState[folder], catName === "🔥 НОВОЕ", q);
        }
      }
    }

    countEl.textContent = q
      ? `Найдено: ${totalVisible} из ${tracks.length}`
      : `${tracks.length} треков • ${Object.keys(grouped.rawData).length} плейлистов`;

    if (!html) {
      listEl.innerHTML = `<div class="empty">Ничего не найдено 🤷</div>`;
    } else {
      listEl.innerHTML = html;
    }
  }

  function renderPlaylist(folder, items, isOpen, isNewSection, searchQuery) {
    const name = displayName(folder);
    const renamed = aliases[folder] && aliases[folder].trim() && aliases[folder].trim() !== folder;
    const showNewBadge = isNewSection;

    // Берем ссылку из файла. Если там пусто или стоит заглушка — ведем на главную Диска.
    let dlUrl = downloads[folder] || downloads[name];
    if (!dlUrl || dlUrl === "ССЫЛКА_НА_ПАПКУ") {
      dlUrl = "https://disk.yandex.ru"; 
    }
    
    const dlBtn = `<a href="${dlUrl}" target="_blank" class="download-btn" title="Скачать плейлист">⬇ Скачать</a>`;

    let tracksHtml = "";
    
    if (searchQuery) {
      tracksHtml = items.map(t => renderTrack(t)).join("");
    } else {
      const albums = {};
      for (const t of items) {
        const aName = t.album && t.album.trim() ? t.album.trim() : "Синглы / Без альбома";
        if (!albums[aName]) albums[aName] = [];
        albums[aName].push(t);
      }

      const sortedAlbumNames = Object.keys(albums).sort((a, b) => {
        if (a === "Синглы / Без альбома") return 1;
        if (b === "Синглы / Без альбома") return -1;
        
        const yearA = albums[a][0].year || 9999;
        const yearB = albums[b][0].year || 9999;
        
        if (yearA !== yearB) {
          return yearA - yearB;
        }
        return a.localeCompare(b, "ru");
      });

      for (const albumName of sortedAlbumNames) {
        const albumYear = albums[albumName][0].year ? ` <span class="album-year">(${albums[albumName][0].year})</span>` : "";
        tracksHtml += `<div class="album-header">${escapeHtml(albumName)}${albumYear}</div>`;
        tracksHtml += albums[albumName].map(t => renderTrack(t)).join("");
      }
    }

    return `
      <section class="playlist ${isOpen ? "open" : ""} ${showNewBadge ? "is-new" : ""}" data-folder="${escapeAttr(folder)}">
        <div class="playlist-head">
          <span class="arrow">▶</span>
          <span class="name" title="${escapeAttr(folder)}">
            ${escapeHtml(name)}
            ${renamed ? `<small style="color:#6f6f7a;font-weight:400">(${escapeHtml(folder)})</small>` : ''}
          </span>
          ${showNewBadge ? '<span class="badge-new">NEW</span>' : ''}
          
          <div class="playlist-actions">
            ${dlBtn}
            <button class="edit" type="button" title="Переименовать">✎</button>
            <span class="count">${items.length}</span>
          </div>
        </div>
        <div class="playlist-body">
          ${tracksHtml}
        </div>
      </section>`;
  }

  function renderTrack(t) {
    const idx = tracks.indexOf(t);
    const trackNum = t.track && t.track !== 999 ? `<span class="track-num">${t.track}.</span> ` : "";
    
    return `
      <div class="track">
        <div class="meta">
          ${trackNum}<b>${escapeHtml(t.artist)}</b> — <span class="t">${escapeHtml(t.title)}</span>
          ${t.album ? `<small>${escapeHtml(t.album)}</small>` : ''}
        </div>
        <div class="actions">
          <button class="yt" data-yt="${idx}" title="Искать на YouTube">▶ YouTube</button>
          <button data-idx="${idx}" title="Скопировать и вставить в чат">Скопировать</button>
        </div>
      </div>`;
  }

  listEl.addEventListener("click", (e) => {
    // Если кликнули на кнопку скачивания, не открываем/закрываем плейлист
    if (e.target.closest(".download-btn")) return;

    const editBtn = e.target.closest(".playlist-head .edit");
    if (editBtn) {
      e.stopPropagation();
      startRename(editBtn.closest(".playlist"));
      return;
    }

    const ytBtn = e.target.closest("button[data-yt]");
    if (ytBtn) {
      e.stopPropagation();
      const t = tracks[Number(ytBtn.dataset.yt)];
      if (t) youtubeSearch(t);
      return;
    }

    const head = e.target.closest(".playlist-head");
    if (head && !e.target.closest("input")) {
      const pl = head.parentElement;
      pl.classList.toggle("open");
      openState[pl.dataset.folder] = pl.classList.contains("open");
      return;
    }

    const btn = e.target.closest("button[data-idx]");
    if (btn) {
      const t = tracks[Number(btn.dataset.idx)];
      if (t) copyTrack(t, btn);
    }
  });

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
        if (!val || val === folder) delete aliases[folder];
        else aliases[folder] = val;
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

  if (adminExport) {
    adminExport.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(aliases, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "aliases.json";
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus("aliases.json скачан", "ok");
    });
  }

  if (adminReset) {
    adminReset.addEventListener("click", () => {
      if (!confirm("Сбросить ВСЕ переименования?")) return;
      aliases = {};
      localStorage.removeItem(LS_KEY);
      buildGroups();
      render();
      setStatus("Локальные переименования сброшены", "ok");
    });
  }
  async function copyTrack(t, btn) {
    // Формируем инфу для скобок
    let extraInfo = "";
    if (t.album && t.album.trim()) {
      extraInfo = t.album.trim();
      if (t.year) {
        extraInfo += `, ${t.year}`;
      }
    } else if (t.folder && t.folder.trim()) {
      extraInfo = t.folder.trim();
    }

    const text = `${t.artist} — ${t.title} (${extraInfo})`;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = fallbackCopy(text);
      }
    } catch { ok = fallbackCopy(text); }

    if (ok) {
      showToast(`Скопировано: «${text}»`);
      setStatus(`Скопировано: ${text}`, "ok");
      if (btn) {
        const old = btn.textContent;
        btn.textContent = "✓";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1400);
      }
    } else {
      prompt("Скопируй вручную:", text);
    }
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }

  function youtubeSearch(t) {
    const q = `${t.artist} ${t.title}`.trim();
    window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(q), "_blank", "noopener");
  }

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

  let tmr;
  searchEl.addEventListener("input", () => {
    clearTimeout(tmr);
    tmr = setTimeout(render, 120);
  });

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
