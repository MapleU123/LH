import { toBlob, toPng } from 'html-to-image';

export async function exportElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: '#070A11',
    cacheBust: true,
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyElementAsPng(element: HTMLElement): Promise<'copied' | 'fallback-downloaded'> {
  const blob = await toBlob(element, {
    pixelRatio: 2,
    backgroundColor: '#070A11',
    cacheBust: true,
  });
  if (!blob) {
    throw new Error('图像生成失败');
  }

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // Fall through to file download if browser blocks clipboard image write in iframe
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `quant-snapshot-${Date.now()}.png`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return 'fallback-downloaded';
}

export async function copyImageUrlToClipboard(imageUrl: string, fallbackFilename: string): Promise<'copied' | 'fallback-downloaded'> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error('图片加载失败');
  const blob = await res.blob();

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // Fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fallbackFilename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return 'fallback-downloaded';
}
