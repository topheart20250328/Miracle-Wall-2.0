import { isSupabaseConfigured, createSupabaseClient } from "./supabase-config.js";

// Replace this hash with the SHA-256 digest of your desired admin password.
const ADMIN_PASSWORD_HASH = "edd807dfa6482153fdf7d0cc18d84cf6a4b0cdc667b972951c3a55cee7afe92f";
const ADMIN_SECRET_HEADER = "admin-super-secret";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("adminPassword");
const loginError = document.getElementById("loginError");
const configNotice = document.getElementById("configNotice");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loadingIndicator = document.getElementById("loadingIndicator");
const emptyState = document.getElementById("emptyState");
const entriesBody = document.getElementById("entriesBody");
const rowTemplate = document.getElementById("entryRowTemplate");
const toastNode = document.getElementById("adminToast");
const exportBtn = document.getElementById("exportBtn");
const totalCountNode = document.getElementById("totalCount");

if (exportBtn) {
  exportBtn.disabled = true;
}
if (totalCountNode) {
  totalCountNode.textContent = "0";
}

if (configNotice) {
  configNotice.hidden = isSupabaseConfigured();
}

const state = {
  authorized: false,
  entries: [],
  loading: false,
  toastTimer: null,
};

let supabaseClient = null;

let dateFormatter = null;
try {
  dateFormatter = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
} catch (error) {
  console.warn("DateTime format unavailable", error);
}

loginForm?.addEventListener("submit", handleLogin);
refreshBtn?.addEventListener("click", () => {
  if (!state.authorized || state.loading) {
    return;
  }
  void loadStickers(true);
});
logoutBtn?.addEventListener("click", handleLogout);
entriesBody?.addEventListener("input", handleRowInput);
entriesBody?.addEventListener("click", handleTableClick);
exportBtn?.addEventListener("click", handleExportEntries);

document.addEventListener("DOMContentLoaded", () => {
  passwordInput?.focus();
});

async function handleLogin(event) {
  event.preventDefault();
  if (state.authorized) {
    return;
  }
  const password = passwordInput?.value ?? "";
  if (!password) {
    loginError.textContent = "請輸入密碼";
    return;
  }
  loginError.textContent = "";
  try {
    const verified = await verifyPassword(password);
    if (!verified) {
      loginError.textContent = "密碼錯誤，請再試一次";
      return;
    }
  } catch (error) {
    console.error("Password verification failed", error);
    loginError.textContent = "密碼驗證失敗，請使用支援 SHA-256 的瀏覽器";
    return;
  }

  state.authorized = true;
  passwordInput.value = "";
  loginPanel.hidden = true;
  dashboard.hidden = false;
  if (exportBtn) {
    exportBtn.disabled = false;
  }
  supabaseClient = createSupabaseClient({ headers: { "x-admin-secret": ADMIN_SECRET_HEADER } });
  void loadStickers();
}

function handleLogout() {
  state.authorized = false;
  state.entries = [];
  renderEntries();
  emptyState.hidden = true;
  dashboard.hidden = true;
  loginPanel.hidden = false;
  supabaseClient = null;
  if (exportBtn) {
    exportBtn.disabled = true;
  }
  if (loginError) {
    loginError.textContent = "";
  }
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.focus();
  }
}

async function loadStickers(showToastOnError = false) {
  if (!state.authorized) {
    return;
  }
  if (!supabaseClient) {
    if (showToastOnError) {
      showToast("尚未建立管理連線，請重新登入。", "danger");
    }
    return;
  }
  if (!isSupabaseConfigured()) {
    if (showToastOnError) {
      showToast("尚未設定 Supabase，請先完成設定。", "danger");
    }
    return;
  }
  state.loading = true;
  if (loadingIndicator) {
    loadingIndicator.hidden = false;
  }
  emptyState.hidden = true;
  try {
    const { data, error } = await supabaseClient
      .from("wall_stickers")
      .select("id, note, rotation_angle, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      throw error;
    }
    state.entries = Array.isArray(data)
      ? data.map((entry) => ({
          ...entry,
          rotation_angle: normalizeRotation(entry.rotation_angle),
        }))
      : [];
    renderEntries();
    if (!state.entries.length) {
      emptyState.hidden = false;
    }
  } catch (error) {
    console.error("Failed to load stickers", error);
    showToast("讀取留言失敗，請稍後再試。", "danger");
  } finally {
    state.loading = false;
    if (loadingIndicator) {
      loadingIndicator.hidden = true;
    }
  }
}

function renderEntries() {
  if (!entriesBody || !rowTemplate) {
    return;
  }
  entriesBody.innerHTML = "";
  if (!Array.isArray(state.entries) || !state.entries.length) {
    updateTotalCount();
    return;
  }
  const fragment = document.createDocumentFragment();
  state.entries.forEach((entry, index) => {
    const clone = rowTemplate.content.firstElementChild.cloneNode(true);
    clone.dataset.id = entry.id;
    const numberCell = clone.querySelector(".entry-number");
    const idCell = clone.querySelector(".entry-id");
    const createdCell = clone.querySelector(".created");
    const updatedCell = clone.querySelector(".updated");
    const rotationInput = clone.querySelector(".rotation-input");
    const noteInputNode = clone.querySelector(".note-input");

    if (numberCell) {
      numberCell.textContent = `#${index + 1}`;
    }
    if (idCell) {
      idCell.textContent = entry.id;
    }
    if (createdCell) {
      createdCell.textContent = `建立：${formatDate(entry.created_at)}`;
    }
    if (updatedCell) {
      updatedCell.textContent = entry.updated_at
        ? `更新：${formatDate(entry.updated_at)}`
        : "更新：—";
    }
    if (rotationInput) {
      const rotationValue = normalizeRotation(entry.rotation_angle);
      const rotationText = rotationValue.toString();
      rotationInput.value = rotationText;
      rotationInput.dataset.originalValue = rotationText;
      rotationInput.setAttribute("aria-label", `留言 #${index + 1} 的旋轉角度`);
    }
    if (noteInputNode) {
      noteInputNode.value = entry.note ?? "";
      noteInputNode.dataset.originalValue = noteInputNode.value;
      noteInputNode.setAttribute("aria-label", `留言 #${index + 1} 的內容`);
    }

    fragment.appendChild(clone);
  });
  entriesBody.appendChild(fragment);
  updateTotalCount();
}

function handleRowInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return;
  }
  const row = target.closest(".entry-row");
  if (!row) {
    return;
  }
  const rotationInput = row.querySelector(".rotation-input");
  const noteInputNode = row.querySelector(".note-input");
  const rotationChanged = Boolean(rotationInput && rotationInput.value !== rotationInput.dataset.originalValue);
  const noteChanged = Boolean(noteInputNode && noteInputNode.value !== noteInputNode.dataset.originalValue);
  row.classList.toggle("dirty", rotationChanged || noteChanged);
}

function handleTableClick(event) {
  const origin = event.target;
  if (!(origin instanceof Element)) {
    return;
  }
  const button = origin.closest("button[data-action]");
  if (!button) {
    return;
  }
  const row = button.closest(".entry-row");
  if (!row) {
    return;
  }
  const action = button.dataset.action;
  if (action === "save") {
    void saveEntry(row, button);
  } else if (action === "delete") {
    void deleteEntry(row, button);
  }
}

async function saveEntry(row, button) {
  const id = row.dataset.id;
  if (!id) {
    showToast("找不到這筆留言的 ID。", "danger");
    return;
  }
  if (!supabaseClient) {
    showToast("尚未建立管理連線，請重新登入。", "danger");
    return;
  }
  const rotationInput = row.querySelector(".rotation-input");
  const noteInputNode = row.querySelector(".note-input");
  if (!rotationInput || !noteInputNode) {
    showToast("欄位填寫不完整。", "danger");
    return;
  }
  const note = noteInputNode.value.trim();
  if (!note) {
    showToast("留言內容不可為空。", "danger");
    return;
  }
  if (note.length > 800) {
    showToast("留言內容需在 800 字以內。", "danger");
    return;
  }
  let rotation = Number(rotationInput.value);
  if (!Number.isFinite(rotation)) {
    showToast("請輸入正確的旋轉角度。", "danger");
    return;
  }
  rotation = normalizeRotation(rotation);

  const saveLabel = button.textContent;
  button.disabled = true;
  button.textContent = "儲存中…";
  try {
    const { error, data } = await supabaseClient
      .from("wall_stickers")
      .update({
        note,
        rotation_angle: rotation,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    updateLocalEntry(id, note, rotation, data?.updated_at ?? null);
    const rotationText = rotation.toString();
    rotationInput.value = rotationText;
    rotationInput.dataset.originalValue = rotationText;
    noteInputNode.value = note;
    noteInputNode.dataset.originalValue = note;
    row.classList.remove("dirty");
    showToast("已更新留言。", "success");
    renderEntries();
  } catch (error) {
    console.error("Failed to update entry", error);
    showToast("更新失敗，請稍後再試。", "danger");
  } finally {
    button.disabled = false;
    button.textContent = saveLabel ?? "儲存";
  }
}

async function deleteEntry(row, button) {
  const id = row.dataset.id;
  if (!id) {
    showToast("找不到這筆留言的 ID。", "danger");
    return;
  }
  const confirmDelete = window.confirm("確定要刪除這筆留言嗎？刪除後無法復原。");
  if (!confirmDelete) {
    return;
  }
  if (!supabaseClient) {
    showToast("尚未建立管理連線，請重新登入。", "danger");
    return;
  }
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "刪除中…";
  try {
    const { error } = await supabaseClient
      .from("wall_stickers")
      .delete()
      .eq("id", id);
    if (error) {
      throw error;
    }
    state.entries = state.entries.filter((entry) => entry.id !== id);
    renderEntries();
    if (!state.entries.length) {
      emptyState.hidden = false;
    }
    showToast("已刪除留言。", "success");
  } catch (error) {
    console.error("Failed to delete entry", error);
    showToast("刪除失敗，請稍後再試。", "danger");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel ?? "刪除";
  }
}

function updateLocalEntry(id, note, rotation, updatedAt) {
  const target = state.entries.find((entry) => entry.id === id);
  if (!target) {
    return;
  }
  target.note = note;
  target.rotation_angle = rotation;
  if (updatedAt) {
    target.updated_at = updatedAt;
  } else {
    target.updated_at = new Date().toISOString();
  }
}

function updateTotalCount() {
  if (!totalCountNode) {
    return;
  }
  totalCountNode.textContent = state.entries.length.toString();
}

function handleExportEntries() {
  if (!state.authorized) {
    showToast("請先登入管理後再匯出。", "danger");
    return;
  }
  if (!state.entries.length) {
    showToast("目前沒有留言可匯出。", "info");
    return;
  }
  const lines = state.entries.map((entry, index) => {
    const note = (entry.note ?? "").replace(/\r?\n/g, "\n");
    return `#${index + 1}\nID：${entry.id}\n留言：${note}`;
  });
  const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `miracle-wall-entries-${new Date().toISOString().slice(0, 10)}.txt`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  showToast("已匯出留言。", "success");
}

async function verifyPassword(password) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("SubtleCrypto unavailable");
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return hash === ADMIN_PASSWORD_HASH;
}

function normalizeRotation(value) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }
  let result = Math.round(Number(value)) % 360;
  if (result < 0) {
    result += 360;
  }
  return Number.isFinite(result) ? result : 0;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    if (dateFormatter) {
      return dateFormatter.format(date);
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  } catch (error) {
    console.error("Failed to format date", error);
    return "—";
  }
}

function showToast(message, tone = "info") {
  if (!toastNode) {
    return;
  }
  toastNode.textContent = message;
  toastNode.dataset.tone = tone;
  toastNode.classList.add("visible");
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }
  state.toastTimer = setTimeout(() => {
    toastNode.classList.remove("visible");
  }, 2600);
}
