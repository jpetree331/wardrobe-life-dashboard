// Shared, side-effect-only browser helpers for the backup/export features.
// These do NOT touch Supabase or app data — they only take a finished string
// and hand it to the browser as a download or a print view.

/** Trigger a browser download of a text file via a temporary object URL. */
export function downloadTextFile(filename: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Render a full HTML document in a hidden iframe and open the print dialog
 *  (for "Save as PDF"). No popup window, so nothing is blocked. Waits for web
 *  fonts to load first so the PDF matches the app, with a safety timeout. */
export function printHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow!;
  const go = () => {
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 60000);
  };
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) {
    let done = false;
    const fire = () => { if (!done) { done = true; go(); } };
    fonts.ready.then(fire).catch(fire);
    setTimeout(fire, 2500);
  } else if (doc.readyState === 'complete') {
    setTimeout(go, 400);
  } else {
    iframe.onload = () => setTimeout(go, 400);
  }
}
