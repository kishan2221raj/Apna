const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/login.html"));
}

app.whenReady().then(async () => {
  // Start integrated backend server and wait until it's listening
  try {
    const { serverReady } = require("./server/server.js");
    await serverReady;
    console.log("Backend server integrated and started.");
  } catch (err) {
    console.error("Failed to start integrated server:", err);
  }

  createWindow();

  // ── PDF Save Handler ─────────────────────────────────────────────────────────
  ipcMain.handle("save-pdf", async (event, { html, defaultFileName }) => {
    try {
      // Ask user where to save
      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: "Save as PDF",
        defaultPath: defaultFileName || "report.pdf",
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      });
      if (canceled || !filePath) return { success: false, reason: "canceled" };

      // Create a hidden window to render the HTML
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
      await pdfWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

      // Wait a moment for rendering to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const pdfData = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
      });
      pdfWin.destroy();

      fs.writeFileSync(filePath, pdfData);
      return { success: true, filePath };
    } catch (err) {
      console.error("PDF save error:", err.message);
      return { success: false, reason: err.message };
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (serverProcess) serverProcess.kill();
});