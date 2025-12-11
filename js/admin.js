import { isSupabaseConfigured, createSupabaseClient } from "./supabase-config.js";

// Replace this hash with the SHA-256 digest of your desired admin password.
const ADMIN_PASSWORD_HASH = "edd807dfa6482153fdf7d0cc18d84cf6a4b0cdc667b972951c3a55cee7afe92f";
const ADMIN_SECRET_HEADER = "admin-super-secret";
const WALL_WIDTH = 3500;
const WALL_HEIGHT = 1779.31;

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
const exportCsvBtn = document.getElementById("exportCsvBtn");
const searchInput = document.getElementById("searchInput");
const totalCountNode = document.getElementById("totalCount");
const reviewControls = document.getElementById("reviewControls");
const marqueeToggle = document.getElementById("marqueeApprovalToggle");
const stickerToggle = document.getElementById("stickerApprovalToggle");
const stickerReviewCard = document.getElementById("stickerReviewCard");
const marqueeReviewStatus = document.getElementById("marqueeReviewStatus");
const stickerReviewStatus = document.getElementById("stickerReviewStatus");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const batchActions = document.getElementById("batchActions");
const batchApproveBtn = document.getElementById("batchApproveBtn");
const batchDeleteBtn = document.getElementById("batchDeleteBtn");
const paginationControls = document.getElementById("paginationControls");
const paginationInfo = document.getElementById("paginationInfo");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const deleteConfirmModal = document.getElementById("deleteConfirmModal");
const modalConfirmBtn = document.getElementById("modalConfirmBtn");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalMessage = document.getElementById("modalMessage");

if (exportBtn) {
  exportBtn.disabled = true;
}
if (exportCsvBtn) {
  exportCsvBtn.disabled = true;
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
  selectedIds: new Set(),
  searchTerm: "",
  currentPage: 1,
  pageSize: 50,
  totalCount: 0,
};

const reviewSettingsState = {
  id: null,
  requireMarqueeApproval: true,
  requireStickerApproval: true,
  loading: false,
  ready: false,
};

let supabaseClient = null;
let pendingDeleteAction = null;

function syncPanelVisibility() {
  if (loginPanel) {
    loginPanel.hidden = state.authorized;
    loginPanel.setAttribute("aria-hidden", state.authorized ? "true" : "false");
  }
  if (dashboard) {
    dashboard.hidden = !state.authorized;
    dashboard.setAttribute("aria-hidden", state.authorized ? "false" : "true");
  }
}

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

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

loginForm?.addEventListener("submit", handleLogin);
refreshBtn?.addEventListener("click", () => {
  if (!state.authorized || state.loading) {
    return;
  }
  void loadStickers(1, true);
});
logoutBtn?.addEventListener("click", handleLogout);
entriesBody?.addEventListener("input", handleRowInput);
entriesBody?.addEventListener("click", handleTableClick);
entriesBody?.addEventListener("change", handleTableChange);
exportBtn?.addEventListener("click", handleExportEntries);
exportCsvBtn?.addEventListener("click", handleExportCsv);
searchInput?.addEventListener("input", debounce(handleSearchInput, 500));
marqueeToggle?.addEventListener("change", handleMarqueeToggleChange);
stickerToggle?.addEventListener("change", handleStickerToggleChange);
selectAllCheckbox?.addEventListener("change", handleSelectAllChange);
batchApproveBtn?.addEventListener("click", handleBatchApprove);
batchDeleteBtn?.addEventListener("click", handleBatchDelete);
prevPageBtn?.addEventListener("click", () => changePage(state.currentPage - 1));
nextPageBtn?.addEventListener("click", () => changePage(state.currentPage + 1));
modalCancelBtn?.addEventListener("click", closeDeleteModal);
modalConfirmBtn?.addEventListener("click", executePendingDelete);

document.addEventListener("DOMContentLoaded", () => {
  passwordInput?.focus();
});

syncPanelVisibility();

function openDeleteModal(message, action) {
  if (modalMessage) modalMessage.textContent = message;
  pendingDeleteAction = action;
  if (deleteConfirmModal) {
    deleteConfirmModal.hidden = false;
    deleteConfirmModal.setAttribute("aria-hidden", "false");
  }
}

function closeDeleteModal() {
  pendingDeleteAction = null;
  if (deleteConfirmModal) {
    deleteConfirmModal.hidden = true;
    deleteConfirmModal.setAttribute("aria-hidden", "true");
  }
}

async function executePendingDelete() {
  if (pendingDeleteAction) {
    await pendingDeleteAction();
  }
  closeDeleteModal();
}

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
  syncPanelVisibility();
  if (exportBtn) {
    exportBtn.disabled = false;
  }
  if (exportCsvBtn) {
    exportCsvBtn.disabled = false;
  }
  supabaseClient = createSupabaseClient({ headers: { "x-admin-secret": ADMIN_SECRET_HEADER } });
  void initializeReviewSettings();
  void loadStickers(1);
}

function handleLogout() {
  state.authorized = false;
  state.entries = [];
  state.selectedIds.clear();
  state.currentPage = 1;
  state.totalCount = 0;
  renderEntries();
  emptyState.hidden = true;
  syncPanelVisibility();
  supabaseClient = null;
  if (exportBtn) {
    exportBtn.disabled = true;
  }
  if (exportCsvBtn) {
    exportCsvBtn.disabled = true;
  }
  resetReviewControls();
  updateBatchActionsState();
  if (loginError) {
    loginError.textContent = "";
  }
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.focus();
  }
}

async function loadStickers(page = 1, showToastOnError = false) {
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
  
  const from = (page - 1) * state.pageSize;
  const to = from + state.pageSize - 1;

  try {
    let query = supabaseClient
      .from("wall_sticker_entries")
      .select("id, note, x_norm, y_norm, created_at, updated_at, is_approved", { count: 'exact' })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (state.searchTerm) {
      query = query.ilike('note', `%${state.searchTerm}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }
    
    state.entries = Array.isArray(data)
      ? data.map((entry) => ({
          ...entry,
          x_norm: typeof entry.x_norm === "number" ? entry.x_norm : null,
          y_norm: typeof entry.y_norm === "number" ? entry.y_norm : null,
          is_approved: Boolean(entry.is_approved),
        }))
      : [];
    
    state.totalCount = count || 0;
    state.currentPage = page;
    state.selectedIds.clear();
    
    renderEntries();
    updatePaginationControls();
    
    if (!state.entries.length && page === 1) {
      emptyState.hidden = false;
    }
    updateBatchActionsState();
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

function changePage(newPage) {
  if (newPage < 1 || newPage > Math.ceil(state.totalCount / state.pageSize)) {
    return;
  }
  loadStickers(newPage);
}

function updatePaginationControls() {
  if (!paginationControls) return;
  
  const totalPages = Math.ceil(state.totalCount / state.pageSize) || 1;
  paginationControls.hidden = state.totalCount === 0;
  
  if (paginationInfo) {
    paginationInfo.textContent = `第 ${state.currentPage} 頁，共 ${totalPages} 頁 (總計 ${state.totalCount} 筆)`;
  }
  
  if (prevPageBtn) {
    prevPageBtn.disabled = state.currentPage <= 1;
  }
  
  if (nextPageBtn) {
    nextPageBtn.disabled = state.currentPage >= totalPages;
  }
}

function renderEntries() {
  if (!entriesBody || !rowTemplate) {
    return;
  }
  entriesBody.innerHTML = "";
  const displayEntries = state.entries;
  
  if (!Array.isArray(displayEntries) || !displayEntries.length) {
    updateTotalCount();
    return;
  }
  const fragment = document.createDocumentFragment();
  
  displayEntries.forEach((entry, index) => {
    // Calculate absolute index for display number
    const absoluteIndex = (state.currentPage - 1) * state.pageSize + index;
    
    const clone = rowTemplate.content.firstElementChild.cloneNode(true);
    clone.dataset.id = entry.id;
    const approved = Boolean(entry.is_approved);
    clone.classList.toggle("pending-review", !approved);
    
    const checkbox = clone.querySelector(".row-checkbox");
    if (checkbox) {
      checkbox.checked = state.selectedIds.has(entry.id);
      checkbox.value = entry.id;
    }

    const numberCell = clone.querySelector(".entry-number");
    const idCell = clone.querySelector(".entry-id");
    const createdCell = clone.querySelector(".created");
    const updatedCell = clone.querySelector(".updated");
    const coordsNode = clone.querySelector(".entry-coords");
    const noteInputNode = clone.querySelector(".note-input");
    const statusBadge = clone.querySelector(".status-badge");
    const approveButton = clone.querySelector('button[data-action="approve"]');
    const revokeButton = clone.querySelector('button[data-action="revoke"]');

    // Display number logic: Total - Absolute Index
    // If searching, this number might be confusing if it represents "nth result" vs "nth total record"
    // Let's stick to "nth result" for now as it's simpler with server-side search
    const displayNumber = state.totalCount - absoluteIndex;
    
    if (numberCell) {
      numberCell.textContent = `#${displayNumber}`;
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
    if (coordsNode) {
      coordsNode.textContent = formatCoordinateLabel(entry);
    }
    if (statusBadge) {
      statusBadge.textContent = approved ? "已通過" : "審核中";
      statusBadge.dataset.state = approved ? "approved" : "pending";
    }
    if (noteInputNode) {
      noteInputNode.value = entry.note ?? "";
      noteInputNode.dataset.originalValue = noteInputNode.value;
      noteInputNode.setAttribute("aria-label", `留言 #${displayNumber} 的內容`);
    }
    if (approveButton) {
      approveButton.hidden = approved;
      approveButton.disabled = approved;
      if (approved) {
        approveButton.setAttribute("aria-hidden", "true");
      } else {
        approveButton.removeAttribute("aria-hidden");
      }
    }
    if (revokeButton) {
      revokeButton.hidden = !approved;
      revokeButton.disabled = !approved;
      if (!approved) {
        revokeButton.setAttribute("aria-hidden", "true");
      } else {
        revokeButton.removeAttribute("aria-hidden");
      }
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
  const noteInputNode = row.querySelector(".note-input");
  const noteChanged = Boolean(noteInputNode && noteInputNode.value !== noteInputNode.dataset.originalValue);
  row.classList.toggle("dirty", noteChanged);
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
  } else if (action === "approve") {
    void approveEntry(row, button);
  } else if (action === "revoke") {
    void revokeEntry(row, button);
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
  const noteInputNode = row.querySelector(".note-input");
  if (!noteInputNode) {
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
  const saveLabel = button.textContent;
  button.disabled = true;
  button.textContent = "儲存中…";
  try {
    const { error, data } = await supabaseClient
      .from("wall_stickers")
      .update({
        note,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    const patch = {
      note,
      updated_at: data?.updated_at ?? null,
    };
    if (typeof data?.is_approved !== "undefined") {
      patch.is_approved = data.is_approved;
    }
    updateLocalEntry(id, patch);
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

async function approveEntry(row, button) {
  const id = row.dataset.id;
  if (!id) {
    showToast("找不到這筆留言的 ID。", "danger");
    return;
  }
  if (!supabaseClient) {
    showToast("尚未建立管理連線，請重新登入。", "danger");
    return;
  }
  const existing = state.entries.find((entry) => entry.id === id);
  if (existing?.is_approved) {
    showToast("此留言已通過審核。", "info");
    return;
  }
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "通過中…";
  try {
    const { data, error } = await supabaseClient
      .from("wall_stickers")
      .update({ is_approved: true })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    updateLocalEntry(id, {
      is_approved: true,
      updated_at: data?.updated_at ?? new Date().toISOString(),
    });
    showToast("已通過這則留言。", "success");
    renderEntries();
  } catch (error) {
    console.error("Failed to approve entry", error);
    showToast("審核失敗，請稍後再試。", "danger");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel ?? "通過";
  }
}

async function revokeEntry(row, button) {
  const id = row.dataset.id;
  if (!id) {
    showToast("找不到這筆留言的 ID。", "danger");
    return;
  }
  if (!supabaseClient) {
    showToast("尚未建立管理連線，請重新登入。", "danger");
    return;
  }
  const existing = state.entries.find((entry) => entry.id === id);
  if (!existing?.is_approved) {
    showToast("此留言尚未通過審核。", "info");
    return;
  }
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "取消中…";
  try {
    const { data, error } = await supabaseClient
      .from("wall_stickers")
      .update({ is_approved: false })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    updateLocalEntry(id, {
      is_approved: false,
      updated_at: data?.updated_at ?? new Date().toISOString(),
    });
    showToast("已取消通過這則留言。", "success");
    renderEntries();
  } catch (error) {
    console.error("Failed to revoke entry", error);
    showToast("取消失敗，請稍後再試。", "danger");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel ?? "取消通過";
  }
}

async function deleteEntry(row, button) {
  const id = row.dataset.id;
  if (!id) {
    showToast("找不到這筆留言的 ID。", "danger");
    return;
  }
  
  openDeleteModal("確定要刪除這筆留言嗎？刪除後無法復原。", async () => {
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
  });
}

function updateLocalEntry(id, changes = {}) {
  const target = state.entries.find((entry) => entry.id === id);
  if (!target) {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "note")) {
    target.note = changes.note;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "is_approved")) {
    target.is_approved = Boolean(changes.is_approved);
  }
  if (Object.prototype.hasOwnProperty.call(changes, "updated_at")) {
    target.updated_at = changes.updated_at ?? new Date().toISOString();
  }
}

function updateTotalCount() {
  if (!totalCountNode) {
    return;
  }
  // Note: This count might be slightly off if we don't query the pending count separately
  // But for performance, we can just show total count or fetch pending count in a separate lightweight query if needed.
  // For now, let's just show total count.
  totalCountNode.textContent = state.totalCount.toString();
}

function handleMarqueeToggleChange(event) {
  if (!state.authorized || reviewSettingsState.loading) {
    event.preventDefault();
    syncReviewControls();
    return;
  }
  const enabled = Boolean(event.target.checked);
  const nextSticker = enabled ? reviewSettingsState.requireStickerApproval : false;
  void persistReviewSettings({
    require_marquee_approval: enabled,
    require_sticker_approval: nextSticker,
  });
}

function handleStickerToggleChange(event) {
  if (!state.authorized || reviewSettingsState.loading || !reviewSettingsState.requireMarqueeApproval) {
    event.preventDefault();
    syncReviewControls();
    return;
  }
  const enabled = Boolean(event.target.checked);
  void persistReviewSettings({
    require_marquee_approval: true,
    require_sticker_approval: enabled,
  });
}

async function initializeReviewSettings() {
  if (!state.authorized || !supabaseClient || !reviewControls) {
    return;
  }
  reviewControls.hidden = false;
  reviewSettingsState.loading = true;
  syncReviewControls();
  try {
    const data = await fetchOrCreateReviewSettings();
    applyReviewSettingsState(data);
    reviewSettingsState.ready = true;
  } catch (error) {
    console.error("Failed to load review settings", error);
    showToast("讀取審核設定失敗，請稍後再試。", "danger");
    reviewControls.hidden = true;
  } finally {
    reviewSettingsState.loading = false;
    syncReviewControls();
  }
}

function resetReviewControls() {
  reviewSettingsState.id = null;
  reviewSettingsState.requireMarqueeApproval = true;
  reviewSettingsState.requireStickerApproval = true;
  reviewSettingsState.loading = false;
  reviewSettingsState.ready = false;
  if (reviewControls) {
    reviewControls.hidden = true;
  }
  if (marqueeToggle) {
    marqueeToggle.checked = true;
    marqueeToggle.disabled = true;
  }
  if (stickerToggle) {
    stickerToggle.checked = true;
    stickerToggle.disabled = true;
  }
  syncReviewControls();
}

async function fetchOrCreateReviewSettings() {
  if (!supabaseClient) {
    throw new Error("Missing Supabase client");
  }
  const baseQuery = supabaseClient
    .from("wall_review_settings")
    .select("id, require_marquee_approval, require_sticker_approval")
    .limit(1)
    .maybeSingle();
  const { data, error } = await baseQuery;
  if (error && error.code !== "PGRST116") {
    throw error;
  }
  if (data) {
    return data;
  }
  const { data: inserted, error: insertError } = await supabaseClient
    .from("wall_review_settings")
    .insert({ require_marquee_approval: true, require_sticker_approval: true })
    .select()
    .single();
  if (insertError) {
    throw insertError;
  }
  return inserted;
}

function applyReviewSettingsState(payload = {}) {
  if (!payload) {
    return;
  }
  reviewSettingsState.id = payload.id ?? reviewSettingsState.id;
  const marqueeRequired = Boolean(payload.require_marquee_approval);
  reviewSettingsState.requireMarqueeApproval = marqueeRequired;
  reviewSettingsState.requireStickerApproval = marqueeRequired && Boolean(payload.require_sticker_approval);
  syncReviewControls();
}

function syncReviewControls() {
  if (!reviewControls) {
    return;
  }
  if (!state.authorized || !reviewSettingsState.ready) {
    reviewControls.hidden = true;
  } else {
    reviewControls.hidden = false;
  }
  if (!state.authorized) {
    return;
  }
  const marqueeEnabled = Boolean(reviewSettingsState.requireMarqueeApproval);
  if (marqueeToggle) {
    marqueeToggle.checked = marqueeEnabled;
    marqueeToggle.disabled = reviewSettingsState.loading;
  }
  if (marqueeReviewStatus) {
    marqueeReviewStatus.textContent = marqueeEnabled ? "需審核" : "免審";
    marqueeReviewStatus.dataset.state = marqueeEnabled ? "on" : "off";
  }
  if (stickerReviewCard) {
    stickerReviewCard.hidden = !marqueeEnabled;
  }
  const stickerEnabled = marqueeEnabled && Boolean(reviewSettingsState.requireStickerApproval);
  if (stickerToggle) {
    stickerToggle.checked = stickerEnabled;
    stickerToggle.disabled = reviewSettingsState.loading || !marqueeEnabled;
  }
  if (stickerReviewStatus) {
    stickerReviewStatus.textContent = stickerEnabled ? "需審核" : "免審";
    stickerReviewStatus.dataset.state = stickerEnabled ? "on" : "off";
  }
}

async function persistReviewSettings(values) {
  if (!state.authorized) {
    showToast("請先登入管理後再調整審核設定。", "danger");
    syncReviewControls();
    return;
  }
  if (!supabaseClient) {
    showToast("尚未建立管理連線，請重新登入。", "danger");
    syncReviewControls();
    return;
  }
  const payload = {
    require_marquee_approval: Boolean(values.require_marquee_approval),
    require_sticker_approval: Boolean(values.require_marquee_approval) && Boolean(values.require_sticker_approval),
  };
  reviewSettingsState.loading = true;
  syncReviewControls();
  try {
    let query = supabaseClient.from("wall_review_settings");
    if (reviewSettingsState.id) {
      query = query.update(payload).eq("id", reviewSettingsState.id);
    } else {
      query = query.insert(payload);
    }
    const { data, error } = await query.select().single();
    if (error) {
      throw error;
    }
    applyReviewSettingsState(data);
    showToast("已更新審核設定。", "success");
  } catch (error) {
    console.error("Failed to update review settings", error);
    showToast("更新審核設定失敗，請稍後再試。", "danger");
  } finally {
    reviewSettingsState.loading = false;
    syncReviewControls();
  }
}

async function handleExportEntries() {
  if (!state.authorized) {
    showToast("請先登入管理後再匯出。", "danger");
    return;
  }
  
  const originalLabel = exportBtn.textContent;
  exportBtn.disabled = true;
  exportBtn.textContent = "匯出中…";

  try {
    let query = supabaseClient
      .from("wall_sticker_entries")
      .select("id, note, x_norm, y_norm, created_at, updated_at, is_approved")
      .order("created_at", { ascending: true });

    if (state.searchTerm) {
      query = query.ilike('note', `%${state.searchTerm}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || !data.length) {
      showToast("目前沒有留言可匯出。", "info");
      return;
    }

    const lines = data.map((entry, index) => {
      const note = (entry.note ?? "").replace(/\r?\n/g, "\n");
      const coordsText = formatCoordinateLine(entry);
      return `#${index + 1}\nID：${entry.id}\n${coordsText}\n留言：${note}`;
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
  } catch (error) {
    console.error("Export failed", error);
    showToast("匯出失敗，請稍後再試。", "danger");
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = originalLabel;
  }
}

function handleSearchInput(event) {
  const term = event.target.value.trim().toLowerCase();
  state.searchTerm = term;
  loadStickers(1);
}

async function handleExportCsv() {
  if (!state.authorized) {
    showToast("請先登入管理後再匯出。", "danger");
    return;
  }
  
  const originalLabel = exportCsvBtn.textContent;
  exportCsvBtn.disabled = true;
  exportCsvBtn.textContent = "匯出中…";

  try {
    let query = supabaseClient
      .from("wall_sticker_entries")
      .select("id, note, x_norm, y_norm, created_at, updated_at, is_approved")
      .order("created_at", { ascending: true });

    if (state.searchTerm) {
      query = query.ilike('note', `%${state.searchTerm}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || !data.length) {
      showToast("目前沒有留言可匯出。", "info");
      return;
    }
  
    // BOM for Excel to recognize UTF-8
    const BOM = "\uFEFF";
    const headers = ["編號", "ID", "留言內容", "X座標", "Y座標", "建立時間", "更新時間", "審核狀態"];
    
    const rows = data.map((entry, index) => {
      const note = (entry.note ?? "").replace(/"/g, '""'); // Escape quotes
      const status = entry.is_approved ? "已通過" : "審核中";
      const created = formatDate(entry.created_at);
      const updated = entry.updated_at ? formatDate(entry.updated_at) : "";
      
      return [
        index + 1,
        entry.id,
        `"${note}"`,
        entry.x_norm,
        entry.y_norm,
        created,
        updated,
        status
      ].join(",");
    });
    
    const csvContent = BOM + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `miracle-wall-export-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast("已匯出 CSV。", "success");
  } catch (error) {
    console.error("Export failed", error);
    showToast("匯出失敗，請稍後再試。", "danger");
  } finally {
    exportCsvBtn.disabled = false;
    exportCsvBtn.textContent = originalLabel;
  }
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

function hasNumericCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCoordinateLabel(entry) {
  if (!hasNumericCoordinate(entry?.x_norm) || !hasNumericCoordinate(entry?.y_norm)) {
    return "座標：—";
  }
  const { x_norm: xNorm, y_norm: yNorm } = entry;
  const pxX = Math.round(xNorm * WALL_WIDTH);
  const pxY = Math.round(yNorm * WALL_HEIGHT);
  return `座標：X ${xNorm.toFixed(4)}（${pxX}px） · Y ${yNorm.toFixed(4)}（${pxY}px）`;
}

function formatCoordinateLine(entry) {
  if (!hasNumericCoordinate(entry?.x_norm) || !hasNumericCoordinate(entry?.y_norm)) {
    return "座標：無可用資料";
  }
  const { x_norm: xNorm, y_norm: yNorm } = entry;
  const pxX = Math.round(xNorm * WALL_WIDTH);
  const pxY = Math.round(yNorm * WALL_HEIGHT);
  return `座標：X=${xNorm.toFixed(5)}（${pxX}px） Y=${yNorm.toFixed(5)}（${pxY}px）`;
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

function handleTableChange(event) {
  const target = event.target;
  if (target.classList.contains("row-checkbox")) {
    const id = target.value;
    if (target.checked) {
      state.selectedIds.add(id);
    } else {
      state.selectedIds.delete(id);
    }
    updateBatchActionsState();
  }
}

function handleSelectAllChange(event) {
  const checked = event.target.checked;
  
  if (checked) {
    state.entries.forEach((entry) => state.selectedIds.add(entry.id));
  } else {
    state.selectedIds.clear();
  }
  
  const checkboxes = entriesBody.querySelectorAll(".row-checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = checked;
  });
  
  updateBatchActionsState();
}

function updateBatchActionsState() {
  const count = state.selectedIds.size;
  const allSelected = state.entries.length > 0 && count === state.entries.length;
  
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = count > 0 && count < state.entries.length;
  }
  
  if (batchActions) {
    batchActions.hidden = count === 0;
  }
  
  if (batchApproveBtn) {
    batchApproveBtn.textContent = `批次通過 (${count})`;
  }
  
  if (batchDeleteBtn) {
    batchDeleteBtn.textContent = `批次刪除 (${count})`;
  }
}

async function handleBatchApprove() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return;
  
  if (!supabaseClient) {
    showToast("尚未建立管理連線，請重新登入。", "danger");
    return;
  }
  
  batchApproveBtn.disabled = true;
  const originalText = batchApproveBtn.textContent;
  batchApproveBtn.textContent = "處理中...";
  
  try {
    const { error } = await supabaseClient
      .from("wall_stickers")
      .update({ is_approved: true })
      .in("id", ids);
      
    if (error) throw error;
    
    ids.forEach(id => {
      updateLocalEntry(id, { is_approved: true });
    });
    
    state.selectedIds.clear();
    renderEntries();
    updateBatchActionsState();
    showToast(`已通過 ${ids.length} 則留言。`, "success");
  } catch (error) {
    console.error("Batch approve failed", error);
    showToast("批次審核失敗，請稍後再試。", "danger");
  } finally {
    batchApproveBtn.disabled = false;
    batchApproveBtn.textContent = originalText;
  }
}

async function handleBatchDelete() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return;
  
  openDeleteModal(`確定要刪除選取的 ${ids.length} 則留言嗎？此動作無法復原。`, async () => {
    if (!supabaseClient) {
      showToast("尚未建立管理連線，請重新登入。", "danger");
      return;
    }
    
    batchDeleteBtn.disabled = true;
    const originalText = batchDeleteBtn.textContent;
    batchDeleteBtn.textContent = "處理中...";
    
    try {
      const { error } = await supabaseClient
        .from("wall_stickers")
        .delete()
        .in("id", ids);
        
      if (error) throw error;
      
      state.entries = state.entries.filter(entry => !ids.includes(entry.id));
      state.selectedIds.clear();
      renderEntries();
      if (!state.entries.length) {
        emptyState.hidden = false;
      }
      updateBatchActionsState();
      showToast(`已刪除 ${ids.length} 則留言。`, "success");
    } catch (error) {
      console.error("Batch delete failed", error);
      showToast("批次刪除失敗，請稍後再試。", "danger");
    } finally {
      batchDeleteBtn.disabled = false;
      batchDeleteBtn.textContent = originalText;
    }
  });
}
