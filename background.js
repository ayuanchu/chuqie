const CAPTURE_LIMIT = 80;
const CAPTURE_TTL_MS = 2 * 60 * 1000;
const STORAGE_KEYS = {
  captures: "captures",
  settings: "settings",
};

const recentCaptureMap = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "clear-m3u8-captures",
      title: "清空已捕获的 m3u8 链接",
      contexts: ["action"],
    });
  });

  const { [STORAGE_KEYS.captures]: captures = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.captures,
  );
  await updateBadge(captures.length);
});

chrome.runtime.onStartup.addListener(async () => {
  const { [STORAGE_KEYS.captures]: captures = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.captures,
  );
  await updateBadge(captures.length);
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "clear-m3u8-captures") {
    await chrome.storage.local.set({ [STORAGE_KEYS.captures]: [] });
    recentCaptureMap.clear();
    await updateBadge(0);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "deleteCapture") {
    deleteCapture(message.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "clearCaptures") {
    chrome.storage.local
      .set({ [STORAGE_KEYS.captures]: [] })
      .then(() => {
        recentCaptureMap.clear();
        return updateBadge(0);
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!details.url || !isPotentialM3u8Url(details.url)) {
      return;
    }

    void captureRequest({
      url: details.url,
      source: "webRequest",
      tabId: details.tabId,
      pageUrl: details.initiator || details.documentUrl || "",
      requestType: details.type,
    });
  },
  { urls: ["<all_urls>"] },
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const contentType = getHeaderValue(details.responseHeaders, "content-type");
    if (!isM3u8ContentType(contentType)) {
      return;
    }

    void captureRequest({
      url: details.url,
      source: "headers",
      tabId: details.tabId,
      pageUrl: details.initiator || details.documentUrl || "",
      requestType: details.type,
      contentType,
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

async function captureRequest(entry) {
  const normalizedUrl = normalizeUrl(entry.url);
  const dedupeKey = `${entry.tabId}|${normalizedUrl}`;
  const now = Date.now();

  pruneRecentCaptureMap(now);
  if (recentCaptureMap.has(dedupeKey)) {
    return;
  }

  recentCaptureMap.set(dedupeKey, now);

  const tabMeta = await getTabMeta(entry.tabId);
  const capture = {
    id: `${now}-${Math.random().toString(16).slice(2, 10)}`,
    url: normalizedUrl,
    pageUrl: entry.pageUrl || tabMeta.url || "",
    pageTitle: tabMeta.title || "",
    source: entry.source,
    contentType: entry.contentType || "",
    requestType: entry.requestType || "",
    tabId: Number.isInteger(entry.tabId) ? entry.tabId : -1,
    detectedAt: new Date(now).toISOString(),
  };

  const { [STORAGE_KEYS.captures]: currentCaptures = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.captures,
  );

  const nextCaptures = [capture, ...currentCaptures.filter((item) => item.url !== normalizedUrl)].slice(
    0,
    CAPTURE_LIMIT,
  );

  await chrome.storage.local.set({ [STORAGE_KEYS.captures]: nextCaptures });
  await updateBadge(nextCaptures.length);
}

async function deleteCapture(id) {
  const { [STORAGE_KEYS.captures]: currentCaptures = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.captures,
  );
  const nextCaptures = currentCaptures.filter((item) => item.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.captures]: nextCaptures });
  await updateBadge(nextCaptures.length);
}

async function updateBadge(count) {
  const badgeText = count > 0 ? String(Math.min(count, 99)) : "";
  await chrome.action.setBadgeBackgroundColor({ color: "#cc5b2b" });
  await chrome.action.setBadgeText({ text: badgeText });
}

function pruneRecentCaptureMap(now) {
  for (const [key, timestamp] of recentCaptureMap.entries()) {
    if (now - timestamp > CAPTURE_TTL_MS) {
      recentCaptureMap.delete(key);
    }
  }
}

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.toString();
  } catch (_error) {
    return rawUrl;
  }
}

function isPotentialM3u8Url(url) {
  return /\.m3u8($|[?#])/i.test(url) || /(?:^|[?&=/._-])m3u8(?:$|[?&=/._-])/i.test(url);
}

function isM3u8ContentType(contentType) {
  if (!contentType) {
    return false;
  }

  return /(application\/vnd\.apple\.mpegurl|application\/x-mpegurl|audio\/mpegurl)/i.test(contentType);
}

function getHeaderValue(headers, targetName) {
  if (!Array.isArray(headers)) {
    return "";
  }

  const header = headers.find((item) => item?.name?.toLowerCase() === targetName);
  return header?.value || "";
}

async function getTabMeta(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return {};
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    return {
      title: tab.title || "",
      url: tab.url || "",
    };
  } catch (_error) {
    return {};
  }
}
