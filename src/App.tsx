import { useEffect, useRef, useState } from "react";
import { useFFmpeg } from "./hooks/useFFmpeg";
import "./App.css";

function App() {
  const { status, progress, frames, processVideo, errorMessage } = useFFmpeg();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("video");
    if (url) {
      setVideoUrl(url);
      processVideo(url);
    }
  }, []); // Run once on mount

  const downloadMerged = async () => {
    if (frames.length === 0 || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Assuming frames are loaded in the browser as blobs, we need to draw them.
    // We already have URLs.
    // 3x3 Grid.
    // Let's assume each frame is same size. We'll pick a target size, e.g., 320x180 per cell.
    // Updated params based on Go reference
    const cellW = 320;
    const cellH = 180; // Keeping 16:9 ratio for 320 width
    const margin = 8;

    // Calculate total size with margins
    // Width = (cols * cellW) + ((cols + 1) * margin)
    // Height = (rows * cellH) + ((rows + 1) * margin)
    canvas.width = 3 * cellW + 4 * margin;
    canvas.height = 3 * cellH + 4 * margin;

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const images = await Promise.all(frames.map((f) => loadImage(f.url)));

    images.forEach((img, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);

      const x = margin + col * (cellW + margin);
      const y = margin + row * (cellH + margin);

      ctx.drawImage(img, x, y, cellW, cellH);
    });

    // Download
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `preview-grid-${Date.now()}.jpg`;
    a.click();
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>🎞️ 视频预览生成器</h1>
        {status !== "idle" && (
          <span className={`status-badge ${status}`}>
            {status.toUpperCase()}
          </span>
        )}
      </header>

      <main className="content">
        {!videoUrl && (
          <div className="empty-state">
            <p>未选择视频。请在网页视频旁点击“生成预览”按钮。</p>
          </div>
        )}

        {videoUrl && (
          <div className="preview-area">
            <div className="video-info">
              <p className="url-text" title={videoUrl}>
                来源: {videoUrl}
              </p>
            </div>

            {["loading_wasm", "downloading", "processing"].includes(status) && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="progress-text">
                  {status === "processing"
                    ? `正在提取帧... ${Math.round(progress)}%`
                    : "正在初始化..."}
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="error-card">
                <h3>⚠️ 处理视频失败</h3>
                <p>
                  {videoUrl?.startsWith("blob:")
                    ? "不支持 Bilibili/YouTube 等网站的加密流媒体 (Blob/MSE)。仅支持 MP4 直链或 HLS (.m3u8) 播放列表。"
                    : `无法加载 FFmpeg 或下载视频。${
                        errorMessage
                          ? "[" + errorMessage + "]"
                          : "可能是跨域 (CORS) 问题或格式不兼容。"
                      }`}
                </p>
                {!videoUrl?.startsWith("blob:") && (
                  <button onClick={() => videoUrl && processVideo(videoUrl)}>
                    重试
                  </button>
                )}
              </div>
            )}

            {frames.length > 0 && (
              <div className="results-container">
                <div className="grid-view">
                  {frames.map((frame, i) => (
                    <div key={i} className="grid-item">
                      <img src={frame.url} alt={`Frame ${i}`} />
                      <span className="timestamp">
                        {new Date(frame.time * 1000)
                          .toISOString()
                          .substring(14, 19)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="actions">
                  <div className="settings-row">
                    <label>背景颜色: </label>
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="color-picker"
                    />
                  </div>
                  <button className="primary-btn" onClick={downloadMerged}>
                    下载合成图片
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Hidden Canvas for merging */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

export default App;
