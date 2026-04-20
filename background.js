const MENU_ID = "webshot-capture";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Webshot!",
    contexts: ["page", "image", "link", "selection", "frame", "video", "audio"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  await capture(tab);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await capture(tab);
});

async function capture(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyImageFromDataUrl,
      args: [dataUrl],
    });
    if (!result?.result?.ok) {
      console.warn("Webshot clipboard write failed:", result?.result?.error);
    }
  } catch (err) {
    console.error("Webshot capture failed:", err);
  }
}

async function copyImageFromDataUrl(dataUrl) {
  try {
    const blob = await toCssPixelBlob(dataUrl);
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    flash("Copied to clipboard");
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

  function flash(text) {
    const IN_EASE = "cubic-bezier(0.42, 0, 0.58, 1)";
    const OUT_SPRING = "cubic-bezier(0.36, 0, 0.66, -0.15)";
    const HIDDEN = "translateY(calc(100% + 104px))";
    const SHOWN = "translateY(0)";
    const IN_MS = 240;
    const OUT_MS = 400;
    const HOLD_MS = 1200;

    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      padding: "10px 14px 11px",
      background: "rgba(17,17,17,0.92)",
      color: "white",
      font: "500 13px/1 -apple-system, system-ui, sans-serif",
      borderRadius: "8px",
      zIndex: "2147483647",
      // boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      pointerEvents: "none",
      transform: HIDDEN,
      transition: `transform ${IN_MS}ms ${IN_EASE}`,
    });
    document.documentElement.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = SHOWN;
    });
    setTimeout(() => {
      el.style.transition = `transform ${OUT_MS}ms ${OUT_SPRING}`;
      el.style.transform = HIDDEN;
      setTimeout(() => el.remove(), OUT_MS);
    }, HOLD_MS);
  }
}
