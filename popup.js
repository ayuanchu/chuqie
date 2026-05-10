const STORAGE_KEYS = {
  captures: "captures",
  settings: "settings",
};

const DEFAULT_SETTINGS = {
  descriptionUrl: "",
  controlUrl: "",
  friendlyName: "",
  lastResolvedAt: "",
  scanSubnet: "",
};

const SCAN_PORTS = [80, 49152, 49153, 49154, 49155, 6095];
const SCAN_PATHS = ["/description.xml", "/rootDesc.xml"];
const SCAN_TIMEOUT_MS = 450;
const SCAN_CONCURRENCY = 64;

const state = {
  captures: [],
  settings: { ...DEFAULT_SETTINGS },
  discoveredDevices: [],
  scanning: false,
  scanProgress: "",
  activeScanId: 0,
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
  elements.scanSubnet = document.getElementById("scanSubnet");
  elements.scanStatus = document.getElementById("scanStatus");
  elements.discoveredList = document.getElementById("discoveredList");
  elements.scanDevicesButton = document.getElementById("scanDevicesButton");
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

  document.getElementById("scanDevicesButton").addEventListener("click", () => {
    void scanDevices();
  });

  document.getElementById("guessSubnetButton").addEventListener("click", () => {
    applyGuessedSubnet();
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

  elements.discoveredList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-device-action]");
    if (!button) {
      return;
    }

    const deviceId = button.dataset.deviceId;
    const action = button.dataset.deviceAction;
    const device = state.discoveredDevices.find((item) => item.id === deviceId);

    if (!device) {
      showToast("这台设备已经不在当前扫描结果里了。", true);
      return;
    }

    if (action === "use") {
      void applyDiscoveredDevice(device, false);
      return;
    }

    if (action === "cast") {
      void applyDiscoveredDevice(device, true);
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
  renderDiscoveredDevices();
}

function renderSettings() {
  elements.descriptionUrl.value = state.settings.descriptionUrl || "";
  elements.controlUrl.value = state.settings.controlUrl || "";
  elements.friendlyName.value = state.settings.friendlyName || "";
  elements.scanSubnet.value = state.settings.scanSubnet || guessScanSubnet(state.settings);

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

function renderDiscoveredDevices() {
  const scanningText = state.scanning ? state.scanProgress || "正在扫描，请稍候..." : "";
  const readyText = state.discoveredDevices.length
    ? `发现 ${state.discoveredDevices.length} 台可投屏设备。`
    : "将扫描输入网段下的常见 DLNA 端口和描述地址。";

  elements.scanDevicesButton.disabled = state.scanning;
  elements.scanDevicesButton.textContent = state.scanning ? "扫描中..." : "扫描设备";
  elements.scanStatus.textContent = scanningText || readyText;

  if (state.scanning && !state.discoveredDevices.length) {
    elements.discoveredList.className = "capture-list empty";
    elements.discoveredList.innerHTML = `
      <div class="empty-state">
        <strong>正在扫描局域网设备</strong>
        <p>${escapeHtml(state.scanProgress || "会优先尝试常见的 DLNA 描述地址。")}</p>
      </div>
    `;
    return;
  }

  if (!state.discoveredDevices.length) {
    elements.discoveredList.className = "capture-list empty";
    elements.discoveredList.innerHTML = `
      <div class="empty-state">
        <strong>还没有扫描到设备</strong>
        <p>如果没扫到，请把网段改成你的局域网前缀，例如 192.168.0、192.168.1 或 192.168.31。</p>
      </div>
    `;
    return;
  }

  elements.discoveredList.className = "capture-list";
  elements.discoveredList.innerHTML = state.discoveredDevices
    .map((device) => {
      const title = escapeHtml(device.friendlyName || `设备 ${device.ip}`);
      const detail = escapeHtml([device.manufacturer, device.modelName].filter(Boolean).join(" · ") || "已识别为可投屏设备");
      const line2 = escapeHtml(`${device.ip}:${device.port} · ${device.path}`);
      const badge = device.isLikelyTv ? "电视" : "DLNA";

      return `
        <article class="capture-card">
          <div class="capture-card-head">
            <div>
              <h3>${title}</h3>
              <p>${detail}</p>
              <p class="scan-extra">${line2}</p>
            </div>
            <span class="capture-tag">${badge}</span>
          </div>
          <code class="capture-url">${escapeHtml(device.descriptionUrl)}</code>
          <div class="actions compact">
            <button type="button" data-device-action="use" data-device-id="${device.id}">设为当前设备</button>
            <button type="button" data-device-action="cast" data-device-id="${device.id}">用它投屏</button>
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
    scanSubnet: normalizeScanSubnet(elements.scanSubnet.value) || state.settings.scanSubnet || "",
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
      ...state.settings,
      descriptionUrl,
      controlUrl: resolved.controlUrl,
      friendlyName: resolved.friendlyName || elements.friendlyName.value.trim(),
      lastResolvedAt: new Date().toISOString(),
      scanSubnet: normalizeScanSubnet(elements.scanSubnet.value) || state.settings.scanSubnet || guessScanSubnet({
        descriptionUrl,
      }),
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
    showToast(`已推送到 ${settings.friendlyName || "电视设备"}。`);
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

async function applyDiscoveredDevice(device, castImmediately) {
  elements.descriptionUrl.value = device.descriptionUrl;
  elements.controlUrl.value = device.controlUrl;
  elements.friendlyName.value = device.friendlyName || elements.friendlyName.value;
  elements.scanSubnet.value = normalizeScanSubnet(device.ip) || elements.scanSubnet.value;

  state.settings = {
    ...state.settings,
    descriptionUrl: device.descriptionUrl,
    controlUrl: device.controlUrl,
    friendlyName: device.friendlyName || state.settings.friendlyName,
    lastResolvedAt: new Date().toISOString(),
    scanSubnet: normalizeScanSubnet(device.ip) || state.settings.scanSubnet,
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
  renderSettings();

  if (!castImmediately) {
    showToast(`已选中 ${device.friendlyName || device.ip}。`);
    return;
  }

  const url = elements.manualUrl.value.trim() || state.captures[0]?.url || "";
  const title = elements.manualTitle.value.trim() || state.captures[0]?.pageTitle || "M3U8 投屏";

  if (!url) {
    showToast("设备已选中，请先填入或捕获一个 m3u8 链接。", true);
    return;
  }

  await castUrl(url, title);
}

async function scanDevices() {
  if (state.scanning) {
    return;
  }

  const scanSubnet = normalizeScanSubnet(elements.scanSubnet.value);
  if (!scanSubnet) {
    showToast("请输入类似 192.168.1 的网段前缀。", true);
    return;
  }

  elements.scanSubnet.value = scanSubnet;
  state.settings.scanSubnet = scanSubnet;
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });

  const scanId = Date.now();
  state.activeScanId = scanId;
  state.scanning = true;
  state.discoveredDevices = [];
  state.scanProgress = `正在扫描 ${scanSubnet}.0/24 ...`;
  renderDiscoveredDevices();

  try {
    const devices = await discoverDevicesOnSubnet(scanSubnet, scanId);
    if (state.activeScanId !== scanId) {
      return;
    }

    state.discoveredDevices = devices;
    state.scanning = false;
    state.scanProgress = devices.length
      ? `扫描完成，发现 ${devices.length} 台可投屏设备。`
      : `扫描完成，在 ${scanSubnet}.0/24 没找到可识别设备。`;
    renderDiscoveredDevices();

    if (devices.length) {
      showToast(`已发现 ${devices.length} 台设备。`);
    } else {
      showToast("没有扫描到设备，请尝试修改网段后重试。", true);
    }
  } catch (error) {
    if (state.activeScanId !== scanId) {
      return;
    }

    state.scanning = false;
    state.scanProgress = "";
    renderDiscoveredDevices();
    showToast(error.message || "扫描失败。", true);
  }
}

function applyGuessedSubnet() {
  const guessed = guessScanSubnet(state.settings);
  elements.scanSubnet.value = guessed;
  showToast(`已填入猜测网段：${guessed}`);
}

async function discoverDevicesOnSubnet(scanSubnet, scanId) {
  const lastKnownHost = getHostFromUrl(state.settings.descriptionUrl) || getHostFromUrl(state.settings.controlUrl);
  const preferredLastOctet = getLastOctetIfSameSubnet(lastKnownHost, scanSubnet);
  const candidates = buildDescriptionCandidates(scanSubnet, preferredLastOctet);

  let completed = 0;
  const found = [];
  let index = 0;

  const workers = Array.from({ length: Math.min(SCAN_CONCURRENCY, candidates.length) }, async () => {
    while (index < candidates.length) {
      if (state.activeScanId !== scanId) {
        return;
      }

      const candidate = candidates[index];
      index += 1;

      const device = await probeDescriptionCandidate(candidate);
      completed += 1;

      if (device) {
        found.push(device);
        state.discoveredDevices = dedupeDevices(found);
      }

      if (completed === 1 || completed % 64 === 0 || device) {
        const uniqueCount = state.discoveredDevices.length;
        state.scanProgress = `已探测 ${completed}/${candidates.length} 个地址，发现 ${uniqueCount} 台设备。`;
        renderDiscoveredDevices();
      }
    }
  });

  await Promise.all(workers);

  const dedupedDevices = dedupeDevices(found);
  dedupedDevices.sort((left, right) => {
    if (left.isLikelyTv !== right.isLikelyTv) {
      return left.isLikelyTv ? -1 : 1;
    }

    return left.ip.localeCompare(right.ip, undefined, { numeric: true });
  });

  return dedupedDevices;
}

function buildDescriptionCandidates(scanSubnet, preferredLastOctet) {
  const hostOrder = buildHostOrder(preferredLastOctet);
  const urls = new Set();
  const candidates = [];

  for (const lastOctet of hostOrder) {
    const ip = `${scanSubnet}.${lastOctet}`;

    for (const port of SCAN_PORTS) {
      for (const path of SCAN_PATHS) {
        const descriptionUrl = `http://${ip}:${port}${path}`;
        if (urls.has(descriptionUrl)) {
          continue;
        }

        urls.add(descriptionUrl);
        candidates.push({ ip, port, path, descriptionUrl });
      }
    }
  }

  return candidates;
}

function buildHostOrder(preferredLastOctet) {
  const hosts = [];

  if (Number.isInteger(preferredLastOctet) && preferredLastOctet >= 2 && preferredLastOctet <= 254) {
    hosts.push(preferredLastOctet);
  }

  for (let current = 2; current <= 254; current += 1) {
    if (current !== preferredLastOctet) {
      hosts.push(current);
    }
  }

  return hosts;
}

async function probeDescriptionCandidate(candidate) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(candidate.descriptionUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    return parseDlnaDescriptionXml(text, response.url || candidate.descriptionUrl, candidate);
  } catch (_error) {
    return null;
  } finally {
    window.clearTimeout(timerId);
  }
}

async function resolveDlnaDevice(descriptionUrl) {
  let response;
  try {
    response = await fetch(descriptionUrl, { method: "GET", cache: "no-store" });
  } catch (_error) {
    throw new Error("无法访问设备描述地址，请确认电视与电脑在同一局域网。");
  }

  if (!response.ok) {
    throw new Error(`设备描述地址返回 ${response.status}。`);
  }

  const xml = await response.text();
  const device = parseDlnaDescriptionXml(xml, response.url || descriptionUrl);
  if (!device) {
    throw new Error("没有在设备描述里找到 AVTransport 服务。");
  }

  return {
    controlUrl: device.controlUrl,
    friendlyName: device.friendlyName,
  };
}

function parseDlnaDescriptionXml(xmlText, descriptionUrl, candidate = {}) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    return null;
  }

  const serviceNodes = Array.from(doc.getElementsByTagName("service"));
  const avTransportNode = serviceNodes.find((serviceNode) => {
    const serviceType = getFirstNodeText(serviceNode, "serviceType");
    return /AVTransport/i.test(serviceType);
  });

  if (!avTransportNode) {
    return null;
  }

  const controlPath = getFirstNodeText(avTransportNode, "controlURL");
  if (!controlPath) {
    return null;
  }

  const deviceNode = findAncestorByNodeName(avTransportNode, "device");
  const baseUrl = getFirstNodeText(doc, "URLBase") || descriptionUrl;
  const controlUrl = new URL(controlPath, baseUrl).toString();
  const friendlyName = getFirstNodeText(deviceNode || doc, "friendlyName");
  const manufacturer = getFirstNodeText(deviceNode || doc, "manufacturer");
  const modelName = getFirstNodeText(deviceNode || doc, "modelName");
  const deviceType = getFirstNodeText(deviceNode || doc, "deviceType");
  const host = getHostFromUrl(descriptionUrl);
  const ip = candidate.ip || host;
  const port = candidate.port || Number(new URL(descriptionUrl).port || 80);
  const path = candidate.path || new URL(descriptionUrl).pathname;

  return {
    id: createStableDeviceId(controlUrl || descriptionUrl),
    descriptionUrl,
    controlUrl,
    friendlyName,
    manufacturer,
    modelName,
    deviceType,
    ip,
    port,
    path,
    isLikelyTv: isLikelyTelevision([friendlyName, manufacturer, modelName, deviceType].join(" ")),
  };
}

function dedupeDevices(devices) {
  const map = new Map();

  for (const device of devices) {
    const key = device.controlUrl || device.descriptionUrl || `${device.friendlyName}|${device.ip}`;
    if (!map.has(key)) {
      map.set(key, device);
    }
  }

  return Array.from(map.values());
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
  return getFirstNodeText(doc, "faultstring") || getFirstNodeText(doc, "errorDescription") || "";
}

function applyGuessedSubnetToState() {
  state.settings.scanSubnet = guessScanSubnet(state.settings);
}

function guessScanSubnet(settings) {
  const host = getHostFromUrl(settings.descriptionUrl) || getHostFromUrl(settings.controlUrl);
  const normalized = normalizeScanSubnet(host);
  if (normalized) {
    return normalized;
  }

  return "192.168.1";
}

function normalizeScanSubnet(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  let host = rawValue;
  if (/^https?:\/\//i.test(rawValue)) {
    try {
      host = new URL(rawValue).hostname;
    } catch (_error) {
      return "";
    }
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts.every((part) => part >= 0 && part <= 255)) {
      return parts.slice(0, 3).join(".");
    }
  }

  const prefixMatch = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (prefixMatch) {
    const parts = prefixMatch.slice(1).map(Number);
    if (parts.every((part) => part >= 0 && part <= 255)) {
      return parts.join(".");
    }
  }

  return "";
}

function getHostFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname || "";
  } catch (_error) {
    return "";
  }
}

function getLastOctetIfSameSubnet(host, scanSubnet) {
  if (!host || !scanSubnet) {
    return null;
  }

  const normalizedHostSubnet = normalizeScanSubnet(host);
  if (normalizedHostSubnet !== scanSubnet) {
    return null;
  }

  const parts = host.split(".");
  const lastOctet = Number(parts[3]);
  return Number.isInteger(lastOctet) ? lastOctet : null;
}

function isLikelyTelevision(text) {
  return /(tv|电视|小米|redmi|mi tv|bravia|sony|samsung|lg|hisense|tcl|skyworth|海信|创维|长虹|康佳|飞利浦|sharp|xiaomi)/i.test(
    text,
  );
}

function createStableDeviceId(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `device-${hash.toString(16)}`;
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

function getFirstNodeText(root, tagName) {
  if (!root) {
    return "";
  }

  const node = root.getElementsByTagName(tagName)[0];
  return node?.textContent?.trim() || "";
}

function findAncestorByNodeName(node, nodeName) {
  let current = node?.parentNode || null;

  while (current) {
    if (String(current.nodeName).toLowerCase() === nodeName.toLowerCase()) {
      return current;
    }
    current = current.parentNode;
  }

  return null;
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

applyGuessedSubnetToState();
