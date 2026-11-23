/**
 * Generates a real, locally recorded studio motion sample clip so users can test
 * trimming, FPS, resizing, quality, and WebP/APNG export in one click.
 */
export async function generateSampleClipFile(): Promise<File> {
  const width = 640;
  const height = 360;
  const durationMs = 2400;
  const fps = 30;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable to synthesize sample clip.');
  }

  const candidates = [
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];

  const supported = candidates.find(
    (c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)
  );
  if (!supported) {
    throw new Error('MediaRecorder is unavailable in this browser. Please upload an MP4 file.');
  }

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: supported.mime,
    videoBitsPerSecond: 2_500_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const renderFrame = (progress: number) => {
    // Deep studio background
    ctx.fillStyle = '#0B0D11';
    ctx.fillRect(0, 0, width, height);

    // Subtle calibration grid
    ctx.strokeStyle = '#1B202C';
    ctx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 40; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const cx = width / 2;
    const cy = height / 2;
    const angle = progress * Math.PI * 2;

    // Outer orbital ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, 106, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Amber swept arc
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-angle * 1.5);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 76, 0, Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();

    // Orbiting marker dot
    const dotX = cx + Math.cos(angle * 2) * 106;
    const dotY = cy + Math.sin(angle * 2) * 106;
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Inner kinetic bar wave
    const barCount = 9;
    const barGap = 10;
    const barW = 6;
    const totalW = barCount * barW + (barCount - 1) * barGap;
    for (let i = 0; i < barCount; i++) {
      const phase = angle * 2 + i * 0.55;
      const barH = 14 + Math.round((Math.sin(phase) * 0.5 + 0.5) * 38);
      const bx = cx - totalW / 2 + i * (barW + barGap);
      const by = cy - barH / 2;
      ctx.fillStyle = i % 2 === 0 ? '#F59E0B' : '#94A3B8';
      ctx.fillRect(bx, by, barW, barH);
    }

    // Crisp bottom progress bar & frame readout
    ctx.fillStyle = '#1E2432';
    ctx.fillRect(40, height - 34, width - 80, 4);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(40, height - 34, (width - 80) * progress, 4);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('STUDIO MOTION TEST · 640x360', 40, height - 46);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(progress * 100)}%`, width - 40, height - 46);
  };

  return await new Promise<File>((resolve, reject) => {
    const start = performance.now();
    let rafId = 0;

    recorder.onstop = () => {
      window.cancelAnimationFrame(rafId);
      const blob = new Blob(chunks, { type: supported.mime });
      const file = new File([blob], `studio-motion-sample.${supported.ext}`, {
        type: supported.mime,
      });
      resolve(file);
    };

    recorder.onerror = () => {
      window.cancelAnimationFrame(rafId);
      reject(new Error('Failed to record sample video clip.'));
    };

    renderFrame(0);
    recorder.start(100);

    const tick = () => {
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / durationMs);
      renderFrame(progress);
      if (elapsed < durationMs) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        recorder.stop();
      }
    };

    rafId = window.requestAnimationFrame(tick);
  });
}
