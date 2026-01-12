// Content Script: 检测视频并注入预览按钮

console.log("[Video Preview] Content script loaded");

const OBSERVED_VIDEOS = new WeakSet<HTMLVideoElement>();

function init() {
  // Policy Compliance: Block YouTube
  if (
    window.location.hostname.includes("youtube.com") ||
    window.location.hostname.includes("youtu.be")
  ) {
    console.log(
      "[Video Preview] YouTube is disabled due to Web Store policies."
    );
    return;
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.tagName === "VIDEO") {
            attachButton(node as HTMLVideoElement);
          } else {
            const videos = node.querySelectorAll("video");
            videos.forEach(attachButton);
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check
  document.querySelectorAll("video").forEach(attachButton);
}

function attachButton(video: HTMLVideoElement) {
  if (OBSERVED_VIDEOS.has(video)) return;
  OBSERVED_VIDEOS.add(video);

  // 包装容器以便定位
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.top = "10px";
  container.style.right = "10px";
  container.style.zIndex = "99999";
  container.style.pointerEvents = "auto";

  // Shadow DOM 防止样式污染
  const shadow = container.attachShadow({ mode: "open" });

  const button = document.createElement("button");
  button.innerText = "生成预览 ⇲";

  // Basic styles - "Premium" look (Glassmorphismish)
  const style = document.createElement("style");
  style.textContent = `
    button {
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      padding: 6px 12px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    button:hover {
      background: rgba(255, 255, 255, 0.9);
      color: black;
      transform: translateY(-1px);
    }
  `;

  button.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlePreview(video);
  };

  shadow.appendChild(style);
  shadow.appendChild(button);

  // Position logic is tricky.
  // If video has a parent that is relatively positioned, absolute works.
  // But often video is inside complex players.
  // We'll try to append to video's parent if possible, or overlay specifically.
  // For now, let's append to video.parentNode and hope it's positioned.
  // If not, we might need to force position relative on parent? No, that breaks layout.
  // Safer: Append to body and use getBoundingClientRect() loop (expensive)?
  // Or: Insert adjacent to video and use strict absolute positioning logic?

  // 简单的处理方式：视频父级通常是视频的框架。
  const parent = video.parentElement;
  if (parent) {
    // Ensure parent handles absolute children if it doesn't already
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === "static") {
      // Warning: Changing this might break things.
      // Let's try to just use offsetTop/Left relative to generic offsetParent
      // For simple generic videos this works.
      // For YouTube, it injects into the player container usually.
      parent.style.position = "relative";
    }
    parent.appendChild(container);
  }
}

function handlePreview(video: HTMLVideoElement) {
  let src = video.currentSrc || video.src;
  if (!src) return;

  chrome.runtime.sendMessage({ type: "OPEN_PREVIEW", url: src });
}

// 确保 body 存在再初始化
if (document.body) {
  init();
} else {
  window.addEventListener("DOMContentLoaded", init);
}
