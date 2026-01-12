# 🎞️ Video Preview Generator

一个运行在浏览器端的视频九宫格预览生成器。

本插件完全基于前端技术栈（React + FFmpeg WASM）构建，利用 WebAssembly 在本地进行视频帧提取与合成，**无需上传视频，保护隐私，且完全免费**。

## ✨ 功能特性

- **本地处理**: 使用 FFmpeg WASM 在浏览器内部解码，不消耗服务器资源，不上传用户数据。
- **支持广泛**: 支持普通 MP4 直链及 **HLS (.m3u8)** 流媒体视频。
- **智能合成**: 自动提取视频中均匀分布的 9 个关键帧，生成 3x3 九宫格预览图。
- **高度自定义**:
  - 支持自定义背景颜色。
  - 自动添加时间戳水印。
  - 美观的 UI 设计。
- **安全合规**: 严格遵守 Chrome 网上应用店政策（已屏蔽 YouTube）。

## 🚀 安装指南

### 方式一：加载已解压的扩展程序（开发者模式）

1.  下载本项目源码或 Release 压缩包并解压。
2.  在 Chrome 地址栏输入 `chrome://extensions`。
3.  开启右上角的 **"开发者模式" (Developer mode)**。
4.  点击左上角的 **"加载已解压的扩展程序" (Load unpacked)**。
5.  选择项目中的 `dist` 文件夹即可。

### 方式二：打包安装

如果你需要分享给朋友或发布：

1.  运行 `pnpm run pack`。
2.  生成的 `video-preview.zip` 文件可直接提交至 Chrome Web Store，或发给朋友解压安装。

## 🛠️ 虽然开发

```bash
# 安装依赖
pnpm install

# 启动本地开发服务器 (仅调试 UI)
pnpm dev

# 构建生产版本 (输出到 dist/)
pnpm build

# 打包为 ZIP (用于发布)
pnpm run pack
```

## 📝 注意事项

- **YouTube 支持**: 由于 Chrome Web Store 政策限制，本插件**无法**在 YouTube 上使用。
- **WASM 加载**: 首次运行时会自动加载 FFmpeg 核心文件（约 25MB），之后将永久缓存，离线可用。

## 📄 License

MIT
