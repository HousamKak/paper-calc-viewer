import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Optional: lightweight ZIP utils for bundling/unbundling .texhtml files
// (All NPM libs are available; fflate is tiny and fast.)
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

// --- Small helpers ---
function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// Persist simple settings
function useLocalStorage<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal] as const;
}

// Types
type ViewMode = "split" | "paper" | "app";
type Theme = "light" | "dark";

export default function PaperHtmlViewer() {
  // PDF source (either object URL or remote URL)
  const [pdfUrl, setPdfUrl] = useLocalStorage<string | null>("pcv.pdfUrl", null);
  const [pdfFile, setPdfFile] = useState<File | null>(null); // to allow bundling

  // App source: either iframe src (URL) OR inline srcDoc string
  const [appUrl, setAppUrl] = useLocalStorage<string | null>("pcv.appUrl", null);
  const [appSrcDoc, setAppSrcDoc] = useState<string | null>(null);
  const [appFile, setAppFile] = useState<File | null>(null);

  const [view, setView] = useLocalStorage<ViewMode>("pcv.view", "split");
  const [orientation, setOrientation] = useLocalStorage<"horizontal" | "vertical">(
    "pcv.orient",
    "horizontal"
  );
  const [splitPct, setSplitPct] = useLocalStorage<number>("pcv.splitPct", 50);
  const [swap, setSwap] = useLocalStorage<boolean>("pcv.swap", false);
  const [theme, setTheme] = useLocalStorage<Theme>("pcv.theme", "light");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfZoom, setPdfZoom] = useLocalStorage<number>("pcv.pdfZoom", 100);
  const [isDragging, setIsDragging] = useState(false);
  const [showToolbar, setShowToolbar] = useLocalStorage<boolean>("pcv.showToolbar", true);

  // Build iframe props for the calculator pane
  const calcIframeProps = useMemo(() => {
    if (appUrl) return { src: appUrl, srcDoc: undefined as any };
    if (appSrcDoc) return { src: undefined as any, srcDoc: appSrcDoc };
    return { src: undefined as any, srcDoc: undefined as any };
  }, [appUrl, appSrcDoc]);

  // --- File handlers ---
  const onPickPdf = (file: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    setPdfFile(file);
  };

  const onClearPdf = () => {
    if (pdfUrl && pdfUrl.startsWith("blob:")) {
      URL.revokeObjectURL(pdfUrl);
    }
    setPdfUrl(null);
    setPdfFile(null);
    setPdfZoom(100);
  };

  const onClearHtml = () => {
    if (appUrl && appUrl.startsWith("blob:")) {
      URL.revokeObjectURL(appUrl);
    }
    setAppUrl(null);
    setAppSrcDoc(null);
    setAppFile(null);
  };

  const onPickHtml = (file: File) => {
    if (!file) return;
    setAppFile(file);
    // Try to keep it as a Blob URL to preserve relative resource loading if any
    // If your calculator is a single self-contained HTML (no external assets),
    // using srcDoc is also fine. We'll prefer Blob URL to be safe.
    const url = URL.createObjectURL(file);
    setAppUrl(url);
    setAppSrcDoc(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.files || []);
    if (!items.length) return;
    const pdf = items.find((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const html = items.find((f) => f.type.includes("html") || f.name.toLowerCase().endsWith(".html"));
    if (pdf) onPickPdf(pdf);
    if (html) onPickHtml(html);
  };

  // --- .texhtml bundle support (a simple ZIP with a manifest) ---
  // Layout/spec:
  // manifest.json { title, paper, app, layout, split }
  // paper.pdf (binary), calculator.html (text)
  const onOpenBundle = async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    const files = unzipSync(buf);
    const manifestRaw = files["manifest.json"]; // required
    if (!manifestRaw) {
      alert("Bundle missing manifest.json");
      return;
    }
    const manifest = JSON.parse(strFromU8(manifestRaw)) as {
      title?: string;
      paper: string; // path inside zip
      app: string; // path inside zip
      layout?: ViewMode;
      split?: number;
      orientation?: "horizontal" | "vertical";
    };
    // PDF
    const pdfEntry = files[manifest.paper];
    if (!pdfEntry) {
      alert(`Bundle missing ${manifest.paper}`);
      return;
    }
    const pdfBlob = new Blob([new Uint8Array(pdfEntry)], { type: "application/pdf" });
    const pdfObjUrl = URL.createObjectURL(pdfBlob);
    setPdfUrl(pdfObjUrl);
    setPdfFile(new File([pdfBlob], manifest.paper.split("/").pop() || "paper.pdf", { type: "application/pdf" }));

    // HTML (we'll use a Blob URL to preserve any relative paths that were zipped)
    const appEntry = files[manifest.app];
    if (!appEntry) {
      alert(`Bundle missing ${manifest.app}`);
      return;
    }
    const appBlob = new Blob([new Uint8Array(appEntry)], { type: "text/html" });
    const appObjUrl = URL.createObjectURL(appBlob);
    setAppUrl(appObjUrl);
    setAppSrcDoc(null);
    setAppFile(new File([appBlob], manifest.app.split("/").pop() || "calculator.html", { type: "text/html" }));

    if (manifest.layout) setView(manifest.layout);
    if (typeof manifest.split === "number") setSplitPct(Math.min(85, Math.max(15, manifest.split)));
    if (manifest.orientation) setOrientation(manifest.orientation);
  };

  const onSaveBundle = async () => {
    if (!pdfFile || (!appFile && !appSrcDoc && !appUrl)) {
      alert("Please load a PDF and a calculator first.");
      return;
    }
    // Get HTML bytes
    let appBytes: Uint8Array | null = null;
    let appName = "calculator.html";

    if (appFile) {
      const buf = new Uint8Array(await appFile.arrayBuffer());
      appBytes = buf;
      appName = appFile.name || appName;
    } else if (appSrcDoc) {
      appBytes = strToU8(appSrcDoc);
    } else if (appUrl && appUrl.startsWith("blob:")) {
      // Attempt to fetch blob URL (works in most cases)
      const res = await fetch(appUrl);
      const ab = await res.arrayBuffer();
      appBytes = new Uint8Array(ab);
    }

    if (!appBytes) {
      alert("Could not capture calculator HTML bytes. If you used a remote URL, download it first.");
      return;
    }

    const pdfName = pdfFile.name || "paper.pdf";
    const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());

    const manifest = {
      title: pdfName.replace(/\.pdf$/i, ""),
      paper: pdfName,
      app: appName,
      layout: view,
      split: splitPct,
      orientation,
      version: 1
    };

    const zipped = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      [pdfName]: pdfBytes,
      [appName]: appBytes
    }, { level: 9 });

    const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (manifest.title || "bundle") + ".texhtml"; // custom extension (zip under the hood)
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // --- Drag split functionality ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const container = document.querySelector('.split-container') as HTMLElement;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    let newSplit;
    
    if (orientation === 'horizontal') {
      const relativeX = e.clientX - rect.left;
      newSplit = (relativeX / rect.width) * 100;
    } else {
      const relativeY = e.clientY - rect.top;
      newSplit = (relativeY / rect.height) * 100;
    }
    
    newSplit = Math.max(15, Math.min(85, newSplit));
    setSplitPct(newSplit);
  }, [isDragging, orientation]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp, orientation]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            setView('split');
            break;
          case '2':
            e.preventDefault();
            setView('paper');
            break;
          case '3':
            e.preventDefault();
            setView('app');
            break;
          case 'd':
            e.preventDefault();
            setTheme(theme === 'light' ? 'dark' : 'light');
            break;
          case 'f':
            e.preventDefault();
            toggleFullscreen();
            break;
          case 's':
            e.preventDefault();
            setSwap(s => !s);
            break;
          case 'h':
            e.preventDefault();
            setShowToolbar(t => !t);
            break;
        }
      }
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [theme]);

  // --- Fullscreen functionality ---
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // --- Theme effect ---
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // UI bits
  const filePdfRef = useRef<HTMLInputElement>(null);
  const fileHtmlRef = useRef<HTMLInputElement>(null);
  const fileBundleRef = useRef<HTMLInputElement>(null);

  const Pane = ({ children }: { children: React.ReactNode }) => (
    <div className={classNames(
      "w-full h-full rounded-2xl overflow-hidden shadow-sm border transition-colors",
      theme === 'dark' 
        ? "bg-gray-800/50 border-gray-600" 
        : "bg-white/50 border-gray-200"
    )}>
      {children}
    </div>
  );

  const Toolbar = () => (
    <div className={classNames(
      "flex flex-wrap items-center gap-2 p-3 border-b sticky top-0 z-10 transition-colors",
      theme === 'dark' 
        ? "bg-gradient-to-b from-gray-900 to-gray-800 border-gray-600 text-white" 
        : "bg-gradient-to-b from-white to-gray-50 border-gray-200"
    )}>
      <div className="text-xl font-semibold mr-2">Paper + HTML Viewer</div>

      {/* File Operations */}
      <div className="flex items-center gap-2">
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => filePdfRef.current?.click()}>
          📄 Load PDF
        </button>
        <input ref={filePdfRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && onPickPdf(e.target.files[0])} />

        {pdfFile && (
          <button className={classNames(
            "px-2 py-1.5 rounded-xl border transition-colors text-red-600",
            theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
          )} onClick={onClearPdf} title="Clear PDF">
            ❌
          </button>
        )}

        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => fileHtmlRef.current?.click()}>
          🌐 Load HTML
        </button>
        <input ref={fileHtmlRef} className="hidden" type="file" accept="text/html,.html" onChange={(e) => e.target.files?.[0] && onPickHtml(e.target.files[0])} />

        {appFile && (
          <button className={classNames(
            "px-2 py-1.5 rounded-xl border transition-colors text-red-600",
            theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
          )} onClick={onClearHtml} title="Clear HTML">
            ❌
          </button>
        )}
      </div>

      <div className={classNames("mx-2 h-6 w-px", theme === 'dark' ? "bg-gray-600" : "bg-gray-200")} />

      {/* Bundle Operations */}
      <div className="flex items-center gap-2">
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => fileBundleRef.current?.click()}>
          📦 Open Bundle
        </button>
        <input ref={fileBundleRef} className="hidden" type="file" accept=".texhtml,.zip" onChange={(e) => e.target.files?.[0] && onOpenBundle(e.target.files[0])} />

        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={onSaveBundle}>
          💾 Save Bundle
        </button>
      </div>

      <div className={classNames("mx-2 h-6 w-px", theme === 'dark' ? "bg-gray-600" : "bg-gray-200")} />

      {/* View Controls */}
      <div className="flex items-center gap-1">
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          view === "split" 
            ? theme === 'dark' ? "bg-gray-700 font-semibold border-gray-500" : "bg-gray-100 font-semibold border-gray-400"
            : theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setView("split")}>
          Split <span className="text-xs opacity-60">(⌘1)</span>
        </button>
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          view === "paper" 
            ? theme === 'dark' ? "bg-gray-700 font-semibold border-gray-500" : "bg-gray-100 font-semibold border-gray-400"
            : theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setView("paper")}>
          Paper <span className="text-xs opacity-60">(⌘2)</span>
        </button>
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          view === "app" 
            ? theme === 'dark' ? "bg-gray-700 font-semibold border-gray-500" : "bg-gray-100 font-semibold border-gray-400"
            : theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setView("app")}>
          HTML <span className="text-xs opacity-60">(⌘3)</span>
        </button>
      </div>

      <div className={classNames("mx-2 h-6 w-px", theme === 'dark' ? "bg-gray-600" : "bg-gray-200")} />

      {/* PDF Zoom Controls */}
      {pdfUrl && (view === "paper" || view === "split") && (
        <>
          <div className="flex items-center gap-2">
            <label className={classNames("text-sm", theme === 'dark' ? "text-gray-300" : "text-gray-600")}>
              Zoom:
            </label>
            <button className={classNames(
              "px-2 py-1 rounded border transition-colors",
              theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
            )} onClick={() => setPdfZoom(Math.max(25, pdfZoom - 25))}>
              −
            </button>
            <span className={classNames("w-12 text-center text-sm", theme === 'dark' ? "text-gray-300" : "text-gray-600")}>
              {pdfZoom}%
            </span>
            <button className={classNames(
              "px-2 py-1 rounded border transition-colors",
              theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
            )} onClick={() => setPdfZoom(Math.min(200, pdfZoom + 25))}>
              +
            </button>
          </div>
          <div className={classNames("mx-2 h-6 w-px", theme === 'dark' ? "bg-gray-600" : "bg-gray-200")} />
        </>
      )}

      {/* Split Controls */}
      {view === "split" && (
        <>
          <div className="flex items-center gap-2">
            <label className={classNames("text-sm", theme === 'dark' ? "text-gray-300" : "text-gray-600")}>
              Split:
            </label>
            <input 
              type="range" 
              min={15} 
              max={85} 
              value={splitPct} 
              onChange={(e) => setSplitPct(parseInt(e.target.value))}
              className="w-20"
            />
            <span className={classNames("w-10 text-center text-sm", theme === 'dark' ? "text-gray-300" : "text-gray-600")}>
              {splitPct}%
            </span>
          </div>
          <div className={classNames("mx-2 h-6 w-px", theme === 'dark' ? "bg-gray-600" : "bg-gray-200")} />
        </>
      )}

      {/* Layout Controls */}
      <div className="flex items-center gap-1">
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          orientation === "horizontal" 
            ? theme === 'dark' ? "bg-gray-700 font-semibold border-gray-500" : "bg-gray-100 font-semibold border-gray-400"
            : theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setOrientation("horizontal")}>
          ↔️
        </button>
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          orientation === "vertical" 
            ? theme === 'dark' ? "bg-gray-700 font-semibold border-gray-500" : "bg-gray-100 font-semibold border-gray-400"
            : theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setOrientation("vertical")}>
          ↕️
        </button>
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          swap 
            ? theme === 'dark' ? "bg-gray-700 font-semibold border-gray-500" : "bg-gray-100 font-semibold border-gray-400"
            : theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setSwap((s) => !s)}>
          🔄 <span className="text-xs opacity-60">(⌘S)</span>
        </button>
      </div>

      {/* Theme and Tools */}
      <div className="ml-auto flex items-center gap-2">
        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle Theme (⌘D)">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={toggleFullscreen} title="Fullscreen (F11)">
          {isFullscreen ? '🪟' : '⛶'}
        </button>

        <button className={classNames(
          "px-3 py-1.5 rounded-xl border transition-colors",
          theme === 'dark' ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
        )} onClick={() => setShowToolbar(false)} title="Hide Toolbar (⌘H)">
          ❌
        </button>

        <div className={classNames("text-sm", theme === 'dark' ? "text-gray-400" : "text-gray-500")}>
          Drop PDF + HTML anywhere
        </div>
      </div>
    </div>
  );

  const PaperPane = () => (
    <Pane>
      {pdfUrl ? (
        // Use the browser PDF viewer with zoom
        <iframe 
          title="paper" 
          src={`${pdfUrl}#view=FitH&zoom=${pdfZoom}`} 
          className="w-full h-full" 
        />
      ) : (
        <DropHint kind="PDF" />
      )}
    </Pane>
  );

  const AppPane = () => (
    <Pane>
      {appUrl || appSrcDoc ? (
        <iframe title="calculator" className="w-full h-full" {...calcIframeProps} />
      ) : (
        <DropHint kind="HTML" />
      )}
    </Pane>
  );

  return (
    <div className={classNames(
      "w-full h-screen flex flex-col transition-colors",
      theme === 'dark' ? "bg-gray-900" : "bg-gray-100"
    )} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {showToolbar && <Toolbar />}

      {/* Floating toolbar toggle button */}
      {!showToolbar && (
        <button
          className={classNames(
            "fixed top-4 left-4 z-50 px-3 py-2 rounded-xl border transition-all duration-300 shadow-lg",
            theme === 'dark' 
              ? "bg-gray-800 border-gray-600 text-white hover:bg-gray-700" 
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          )}
          onClick={() => setShowToolbar(true)}
          title="Show Toolbar (⌘H)"
        >
          ⚙️
        </button>
      )}

      {/* Work area */}
      {view === "paper" && (
        <div className="flex-1 p-3">
          <div className="w-full h-full"><PaperPane /></div>
        </div>
      )}

      {view === "app" && (
        <div className="flex-1 p-3">
          <div className="w-full h-full"><AppPane /></div>
        </div>
      )}

      {view === "split" && (
        <div className={classNames("flex-1 p-3 split-container", orientation === "horizontal" ? "" : "")}>
          {orientation === "horizontal" ? (
            <div className="w-full h-full flex gap-3 relative">
              <div className="h-full" style={{ width: `${splitPct}%` }}>
                {swap ? <AppPane /> : <PaperPane />}
              </div>
              
              {/* Draggable divider */}
              <div 
                className={classNames(
                  "w-1 h-full cursor-col-resize flex items-center justify-center group relative",
                  theme === 'dark' ? "hover:bg-gray-600" : "hover:bg-gray-300"
                )}
                onMouseDown={handleMouseDown}
              >
                <div className={classNames(
                  "w-1 h-16 rounded-full transition-all",
                  isDragging 
                    ? theme === 'dark' ? "bg-blue-400" : "bg-blue-500"
                    : theme === 'dark' ? "bg-gray-600 group-hover:bg-gray-500" : "bg-gray-300 group-hover:bg-gray-400"
                )} />
              </div>
              
              <div className="h-full flex-1">
                {swap ? <PaperPane /> : <AppPane />}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col gap-3 relative">
              <div className="w-full" style={{ height: `${splitPct}%` }}>
                {swap ? <AppPane /> : <PaperPane />}
              </div>
              
              {/* Draggable divider */}
              <div 
                className={classNames(
                  "w-full h-1 cursor-row-resize flex items-center justify-center group relative",
                  theme === 'dark' ? "hover:bg-gray-600" : "hover:bg-gray-300"
                )}
                onMouseDown={handleMouseDown}
              >
                <div className={classNames(
                  "w-16 h-1 rounded-full transition-all",
                  isDragging 
                    ? theme === 'dark' ? "bg-blue-400" : "bg-blue-500"
                    : theme === 'dark' ? "bg-gray-600 group-hover:bg-gray-500" : "bg-gray-300 group-hover:bg-gray-400"
                )} />
              </div>
              
              <div className="w-full flex-1">
                {swap ? <PaperPane /> : <AppPane />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DropHint({ kind }: { kind: "PDF" | "HTML" }) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="text-center text-gray-500 dark:text-gray-400">
        <div className="text-6xl mb-4">{kind === "PDF" ? "📄" : "🌐"}</div>
        <div className="text-lg font-medium mb-1">No {kind} loaded</div>
        <div className="text-sm">Use the toolbar or drop a {kind} file here</div>
        <div className="text-xs mt-2 opacity-60">
          {kind === "PDF" ? "Supports: .pdf files" : "Supports: .html files"}
        </div>
      </div>
    </div>
  );
}