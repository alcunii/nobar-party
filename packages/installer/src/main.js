const { invoke } = window.__TAURI__.core;

const screens = ["welcome", "extracting", "load", "return", "done"];
function show(name) {
  for (const s of screens) {
    const el = document.getElementById(`screen-${s}`);
    if (!el) continue;
    el.hidden = s !== name;
  }
}

let chromeBin = null;
let extensionPath = null;

async function init() {
  chromeBin = await invoke("detect_chrome");
  const status = document.getElementById("chrome-status");
  const btn = document.getElementById("btn-install");
  if (chromeBin) {
    status.textContent = "Chrome detected.";
    btn.disabled = false;
  } else {
    status.innerHTML = "Chrome not found. <a href='#' id='dl-chrome'>Download Chrome</a>.";
    document.getElementById("dl-chrome").addEventListener("click", (e) => {
      e.preventDefault();
      invoke("open_url", { url: "https://www.google.com/chrome/" });
    });
  }
  btn.addEventListener("click", onInstall);
  document.getElementById("btn-done-load").addEventListener("click", () => show("return"));
  document.getElementById("btn-next-done").addEventListener("click", () => show("done"));
  document.getElementById("btn-close").addEventListener("click", () => window.close());
  document.getElementById("btn-open-url").addEventListener("click", async () => {
    const url = document.getElementById("fallback-url").value.trim();
    if (!/^https:\/\/[\w.-]+\/join\?room=[A-Z0-9]{6}$/.test(url)) {
      alert("Please paste a valid invite link like https://watch.example.com/join?room=ABC123");
      return;
    }
    await invoke("open_url", { url });
  });
}

async function onInstall() {
  show("extracting");
  try {
    extensionPath = await invoke("extract_extension");
  } catch (e) {
    document.getElementById("extract-msg").textContent = `Extraction failed: ${e}`;
    return;
  }
  document.getElementById("ext-path").textContent = extensionPath;
  await invoke("copy_to_clipboard", { text: extensionPath });
  if (chromeBin) {
    await invoke("open_chrome_extensions", { chromeBin });
  }
  show("load");
}

init();
