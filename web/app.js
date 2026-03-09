/* global window, document, prompt */
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
    bankrConfig: {
      enabled: false,
      baseUrl: "https://llm.bankr.bot",
      defaultRoute: "local"
    },
    portConfig: { host: "127.0.0.1", port: 11435 },
    walletConfig: {
      enabled: false,
      baseUrl: "http://127.0.0.1:18790",
      tokenConfigured: false,
      autoConfirm: false
    },
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
      const localModels = data.data || [];

      let bankrModels = [];
      try {
        const remote = await api("GET", "/v1/bankr/models");
        bankrModels = remote.data || [];
      } catch {
        bankrModels = [];
      }

      state.models = [...localModels, ...bankrModels];
      renderModels();
    } catch (err) {
      toast(`Failed to load models: ${err.message}`, "error");
    }
  }

  function renderModels() {
    const listEl = $(".model-list");
    if (!listEl) return;

    // Group by provider
    const darksol = state.models.filter((m) => m.provider === "darksol" || m.owned_by === "darksol");
    const ollama = state.models.filter((m) => m.provider === "ollama" || m.owned_by === "ollama");
    const bankr = state.models.filter((m) => m.provider === "bankr" || m.owned_by === "bankr");

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

    if (bankr.length > 0) {
      html += `<li class="model-section-label">Bankr Cloud</li>`;
      bankr.forEach((m) => {
        const active = state.selectedModel === m.id ? "active" : "";
        html += `
          <li class="model-item ${active}" data-model-id="${esc(m.id)}">
            <div class="model-meta">
              <span class="dot online"></span>
              <span class="model-name">${esc(m.id)}</span>
            </div>
            <span class="model-size">cloud</span>
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
          route: state.selectedModel.startsWith("bankr/") ? "bankr" : (state.bankrConfig.defaultRoute || "local"),
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
    const addBtn = $(".panel-title-row button[aria-label='Add model']");
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

  function initImportOllamaButton() {
    const btn = $("#import-ollama-btn");
    if (!btn) return;
    btn.addEventListener("click", openImportModal);
  }

  async function openImportModal() {
    const candidates = state.models.filter((m) => m.provider === "ollama" || m.owned_by === "ollama");
    if (candidates.length === 0) {
      toast("No importable Ollama models found.");
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Import from Ollama</h3>
        <p class="modal-copy">Pick models to bring into Darksol. Link mode avoids duplicate disk usage.</p>
        <div class="modal-list">
          ${candidates.map((m) => `
            <label class="modal-item">
              <input type="checkbox" value="${esc(m.id)}" />
              <span class="modal-item-name">${esc(m.id)}</span>
              <span class="modal-item-size">${formatSize(m.size)}</span>
            </label>
          `).join("")}
        </div>
        <label class="field" style="margin-top:10px">
          <span>Import mode</span>
          <select id="import-mode">
            <option value="link">Link (recommended)</option>
            <option value="copy">Copy</option>
          </select>
        </label>
        <div class="modal-actions">
          <button type="button" class="section-btn" id="import-cancel">Cancel</button>
          <button type="button" class="section-btn" id="import-run">Import selected</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    $("#import-cancel", overlay)?.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    $("#import-run", overlay)?.addEventListener("click", async () => {
      const mode = $("#import-mode", overlay)?.value || "link";
      const selected = $$("input[type='checkbox']:checked", overlay).map((cb) => cb.value);
      if (selected.length === 0) {
        toast("Select at least one model.", "error");
        return;
      }

      try {
        for (const id of selected) {
          await api("POST", "/v1/models/import-ollama", { modelId: id, mode });
        }
        toast(`Imported ${selected.length} model(s).`);
        close();
        await loadModels();
      } catch (err) {
        toast(`Import failed: ${err.message}`, "error");
      }
    });
  }

  async function loadBankrConfig() {
    try {
      const config = await api("GET", "/v1/bankr/config");
      state.bankrConfig = {
        enabled: !!config.enabled,
        baseUrl: config.baseUrl || "https://llm.bankr.bot",
        defaultRoute: config.defaultRoute || "local"
      };

      const enabledEl = $("#bankr-enabled");
      const baseUrlEl = $("#bankr-base-url");
      const providerEl = $("#bankr-provider-mode");
      if (enabledEl) enabledEl.checked = !!config.enabled;
      if (baseUrlEl) baseUrlEl.value = config.baseUrl || "https://llm.bankr.bot";
      if (providerEl) providerEl.value = config.defaultRoute || "local";

      const usageCopy = $("#bankr-usage-copy");
      if (usageCopy) {
        usageCopy.innerHTML = `<span>Gateway</span><span>${config.apiKeyConfigured ? "configured" : "not configured"}</span>`;
      }
    } catch {
      // silent
    }
  }

  async function refreshBankrUsage() {
    try {
      const usage = await api("GET", "/v1/bankr/usage?days=30");
      const totalCost = Number(usage?.totals?.totalCost || 0);
      const totalReq = Number(usage?.totals?.totalRequests || 0);
      const copy = $("#bankr-usage-copy");
      const bar = $("#bankr-usage-bar");
      if (copy) {
        copy.innerHTML = `<span>30d usage</span><span>$${totalCost.toFixed(2)} • ${totalReq} req</span>`;
      }
      if (bar) {
        const pct = Math.max(3, Math.min(100, totalCost > 0 ? Math.round((Math.log10(totalCost + 1) / 2) * 100) : 0));
        bar.style.width = `${pct}%`;
      }
    } catch (err) {
      toast(`Bankr usage unavailable: ${err.message}`);
    }
  }

  function initBankrSettings() {
    const saveBtn = $("#bankr-save-config");
    const refreshBtn = $("#bankr-refresh-usage");
    const keyToggle = $("#bankr-key-visibility");

    keyToggle?.addEventListener("click", () => {
      const keyInput = $("#bankr-api-key");
      if (!keyInput) return;
      keyInput.type = keyInput.type === "password" ? "text" : "password";
    });

    refreshBtn?.addEventListener("click", () => {
      refreshBankrUsage();
    });

    saveBtn?.addEventListener("click", async () => {
      const enabled = !!$("#bankr-enabled")?.checked;
      const baseUrl = $("#bankr-base-url")?.value?.trim() || "https://llm.bankr.bot";
      const apiKey = $("#bankr-api-key")?.value?.trim() || undefined;
      const defaultRoute = $("#bankr-provider-mode")?.value === "bankr" ? "bankr" : "local";

      try {
        const saved = await api("POST", "/v1/bankr/config", {
          enabled,
          baseUrl,
          ...(apiKey !== undefined ? { apiKey } : {}),
          defaultRoute
        });

        state.bankrConfig = {
          enabled: !!saved.enabled,
          baseUrl: saved.baseUrl,
          defaultRoute: saved.defaultRoute || "local"
        };

        toast("Bankr settings saved.");
        await refreshBankrUsage();
        await loadModels();
      } catch (err) {
        toast(`Failed to save Bankr settings: ${err.message}`, "error");
      }
    });
  }

  function initPortService() {
    const checkBtn = $("#check-port-btn");
    const findBtn = $("#find-port-btn");
    const applyBtn = $("#apply-port-btn");

    const getPayload = () => ({
      host: $("#port-host")?.value || "127.0.0.1",
      port: Number($("#port-input")?.value || 11435),
    });

    const setStatus = (text, ok = true) => {
      const status = $("#port-status");
      if (!status) return;
      status.textContent = text;
      status.style.color = ok ? "var(--status-on)" : "#fca5a5";
    };

    checkBtn?.addEventListener("click", async () => {
      try {
        const { host, port } = getPayload();
        const info = await api("GET", `/v1/runtime/ports?host=${encodeURIComponent(host)}&port=${port}`);
        setStatus(info.available ? `Port ${port} is free` : `Port ${port} is in use`, info.available);
      } catch (err) {
        setStatus(`Check failed: ${err.message}`, false);
      }
    });

    findBtn?.addEventListener("click", async () => {
      try {
        const { host, port } = getPayload();
        const info = await api("POST", "/v1/runtime/ports/find", { host, startPort: port });
        const input = $("#port-input");
        if (input) input.value = String(info.port);
        setStatus(`Found free port: ${info.port}`, true);
      } catch (err) {
        setStatus(`Find failed: ${err.message}`, false);
      }
    });

    applyBtn?.addEventListener("click", async () => {
      try {
        const { host, port } = getPayload();
        await api("POST", "/v1/runtime/config", { host, port });
        await api("POST", "/v1/runtime/restart", {});
        setStatus(`Applied ${host}:${port} and restarted runtime`, true);
        toast("Runtime port updated.");
      } catch (err) {
        setStatus(`Apply failed: ${err.message}`, false);
        toast(err.message, "error");
      }
    });

    // Prime from current config
    api("GET", "/v1/runtime/ports")
      .then((info) => {
        const hostSel = $("#port-host");
        const portInput = $("#port-input");
        if (hostSel) hostSel.value = info.host || "127.0.0.1";
        if (portInput) portInput.value = String(info.port || 11435);
      })
      .catch(() => {
        // silent
      });
  }

  async function loadWalletConfig() {
    try {
      const config = await api("GET", "/v1/wallet/config");
      state.walletConfig = {
        enabled: !!config.enabled,
        baseUrl: config.baseUrl || "http://127.0.0.1:18790",
        tokenConfigured: !!config.tokenConfigured,
        autoConfirm: !!config.autoConfirm
      };

      const enabledEl = $("#wallet-enabled");
      const baseUrlEl = $("#wallet-base-url");
      const autoConfirmEl = $("#wallet-auto-confirm");
      if (enabledEl) enabledEl.checked = !!state.walletConfig.enabled;
      if (baseUrlEl) baseUrlEl.value = state.walletConfig.baseUrl;
      if (autoConfirmEl) autoConfirmEl.checked = !!state.walletConfig.autoConfirm;
    } catch {
      // silent
    }
  }

  async function refreshWalletHealth() {
    const statusEl = $("#wallet-status");
    try {
      const health = await api("GET", "/v1/wallet/health");
      if (!statusEl) return;

      if (!health.enabled) {
        statusEl.textContent = "Wallet status: disabled";
        statusEl.style.color = "var(--text-muted)";
        return;
      }

      const online = !!health.online;
      const address = health.address ? String(health.address).slice(0, 8) + "…" + String(health.address).slice(-6) : "n/a";
      statusEl.textContent = online
        ? `Wallet status: online • ${address}`
        : `Wallet status: offline • ${health.error || "signer unavailable"}`;
      statusEl.style.color = online ? "var(--status-on)" : "#fca5a5";
    } catch (err) {
      if (!statusEl) return;
      statusEl.textContent = `Wallet status: error • ${err.message}`;
      statusEl.style.color = "#fca5a5";
    }
  }

  function initWalletSettings() {
    const saveBtn = $("#wallet-save-btn");
    const refreshBtn = $("#wallet-refresh-btn");
    const tokenToggle = $("#wallet-token-visibility");

    tokenToggle?.addEventListener("click", () => {
      const tokenInput = $("#wallet-token");
      if (!tokenInput) return;
      tokenInput.type = tokenInput.type === "password" ? "text" : "password";
    });

    refreshBtn?.addEventListener("click", () => {
      refreshWalletHealth();
    });

    saveBtn?.addEventListener("click", async () => {
      const enabled = !!$("#wallet-enabled")?.checked;
      const baseUrl = $("#wallet-base-url")?.value?.trim() || "http://127.0.0.1:18790";
      const token = $("#wallet-token")?.value?.trim() || undefined;
      const autoConfirm = !!$("#wallet-auto-confirm")?.checked;

      try {
        const saved = await api("POST", "/v1/wallet/config", {
          enabled,
          baseUrl,
          autoConfirm,
          ...(token !== undefined ? { token } : {})
        });

        state.walletConfig = {
          enabled: !!saved.enabled,
          baseUrl: saved.baseUrl || baseUrl,
          tokenConfigured: !!saved.tokenConfigured,
          autoConfirm: !!saved.autoConfirm
        };

        toast("Wallet settings saved.");
        await refreshWalletHealth();
      } catch (err) {
        toast(`Failed to save wallet settings: ${err.message}`, "error");
      }
    });
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
    initImportOllamaButton();
    initBankrSettings();
    initPortService();
    initWalletSettings();
    initTreeToggles();

    // Load data in parallel
    await Promise.allSettled([
      loadBankrConfig(),
      loadWalletConfig(),
      loadModels(),
      loadMcpServers(),
      loadRuntimeStatus(),
      loadUsage(),
      refreshBankrUsage(),
      refreshWalletHealth(),
    ]);

    // Periodic refresh (every 30s)
    setInterval(() => {
      loadModels();
      loadRuntimeStatus();
      refreshWalletHealth();
    }, 30000);
  }

  // Start when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
