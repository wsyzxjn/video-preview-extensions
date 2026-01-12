export interface Segment {
  url: string;
  duration: number;
  start: number;
  end: number;
}

export interface M3U8Data {
  duration: number;
  segments: Segment[];
}

export function parseM3U8(content: string, baseUrl: string): M3U8Data {
  const lines = content.split("\n");
  const segments: Segment[] = [];
  let currentStart = 0;
  let segmentDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      // Parse duration from #EXTINF:10.0,
      const durationStr = line.split(":")[1].split(",")[0];
      segmentDuration = parseFloat(durationStr);
    } else if (!line.startsWith("#")) {
      // It's a URL
      let url = line;
      if (!url.startsWith("http")) {
        // Resolve relative URL
        try {
          url = new URL(url, baseUrl).toString();
        } catch (e) {
          console.error("Failed to resolve relative URL:", url, baseUrl, e);
        }
      }

      segments.push({
        url,
        duration: segmentDuration,
        start: currentStart,
        end: currentStart + segmentDuration,
      });
      currentStart += segmentDuration;
      segmentDuration = 0; // Reset for next segment
    }
  }

  return {
    duration: currentStart,
    segments,
  };
}

export function findSegmentForTime(
  segments: Segment[],
  time: number
): Segment | undefined {
  return segments.find((seg) => time >= seg.start && time < seg.end);
}
