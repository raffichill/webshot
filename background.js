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

  function ensureStyles() {
    const ID = "webshot-toast-styles";
    if (document.getElementById(ID)) return;
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = `
.webshot-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 10px 14px 11px;
  background: rgba(17, 17, 17, 0.92);
  color: white;
  font: 500 13px/1 -apple-system, system-ui, sans-serif;
  border-radius: 8px;
  z-index: 2147483647;
  pointer-events: none;
  transform: translateY(calc(100% + 104px));
  transition-property: transform;
}
.webshot-toast.is-in {
  transition-duration: 921.03ms;
  /* prettier-ignore */
  transition-timing-function: linear(0 0%, 0.002418 1%, 0.00935 2%, 0.020334 3%, 0.034933 4%, 0.052732 5%, 0.073343 6%, 0.096399 7%, 0.121559 8%, 0.148503 9%, 0.176933 10%, 0.206572 11%, 0.237164 12%, 0.268473 13%, 0.300282 14%, 0.332391 15%, 0.364621 16%, 0.396805 17%, 0.428795 18%, 0.460458 19%, 0.491674 20%, 0.522337 21%, 0.552354 22%, 0.581643 23%, 0.610135 24%, 0.63777 25%, 0.664498 26%, 0.690278 27%, 0.715078 28%, 0.738873 29%, 0.761645 30%, 0.783384 31%, 0.804085 32%, 0.823747 33%, 0.842377 34%, 0.859983 35%, 0.87658 36%, 0.892185 37%, 0.906817 38%, 0.9205 39%, 0.933259 40%, 0.945122 41%, 0.956116 42%, 0.966273 43%, 0.975624 44%, 0.984201 45%, 0.992037 46%, 0.999165 47%, 1.005618 48%, 1.011431 49%, 1.016636 50%, 1.021267 51%, 1.025356 52%, 1.028935 53%, 1.032036 54%, 1.03469 55%, 1.036926 56%, 1.038774 57%, 1.040261 58%, 1.041415 59%, 1.042263 60%, 1.042829 61%, 1.043137 62%, 1.043211 63%, 1.043072 64%, 1.042742 65%, 1.04224 66%, 1.041584 67%, 1.040793 68%, 1.039884 69%, 1.038871 70%, 1.03777 71%, 1.036594 72%, 1.035356 73%, 1.034067 74%, 1.03274 75%, 1.031382 76%, 1.030005 77%, 1.028616 78%, 1.027223 79%, 1.025833 80%, 1.024453 81%, 1.023087 82%, 1.021742 83%, 1.020422 84%, 1.019129 85%, 1.017869 86%, 1.016644 87%, 1.015456 88%, 1.014308 89%, 1.013201 90%, 1.012137 91%, 1.011116 92%, 1.010139 93%, 1.009207 94%, 1.00832 95%, 1.007478 96%, 1.00668 97%, 1.005927 98%, 1.005217 99%, 1.00455 100%);
  transform: translateY(0);
}
.webshot-toast.is-out {
  transition-duration: 400ms;
  transition-timing-function: cubic-bezier(0.36, 0, 0.66, -0.15);
  transform: translateY(calc(100% + 104px));
}
`;
    document.documentElement.appendChild(style);
  }

  function flash(text) {
    const HOLD_MS = 1200;
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
