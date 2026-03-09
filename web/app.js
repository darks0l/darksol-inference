// DARKSOL Studio — Interactive UI Wiring
// Connects the 4-panel desktop shell to real API endpoints.
// Detects Electron (window.darksolDesktop) vs standalone browser (direct HTTP).

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const API_BASE = window.__DARKSOL_API_BASE__ || "";
  const isElectron = typeof window.darksolDesktop !== "undefined";

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  async function api(method, path, body) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err?.error?.message || res.statusText);
    }
    return res.json();
  }

  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function formatSize(bytes) {
    if (!bytes) return "—";
    const gb = bytes / 1e9;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / 1e6).toFixed(0)} MB`;
  }

  function toast(msg, type = "info") {
    let container = $(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.classList.add("toast-fade"); setTimeout(() => el.remove(), 400); }, 3000);
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    models: [],
    selectedModel: null,
    messages: [],
    chatAbort: null,
    mcpServers: [],
    runtimeStatus: null,
    usage: null,
  };

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function initNav() {
    const items = $$(".icon-item:not(.exit-item)");
    const panels = {
      0: null,          // Home — shows models + chat (default)
      1: null,          // Models — same view
      2: "settings",    // Settings
      3: "apikeys",     // API Keys (future)
    };
    items.forEach((item, i) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        items.forEach((it) => it.classList.remove("active"));
        item.classList.add("active");
        // For now, settings panel toggle
        const settingsPanel = $(".settings-panel");
        if (settingsPanel) {
          if (panels[i] === "settings") {
            settingsPanel.classList.toggle("panel-hidden");
          }
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Models Panel
  // ---------------------------------------------------------------------------
  async function loadModels() {
    try {
      const data = await api("GET", "/v1/models");
      state.models = data.data || [];
      renderModels();
    } catch (err) {
      toast(`Failed to load models: ${err.message}`, "error");
    }
  }

  function renderModels() {
    const listEl = $(".model-list");
    if (!listEl) return;
    const treeBlock = listEl.closest(".tree-block");

    // Group by provider
    const darksol = state.models.filter((m) => m.provider === "darksol" || m.owned_by === "darksol");
    const ollama = state.models.filter((m) => m.provider === "ollama" || m.owned_by === "ollama");

    let html = "";

    if (darksol.length > 0) {
      html += `<li class="model-section-label">Darksol Local</li>`;
      darksol.forEach((m) => {
        const active = state.selectedModel === m.id ? "active" : "";
        const dot = m.loaded ? "online" : "offline";
        html += `
          <li class="model-item ${active}" data-model-id="${esc(m.id)}">
            <div class="model-meta">
              <span class="dot ${dot}"></span>
              <span class="model-name">${esc(m.id)}</span>
            </div>
            <span class="model-size">${m.loaded ? "loaded" : "idle"}</span>
          </li>`;
      });
    }

    if (ollama.length > 0) {
      html += `<li class="model-section-label">Ollama</li>`;
      ollama.forEach((m) => {
        const active = state.selectedModel === m.id ? "active" : "";
        html += `
          <li class="model-item ${active}" data-model-id="${esc(m.id)}">
            <div class="model-meta">
              <span class="dot online"></span>
              <span class="model-name">${esc(m.id)}</span>
            </div>
            <span class="model-size">${formatSize(m.size)}</span>
          </li>`;
      });
    }

    if (state.models.length === 0) {
      html = `<li class="model-item"><div class="model-meta"><span class="model-name" style="color:var(--text-muted)">No models found</span></div></li>`;
    }

    listEl.innerHTML = html;

    // Auto-select first if none selected
    if (!state.selectedModel && state.models.length > 0) {
      selectModel(state.models[0].id);
    }

    // Click handlers
    $$(".model-item[data-model-id]", listEl).forEach((li) => {
      li.addEventListener("click", () => selectModel(li.dataset.modelId));
    });
  }

  function selectModel(modelId) {
    state.selectedModel = modelId;
    // Update topbar
    const label = $(".chat-model-label");
    const sub = $(".chat-model-sub");
    const avatar = $(".chat-model .avatar");
    if (label) label.textContent = modelId;
    if (sub) sub.textContent = "Active model";
    if (avatar) avatar.textContent = modelId.charAt(0).toUpperCase();

    // Re-render model list highlights
    $$(".model-item").forEach((li) => {
      li.classList.toggle("active", li.dataset.modelId === modelId);
    });
  }

  // Model search filter
  function initModelSearch() {
    const input = $(".search-box input");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.toLowerCase();
      $$(".model-item[data-model-id]").forEach((li) => {
        const name = li.dataset.modelId.toLowerCase();
        li.style.display = name.includes(q) ? "" : "none";
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Chat Panel
  // ---------------------------------------------------------------------------
  function initChat() {
    const input = $(".compose-input input");
    const sendBtn = $(".send-btn");
    const newChatBtn = $(".chat-actions .ghost-btn:not(.danger)");
    const deleteChatBtn = $(".chat-actions .ghost-btn.danger");

    if (sendBtn) sendBtn.addEventListener("click", sendMessage);
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }
    if (newChatBtn) newChatBtn.addEventListener("click", clearChat);
    if (deleteChatBtn) deleteChatBtn.addEventListener("click", clearChat);

    // Clear placeholder messages
    clearChat();
  }

  function clearChat() {
    state.messages = [];
    if (state.chatAbort) { state.chatAbort.abort(); state.chatAbort = null; }
    const msgContainer = $(".messages");
    if (msgContainer) msgContainer.innerHTML = renderEmptyState();
  }

  function renderEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-icon">DS</div>
        <p>Select a model and start chatting</p>
      </div>`;
  }

  function appendMessage(role, content) {
    const msgContainer = $(".messages");
    if (!msgContainer) return;
    // Remove empty state
    const empty = $(".empty-state", msgContainer);
    if (empty) empty.remove();

    const isUser = role === "user";
    const row = document.createElement("article");
    row.className = `message-row ${isUser ? "user-row" : "bot-row"}`;

    const avatarSvg = isUser
      ? `<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4z"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M9 2h6v2h-2v2h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h4V4H9V2zm1 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-5 6h6v1H9v-1z"/></svg>`;

    row.innerHTML = `
      <div class="msg-avatar ${isUser ? "user-avatar" : "bot-avatar"}">${avatarSvg}</div>
      <div class="message-bubble ${isUser ? "user-bubble" : "bot-bubble"}">${esc(content)}</div>`;

    msgContainer.appendChild(row);
    msgContainer.scrollTop = msgContainer.scrollHeight;
    return row;
  }

  function getOrCreateBotBubble() {
    const msgContainer = $(".messages");
    if (!msgContainer) return null;
    // Remove empty state
    const empty = $(".empty-state", msgContainer);
    if (empty) empty.remove();

    const row = document.createElement("article");
    row.className = "message-row bot-row";
    row.innerHTML = `
      <div class="msg-avatar bot-avatar">
        <svg viewBox="0 0 24 24"><path d="M9 2h6v2h-2v2h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h4V4H9V2zm1 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-5 6h6v1H9v-1z"/></svg>
      </div>
      <div class="message-bubble bot-bubble"><span class="typing-indicator">●●●</span></div>`;
    msgContainer.appendChild(row);
    msgContainer.scrollTop = msgContainer.scrollHeight;
    return $(".bot-bubble", row);
  }

  async function sendMessage() {
    const input = $(".compose-input input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (!state.selectedModel) {
      toast("Select a model first", "error");
      return;
    }

    input.value = "";
    state.messages.push({ role: "user", content: text });
    appendMessage("user", text);

    const bubble = getOrCreateBotBubble();
    if (!bubble) return;

    const controller = new AbortController();
    state.chatAbort = controller;
    let fullText = "";

    try {
      const res = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: state.selectedModel,
          messages: state.messages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const chunk = JSON.parse(payload);
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              bubble.textContent = fullText;
              const msgContainer = $(".messages");
              if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      state.messages.push({ role: "assistant", content: fullText });
    } catch (err) {
      if (err.name === "AbortError") {
        bubble.textContent = fullText || "(cancelled)";
      } else {
        bubble.textContent = `Error: ${err.message}`;
        bubble.classList.add("error-bubble");
        toast(err.message, "error");
      }
    } finally {
      state.chatAbort = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Settings Panel — MCP
  // ---------------------------------------------------------------------------
  async function loadMcpServers() {
    try {
      const data = await api("GET", "/v1/mcp/servers");
      state.mcpServers = data.data || [];
      renderMcpSources();
    } catch {
      // MCP may not be configured — silent fail
    }
  }

  function renderMcpSources() {
    const list = $(".source-list");
    if (!list) return;
    if (state.mcpServers.length === 0) {
      list.innerHTML = `<li style="color:var(--text-muted);padding:8px 0">No MCP servers configured</li>`;
      return;
    }

    list.innerHTML = state.mcpServers.map((srv) => `
      <li>
        <div class="source-main">
          <span class="dot ${srv.enabled ? "online" : "offline"}" style="width:8px;height:8px;margin-right:8px"></span>
          <span>${esc(srv.name || srv.id || "unknown")}</span>
        </div>
        <label class="switch switch-sm">
          <input type="checkbox" ${srv.enabled ? "checked" : ""} data-mcp-name="${esc(srv.name || srv.id)}"/>
          <span></span>
        </label>
      </li>
    `).join("");

    // Toggle handlers
    $$(".source-list input[data-mcp-name]").forEach((cb) => {
      cb.addEventListener("change", async () => {
        const name = cb.dataset.mcpName;
        const enable = cb.checked;
        try {
          await api("POST", `/v1/mcp/servers/${encodeURIComponent(name)}/${enable ? "enable" : "disable"}`);
          toast(`${name} ${enable ? "enabled" : "disabled"}`);
        } catch (err) {
          toast(`Failed: ${err.message}`, "error");
          cb.checked = !enable; // revert
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Settings Panel — Runtime
  // ---------------------------------------------------------------------------
  async function loadRuntimeStatus() {
    try {
      const endpoint = isElectron ? null : "/v1/runtime/status";
      const data = isElectron
        ? await window.darksolDesktop.getRuntimeStatus()
        : await api("GET", endpoint);
      state.runtimeStatus = data;
      renderRuntimeStatus();
    } catch {
      // Server might not be running
    }
  }

  function renderRuntimeStatus() {
    // Update the gateway card if we have data
    const gatewayCard = $$(".settings-card")[0];
    if (!gatewayCard || !state.runtimeStatus) return;

    const engine = state.runtimeStatus.engine || {};
    const kw = state.runtimeStatus.keepWarm || {};

    // Update quota block to show runtime info
    const quotaCopy = $(".quota-copy", gatewayCard);
    const progress = $(".progress span", gatewayCard);
    if (quotaCopy) {
      const statusText = engine.running ? "Running" : "Stopped";
      quotaCopy.innerHTML = `<span>Engine</span><span style="color:${engine.running ? "var(--status-on)" : "var(--text-muted)"}">${statusText}</span>`;
    }
    if (progress) {
      progress.style.width = engine.running ? "100%" : "0%";
      progress.style.background = engine.running ? "var(--status-on)" : "var(--text-muted)";
    }
  }

  // ---------------------------------------------------------------------------
  // Settings Panel — Usage
  // ---------------------------------------------------------------------------
  async function loadUsage() {
    try {
      const data = await api("GET", "/v1/app/usage");
      state.usage = data;
      renderUsage();
    } catch { /* silent */ }
  }

  function renderUsage() {
    if (!state.usage) return;
    // Could update a usage section — for now just cache it
  }

  // ---------------------------------------------------------------------------
  // Add Model (Pull) Dialog
  // ---------------------------------------------------------------------------
  function initAddModelButton() {
    const addBtn = $(".panel-title-row .icon-button");
    if (!addBtn) return;
    addBtn.addEventListener("click", () => {
      const name = prompt("Enter model name to pull (e.g. lfm2:latest):");
      if (!name) return;
      pullModel(name.trim());
    });
  }

  async function pullModel(name) {
    toast(`Pulling ${name}...`);
    try {
      await api("POST", "/v1/models/pull", { name });
      toast(`${name} pulled successfully`);
      await loadModels();
    } catch (err) {
      toast(`Pull failed: ${err.message}`, "error");
    }
  }

  // ---------------------------------------------------------------------------
  // Tree toggle
  // ---------------------------------------------------------------------------
  function initTreeToggles() {
    $$(".tree-head, .tree-subhead").forEach((btn) => {
      btn.addEventListener("click", () => {
        const block = btn.closest(".tree-block");
        if (block) block.classList.toggle("collapsed");
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    initNav();
    initChat();
    initModelSearch();
    initAddModelButton();
    initTreeToggles();

    // Load data in parallel
    await Promise.allSettled([
      loadModels(),
      loadMcpServers(),
      loadRuntimeStatus(),
      loadUsage(),
    ]);

    // Periodic refresh (every 30s)
    setInterval(() => {
      loadModels();
      loadRuntimeStatus();
    }, 30000);
  }

  // Start when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
