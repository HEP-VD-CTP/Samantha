// src-electron/electron-main.ts
import { app, ipcMain, BrowserWindow, dialog, shell } from "electron";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import axios from "axios";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";

// package.json
var package_default = {
  name: "samantha",
  version: "1.0.0",
  description: "Samantha is a video processing application that allows users to edit and manage video files with ease.",
  productName: "Samantha",
  author: "Marcel Grosjean <marcel.grosjean@hepl.ch>",
  type: "module",
  private: true,
  scripts: {
    test: 'echo "No test specified" && exit 0',
    dev: "quasar dev",
    build: "quasar build",
    postinstall: "quasar prepare"
  },
  dependencies: {
    "@quasar/extras": "^1.16.4",
    axios: "^1.9.0",
    "fluent-ffmpeg": "^2.1.3",
    pinia: "^3.0.1",
    quasar: "^2.18.2",
    "video.js": "^8.22.0",
    vue: "^3.4.18",
    "vue-i18n": "^11.0.0",
    "vue-router": "^4.0.12"
  },
  devDependencies: {
    "@electron/packager": "^18.3.6",
    "@intlify/unplugin-vue-i18n": "^4.0.0",
    "@quasar/app-vite": "^2.3.0",
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^20.5.9",
    autoprefixer: "^10.4.2",
    electron: "^35.1.2",
    typescript: "~5.5.3"
  },
  engines: {
    node: "^28 || ^26 || ^24 || ^22 || ^20 || ^18",
    npm: ">= 6.13.4",
    yarn: ">= 1.21.1"
  }
};

// src-electron/electron-main.ts
var platform = process.platform || os.platform();
var currentDir = fileURLToPath(new URL(".", import.meta.url));
var mainWindow;
var pythonProcess = null;
if (false) {
  const pythonExecutable = path.resolve(currentDir, "main", "main");
  pythonProcess = spawn(pythonExecutable, [], {
    stdio: "inherit",
    cwd: currentDir,
    env: process.env
  });
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    icon: path.resolve(currentDir, "icons/icon.png"),
    // tray icon
    width: 1024,
    height: 768,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false,
      contextIsolation: true,
      sandbox: false,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(
        currentDir,
        path.join("/Users/marcel/Desktop/Samantha/.quasar/dev-electron/preload", "electron-preload.cjs")
      )
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.setTitle(`Samantha ${package_default.version}`);
  });
  if (true) {
    await mainWindow.loadURL("http://localhost:9300");
  } else {
    await mainWindow.loadFile("index.html");
  }
  if (true) {
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.webContents.on("devtools-opened", () => {
    });
  }
  mainWindow.on("closed", () => {
    mainWindow = void 0;
  });
}
void app.whenReady().then(createWindow);
ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled)
    return null;
  return result.filePaths[0];
});
ipcMain.on("setup-progress", (event, message) => {
  if (mainWindow)
    mainWindow.webContents.send("setup-progress", message);
});
ipcMain.on("open-folder", (event, folderPath) => {
  shell.openPath(folderPath);
});
ipcMain.handle("download-models", async (_event, dest, url) => {
  const response = await axios.get(url, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(dest);
    response.data.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  await fs.chmod(dest, 493);
  return { success: true };
});
ipcMain.handle("read-workspace", async (_event, folderPath) => {
  const projectsPath = path.join(folderPath, "projects");
  const dir = await fs.opendir(projectsPath);
  const dirs = [];
  for await (const dirent of dir)
    if (dirent.isDirectory())
      dirs.push(dirent.name);
  return dirs;
});
ipcMain.handle("file-exists", async (_event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("pick-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Videos", extensions: ["mp4", "avi", "mov", "mkv", "webm", "wmv", "flv", "mpeg", "mpg"] }
    ]
  });
  if (result.canceled)
    return null;
  return result.filePaths[0];
});
app.on("window-all-closed", () => {
  if (platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === void 0) {
    void createWindow();
  }
});
app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
});
process.on("exit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
});
process.on("SIGINT", () => {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
  process.exit();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjLWVsZWN0cm9uL2VsZWN0cm9uLW1haW4udHMiLCAiLi4vLi4vcGFja2FnZS5qc29uIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBhcHAsIGlwY01haW4sIEJyb3dzZXJXaW5kb3csIGRpYWxvZywgc2hlbGwgfSBmcm9tICdlbGVjdHJvbidcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5pbXBvcnQgb3MgZnJvbSAnb3MnXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJ1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJ1xuaW1wb3J0IGZzIGZyb20gJ25vZGU6ZnMvcHJvbWlzZXMnXG5pbXBvcnQgeyBjcmVhdGVXcml0ZVN0cmVhbSB9IGZyb20gJ25vZGU6ZnMnXG5pbXBvcnQgcGFja2FnZUpzb24gZnJvbSAnLi4vcGFja2FnZS5qc29uJyBhc3NlcnQgeyB0eXBlOiAnanNvbicgfVxuaW1wb3J0IHsgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuXG5cblxuLy8gbmVlZGVkIGluIGNhc2UgcHJvY2VzcyBpcyB1bmRlZmluZWQgdW5kZXIgTGludXhcbmNvbnN0IHBsYXRmb3JtID0gcHJvY2Vzcy5wbGF0Zm9ybSB8fCBvcy5wbGF0Zm9ybSgpXG5cbmNvbnN0IGN1cnJlbnREaXIgPSBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4nLCBpbXBvcnQubWV0YS51cmwpKVxuXG5sZXQgbWFpbldpbmRvdzogQnJvd3NlcldpbmRvdyB8IHVuZGVmaW5lZFxuXG4vLyBSdW4gdGhlIHB5dGhvbiBiYWNrZW5kIG9uIHByb2R1Y3Rpb25cbmxldCBweXRob25Qcm9jZXNzOiBSZXR1cm5UeXBlPHR5cGVvZiBzcGF3bj4gfCBudWxsID0gbnVsbFxuaWYgKCFwcm9jZXNzLmVudi5ERUJVR0dJTkcpe1xuICBjb25zdCBweXRob25FeGVjdXRhYmxlID0gcGF0aC5yZXNvbHZlKGN1cnJlbnREaXIsICdtYWluJywgJ21haW4nKVxuXG4gIC8vIFN0YXJ0IHRoZSBQeXRob24gcHJvY2Vzc1xuICBweXRob25Qcm9jZXNzID0gc3Bhd24ocHl0aG9uRXhlY3V0YWJsZSwgW10sIHtcbiAgICBzdGRpbzogJ2luaGVyaXQnLFxuICAgIGN3ZDogY3VycmVudERpcixcbiAgICBlbnY6IHByb2Nlc3MuZW52IFxuICB9KVxufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVXaW5kb3coKSB7XG4gIC8qKlxuICAgKiBJbml0aWFsIHdpbmRvdyBvcHRpb25zXG4gICAqL1xuICBtYWluV2luZG93ID0gbmV3IEJyb3dzZXJXaW5kb3coe1xuICAgIGljb246IHBhdGgucmVzb2x2ZShjdXJyZW50RGlyLCAnaWNvbnMvaWNvbi5wbmcnKSwgLy8gdHJheSBpY29uXG4gICAgd2lkdGg6IDEwMjQsXG4gICAgaGVpZ2h0OiA3NjgsXG4gICAgdXNlQ29udGVudFNpemU6IHRydWUsXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcbiAgICAgIG5vZGVJbnRlZ3JhdGlvbjogdHJ1ZSxcbiAgICAgIHdlYlNlY3VyaXR5OiBmYWxzZSxcbiAgICAgIGNvbnRleHRJc29sYXRpb246IHRydWUsXG4gICAgICBzYW5kYm94OiBmYWxzZSxcbiAgICAgIC8vIE1vcmUgaW5mbzogaHR0cHM6Ly92Mi5xdWFzYXIuZGV2L3F1YXNhci1jbGktdml0ZS9kZXZlbG9waW5nLWVsZWN0cm9uLWFwcHMvZWxlY3Ryb24tcHJlbG9hZC1zY3JpcHRcbiAgICAgIHByZWxvYWQ6IHBhdGgucmVzb2x2ZShcbiAgICAgICAgY3VycmVudERpcixcbiAgICAgICAgcGF0aC5qb2luKHByb2Nlc3MuZW52LlFVQVNBUl9FTEVDVFJPTl9QUkVMT0FEX0ZPTERFUiwgJ2VsZWN0cm9uLXByZWxvYWQnICsgcHJvY2Vzcy5lbnYuUVVBU0FSX0VMRUNUUk9OX1BSRUxPQURfRVhURU5TSU9OKVxuICAgICAgKSxcbiAgICB9LFxuICB9KVxuXG4gIG1haW5XaW5kb3cud2ViQ29udGVudHMub24oJ2RpZC1maW5pc2gtbG9hZCcsICgpID0+IHtcbiAgICBtYWluV2luZG93Py5zZXRUaXRsZShgU2FtYW50aGEgJHtwYWNrYWdlSnNvbi52ZXJzaW9ufWApXG4gICAgLy8gb3BlbiBkZXYgdG9vbHNcbiAgICAvL21haW5XaW5kb3c/LndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpXG4gIH0pXG5cbiAgaWYgKHByb2Nlc3MuZW52LkRFVikge1xuICAgIGF3YWl0IG1haW5XaW5kb3cubG9hZFVSTChwcm9jZXNzLmVudi5BUFBfVVJMKVxuICB9IFxuICBlbHNlIHtcbiAgICBhd2FpdCBtYWluV2luZG93LmxvYWRGaWxlKCdpbmRleC5odG1sJylcbiAgfVxuXG4gIGlmIChwcm9jZXNzLmVudi5ERUJVR0dJTkcpIHtcbiAgICAvLyBpZiBvbiBERVYgb3IgUHJvZHVjdGlvbiB3aXRoIGRlYnVnIGVuYWJsZWRcbiAgICBtYWluV2luZG93LndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpXG4gIH0gZWxzZSB7XG4gICAgLy8gd2UncmUgb24gcHJvZHVjdGlvbjsgbm8gYWNjZXNzIHRvIGRldnRvb2xzIHBsc1xuICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMub24oJ2RldnRvb2xzLW9wZW5lZCcsICgpID0+IHtcbiAgICAgIC8vbWFpbldpbmRvdz8ud2ViQ29udGVudHMuY2xvc2VEZXZUb29scygpO1xuICAgIH0pXG4gIH1cblxuICBtYWluV2luZG93Lm9uKCdjbG9zZWQnLCAoKSA9PiB7XG4gICAgbWFpbldpbmRvdyA9IHVuZGVmaW5lZDtcbiAgfSlcbn1cblxudm9pZCBhcHAud2hlblJlYWR5KCkudGhlbihjcmVhdGVXaW5kb3cpO1xuXG4vLyBwaWNrIGEgZm9sZGVyIGZyb20gdGhlIGZpbGVzeXN0ZW1cbmlwY01haW4uaGFuZGxlKCdwaWNrLWZvbGRlcicsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nLnNob3dPcGVuRGlhbG9nKHtcbiAgICBwcm9wZXJ0aWVzOiBbJ29wZW5EaXJlY3RvcnknLCAnY3JlYXRlRGlyZWN0b3J5J10sIFxuICB9KVxuXG4gIGlmIChyZXN1bHQuY2FuY2VsZWQpIFxuICAgIHJldHVybiBudWxsXG5cbiAgcmV0dXJuIHJlc3VsdC5maWxlUGF0aHNbMF0gXG59KVxuXG4vLyBrZWVwIHRoZSB1c2VyIGluZm9ybWVkIGFib3V0IHRoZSBzZXR1cCBwcm9ncmVzc1xuaXBjTWFpbi5vbignc2V0dXAtcHJvZ3Jlc3MnLCAoZXZlbnQsIG1lc3NhZ2UpID0+IHtcbiAgaWYgKG1haW5XaW5kb3cpIFxuICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCBtZXNzYWdlKVxufSlcblxuLy8gb3BlbiBhIGZvbGRlciBpbiB0aGUgc3lzdGVtIGZpbGUgZXhwbG9yZXJcbmlwY01haW4ub24oJ29wZW4tZm9sZGVyJywgKGV2ZW50LCBmb2xkZXJQYXRoKSA9PiB7XG4gIHNoZWxsLm9wZW5QYXRoKGZvbGRlclBhdGgpXG59KVxuXG4vLyBkb3dubG9hZCBtb2RlbHMgZnJvbSBhIGdpdmVuIFVSTCBhbmQgc2F2ZSB0byBhIGRlc3RpbmF0aW9uIHBhdGhcbmlwY01haW4uaGFuZGxlKCdkb3dubG9hZC1tb2RlbHMnLCBhc3luYyAoX2V2ZW50LCBkZXN0OiBzdHJpbmcsIHVybDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KHVybCwgeyByZXNwb25zZVR5cGU6ICdzdHJlYW0nIH0pXG4gIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBzdHJlYW0gPSBjcmVhdGVXcml0ZVN0cmVhbShkZXN0KVxuICAgIHJlc3BvbnNlLmRhdGEucGlwZShzdHJlYW0pXG4gICAgc3RyZWFtLm9uKCdmaW5pc2gnLCByZXNvbHZlKVxuICAgIHN0cmVhbS5vbignZXJyb3InLCByZWplY3QpXG4gIH0pXG5cbiAgLy8gbWFrZSB0aGUgZmlsZSBleGVjdXRhYmxlXG4gIGF3YWl0IGZzLmNobW9kKGRlc3QsIDBvNzU1KVxuXG4gIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfVxufSlcblxuLy8gcmVhZCBhbGwgZGlyZWN0b3JpZXMgaW4gdGhlIHByb2plY3RzIGZvbGRlclxuaXBjTWFpbi5oYW5kbGUoJ3JlYWQtd29ya3NwYWNlJywgYXN5bmMgKF9ldmVudCwgZm9sZGVyUGF0aDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHByb2plY3RzUGF0aCA9IHBhdGguam9pbihmb2xkZXJQYXRoLCAncHJvamVjdHMnKVxuICBjb25zdCBkaXIgPSBhd2FpdCBmcy5vcGVuZGlyKHByb2plY3RzUGF0aClcbiAgY29uc3QgZGlyczogc3RyaW5nW10gPSBbXVxuXG4gIGZvciBhd2FpdCAoY29uc3QgZGlyZW50IG9mIGRpcilcbiAgICBpZiAoZGlyZW50LmlzRGlyZWN0b3J5KCkpIFxuICAgICAgZGlycy5wdXNoKGRpcmVudC5uYW1lKVxuICAgXG4gIHJldHVybiBkaXJzXG59KVxuXG4vLyBjaGVjayBpZiBhIGZpbGUgZXhpc3RzIG9uIHRoZSBmaWxlc3lzdGVtXG5pcGNNYWluLmhhbmRsZSgnZmlsZS1leGlzdHMnLCBhc3luYyAoX2V2ZW50LCBmaWxlUGF0aDogc3RyaW5nKSA9PiB7XG4gIHRyeSB7XG4gICAgYXdhaXQgZnMuYWNjZXNzKGZpbGVQYXRoKVxuICAgIHJldHVybiB0cnVlXG4gIH0gXG4gIGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSlcblxuLy8gb3BlbiBmaWxlIGV4cGxvcmVyIGFuZCBzZWxlY3QgYSB2aWRlbyBmaWxlXG5pcGNNYWluLmhhbmRsZSgncGljay1maWxlJywgYXN5bmMgKCkgPT4ge1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2cuc2hvd09wZW5EaWFsb2coe1xuICAgIHByb3BlcnRpZXM6IFsnb3BlbkZpbGUnXSxcbiAgICBmaWx0ZXJzOiBbXG4gICAgICB7IG5hbWU6ICdWaWRlb3MnLCBleHRlbnNpb25zOiBbJ21wNCcsICdhdmknLCAnbW92JywgJ21rdicsICd3ZWJtJywgJ3dtdicsICdmbHYnLCAnbXBlZycsICdtcGcnXSB9XG4gICAgXVxuICB9KVxuXG4gIGlmIChyZXN1bHQuY2FuY2VsZWQpIFxuICAgIHJldHVybiBudWxsXG5cbiAgcmV0dXJuIHJlc3VsdC5maWxlUGF0aHNbMF1cbn0pXG5cbmFwcC5vbignd2luZG93LWFsbC1jbG9zZWQnLCAoKSA9PiB7XG4gIGlmIChwbGF0Zm9ybSAhPT0gJ2RhcndpbicpIHtcbiAgICBhcHAucXVpdCgpXG4gIH1cbn0pXG5cbmFwcC5vbignYWN0aXZhdGUnLCAoKSA9PiB7XG4gIGlmIChtYWluV2luZG93ID09PSB1bmRlZmluZWQpIHtcbiAgICB2b2lkIGNyZWF0ZVdpbmRvdygpXG4gIH1cbn0pXG5cbmFwcC5vbignYmVmb3JlLXF1aXQnLCAoKSA9PiB7XG4gIGlmIChweXRob25Qcm9jZXNzKSB7XG4gICAgcHl0aG9uUHJvY2Vzcy5raWxsKClcbiAgICBweXRob25Qcm9jZXNzID0gbnVsbFxuICB9XG59KVxuXG5wcm9jZXNzLm9uKCdleGl0JywgKCkgPT4ge1xuICBpZiAocHl0aG9uUHJvY2Vzcykge1xuICAgIHB5dGhvblByb2Nlc3Mua2lsbCgpXG4gICAgcHl0aG9uUHJvY2VzcyA9IG51bGxcbiAgfVxufSlcblxucHJvY2Vzcy5vbignU0lHSU5UJywgKCkgPT4ge1xuICBpZiAocHl0aG9uUHJvY2Vzcykge1xuICAgIHB5dGhvblByb2Nlc3Mua2lsbCgpXG4gICAgcHl0aG9uUHJvY2VzcyA9IG51bGxcbiAgfVxuICBwcm9jZXNzLmV4aXQoKVxufSkiLCAie1xuICBcIm5hbWVcIjogXCJzYW1hbnRoYVwiLFxuICBcInZlcnNpb25cIjogXCIxLjAuMFwiLFxuICBcImRlc2NyaXB0aW9uXCI6IFwiU2FtYW50aGEgaXMgYSB2aWRlbyBwcm9jZXNzaW5nIGFwcGxpY2F0aW9uIHRoYXQgYWxsb3dzIHVzZXJzIHRvIGVkaXQgYW5kIG1hbmFnZSB2aWRlbyBmaWxlcyB3aXRoIGVhc2UuXCIsXG4gIFwicHJvZHVjdE5hbWVcIjogXCJTYW1hbnRoYVwiLFxuICBcImF1dGhvclwiOiBcIk1hcmNlbCBHcm9zamVhbiA8bWFyY2VsLmdyb3NqZWFuQGhlcGwuY2g+XCIsXG4gIFwidHlwZVwiOiBcIm1vZHVsZVwiLFxuICBcInByaXZhdGVcIjogdHJ1ZSxcbiAgXCJzY3JpcHRzXCI6IHtcbiAgICBcInRlc3RcIjogXCJlY2hvIFxcXCJObyB0ZXN0IHNwZWNpZmllZFxcXCIgJiYgZXhpdCAwXCIsXG4gICAgXCJkZXZcIjogXCJxdWFzYXIgZGV2XCIsXG4gICAgXCJidWlsZFwiOiBcInF1YXNhciBidWlsZFwiLFxuICAgIFwicG9zdGluc3RhbGxcIjogXCJxdWFzYXIgcHJlcGFyZVwiXG4gIH0sXG4gIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICBcIkBxdWFzYXIvZXh0cmFzXCI6IFwiXjEuMTYuNFwiLFxuICAgIFwiYXhpb3NcIjogXCJeMS45LjBcIixcbiAgICBcImZsdWVudC1mZm1wZWdcIjogXCJeMi4xLjNcIixcbiAgICBcInBpbmlhXCI6IFwiXjMuMC4xXCIsXG4gICAgXCJxdWFzYXJcIjogXCJeMi4xOC4yXCIsXG4gICAgXCJ2aWRlby5qc1wiOiBcIl44LjIyLjBcIixcbiAgICBcInZ1ZVwiOiBcIl4zLjQuMThcIixcbiAgICBcInZ1ZS1pMThuXCI6IFwiXjExLjAuMFwiLFxuICAgIFwidnVlLXJvdXRlclwiOiBcIl40LjAuMTJcIlxuICB9LFxuICBcImRldkRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJAZWxlY3Ryb24vcGFja2FnZXJcIjogXCJeMTguMy42XCIsXG4gICAgXCJAaW50bGlmeS91bnBsdWdpbi12dWUtaTE4blwiOiBcIl40LjAuMFwiLFxuICAgIFwiQHF1YXNhci9hcHAtdml0ZVwiOiBcIl4yLjMuMFwiLFxuICAgIFwiQHR5cGVzL2ZsdWVudC1mZm1wZWdcIjogXCJeMi4xLjI3XCIsXG4gICAgXCJAdHlwZXMvbm9kZVwiOiBcIl4yMC41LjlcIixcbiAgICBcImF1dG9wcmVmaXhlclwiOiBcIl4xMC40LjJcIixcbiAgICBcImVsZWN0cm9uXCI6IFwiXjM1LjEuMlwiLFxuICAgIFwidHlwZXNjcmlwdFwiOiBcIn41LjUuM1wiXG4gIH0sXG4gIFwiZW5naW5lc1wiOiB7XG4gICAgXCJub2RlXCI6IFwiXjI4IHx8IF4yNiB8fCBeMjQgfHwgXjIyIHx8IF4yMCB8fCBeMThcIixcbiAgICBcIm5wbVwiOiBcIj49IDYuMTMuNFwiLFxuICAgIFwieWFyblwiOiBcIj49IDEuMjEuMVwiXG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxTQUFTLEtBQUssU0FBUyxlQUFlLFFBQVEsYUFBYTtBQUMzRCxPQUFPLFVBQVU7QUFDakIsT0FBTyxRQUFRO0FBQ2YsU0FBUyxxQkFBcUI7QUFDOUIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sUUFBUTtBQUNmLFNBQVMseUJBQXlCOzs7QUNObEM7QUFBQSxFQUNFLE1BQVE7QUFBQSxFQUNSLFNBQVc7QUFBQSxFQUNYLGFBQWU7QUFBQSxFQUNmLGFBQWU7QUFBQSxFQUNmLFFBQVU7QUFBQSxFQUNWLE1BQVE7QUFBQSxFQUNSLFNBQVc7QUFBQSxFQUNYLFNBQVc7QUFBQSxJQUNULE1BQVE7QUFBQSxJQUNSLEtBQU87QUFBQSxJQUNQLE9BQVM7QUFBQSxJQUNULGFBQWU7QUFBQSxFQUNqQjtBQUFBLEVBQ0EsY0FBZ0I7QUFBQSxJQUNkLGtCQUFrQjtBQUFBLElBQ2xCLE9BQVM7QUFBQSxJQUNULGlCQUFpQjtBQUFBLElBQ2pCLE9BQVM7QUFBQSxJQUNULFFBQVU7QUFBQSxJQUNWLFlBQVk7QUFBQSxJQUNaLEtBQU87QUFBQSxJQUNQLFlBQVk7QUFBQSxJQUNaLGNBQWM7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsaUJBQW1CO0FBQUEsSUFDakIsc0JBQXNCO0FBQUEsSUFDdEIsOEJBQThCO0FBQUEsSUFDOUIsb0JBQW9CO0FBQUEsSUFDcEIsd0JBQXdCO0FBQUEsSUFDeEIsZUFBZTtBQUFBLElBQ2YsY0FBZ0I7QUFBQSxJQUNoQixVQUFZO0FBQUEsSUFDWixZQUFjO0FBQUEsRUFDaEI7QUFBQSxFQUNBLFNBQVc7QUFBQSxJQUNULE1BQVE7QUFBQSxJQUNSLEtBQU87QUFBQSxJQUNQLE1BQVE7QUFBQSxFQUNWO0FBQ0Y7OztBRDNCQSxJQUFNLFdBQVcsUUFBUSxZQUFZLEdBQUcsU0FBUztBQUVqRCxJQUFNLGFBQWEsY0FBYyxJQUFJLElBQUksS0FBSyxZQUFZLEdBQUcsQ0FBQztBQUU5RCxJQUFJO0FBR0osSUFBSSxnQkFBaUQ7QUFDckQsSUFBSSxPQUF1QjtBQUN6QixRQUFNLG1CQUFtQixLQUFLLFFBQVEsWUFBWSxRQUFRLE1BQU07QUFHaEUsa0JBQWdCLE1BQU0sa0JBQWtCLENBQUMsR0FBRztBQUFBLElBQzFDLE9BQU87QUFBQSxJQUNQLEtBQUs7QUFBQSxJQUNMLEtBQUssUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUNIO0FBRUEsZUFBZSxlQUFlO0FBSTVCLGVBQWEsSUFBSSxjQUFjO0FBQUEsSUFDN0IsTUFBTSxLQUFLLFFBQVEsWUFBWSxnQkFBZ0I7QUFBQTtBQUFBLElBQy9DLE9BQU87QUFBQSxJQUNQLFFBQVE7QUFBQSxJQUNSLGdCQUFnQjtBQUFBLElBQ2hCLGdCQUFnQjtBQUFBLE1BQ2QsaUJBQWlCO0FBQUEsTUFDakIsYUFBYTtBQUFBLE1BQ2Isa0JBQWtCO0FBQUEsTUFDbEIsU0FBUztBQUFBO0FBQUEsTUFFVCxTQUFTLEtBQUs7QUFBQSxRQUNaO0FBQUEsUUFDQSxLQUFLLEtBQUssK0RBQTRDLHNCQUFrRTtBQUFBLE1BQzFIO0FBQUEsSUFDRjtBQUFBLEVBQ0YsQ0FBQztBQUVELGFBQVcsWUFBWSxHQUFHLG1CQUFtQixNQUFNO0FBQ2pELGdCQUFZLFNBQVMsWUFBWSxnQkFBWSxPQUFPLEVBQUU7QUFBQSxFQUd4RCxDQUFDO0FBRUQsTUFBSSxNQUFpQjtBQUNuQixVQUFNLFdBQVcsUUFBUSx1QkFBbUI7QUFBQSxFQUM5QyxPQUNLO0FBQ0gsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUFBLEVBQ3hDO0FBRUEsTUFBSSxNQUF1QjtBQUV6QixlQUFXLFlBQVksYUFBYTtBQUFBLEVBQ3RDLE9BQU87QUFFTCxlQUFXLFlBQVksR0FBRyxtQkFBbUIsTUFBTTtBQUFBLElBRW5ELENBQUM7QUFBQSxFQUNIO0FBRUEsYUFBVyxHQUFHLFVBQVUsTUFBTTtBQUM1QixpQkFBYTtBQUFBLEVBQ2YsQ0FBQztBQUNIO0FBRUEsS0FBSyxJQUFJLFVBQVUsRUFBRSxLQUFLLFlBQVk7QUFHdEMsUUFBUSxPQUFPLGVBQWUsWUFBWTtBQUN4QyxRQUFNLFNBQVMsTUFBTSxPQUFPLGVBQWU7QUFBQSxJQUN6QyxZQUFZLENBQUMsaUJBQWlCLGlCQUFpQjtBQUFBLEVBQ2pELENBQUM7QUFFRCxNQUFJLE9BQU87QUFDVCxXQUFPO0FBRVQsU0FBTyxPQUFPLFVBQVUsQ0FBQztBQUMzQixDQUFDO0FBR0QsUUFBUSxHQUFHLGtCQUFrQixDQUFDLE9BQU8sWUFBWTtBQUMvQyxNQUFJO0FBQ0YsZUFBVyxZQUFZLEtBQUssa0JBQWtCLE9BQU87QUFDekQsQ0FBQztBQUdELFFBQVEsR0FBRyxlQUFlLENBQUMsT0FBTyxlQUFlO0FBQy9DLFFBQU0sU0FBUyxVQUFVO0FBQzNCLENBQUM7QUFHRCxRQUFRLE9BQU8sbUJBQW1CLE9BQU8sUUFBUSxNQUFjLFFBQWdCO0FBQzdFLFFBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSSxLQUFLLEVBQUUsY0FBYyxTQUFTLENBQUM7QUFDaEUsUUFBTSxJQUFJLFFBQWMsQ0FBQyxTQUFTLFdBQVc7QUFDM0MsVUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQVMsS0FBSyxLQUFLLE1BQU07QUFDekIsV0FBTyxHQUFHLFVBQVUsT0FBTztBQUMzQixXQUFPLEdBQUcsU0FBUyxNQUFNO0FBQUEsRUFDM0IsQ0FBQztBQUdELFFBQU0sR0FBRyxNQUFNLE1BQU0sR0FBSztBQUUxQixTQUFPLEVBQUUsU0FBUyxLQUFLO0FBQ3pCLENBQUM7QUFHRCxRQUFRLE9BQU8sa0JBQWtCLE9BQU8sUUFBUSxlQUF1QjtBQUNyRSxRQUFNLGVBQWUsS0FBSyxLQUFLLFlBQVksVUFBVTtBQUNyRCxRQUFNLE1BQU0sTUFBTSxHQUFHLFFBQVEsWUFBWTtBQUN6QyxRQUFNLE9BQWlCLENBQUM7QUFFeEIsbUJBQWlCLFVBQVU7QUFDekIsUUFBSSxPQUFPLFlBQVk7QUFDckIsV0FBSyxLQUFLLE9BQU8sSUFBSTtBQUV6QixTQUFPO0FBQ1QsQ0FBQztBQUdELFFBQVEsT0FBTyxlQUFlLE9BQU8sUUFBUSxhQUFxQjtBQUNoRSxNQUFJO0FBQ0YsVUFBTSxHQUFHLE9BQU8sUUFBUTtBQUN4QixXQUFPO0FBQUEsRUFDVCxRQUNNO0FBQ0osV0FBTztBQUFBLEVBQ1Q7QUFDRixDQUFDO0FBR0QsUUFBUSxPQUFPLGFBQWEsWUFBWTtBQUN0QyxRQUFNLFNBQVMsTUFBTSxPQUFPLGVBQWU7QUFBQSxJQUN6QyxZQUFZLENBQUMsVUFBVTtBQUFBLElBQ3ZCLFNBQVM7QUFBQSxNQUNQLEVBQUUsTUFBTSxVQUFVLFlBQVksQ0FBQyxPQUFPLE9BQU8sT0FBTyxPQUFPLFFBQVEsT0FBTyxPQUFPLFFBQVEsS0FBSyxFQUFFO0FBQUEsSUFDbEc7QUFBQSxFQUNGLENBQUM7QUFFRCxNQUFJLE9BQU87QUFDVCxXQUFPO0FBRVQsU0FBTyxPQUFPLFVBQVUsQ0FBQztBQUMzQixDQUFDO0FBRUQsSUFBSSxHQUFHLHFCQUFxQixNQUFNO0FBQ2hDLE1BQUksYUFBYSxVQUFVO0FBQ3pCLFFBQUksS0FBSztBQUFBLEVBQ1g7QUFDRixDQUFDO0FBRUQsSUFBSSxHQUFHLFlBQVksTUFBTTtBQUN2QixNQUFJLGVBQWUsUUFBVztBQUM1QixTQUFLLGFBQWE7QUFBQSxFQUNwQjtBQUNGLENBQUM7QUFFRCxJQUFJLEdBQUcsZUFBZSxNQUFNO0FBQzFCLE1BQUksZUFBZTtBQUNqQixrQkFBYyxLQUFLO0FBQ25CLG9CQUFnQjtBQUFBLEVBQ2xCO0FBQ0YsQ0FBQztBQUVELFFBQVEsR0FBRyxRQUFRLE1BQU07QUFDdkIsTUFBSSxlQUFlO0FBQ2pCLGtCQUFjLEtBQUs7QUFDbkIsb0JBQWdCO0FBQUEsRUFDbEI7QUFDRixDQUFDO0FBRUQsUUFBUSxHQUFHLFVBQVUsTUFBTTtBQUN6QixNQUFJLGVBQWU7QUFDakIsa0JBQWMsS0FBSztBQUNuQixvQkFBZ0I7QUFBQSxFQUNsQjtBQUNBLFVBQVEsS0FBSztBQUNmLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
