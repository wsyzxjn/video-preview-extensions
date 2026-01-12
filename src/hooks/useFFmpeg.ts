import { useState, useRef } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { parseM3U8, findSegmentForTime } from "../utils/m3u8";

export type ProcessingStatus =
  | "idle"
  | "loading_wasm"
  | "ready"
  | "downloading"
  | "processing"
  | "complete"
  | "error";

export interface FrameData {
  time: number;
  url: string;
}

export const useFFmpeg = () => {
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const ffmpegRef = useRef(new FFmpeg());

  const load = async () => {
    setStatus("loading_wasm");

    // User requested to remove dev mode support
    const baseURL = chrome.runtime.getURL("assets");

    if (!window.crossOriginIsolated) {
      console.error(
        "[FFmpeg] SharedArrayBuffer is not available. COOP/COEP headers needed."
      );
      setStatus("error");
      return;
    }

    const ffmpeg = ffmpegRef.current;

    ffmpeg.on("progress", () => {});

    try {
      const coreURL = new URL(
        `${baseURL}/ffmpeg-core.js`,
        window.location.href
      ).toString();
      const wasmURL = new URL(
        `${baseURL}/ffmpeg-core.wasm`,
        window.location.href
      ).toString();

      await ffmpeg.load({
        coreURL: coreURL,
        wasmURL: wasmURL,
      });
      console.log("[FFmpeg] Load success");
      setStatus("ready");
    } catch (error) {
      console.error("FFmpeg load error:", error);
      setStatus("error");
    }
  };

  const proxyFetch = async (url: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "FETCH_RESOURCE", url },
        async (response) => {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          if (response && response.success) {
            try {
              // response.data is a Data URL (base64)
              const res = await fetch(response.data);
              const blob = await res.blob();
              resolve(blob);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(response?.error || "Unknown proxy fetch error"));
          }
        }
      );
    });
  };

  const processVideo = async (videoUrl: string) => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg.loaded) {
      await load();
    }

    try {
      setStatus("downloading");
      setErrorMessage(null); // Clear previous errors

      let duration = 0;
      let isM3U8 = videoUrl.includes(".m3u8") || videoUrl.includes("blob:");
      if (videoUrl.includes(".m3u8")) isM3U8 = true;

      // M3U8 Specific Data
      let m3u8Segments: any[] = [];

      if (isM3U8 && videoUrl.includes(".m3u8")) {
        console.log("[FFmpeg] Proxy fetching M3U8 playlist...");
        const responseBlob = await proxyFetch(videoUrl);
        const text = await responseBlob.text();
        const m3u8Data = parseM3U8(text, videoUrl);
        duration = m3u8Data.duration;
        m3u8Segments = m3u8Data.segments;
        console.log(
          "[FFmpeg] M3U8 Loaded. Duration:",
          duration,
          "Segments:",
          m3u8Segments.length
        );
      } else if (!videoUrl.startsWith("blob:")) {
        console.log("[FFmpeg] Proxy fetching MP4...");
        const videoBlob = await proxyFetch(videoUrl);
        await ffmpeg.writeFile("input.mp4", await fetchFile(videoBlob));

        const tempUrl = URL.createObjectURL(videoBlob);
        duration = await new Promise<number>((resolve) => {
          const v = document.createElement("video");
          v.onloadedmetadata = () => resolve(v.duration);
          v.onerror = () => resolve(0);
          v.src = tempUrl;
        });
        URL.revokeObjectURL(tempUrl);
      } else {
        throw new Error("Blob URLs not directly supported yet unless M3U8.");
      }

      if (!duration) throw new Error("Could not determine video duration");

      setStatus("processing");

      const extractedFrames: FrameData[] = [];
      const count = 9;
      const interval = duration / (count + 1);

      for (let i = 0; i < count; i++) {
        const time = interval * (i + 1);
        const outputName = `frame_${i}.jpg`;
        let inputName = "input.mp4";
        let seekTime = time;

        if (isM3U8) {
          const segment = findSegmentForTime(m3u8Segments, time);
          if (!segment) {
            console.warn("No segment found for time:", time);
            continue;
          }

          inputName = `seg_${i}.ts`;
          try {
            // Check if file exists to avoid re-downloading if lucky?
            // No, simpler to just download.
            // Proxy fetch segment
            console.log(`[FFmpeg] Proxy fetching segment ${i}: ${segment.url}`);
            const segBlob = await proxyFetch(segment.url);
            if (segBlob.size === 0) {
              console.error("Segment blob is empty:", segment.url);
              continue;
            }
            console.log(
              `[FFmpeg] Segment size: ${(segBlob.size / 1024 / 1024).toFixed(
                2
              )} MB`
            );
            await ffmpeg.writeFile(inputName, await fetchFile(segBlob));
            seekTime = time - segment.start;
          } catch (e) {
            console.error("Failed to fetch segment:", segment.url, e);
            continue;
          }
        }

        // Check if seekTime is valid (not negative)
        if (seekTime < 0) seekTime = 0;

        // Safety: Clamp seekTime to be slightly less than duration if available (M3U8)
        if (isM3U8) {
          const segment = findSegmentForTime(m3u8Segments, time); // Re-find or use cached
          if (segment && seekTime > segment.duration - 0.5) {
            seekTime = Math.max(0, segment.duration - 1.0);
          }
        }

        const timeStr = new Date(seekTime * 1000)
          .toISOString()
          .substring(11, 19);

        // STRATEGY CHANGE: Use OUTPUT SEEKING (-ss after -i)
        // This is slower but guarantees frame accuracy for MPEG-TS segments

        console.log(`[FFmpeg] Executing: -i ${inputName} -ss ${timeStr} ...`);

        let ret = await ffmpeg.exec([
          "-i",
          inputName,
          "-ss",
          timeStr,
          "-vf",
          "scale=320:-1",
          "-frames:v",
          "1",
          "-q:v",
          "5",
          "-an",
          outputName,
        ]);

        // Fallback: If failed, try seeking to 0 (beginning of segment)
        if (ret !== 0 && isM3U8) {
          console.warn(`Seek to ${timeStr} failed. Retrying at 00:00:00...`);
          ret = await ffmpeg.exec([
            "-i",
            inputName,
            "-ss",
            "00:00:00",
            "-vf",
            "scale=320:-1",
            "-frames:v",
            "1",
            "-q:v",
            "5",
            "-an",
            outputName,
          ]);
        }

        if (ret !== 0) {
          console.error(
            `FFmpeg exec failed with code ${ret} for time ${time} (seg relative: ${seekTime})`
          );
          // Cleanup input anyway
          if (isM3U8) await ffmpeg.deleteFile(inputName);
          continue;
        }

        if (isM3U8) {
          await ffmpeg.deleteFile(inputName);
        }

        try {
          const data = await ffmpeg.readFile(outputName);
          const blob = new Blob([data as unknown as BlobPart], {
            type: "image/jpeg",
          });
          extractedFrames.push({
            time,
            url: URL.createObjectURL(blob),
          });
          await ffmpeg.deleteFile(outputName);
        } catch (readErr) {
          console.error("Failed to read output file:", outputName, readErr);
        }

        setProgress(((i + 1) / count) * 100);
        setFrames([...extractedFrames]);
      }

      if (!isM3U8) {
        await ffmpeg.deleteFile("input.mp4");
      }

      setStatus("complete");
    } catch (error: any) {
      console.error("Video processing error:", error);
      setStatus("error");
      setErrorMessage(error.message || String(error));
    }
  };

  return { status, progress, frames, processVideo, load, errorMessage };
};
