export type RecorderSegment = {
  id: string;
  blob: Blob;
  url: string;
  filename: string;
  period: string;
  segmentIndex: number;
  durationMs: number;
};

function pickMimeType(): string {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "",
  ];
  return candidates.find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? "";
}

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  private startTime = 0;
  private onSegmentReady: (seg: RecorderSegment) => void;
  private currentPeriod = "";
  private segmentIndex = 0;
  private sportLabel = "";
  private homeTeam = "";
  private awayTeam = "";

  constructor(onSegmentReady: (seg: RecorderSegment) => void) {
    this.onSegmentReady = onSegmentReady;
  }

  setMeta(sportLabel: string, homeTeam: string, awayTeam: string) {
    this.sportLabel = sportLabel;
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
  }

  startSegment(stream: MediaStream, period: string) {
    this.stopSegment(); // finalize any in-progress segment
    this.currentPeriod = period;
    this.chunks = [];
    this.mimeType = pickMimeType();
    this.startTime = performance.now();

    const options: MediaRecorderOptions = {};
    if (this.mimeType) options.mimeType = this.mimeType;

    const mr = new MediaRecorder(stream, options);
    this.mediaRecorder = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    mr.onstop = () => {
      if (this.chunks.length === 0) return;
      const durationMs = performance.now() - this.startTime;
      const blob = new Blob(this.chunks, { type: this.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const home = this.homeTeam || "홈";
      const away = this.awayTeam || "원정";
      const ext = this.mimeType.includes("mp4") ? "mp4" : "webm";
      const filename = `${date}_${this.sportLabel}_${home}vs${away}_${this.currentPeriod}_${this.segmentIndex + 1}.${ext}`;
      const seg: RecorderSegment = {
        id: crypto.randomUUID(),
        blob,
        url,
        filename,
        period: this.currentPeriod,
        segmentIndex: this.segmentIndex,
        durationMs,
      };
      this.segmentIndex++;
      this.onSegmentReady(seg);
      this.chunks = [];
    };

    mr.start(1000); // 1s timeslice
  }

  stopSegment() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
  }

  get isRecording() {
    return this.mediaRecorder !== null && this.mediaRecorder.state === "recording";
  }

  resetSegmentIndex() {
    this.segmentIndex = 0;
  }
}

export function revokeSegment(seg: RecorderSegment) {
  URL.revokeObjectURL(seg.url);
}

export function downloadSegment(seg: RecorderSegment) {
  const a = document.createElement("a");
  a.href = seg.url;
  a.download = seg.filename;
  a.click();
}
