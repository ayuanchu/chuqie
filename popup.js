const STORAGE_KEYS = {
  captures: "captures",
  settings: "settings",
};

const DEFAULT_SETTINGS = {
  descriptionUrl: "",
  controlUrl: "",
  friendlyName: "",
  lastResolvedAt: "",
};

const state = {
  captures: [],
  settings: { ...DEFAULT_SETTINGS },
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  await loadState();
});

function bindElements() {
  elements.descriptionUrl = document.getElementById("descriptionUrl");
  elements.controlUrl = document.getElementById("controlUrl");
  elements.friendlyName = document.getElementById("friendlyName");
  elements.deviceStatus = document.getElementById("deviceStatus");
  elements.manualUrl = document.getElementById("manualUrl");
  elements.manualTitle = document.getElementById("manualTitle");
  elements.captureList = document.getElementById("captureList");
  elements.captureSummary = document.getElementById("captureSummary");
  elements.toast = document.getElementById("toast");
}

function bindEvents() {
  document.getElementById("refreshButton").addEventListener("click", () => {
    void loadState();
  });

  document.getElementById("saveSettingsButton").addEventListener("click", () => {
    void saveSettings({ showNotice: true });
  });

  document.getElementById("resolveDeviceButton").addEventListener("click", () => {
    void resolveDeviceFromForm();
  });

  document.getElementById("castManualButton").addEventListener("click", () => {
    void castManualUrl();
  });

  document.getElementById("copyManualButton").addEventListener("click", () => {
    void copyCurrentUrl();
  });

  document.getElementById("castLatestButton").addEventListener("click", () => {
    void castLatestCapture();
  });

  document.getElementById("clearCapturesButton").addEventListener("click", () => {
    void clearCaptures();
  });

  elements.captureList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const captureId = button.dataset.captureId;
    const action = button.dataset.action;
    const capture = state.captures.find((item) => item.id === captureId);

    if (!capture) {
      showToast("这条捕获记录已经不存在了。", true);
      return;
    }

    if (action === "use") {
      applyCapture(capture);
      return;
    }

    if (action === "copy") {
      void copyText(capture.url, "链接已复制。");
      return;
    }

    if (action === "cast") {
      void castCapture(capture);
      return;
    }

    if (action === "delete") {
      void deleteCapture(capture.id);
    }
  });
}

async function loadState() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.captures, STORAGE_KEYS.settings]);
  state.captures = Array.isArray(stored[STORAGE_KEYS.captures]) ? stored[STORAGE_KEYS.captures] : [];
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(stored[STORAGE_KEYS.settings] || {}),
  };
  render();
}

function render() {
  renderSettings();
  renderCaptures();
}

function renderSettings() {
  elements.descriptionUrl.value = state.settings.descriptionUrl || "";
  elements.controlUrl.value = state.settings.controlUrl || "";
  elements.friendlyName.value = state.settings.friendlyName || "";

  if (state.settings.controlUrl) {
    elements.deviceStatus.textContent = state.settings.friendlyName || "已解析";
    elements.deviceStatus.classList.add("ok");
  } else {
    elements.deviceStatus.textContent = "未配置";
    elements.deviceStatus.classList.remove("ok");
  }
}

function renderCaptures() {
  const count = state.captures.length;
  elements.captureSummary.textContent = count
    ? `已捕获 ${count} 条，最新时间 ${formatTime(state.captures[0].detectedAt)}`
    : "暂无记录";

  if (!count) {
    elements.captureList.className = "capture-list empty";
    elements.captureList.innerHTML = `
      <div class="empty-state">
        <strong>还没有捕获到 m3u8 链接</strong>
        <p>打开视频页面并开始播放，扩展会自动监听请求。</p>
      </div>
    `;
    return;
  }

  elements.captureList.className = "capture-list";
  elements.captureList.innerHTML = state.captures
    .map((capture) => {
      const title = escapeHtml(capture.pageTitle || capture.pageUrl || "未命名页面");
      const subtitle = escapeHtml(getCaptureSubtitle(capture));
      const url = escapeHtml(capture.url);

      return `
        <article class="capture-card">
          <div class="capture-card-head">
            <div>
              <h3>${title}</h3>
              <p>${subtitle}</p>
            </div>
            <span class="capture-tag">${escapeHtml(capture.source)}</span>
          </div>
          <code class="capture-url">${url}</code>
          <div class="actions compact">
            <button type="button" data-action="use" data-capture-id="${capture.id}">使用</button>
            <button type="button" data-action="cast" data-capture-id="${capture.id}">投屏</button>
            <button type="button" class="ghost-button" data-action="copy" data-capture-id="${capture.id}">复制</button>
            <button type="button" class="ghost-button" data-action="delete" data-capture-id="${capture.id}">删除</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function saveSettings(options = {}) {
  const settings = {
    descriptionUrl: elements.descriptionUrl.value.trim(),
    controlUrl: elements.controlUrl.value.trim(),
    friendlyName: elements.friendlyName.value.trim(),
    lastResolvedAt: state.settings.lastResolvedAt || "",
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
  state.settings = settings;
  renderSettings();

  if (options.showNotice) {
    showToast("电视设置已保存。");
  }

  return settings;
}

async function resolveDeviceFromForm() {
  const descriptionUrl = elements.descriptionUrl.value.trim();
  const directControlUrl = elements.controlUrl.value.trim();

  if (!descriptionUrl && !directControlUrl) {
    showToast("请先填写设备描述地址或控制地址。", true);
    return;
  }

  if (directControlUrl) {
    await saveSettings({ showNotice: false });
    showToast("控制地址已保存，可以直接投屏。");
    return;
  }

  try {
    const resolved = await resolveDlnaDevice(descriptionUrl);
    elements.controlUrl.value = resolved.controlUrl;
    elements.friendlyName.value = resolved.friendlyName || elements.friendlyName.value;

    state.settings = {
      descriptionUrl,
      controlUrl: resolved.controlUrl,
      friendlyName: resolved.friendlyName || elements.friendlyName.value.trim(),
      lastResolvedAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
    renderSettings();
    showToast(`设备解析成功：${state.settings.friendlyName || "已获取控制地址"}`);
  } catch (error) {
    showToast(error.message || "设备解析失败。", true);
  }
}

async function castManualUrl() {
  const url = elements.manualUrl.value.trim();
  if (!url) {
    showToast("请先填写要投屏的 m3u8 链接。", true);
    return;
  }

  const title = elements.manualTitle.value.trim() || "M3U8 投屏";
  await castUrl(url, title);
}

async function castLatestCapture() {
  const latestCapture = state.captures[0];
  if (!latestCapture) {
    showToast("当前还没有可投屏的 m3u8 记录。", true);
    return;
  }

  await castCapture(latestCapture);
}

async function castCapture(capture) {
  applyCapture(capture);
  await castUrl(capture.url, capture.pageTitle || "M3U8 投屏");
}

function applyCapture(capture) {
  elements.manualUrl.value = capture.url;
  elements.manualTitle.value = capture.pageTitle || "M3U8 投屏";
  showToast("已填入当前链接。");
}

async function castUrl(url, title) {
  if (!/^https?:\/\//i.test(url)) {
    showToast("投屏地址必须是 http 或 https 链接。", true);
    return;
  }

  let settings = await saveSettings({ showNotice: false });
  if (!settings.controlUrl && settings.descriptionUrl) {
    try {
      const resolved = await resolveDlnaDevice(settings.descriptionUrl);
      settings = {
        ...settings,
        controlUrl: resolved.controlUrl,
        friendlyName: settings.friendlyName || resolved.friendlyName || "",
        lastResolvedAt: new Date().toISOString(),
      };

      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
      state.settings = settings;
      renderSettings();
    } catch (error) {
      showToast(`自动解析设备失败：${error.message}`, true);
      return;
    }
  }

  if (!settings.controlUrl) {
    showToast("请先配置电视的 AVTransport 控制地址。", true);
    return;
  }

  try {
    await sendDlnaAction(settings.controlUrl, "SetAVTransportURI", createSetUriPayload(url, title));
    await delay(300);
    await sendDlnaAction(settings.controlUrl, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>");
    showToast(`已推送到 ${settings.friendlyName || "小米电视"}。`);
  } catch (error) {
    showToast(`投屏失败：${error.message}`, true);
  }
}

async function clearCaptures() {
  const response = await chrome.runtime.sendMessage({ type: "clearCaptures" });
  if (!response?.ok) {
    showToast(response?.error || "清空记录失败。", true);
    return;
  }

  state.captures = [];
  renderCaptures();
  showToast("捕获记录已清空。");
}

async function deleteCapture(captureId) {
  const response = await chrome.runtime.sendMessage({ type: "deleteCapture", id: captureId });
  if (!response?.ok) {
    showToast(response?.error || "删除记录失败。", true);
    return;
  }

  state.captures = state.captures.filter((item) => item.id !== captureId);
  renderCaptures();
  showToast("记录已删除。");
}

async function copyCurrentUrl() {
  const url = elements.manualUrl.value.trim();
  if (!url) {
    showToast("当前没有可复制的链接。", true);
    return;
  }

  await copyText(url, "链接已复制。");
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch (_error) {
    showToast("复制失败，请检查浏览器权限。", true);
  }
}

async function resolveDlnaDevice(descriptionUrl) {
  let response;
  try {
    response = await fetch(descriptionUrl, { method: "GET" });
  } catch (_error) {
    throw new Error("无法访问设备描述地址，请确认电视与电脑在同一局域网。");
  }

  if (!response.ok) {
    throw new Error(`设备描述地址返回 ${response.status}。`);
  }

  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const friendlyName = getFirstNodeText(doc, "friendlyName");

  const serviceNodes = Array.from(doc.getElementsByTagName("service"));
  const avTransportNode = serviceNodes.find((serviceNode) => {
    const serviceType = getFirstNodeText(serviceNode, "serviceType");
    return /AVTransport/i.test(serviceType);
  });

  if (!avTransportNode) {
    throw new Error("没有在设备描述里找到 AVTransport 服务。");
  }

  const controlPath = getFirstNodeText(avTransportNode, "controlURL");
  if (!controlPath) {
    throw new Error("设备描述里缺少 controlURL。");
  }

  const urlBase = getFirstNodeText(doc, "URLBase");
  const controlUrl = new URL(controlPath, urlBase || descriptionUrl).toString();

  return {
    controlUrl,
    friendlyName,
  };
}

async function sendDlnaAction(controlUrl, action, innerXml) {
  const serviceType = "urn:schemas-upnp-org:service:AVTransport:1";
  const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${serviceType}">
      ${innerXml}
    </u:${action}>
  </s:Body>
</s:Envelope>`;

  let response;
  try {
    response = await fetch(controlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${serviceType}#${action}"`,
      },
      body,
    });
  } catch (_error) {
    throw new Error("无法连接电视控制地址，请确认 DLNA/米联 已开启。");
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(readSoapError(responseText) || `控制接口返回 ${response.status}。`);
  }

  const soapError = readSoapError(responseText);
  if (soapError) {
    throw new Error(soapError);
  }
}

function createSetUriPayload(url, title) {
  const safeTitle = escapeXml(title || "M3U8 投屏");
  const safeUrl = escapeXml(url);
  const metadata = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${safeTitle}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:application/vnd.apple.mpegurl:*">${safeUrl}</res></item></DIDL-Lite>`;

  return `
    <InstanceID>0</InstanceID>
    <CurrentURI><![CDATA[${sanitizeCdata(url)}]]></CurrentURI>
    <CurrentURIMetaData><![CDATA[${sanitizeCdata(metadata)}]]></CurrentURIMetaData>
  `;
}

function readSoapError(xmlText) {
  if (!xmlText) {
    return "";
  }

  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  return (
    getFirstNodeText(doc, "faultstring") ||
    getFirstNodeText(doc, "errorDescription") ||
    ""
  );
}

function getFirstNodeText(root, tagName) {
  const node = root.getElementsByTagName(tagName)[0];
  return node?.textContent?.trim() || "";
}

function sanitizeCdata(value) {
  return String(value).replaceAll("]]>", "]]]]><![CDATA[>");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}

function getCaptureSubtitle(capture) {
  const host = safeHost(capture.pageUrl);
  const contentType = capture.contentType ? ` · ${capture.contentType}` : "";
  return `${formatTime(capture.detectedAt)} · ${host}${contentType}`;
}

function safeHost(rawUrl) {
  try {
    return new URL(rawUrl).host || rawUrl || "未知来源";
  } catch (_error) {
    return rawUrl || "未知来源";
  }
}

function formatTime(isoString) {
  if (!isoString) {
    return "--";
  }

  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("visible", true);
  elements.toast.classList.toggle("error", isError);

  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}
