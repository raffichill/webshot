const statusEl = document.getElementById("status");
const buttons = [...document.querySelectorAll("button[data-mode]")];

for (const button of buttons) {
  button.addEventListener("click", async () => {
    const { mode } = button.dataset;
    setBusy(true, mode === "full-content" ? "Capturing full page..." : "Capturing...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "capture-mode",
        mode,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Capture failed");
      }

      window.close();
    } catch (error) {
      setBusy(false, String(error));
    }
  });
}

function setBusy(isBusy, message) {
  for (const button of buttons) {
    button.disabled = isBusy;
  }

  statusEl.textContent = message || "";
}
