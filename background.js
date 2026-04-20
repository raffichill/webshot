const MENU_ID = "webshot-capture";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Webshot",
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
  transition-duration: 767.53ms;
  /* prettier-ignore */
  transition-timing-function: linear(0 0%, 0.002882 1%, 0.011073 2%, 0.023927 3%, 0.040842 4%, 0.061266 5%, 0.084685 6%, 0.110628 7%, 0.138663 8%, 0.168396 9%, 0.199466 10%, 0.231547 11%, 0.264343 12%, 0.297587 13%, 0.331042 14%, 0.364494 15%, 0.397755 16%, 0.430658 17%, 0.463057 18%, 0.494827 19%, 0.52586 20%, 0.556063 21%, 0.585359 22%, 0.613686 23%, 0.640992 24%, 0.66724 25%, 0.6924 26%, 0.716453 27%, 0.739389 28%, 0.761204 29%, 0.781901 30%, 0.801491 31%, 0.819987 32%, 0.837409 33%, 0.85378 34%, 0.869125 35%, 0.883475 36%, 0.896861 37%, 0.909316 38%, 0.920876 39%, 0.931575 40%, 0.941451 41%, 0.950541 42%, 0.958883 43%, 0.966513 44%, 0.97347 45%, 0.979791 46%, 0.985511 47%, 0.990666 48%, 0.99529 49%, 0.999419 50%, 1.003084 51%, 1.006317 52%, 1.009148 53%, 1.011608 54%, 1.013724 55%, 1.015523 56%, 1.017032 57%, 1.018273 58%, 1.01927 59%, 1.020046 60%, 1.020621 61%, 1.021015 62%, 1.021245 63%, 1.021329 64%, 1.021283 65%, 1.021122 66%, 1.020859 67%, 1.020509 68%, 1.020082 69%, 1.01959 70%, 1.019043 71%, 1.018451 72%, 1.017821 73%, 1.017161 74%, 1.016479 75%, 1.015781 76%, 1.015073 77%, 1.01436 78%, 1.013646 79%, 1.012936 80%, 1.012233 81%, 1.01154 82%, 1.010861 83%, 1.010197 84%, 1.00955 85%, 1.008923 86%, 1.008316 87%, 1.007731 88%, 1.007168 89%, 1.006628 90%, 1.006112 91%, 1.00562 92%, 1.005151 93%, 1.004707 94%, 1.004286 95%, 1.003889 96%, 1.003514 97%, 1.003162 98%, 1.002832 99%, 1.002523 100%);
  transform: translateY(0);
}
.webshot-toast.is-out {
  transition-duration: 400ms;
  transition-timing-function: cubic-bezier(0.36, 0, 0.66, -0.15);
  transform: translateY(calc(100% + 36px));
}
`;
    document.documentElement.appendChild(style);
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
