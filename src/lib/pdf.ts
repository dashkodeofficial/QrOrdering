"use client";

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Renders a complete HTML document string into a PDF and triggers a download.
 * Renders inside a hidden iframe so the app's CSS (which may include
 * oklch/lab color functions unsupported by html2canvas) never bleeds in.
 */
export async function downloadInvoicePDF(
  htmlContent: string,
  filename: string,
): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:302px;height:400px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument!;
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // Wait for content to render, then shrink iframe to actual content height
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    const contentHeight = iframeDoc.body.scrollHeight;
    iframe.style.height = contentHeight + "px";

    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 302,
      height: contentHeight,
    });

    const imgData = canvas.toDataURL("image/png");

    // Use 80mm-wide PDF (matching receipt width) with height = content height
    const pdfWidth = 80; // mm
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    const pdf = new jsPDF("p", "mm", [pdfWidth, imgHeight]);

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, imgHeight);
    pdf.save(filename);
  } finally {
    document.body.removeChild(iframe);
  }
}
