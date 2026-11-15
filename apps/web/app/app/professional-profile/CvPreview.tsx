"use client";

import { useEffect, useRef, useState } from "react";

type Status = { state: "loading" } | { state: "ready"; pages: number } | { state: "failed" };

/**
 * Shows a CV in a window over the page, without downloading it.
 * The pages are drawn with pdf.js so the preview works the same on phones, where browsers often
 * can't show a PDF inside a page.
 */
export function CvPreview({ title, subtitle, href, actions, onClose }: {
  title: string;
  /** Shown under the title, before the page count. */
  subtitle: string;
  /** Where the PDF comes from (a same-site download route). */
  href: string;
  /** Buttons for the footer, beside Download. */
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pagesBox = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ state: "loading" });

  // Open as a modal: focus moves inside, the page behind is inert, Escape closes it.
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    document.documentElement.classList.add("modal-open");
    return () => {
      document.documentElement.classList.remove("modal-open");
      d?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const [pdfjs, res] = await Promise.all([import("pdfjs-dist"), fetch(href, { credentials: "same-origin" })]);
        if (!res.ok || !res.headers.get("content-type")?.includes("pdf")) throw new Error("no pdf");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
        destroy = () => void doc.destroy();
        const box = pagesBox.current;
        if (cancelled || !box) return;
        box.replaceChildren();
        const width = Math.min(box.clientWidth, 820);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.className = "cv-page";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Page ${n} of ${doc.numPages}`);
          box.append(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        }
        if (!cancelled) setStatus({ state: "ready", pages: doc.numPages });
      } catch {
        if (!cancelled) setStatus({ state: "failed" });
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [href]);

  return (
    <dialog
      ref={dialog}
      className="cv-modal"
      aria-labelledby="cv-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // a click on the dimmed backdrop
      }}
    >
      <div className="cv-modal-box">
        <header className="cv-modal-head">
          <div>
            <h2 id="cv-modal-title">{title}</h2>
            <p className="muted small">
              {subtitle}{status.state === "ready" ? ` · ${status.pages} ${status.pages === 1 ? "page" : "pages"}` : ""}
            </p>
          </div>
          <button type="button" className="icon-btn cv-modal-close" aria-label="Close preview" onClick={onClose}>✕</button>
        </header>

        <div className="cv-modal-body">
          {status.state === "loading" ? <p className="cv-modal-note" role="status">Preparing your preview…</p> : null}
          {status.state === "failed" ? (
            <div className="cv-modal-note" role="alert">
              <p>The preview couldn't be shown here.</p>
              <a className="btn ghost" href={href} target="_blank" rel="noopener">Open it in a new tab</a>
            </div>
          ) : null}
          <div ref={pagesBox} className="cv-pages" hidden={status.state === "failed"} />
        </div>

        <footer className="cv-modal-foot">
          <a className="btn ghost" href={href} download>Download</a>
          {actions}
        </footer>
      </div>
    </dialog>
  );
}
