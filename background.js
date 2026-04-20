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

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
    flashScreen();
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
