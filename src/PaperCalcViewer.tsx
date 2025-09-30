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
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

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

    newSplit = Math.round(Math.max(15, Math.min(85, newSplit)));
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
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowKeyboardShortcuts(false);
        return;
      }
      
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
    <div className="w-full h-full overflow-hidden">
      {children}
    </div>
  );

  const Toolbar = () => (
    <div className={classNames(
      "flex items-center gap-2 px-3 py-2 border-b sticky top-0 z-10 transition-colors backdrop-blur-sm overflow-x-auto",
      theme === 'dark'
        ? "bg-gray-900/95 border-gray-700/50 text-white shadow-lg"
        : "bg-white/95 border-gray-200/50 shadow-sm"
    )}>
      <div className="text-base font-bold mr-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent whitespace-nowrap flex-shrink-0 min-w-[60px]">
        Paper+
      </div>

      {/* File Operations - Compact */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button className={classNames(
          "px-2 py-0.5 text-xs rounded-md border transition-all hover:scale-105",
          theme === 'dark'
            ? "border-gray-700 hover:bg-gray-800 hover:border-blue-500/50"
            : "border-gray-200 hover:bg-blue-50 hover:border-blue-400"
        )} onClick={() => filePdfRef.current?.click()} title="Load PDF">
          📄
        </button>
        <input ref={filePdfRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && onPickPdf(e.target.files[0])} />

        {pdfFile && (
          <button className={classNames(
            "px-1 py-0.5 text-xs rounded-md transition-all hover:scale-110",
            theme === 'dark' ? "text-red-400 hover:bg-red-900/30" : "text-red-500 hover:bg-red-50"
          )} onClick={onClearPdf} title="Clear PDF">
            ×
          </button>
        )}

        <button className={classNames(
          "px-2 py-0.5 text-xs rounded-md border transition-all hover:scale-105",
          theme === 'dark'
            ? "border-gray-700 hover:bg-gray-800 hover:border-green-500/50"
            : "border-gray-200 hover:bg-green-50 hover:border-green-400"
        )} onClick={() => fileHtmlRef.current?.click()} title="Load HTML">
          🌐
        </button>
        <input ref={fileHtmlRef} className="hidden" type="file" accept="text/html,.html" onChange={(e) => e.target.files?.[0] && onPickHtml(e.target.files[0])} />

        {appFile && (
          <button className={classNames(
            "px-1 py-0.5 text-xs rounded-md transition-all hover:scale-110",
            theme === 'dark' ? "text-red-400 hover:bg-red-900/30" : "text-red-500 hover:bg-red-50"
          )} onClick={onClearHtml} title="Clear HTML">
            ×
          </button>
        )}
      </div>

      <div className={classNames("mx-1 h-4 w-px flex-shrink-0", theme === 'dark' ? "bg-gray-700" : "bg-gray-300")} />

      {/* Bundle Operations - Compact */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button className={classNames(
          "px-2 py-0.5 text-xs rounded-md border transition-all hover:scale-105",
          theme === 'dark'
            ? "border-gray-700 hover:bg-gray-800 hover:border-purple-500/50"
            : "border-gray-200 hover:bg-purple-50 hover:border-purple-400"
        )} onClick={() => fileBundleRef.current?.click()} title="Open Bundle">
          📦
        </button>
        <input ref={fileBundleRef} className="hidden" type="file" accept=".texhtml,.zip" onChange={(e) => e.target.files?.[0] && onOpenBundle(e.target.files[0])} />

        <button className={classNames(
          "px-2 py-0.5 text-xs rounded-md border transition-all hover:scale-105",
          theme === 'dark'
            ? "border-gray-700 hover:bg-gray-800 hover:border-amber-500/50"
            : "border-gray-200 hover:bg-amber-50 hover:border-amber-400"
        )} onClick={onSaveBundle} title="Save Bundle">
          💾
        </button>
      </div>

      <div className={classNames("mx-1 h-4 w-px flex-shrink-0", theme === 'dark' ? "bg-gray-700" : "bg-gray-300")} />

      {/* View Controls - Compact Pills */}
      <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-shrink-0">
        <button className={classNames(
          "px-2 py-0.5 text-xs rounded-md transition-all",
          view === "split"
            ? theme === 'dark'
              ? "bg-blue-600 text-white shadow-md"
              : "bg-blue-500 text-white shadow-md"
            : "hover:bg-gray-200 dark:hover:bg-gray-700"
        )} onClick={() => setView("split")} title="Split View (Ctrl+1 / ⌘1)">
          ⚏
        </button>
        <button className={classNames(
          "px-2 py-0.5 text-xs rounded-md transition-all",
          view === "paper"
            ? theme === 'dark'
              ? "bg-blue-600 text-white shadow-md"
              : "bg-blue-500 text-white shadow-md"
            : "hover:bg-gray-200 dark:hover:bg-gray-700"
        )} onClick={() => setView("paper")} title="Paper Only (Ctrl+2 / ⌘2)">
          📄
        </button>
        <button className={classNames(
          "px-2 py-0.5 text-xs rounded-md transition-all",
          view === "app"
            ? theme === 'dark'
              ? "bg-blue-600 text-white shadow-md"
              : "bg-blue-500 text-white shadow-md"
            : "hover:bg-gray-200 dark:hover:bg-gray-700"
        )} onClick={() => setView("app")} title="HTML Only (Ctrl+3 / ⌘3)">
          🌐
        </button>
      </div>

      {/* PDF Zoom - Compact */}
      {pdfUrl && (view === "paper" || view === "split") && (
        <>
          <div className={classNames("mx-1 h-4 w-px flex-shrink-0", theme === 'dark' ? "bg-gray-700" : "bg-gray-300")} />
          <div className="flex items-center gap-1 flex-shrink-0">
            <button className={classNames(
              "px-1.5 py-0.5 text-xs rounded-md border transition-all hover:scale-110",
              theme === 'dark' ? "border-gray-700 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-100"
            )} onClick={() => setPdfZoom(Math.max(25, pdfZoom - 25))} title="Zoom Out">
              −
            </button>
            <span className={classNames("text-[10px] w-8 text-center font-mono", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>
              {pdfZoom}%
            </span>
            <button className={classNames(
              "px-1.5 py-0.5 text-xs rounded-md border transition-all hover:scale-110",
              theme === 'dark' ? "border-gray-700 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-100"
            )} onClick={() => setPdfZoom(Math.min(200, pdfZoom + 25))} title="Zoom In">
              +
            </button>
          </div>
        </>
      )}

      {/* Split Controls - Minimalist */}
      {view === "split" && (
        <>
          <div className={classNames("mx-1 h-4 w-px flex-shrink-0", theme === 'dark' ? "bg-gray-700" : "bg-gray-300")} />
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              type="range"
              min={15}
              max={85}
              value={splitPct}
              onChange={(e) => setSplitPct(parseInt(e.target.value))}
              className="w-16 h-1"
              title={`Split: ${splitPct}%`}
            />
            <span className={classNames("text-[10px] w-7 text-center font-mono", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>
              {splitPct}%
            </span>
          </div>
        </>
      )}

      <div className={classNames("mx-1 h-4 w-px flex-shrink-0", theme === 'dark' ? "bg-gray-700" : "bg-gray-300")} />

      {/* Layout Controls - Icon Only */}
      <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-shrink-0">
        <button className={classNames(
          "px-1.5 py-0.5 text-xs rounded-md transition-all",
          orientation === "horizontal"
            ? theme === 'dark'
              ? "bg-purple-600 text-white shadow-md"
              : "bg-purple-500 text-white shadow-md"
            : "hover:bg-gray-200 dark:hover:bg-gray-700"
        )} onClick={() => setOrientation("horizontal")} title="Horizontal Split">
          ↔
        </button>
        <button className={classNames(
          "px-1.5 py-0.5 text-xs rounded-md transition-all",
          orientation === "vertical"
            ? theme === 'dark'
              ? "bg-purple-600 text-white shadow-md"
              : "bg-purple-500 text-white shadow-md"
            : "hover:bg-gray-200 dark:hover:bg-gray-700"
        )} onClick={() => setOrientation("vertical")} title="Vertical Split">
          ↕
        </button>
        <button className={classNames(
          "px-1.5 py-0.5 text-xs rounded-md transition-all hover:scale-110",
          swap
            ? theme === 'dark'
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-indigo-500 text-white shadow-md"
            : "hover:bg-gray-200 dark:hover:bg-gray-700"
        )} onClick={() => setSwap((s) => !s)} title="Swap Panes (Ctrl+S / ⌘S)">
          ⇄
        </button>
      </div>

      {/* Right Side Actions */}
      <div className="ml-auto flex items-center gap-1 flex-shrink-0">
        <button className={classNames(
          "px-1.5 py-0.5 text-sm rounded-md transition-all hover:scale-110",
          theme === 'dark' ? "hover:bg-gray-800" : "hover:bg-gray-100"
        )} onClick={() => setShowKeyboardShortcuts(true)} title="Keyboard Shortcuts">
          ℹ️
        </button>

        <button className={classNames(
          "px-1.5 py-0.5 text-sm rounded-md transition-all hover:scale-110",
          theme === 'dark' ? "hover:bg-gray-800" : "hover:bg-gray-100"
        )} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle Theme (Ctrl+D / ⌘D)">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        <button className={classNames(
          "px-1.5 py-0.5 text-sm rounded-md transition-all hover:scale-110",
          theme === 'dark' ? "hover:bg-gray-800" : "hover:bg-gray-100"
        )} onClick={toggleFullscreen} title="Fullscreen (F11)">
          {isFullscreen ? '◧' : '⛶'}
        </button>

        <button className={classNames(
          "px-1.5 py-0.5 text-xs rounded-md transition-all hover:scale-110",
          theme === 'dark' ? "text-gray-500 hover:bg-gray-800" : "text-gray-400 hover:bg-gray-100"
        )} onClick={() => setShowToolbar(false)} title="Hide Toolbar (Ctrl+H / ⌘H)">
          ×
        </button>
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
        <DropHint kind="PDF" onClick={() => filePdfRef.current?.click()} />
      )}
    </Pane>
  );

  const AppPane = () => (
    <Pane>
      {appUrl || appSrcDoc ? (
        <iframe title="calculator" className="w-full h-full" {...calcIframeProps} />
      ) : (
        <DropHint kind="HTML" onClick={() => fileHtmlRef.current?.click()} />
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
            "fixed top-2 left-2 z-50 px-2 py-1 text-xs rounded-lg border transition-all duration-300 shadow-lg hover:scale-110 backdrop-blur-sm",
            theme === 'dark'
              ? "bg-gray-900/90 border-gray-700 text-white hover:bg-gray-800"
              : "bg-white/90 border-gray-300 text-gray-700 hover:bg-gray-50"
          )}
          onClick={() => setShowToolbar(true)}
          title="Show Toolbar (Ctrl+H / ⌘H)"
        >
          ☰
        </button>
      )}

      {/* Work area */}
      {view === "paper" && (
        <div className="flex-1">
          <div className="w-full h-full"><PaperPane /></div>
        </div>
      )}

      {view === "app" && (
        <div className="flex-1">
          <div className="w-full h-full"><AppPane /></div>
        </div>
      )}

      {view === "split" && (
        <div className={classNames("flex-1 split-container", orientation === "horizontal" ? "" : "")}>
          {orientation === "horizontal" ? (
            <div className="w-full h-full flex relative">
              <div className="h-full" style={{ width: `${splitPct}%` }}>
                {swap ? <AppPane /> : <PaperPane />}
              </div>

              {/* Draggable divider - ultra thin Apple style */}
              <div
                className={classNames(
                  "w-px h-full cursor-col-resize flex items-center justify-center group relative",
                  theme === 'dark' ? "bg-gray-700/50" : "bg-gray-300/50"
                )}
                onMouseDown={handleMouseDown}
              >
                {/* Invisible hit area for easier grabbing */}
                <div className="absolute inset-y-0 -inset-x-2" />
                {/* Visible handle on hover */}
                <div className={classNames(
                  "absolute w-1 h-20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                  isDragging
                    ? "opacity-100"
                    : "",
                  theme === 'dark' ? "bg-blue-500" : "bg-blue-400"
                )} />
              </div>

              <div className="h-full flex-1">
                {swap ? <PaperPane /> : <AppPane />}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col relative">
              <div className="w-full" style={{ height: `${splitPct}%` }}>
                {swap ? <AppPane /> : <PaperPane />}
              </div>

              {/* Draggable divider - ultra thin Apple style */}
              <div
                className={classNames(
                  "w-full h-px cursor-row-resize flex items-center justify-center group relative",
                  theme === 'dark' ? "bg-gray-700/50" : "bg-gray-300/50"
                )}
                onMouseDown={handleMouseDown}
              >
                {/* Invisible hit area for easier grabbing */}
                <div className="absolute inset-x-0 -inset-y-2" />
                {/* Visible handle on hover */}
                <div className={classNames(
                  "absolute w-20 h-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                  isDragging
                    ? "opacity-100"
                    : "",
                  theme === 'dark' ? "bg-blue-500" : "bg-blue-400"
                )} />
              </div>

              <div className="w-full flex-1">
                {swap ? <PaperPane /> : <AppPane />}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowKeyboardShortcuts(false)}>
          <div 
            className={classNames(
              "relative max-w-md w-full mx-4 p-6 rounded-xl shadow-2xl border",
              theme === 'dark' 
                ? "bg-gray-900 border-gray-700 text-white" 
                : "bg-white border-gray-200"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Keyboard Shortcuts
              </h3>
              <button 
                className={classNames(
                  "px-2 py-1 text-sm rounded-md transition-all hover:scale-110",
                  theme === 'dark' ? "hover:bg-gray-800" : "hover:bg-gray-100"
                )}
                onClick={() => setShowKeyboardShortcuts(false)}
                title="Close"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span>Split View</span>
                <div className="flex gap-1">
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>Ctrl+1</kbd>
                  <span className="text-xs opacity-50">/</span>
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>⌘1</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Paper Only</span>
                <div className="flex gap-1">
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>Ctrl+2</kbd>
                  <span className="text-xs opacity-50">/</span>
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>⌘2</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>HTML Only</span>
                <div className="flex gap-1">
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>Ctrl+3</kbd>
                  <span className="text-xs opacity-50">/</span>
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>⌘3</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Toggle Theme</span>
                <div className="flex gap-1">
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>Ctrl+D</kbd>
                  <span className="text-xs opacity-50">/</span>
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>⌘D</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Fullscreen</span>
                <kbd className={classNames(
                  "px-2 py-1 text-xs font-mono rounded border",
                  theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                )}>F11</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span>Swap Panes</span>
                <div className="flex gap-1">
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>Ctrl+S</kbd>
                  <span className="text-xs opacity-50">/</span>
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>⌘S</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Hide/Show Toolbar</span>
                <div className="flex gap-1">
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>Ctrl+H</kbd>
                  <span className="text-xs opacity-50">/</span>
                  <kbd className={classNames(
                    "px-2 py-1 text-xs font-mono rounded border",
                    theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
                  )}>⌘H</kbd>
                </div>
              </div>
            </div>
            
            <div className={classNames(
              "mt-4 pt-4 border-t text-xs text-center opacity-70",
              theme === 'dark' ? "border-gray-700" : "border-gray-200"
            )}>
              Press <kbd className={classNames(
                "px-1.5 py-0.5 font-mono rounded border mx-1",
                theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-300"
              )}>Esc</kbd> to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DropHint({ kind, onClick }: { kind: "PDF" | "HTML"; onClick: () => void }) {
  return (
    <div
      className="h-full w-full flex items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      onClick={onClick}
    >
      <div className="text-center text-gray-400 dark:text-gray-500 pointer-events-none">
        <div className="text-4xl mb-2 opacity-50">{kind === "PDF" ? "📄" : "🌐"}</div>
        <div className="text-sm font-medium mb-1">No {kind} loaded</div>
        <div className="text-xs opacity-70">Click here or drop a {kind} file</div>
      </div>
    </div>
  );
}