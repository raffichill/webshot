const MENU_ID = "webshot-capture";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Webshot: copy page as image",
    contexts: ["page", "image", "link", "selection", "frame", "video", "audio"]
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
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyImageFromDataUrl,
      args: [dataUrl]
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
      resizeQuality: "high"
    });
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext("2d").drawImage(resized, 0, 0);
    resized.close?.();
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
  }

  function flash(text) {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      padding: "10px 14px",
      background: "rgba(17,17,17,0.92)",
      color: "white",
      font: "500 13px/1 -apple-system, system-ui, sans-serif",
      borderRadius: "8px",
      zIndex: "2147483647",
      boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 120ms ease"
    });
    document.documentElement.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; });
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 200);
    }, 1200);
  }
}
