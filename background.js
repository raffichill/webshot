const MENU_ROOT_ID = "webshot";
const MENU_VIEWPORT_ID = "webshot-capture-viewport";
const MENU_FULL_CONTENT_ID = "webshot-capture-full-content";

const CAPTURE_MODE_VIEWPORT = "viewport";
const CAPTURE_MODE_FULL_CONTENT = "full-content";

const DEBUGGER_PROTOCOL_VERSION = "1.3";
const MAX_VIEWPORT_GROWTH_PASSES = 10;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ROOT_ID,
      title: "Webshot",
      contexts: ["page", "image", "link", "selection", "frame", "video", "audio"],
    });
    chrome.contextMenus.create({
      id: MENU_VIEWPORT_ID,
      parentId: MENU_ROOT_ID,
      title: "Copy visible viewport",
      contexts: ["page", "image", "link", "selection", "frame", "video", "audio"],
    });
    chrome.contextMenus.create({
      id: MENU_FULL_CONTENT_ID,
      parentId: MENU_ROOT_ID,
      title: "Copy full page content",
      contexts: ["page", "image", "link", "selection", "frame", "video", "audio"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_VIEWPORT_ID) {
    await capture(tab, CAPTURE_MODE_VIEWPORT);
  }
  if (info.menuItemId === MENU_FULL_CONTENT_ID) {
    await capture(tab, CAPTURE_MODE_FULL_CONTENT);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "capture-mode") return;

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }

      await capture(tab, message.mode);
      sendResponse({ ok: true });
    } catch (error) {
      console.error("Webshot popup capture failed:", error);
      sendResponse({ ok: false, error: String(error) });
    }
  })();

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === "capture") {
    await capture(tab, CAPTURE_MODE_VIEWPORT);
  }
  if (command === "capture-full-content") {
    await capture(tab, CAPTURE_MODE_FULL_CONTENT);
  }
});

async function capture(tab, mode = CAPTURE_MODE_VIEWPORT) {
  try {
    const dataUrl =
      mode === CAPTURE_MODE_FULL_CONTENT
        ? await captureFullContent(tab)
        : await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyImageFromDataUrl,
      args: [
        dataUrl,
        mode === CAPTURE_MODE_FULL_CONTENT
          ? "Copied full page to clipboard"
          : "Copied to clipboard",
      ],
    });
    if (!result?.result?.ok) {
      console.warn("Webshot clipboard write failed:", result?.result?.error);
    }
  } catch (err) {
    console.error("Webshot capture failed:", err);
  }
}

async function captureFullContent(tab) {
  const debuggee = { tabId: tab.id };
  const originalViewport = await getViewportState(tab.id);

  await chrome.debugger.attach(debuggee, DEBUGGER_PROTOCOL_VERSION);

  try {
    await chrome.debugger.sendCommand(debuggee, "Page.enable");
    await setViewportOverride(debuggee, originalViewport.viewportWidth, originalViewport.viewportHeight, originalViewport.deviceScaleFactor);
    await setPageScroll(tab.id, 0, 0);
    await settlePage(tab.id);

    let previousTarget = null;

    for (let pass = 0; pass < MAX_VIEWPORT_GROWTH_PASSES; pass += 1) {
      const bounds = await measurePageBounds(tab.id);

      if (!bounds.canScrollX && !bounds.canScrollY) {
        break;
      }

      const target = {
        width: Math.max(1, bounds.viewportWidth, Math.ceil(bounds.scrollWidth)),
        height: Math.max(1, bounds.viewportHeight, Math.ceil(bounds.scrollHeight)),
      };

      if (
        previousTarget &&
        previousTarget.width === target.width &&
        previousTarget.height === target.height
      ) {
        break;
      }

      previousTarget = target;
      await setViewportOverride(
        debuggee,
        target.width,
        target.height,
        originalViewport.deviceScaleFactor,
      );
      await settlePage(tab.id);
    }

    const finalBounds = await measurePageBounds(tab.id);
    const screenshot = await chrome.debugger.sendCommand(
      debuggee,
      "Page.captureScreenshot",
      {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.max(1, Math.ceil(finalBounds.scrollWidth)),
          height: Math.max(1, Math.ceil(finalBounds.scrollHeight)),
          scale: 1,
        },
      },
    );

    return `data:image/png;base64,${screenshot.data}`;
  } finally {
    try {
      await chrome.debugger.sendCommand(debuggee, "Emulation.clearDeviceMetricsOverride");
      await settlePage(tab.id);
    } catch (err) {
      console.warn("Webshot failed to clear viewport override:", err);
    }

    try {
      await setPageScroll(tab.id, originalViewport.scrollX, originalViewport.scrollY);
    } catch (err) {
      console.warn("Webshot failed to restore scroll position:", err);
    }

    try {
      await chrome.debugger.detach(debuggee);
    } catch (err) {
      console.warn("Webshot failed to detach debugger:", err);
    }
  }
}

async function setViewportOverride(debuggee, width, height, deviceScaleFactor) {
  await chrome.debugger.sendCommand(debuggee, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
}

async function getViewportState(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      viewportWidth: Math.ceil(window.innerWidth),
      viewportHeight: Math.ceil(window.innerHeight),
      deviceScaleFactor: window.devicePixelRatio || 1,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }),
  });

  return result.result;
}

async function measurePageBounds(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const root = document.documentElement;
      const body = document.body;
      const scrollingElement = document.scrollingElement || root;
      const scrollWidth = Math.max(
        root?.scrollWidth || 0,
        body?.scrollWidth || 0,
        scrollingElement?.scrollWidth || 0,
      );
      const scrollHeight = Math.max(
        root?.scrollHeight || 0,
        body?.scrollHeight || 0,
        scrollingElement?.scrollHeight || 0,
      );
      const viewportWidth = Math.ceil(window.innerWidth);
      const viewportHeight = Math.ceil(window.innerHeight);

      return {
        scrollWidth,
        scrollHeight,
        viewportWidth,
        viewportHeight,
        canScrollX: scrollWidth > viewportWidth + 1,
        canScrollY: scrollHeight > viewportHeight + 1,
      };
    },
  });

  return result.result;
}

async function setPageScroll(tabId, x, y) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollX, scrollY) => {
      window.scrollTo(scrollX, scrollY);
    },
    args: [x, y],
  });
}

async function settlePage(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    },
  });
}

async function copyImageFromDataUrl(dataUrl, successText = "Copied to clipboard") {
  try {
    const blob = await toCssPixelBlob(dataUrl);
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    flashScreen();
    flash(successText);
    return { ok: true };
  } catch (error) {
    flash("Webshot: clipboard blocked — click the page and retry");
    return { ok: false, error: String(error) };
  }

  async function toCssPixelBlob(src) {
    const dpr = window.devicePixelRatio || 1;
    const sourceBlob = await (await fetch(src)).blob();
    if (dpr <= 1) return sourceBlob;
    const probe = await createImageBitmap(sourceBlob);
    const targetW = Math.round(probe.width / dpr);
    const targetH = Math.round(probe.height / dpr);
    probe.close?.();
    const resized = await createImageBitmap(sourceBlob, {
      resizeWidth: targetW,
      resizeHeight: targetH,
      resizeQuality: "high",
    });
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext("2d").drawImage(resized, 0, 0);
    resized.close?.();
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/png",
      );
    });
  }

  function ensureStyles() {
    const ID = "webshot-toast-styles";
    let style = document.getElementById(ID);
    if (!style) {
      style = document.createElement("style");
      style.id = ID;
      document.documentElement.appendChild(style);
    }
    style.textContent = `
.webshot-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 10px 12px 11px;
  background: rgba(17, 17, 17, 0.92);
  color: white;
  font: 500 13px/1 -apple-system, system-ui, sans-serif;
  border-radius: 8px;
  corner-shape: squircle;
  z-index: 2147483647;
  pointer-events: none;
  transform: translateY(calc(100% + 36px));
  transition-property: transform;
}
.webshot-toast.is-in {
  transition-duration: 614.02ms;
  /* prettier-ignore */
  transition-timing-function: linear(0 0%, 0.004755 1%, 0.018082 2%, 0.038664 3%, 0.065298 4%, 0.096895 5%, 0.13247 6%, 0.171139 7%, 0.212112 8%, 0.254688 9%, 0.298249 10%, 0.342254 11%, 0.386232 12%, 0.429779 13%, 0.47255 14%, 0.514258 15%, 0.554664 16%, 0.593573 17%, 0.630833 18%, 0.666329 19%, 0.699976 20%, 0.731721 21%, 0.761532 22%, 0.789404 23%, 0.815348 24%, 0.839391 25%, 0.861575 26%, 0.881953 27%, 0.900589 28%, 0.91755 29%, 0.932915 30%, 0.946761 31%, 0.959173 32%, 0.970235 33%, 0.980032 34%, 0.98865 35%, 0.996172 36%, 1.002683 37%, 1.008261 38%, 1.012986 39%, 1.016932 40%, 1.020172 41%, 1.022773 42%, 1.0248 43%, 1.026315 44%, 1.027375 45%, 1.028033 46%, 1.02834 47%, 1.02834 48%, 1.028078 49%, 1.027592 50%, 1.026917 51%, 1.026087 52%, 1.02513 53%, 1.024074 54%, 1.022941 55%, 1.021753 56%, 1.020529 57%, 1.019284 58%, 1.018035 59%, 1.016792 60%, 1.015566 61%, 1.014366 62%, 1.013201 63%, 1.012075 64%, 1.010994 65%, 1.009962 66%, 1.008981 67%, 1.008053 68%, 1.00718 69%, 1.006361 70%, 1.005598 71%, 1.004889 72%, 1.004234 73%, 1.00363 74%, 1.003077 75%, 1.002573 76%, 1.002114 77%, 1.0017 78%, 1.001328 79%, 1.000996 80%, 1.0007 81%, 1.000439 82%, 1.000211 83%, 1.000012 84%);
  transform: translateY(0);
}
.webshot-toast.is-out {
  transition-duration: 400ms;
  transition-timing-function: cubic-bezier(0.36, 0, 0.66, -0.15);
  transform: translateY(calc(100% + 36px));
}
@keyframes webshot-flash {
  0%     { opacity: 0; animation-timing-function: linear; }
  5.66%  { opacity: 1; animation-timing-function: ease-in-out; }
  100%   { opacity: 0; }
}
.webshot-flash {
  position: fixed;
  inset: 0;
  background: white;
  opacity: 0;
  pointer-events: none;
  z-index: 2147483646;
  animation: webshot-flash 1060ms forwards;
}
`;
  }

  function flashScreen() {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "webshot-flash";
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function flash(text) {
    const HOLD_MS = 1400;
    const OUT_MS = 400;
    ensureStyles();
    const el = document.createElement("div");
    el.className = "webshot-toast";
    el.textContent = text;
    document.documentElement.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    setTimeout(() => {
      el.classList.remove("is-in");
      el.classList.add("is-out");
      setTimeout(() => el.remove(), OUT_MS);
    }, HOLD_MS);
  }
}
