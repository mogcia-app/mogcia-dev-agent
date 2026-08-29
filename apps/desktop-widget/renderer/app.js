const api = window.mogciaDesktop;

const setupPanel = document.querySelector("#setupPanel");
const baseUrlInput = document.querySelector("#baseUrlInput");
const tokenInput = document.querySelector("#tokenInput");
const launchAtLoginInput = document.querySelector("#launchAtLoginInput");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const clearTokenButton = document.querySelector("#clearTokenButton");
const openSettingsButton = document.querySelector("#openSettingsButton");
const showSetupButton = document.querySelector("#showSetupButton");
const companyInput = document.querySelector("#companyInput");
const selectedCompanyLabel = document.querySelector("#selectedCompany");
const memoInput = document.querySelector("#memoInput");
const parseButton = document.querySelector("#parseButton");
const commitButton = document.querySelector("#commitButton");
const aiPreview = document.querySelector("#aiPreview");
const statusText = document.querySelector("#statusText");
const pinButton = document.querySelector("#pinButton");

let selectedCompany = null;
let parsedMemo = null;
let latestMemoId = null;
let alwaysOnTop = true;
let launchAtLogin = false;

function clearTransientState() {
  selectedCompany = null;
  parsedMemo = null;
  latestMemoId = null;
  companyInput.value = "";
  memoInput.value = "";
  selectedCompanyLabel.textContent = "";
  setStatus("");
  renderPreview();
}

function setStatus(message, loading = false) {
  statusText.innerHTML = loading ? `${message} <span class="loading-blocks"><i></i><i></i><i></i><i></i></span>` : message;
}

function renderPreview() {
  if (!parsedMemo) {
    aiPreview.classList.add("hidden");
    commitButton.disabled = true;
    return;
  }
  const activity = parsedMemo.activityLog ? `<strong>活動ログ</strong><span>${escapeHtml(parsedMemo.activityLog.title)}</span>` : "";
  const tasks = (parsedMemo.suggestedTasks || []).slice(0, 3).map((task) => `<strong>タスク</strong><span>${escapeHtml(task.title)}</span>`).join("");
  const notes = (parsedMemo.companyNotes || []).slice(0, 2).map((note) => `<strong>会社メモ</strong><span>${escapeHtml(note.content)}</span>`).join("");
  aiPreview.innerHTML = activity + tasks + notes || "<span>登録候補はありません。</span>";
  aiPreview.classList.remove("hidden");
  commitButton.disabled = !selectedCompany;
}

async function loadSettings() {
  const settings = await api.getSettings();
  baseUrlInput.value = settings.baseUrl;
  alwaysOnTop = settings.alwaysOnTop;
  launchAtLogin = settings.launchAtLogin;
  launchAtLoginInput.checked = launchAtLogin;
  pinButton.textContent = alwaysOnTop ? "■" : "□";
  setupPanel.classList.toggle("hidden", settings.hasToken);
  if (settings.hasToken) setStatus("メモを登録できます");
}

async function saveSettings() {
  await api.saveSettings({
    baseUrl: baseUrlInput.value,
    token: tokenInput.value,
    alwaysOnTop,
    launchAtLogin
  });
  tokenInput.value = "";
  setupPanel.classList.add("hidden");
  setStatus("接続を確認中", true);
  const result = await api.apiRequest({ path: "/api/desktop/auth/verify" });
  if (!result.success) {
    setupPanel.classList.remove("hidden");
    setStatus(result.error?.message || "認証できませんでした");
    return;
  }
  setStatus(`接続しました: ${result.data.device.deviceName}`);
}

async function clearToken() {
  await api.saveSettings({
    baseUrl: baseUrlInput.value,
    clearToken: true,
    alwaysOnTop,
    launchAtLogin
  });
  tokenInput.value = "";
  selectedCompany = null;
  parsedMemo = null;
  latestMemoId = null;
  renderPreview();
  selectedCompanyLabel.textContent = "";
  setupPanel.classList.remove("hidden");
  setStatus("トークンを削除しました");
}

async function searchCompany() {
  const query = companyInput.value.trim();
  if (!query) return;
  setStatus("会社を検索中", true);
  const result = await api.apiRequest({ path: `/api/desktop/companies/search?q=${encodeURIComponent(query)}` });
  if (!result.success || !result.data.companies.length) {
    selectedCompany = null;
    selectedCompanyLabel.textContent = "会社が見つかりません";
    commitButton.disabled = true;
    setStatus(result.error?.message || "会社が見つかりませんでした");
    return;
  }
  selectedCompany = result.data.companies[0];
  selectedCompanyLabel.textContent = `選択中: ${selectedCompany.name}`;
  commitButton.disabled = !parsedMemo;
  setStatus("会社を選択しました");
}

async function parseMemo() {
  const text = memoInput.value.trim();
  if (!text) return;
  setStatus("AIがメモを整理中", true);
  const result = await api.apiRequest({
    path: "/api/desktop/memos/parse",
    method: "POST",
    body: {
      text,
      companyId: selectedCompany?.id || null,
      createdFrom: "floating_window"
    }
  });
  if (!result.success) {
    setStatus(result.error?.message || "AI整理に失敗しました");
    return;
  }
  latestMemoId = result.data.memoId;
  parsedMemo = result.data.parsed;
  renderPreview();
  setStatus("候補を確認してください");
}

async function commitMemo() {
  if (!selectedCompany || !parsedMemo) return;
  setStatus("登録中", true);
  const result = await api.apiRequest({
    path: "/api/desktop/memos/commit",
    method: "POST",
    body: {
      memoId: latestMemoId,
      companyId: selectedCompany.id,
      originalText: memoInput.value.trim(),
      activityLog: parsedMemo.activityLog,
      tasks: parsedMemo.suggestedTasks || [],
      companyNotes: parsedMemo.companyNotes || [],
      createdFrom: "floating_window"
    }
  });
  if (!result.success) {
    setStatus(result.error?.message || "登録に失敗しました");
    return;
  }
  memoInput.value = "";
  parsedMemo = null;
  latestMemoId = null;
  renderPreview();
  setStatus("登録しました");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

saveSettingsButton.addEventListener("click", saveSettings);
clearTokenButton.addEventListener("click", clearToken);
openSettingsButton.addEventListener("click", () => api.openWeb("/settings/desktop"));
showSetupButton.addEventListener("click", () => setupPanel.classList.toggle("hidden"));
launchAtLoginInput.addEventListener("change", async () => {
  launchAtLogin = launchAtLoginInput.checked;
  const result = await api.setLaunchAtLogin(launchAtLogin);
  launchAtLogin = result.launchAtLogin;
  launchAtLoginInput.checked = launchAtLogin;
  setStatus(result.error || (launchAtLogin ? "ログイン時に起動します" : "ログイン時起動をオフにしました"));
});
companyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchCompany();
});
parseButton.addEventListener("click", parseMemo);
commitButton.addEventListener("click", commitMemo);
document.querySelector("#openHomeButton").addEventListener("click", () => api.openWeb("/home"));
document.querySelector("#closeButton").addEventListener("click", () => {
  clearTransientState();
  api.close();
});
document.querySelector("#minimizeButton").addEventListener("click", () => api.minimize());
pinButton.addEventListener("click", async () => {
  alwaysOnTop = !alwaysOnTop;
  const result = await api.pin(alwaysOnTop);
  alwaysOnTop = result.alwaysOnTop;
  pinButton.textContent = alwaysOnTop ? "■" : "□";
});

loadSettings();
window.addEventListener("pagehide", clearTransientState);
