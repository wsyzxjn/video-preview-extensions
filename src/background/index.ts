// Background Script: 处理消息和标签页管理

// 存储每个标签页最近检测到的视频 URL
const tabVideoMap = new Map<number, string>();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (
      details.type === "media" ||
      details.url.includes(".m3u8") ||
      details.url.includes(".mp4")
    ) {
      if (details.tabId >= 0) {
        tabVideoMap.set(details.tabId, details.url);
      }
    }

    return undefined;
  },
  { urls: ["<all_urls>"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_PREVIEW") {
    let videoUrl = message.url;
    const tabId = sender.tab?.id;

    // 如果页面传来的是 blob，尝试用我们嗅探到的真实 URL 替换
    if (videoUrl.startsWith("blob:") && tabId && tabVideoMap.has(tabId)) {
      const sniffedUrl = tabVideoMap.get(tabId);
      if (sniffedUrl) {
        console.log(
          "[Video Preview] Replaced Blob URL with Sniffed URL:",
          sniffedUrl
        );
        videoUrl = sniffedUrl;
      }
    }

    const previewPageUrl =
      chrome.runtime.getURL("index.html") +
      `?video=${encodeURIComponent(videoUrl)}`;

    chrome.tabs.create({ url: previewPageUrl });
    sendResponse({ success: true });
  } else if (message.type === "FETCH_RESOURCE") {
    // Proxy fetch through background to bypass CORS
    (async () => {
      try {
        const response = await fetch(message.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();

        // Convert blob to base64 to pass back to the extension page
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, data: reader.result }); // reader.result is data:url
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: "Failed to read blob" });
        };
        reader.readAsDataURL(blob);
      } catch (error: any) {
        console.error("[Proxy Fetch Error]", error);
        sendResponse({ success: false, error: error.message || String(error) });
      }
    })();
    return true; // Keep channel open for async response
  }
  return true; // Keep channel open
});

console.log(
  "[Video Preview] Background service worker registered with Sniffer"
);
