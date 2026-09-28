import { ParsedPageData } from './tokenization';

/**
 * Parses an ArrayBuffer of a PDF document and extracts lines per page.
 * Uses pdfjs-dist dynamically in client-side environment.
 */
export async function parsePdfFile(file: File): Promise<{
  fileName: string;
  fileSize: number;
  pages: ParsedPageData[];
  rawText: string;
}> {
  const arrayBuffer = await file.arrayBuffer();

  // Dynamic import of pdfjs-dist to avoid SSR node canvas issues
  const pdfjs = await import('pdfjs-dist');
  
  // Set CDN worker source for browser execution
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;
  const pages: ParsedPageData[] = [];
  let combinedRaw = '';

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by roughly identical Y-coordinate or line items
    const rawLines: string[] = [];
    let currentLine = '';
    let lastY: number | null = null;

    for (const item of textContent.items as any[]) {
      if (!('str' in item)) continue;
      const str = item.str;
      const y = item.transform ? item.transform[5] : null;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        if (currentLine.trim()) {
          rawLines.push(currentLine.trim());
        }
        currentLine = str;
      } else {
        currentLine += (currentLine ? ' ' : '') + str;
      }
      lastY = y;
    }

    if (currentLine.trim()) {
      rawLines.push(currentLine.trim());
    }

    // Fallback if line grouping produced nothing
    const finalLines = rawLines.length > 0 ? rawLines : ['[Page has no readable text]'];
    pages.push({
      pageNumber: pageNum,
      lines: finalLines,
    });

    combinedRaw += `\n--- Page ${pageNum} ---\n` + finalLines.join('\n');
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    pages,
    rawText: combinedRaw.trim(),
  };
}

/**
 * Text or Markdown file fallback parser
 */
export async function parseTextFile(file: File): Promise<{
  fileName: string;
  fileSize: number;
  pages: ParsedPageData[];
  rawText: string;
}> {
  const text = await file.text();
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // Group into virtual pages of ~40 lines
  const linesPerPage = 40;
  const pages: ParsedPageData[] = [];

  for (let i = 0; i < rawLines.length; i += linesPerPage) {
    const pageNum = Math.floor(i / linesPerPage) + 1;
    const slice = rawLines.slice(i, i + linesPerPage);
    pages.push({
      pageNumber: pageNum,
      lines: slice,
    });
  }

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, lines: ['[Empty Document]'] });
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    pages,
    rawText: text,
  };
}
