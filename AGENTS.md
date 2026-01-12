# Project Overview

**Video Preview Extension** 是一个 Chrome 浏览器扩展，用于在网页视频旁生成九宫格预览图。它完全在前端（浏览器环境）运行，利用 WebAssembly 版本的 FFmpeg 进行视频帧提取。

## 🛠 Tech Stack

- **Core**: React 19, TypeScript, Vite
- **Extension Framework**: Manifest V3
- **Video Processing**: `@ffmpeg/ffmpeg` (WASM), `@ffmpeg/core` (MT), `@ffmpeg/util`
- **Styling**: Vanilla CSS (Scoped in `App.css`, no global `index.css` layout styles)
- **Package Manager**: pnpm

## 📂 Project Structure

```
/src
  /assets         # Static assets (icons, WASM files via static-copy)
  /background     # [Service Worker] Handles Network Sniffing & Proxy Fetching
  /content        # [Content Script] Injects UI & Detects Video Source
  /hooks          # React Hooks (Core Logic)
    useFFmpeg.ts  # Main FFmpeg controller (Loading, Processing, M3U8 logic)
  /utils
    m3u8.ts       # M3U8 Playlist Parser & Segment/Time Mapper
  App.tsx         # Main Extension Popup UI
  main.tsx        # React Entry Point
  manifest.json   # Chrome Extension Config
vite.config.ts    # Bundling & Server Headers (COOP/COEP)
```

## 🧠 Key Implementation Details

### 1. FFmpeg WASM Integration

- **Cross-Origin Isolation**: 必须在 `vite.config.ts` 配置 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp` 以启用 `SharedArrayBuffer`。
- **Asset Loading Strategy**:
  - **Extension Mode**: 使用 `chrome.runtime.getURL` 加载 `assets/ffmpeg-core.js` (为了符合 CSP)。
  - **Dev Mode**: 使用 `@ffmpeg/util` 的 `toBlobURL` 加载 (避免本地文件协议问题)。

### 2. M3U8 / HLS Support

由于 FFmpeg WASM 不支持直接通过网络请求拉取 HLS 流（受限于浏览器 CORS 和 Socket 能力），我们采用了 **"Manual Segment Fetching"** 策略：

1.  **Parse**: 解析 `.m3u8` 文件，获取分片列表和时长。
2.  **Map**: 计算目标时间点对应的 `.ts` 分片。
3.  **Fetch**: 下载特定分片到内存 (ArrayBuffer)。
4.  **Write**: 写入 MEMFS (`ffmpeg.writeFile`).
5.  **Extract**: 对该分片执行 `ffmpeg.exec` 提取帧。

### 3. Network & CORS Handling

- **Blob URL Issue**: 现代视频网站 (Bilibili/YouTube) 使用 Blob URL，无法直接传递给 FFmpeg。
- **Solution - Sniffing**: `background/index.ts` 监听 `webRequest`，捕获真实的 `.m3u8` 或媒体地址。
- **Solution - Proxy Fetch**: 扩展页面 (Extension Page) 默认受 CORS 限制。所有资源请求 (`m3u8` playlist, `.ts` segments) **必须** 通过 `chrome.runtime.sendMessage({ type: "FETCH_RESOURCE" })` 发送到后台脚本。后台脚本拥有 Host Permissions，可绕过 CORS 下载数据并以 Base64 返回。

### 4. Stability & Performance

- **Memory Optimization**:
  - **Downscaling**: 提取时强制缩放 `-vf scale=480:-1`，大幅降低内存占用，防止 WASM OOM (Out of Memory)。
  - **No Audio**: 使用 `-an` 禁用音频处理。
  - **Immediate Cleanup**: 处理完一个分片后立即 `deleteFile`。
- **Robust Seeking**:
  - **Output Seeking**: 使用 `-i input -ss time` (Output Seeking) 而非 Input Seeking，确保在只有部分关键帧的 MPEG-TS 分片中能精准定位画面。
  - **Fallback**: 如果定位失败，自动重试截取分片首帧 (`00:00:00`)。

## 📝 Conventions & Rules

1.  **Language**: 文档、注释、UI 文本统一使用 **中文**。
2.  **CSS**:
    - 严禁在 `index.css` 或 `body` 中设置全局布局属性 (如 `display: flex`)，这会破坏 iframe/window 布局。
    - 所有样式尽量写在 `App.css` 并使用特定类名。
3.  **Error Handling**:必须向用户展示明确的错误信息（如区分 "Blob 不支持" 和 "网络错误"）。

## 🚀 Commands

- `pnpm dev`: 启动本地开发服务器 (支持模拟 WASM 环境)。
- `pnpm build`: 构建生产版本 (输出到 `dist/`)。
- `pnpm preview`: 预览构建产物。
