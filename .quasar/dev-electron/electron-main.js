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
    "ffmpeg-static": "^5.2.0",
    "ffprobe-static": "^3.1.0",
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
    "@types/ffprobe-static": "^2.0.3",
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
import { spawn } from "child_process";
var platform = process.platform || os.platform();
var currentDir = fileURLToPath(new URL(".", import.meta.url));
var mainWindow;
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
  console.log(`Current working directory: ${process.cwd()}`);
  const pythonExecutable = path.resolve(process.cwd(), "img", "main");
  console.log(`Python executable path: ${pythonExecutable}`);
  let pythonProcess = null;
  pythonProcess = spawn(pythonExecutable, [], {
    stdio: "pipe"
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
      mainWindow?.webContents.closeDevTools();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjLWVsZWN0cm9uL2VsZWN0cm9uLW1haW4udHMiLCAiLi4vLi4vcGFja2FnZS5qc29uIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBhcHAsIGlwY01haW4sIEJyb3dzZXJXaW5kb3csIGRpYWxvZywgc2hlbGwgfSBmcm9tICdlbGVjdHJvbidcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5pbXBvcnQgb3MgZnJvbSAnb3MnXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJ1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJ1xuaW1wb3J0IGZzIGZyb20gJ25vZGU6ZnMvcHJvbWlzZXMnXG5pbXBvcnQgeyBjcmVhdGVXcml0ZVN0cmVhbSB9IGZyb20gJ25vZGU6ZnMnXG5pbXBvcnQgcGFja2FnZUpzb24gZnJvbSAnLi4vcGFja2FnZS5qc29uJyBhc3NlcnQgeyB0eXBlOiAnanNvbicgfVxuaW1wb3J0IHsgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuXG5cblxuLy8gbmVlZGVkIGluIGNhc2UgcHJvY2VzcyBpcyB1bmRlZmluZWQgdW5kZXIgTGludXhcbmNvbnN0IHBsYXRmb3JtID0gcHJvY2Vzcy5wbGF0Zm9ybSB8fCBvcy5wbGF0Zm9ybSgpXG5cbmNvbnN0IGN1cnJlbnREaXIgPSBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4nLCBpbXBvcnQubWV0YS51cmwpKVxuXG5sZXQgbWFpbldpbmRvdzogQnJvd3NlcldpbmRvdyB8IHVuZGVmaW5lZFxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVXaW5kb3coKSB7XG4gIC8qKlxuICAgKiBJbml0aWFsIHdpbmRvdyBvcHRpb25zXG4gICAqL1xuICBtYWluV2luZG93ID0gbmV3IEJyb3dzZXJXaW5kb3coe1xuICAgIGljb246IHBhdGgucmVzb2x2ZShjdXJyZW50RGlyLCAnaWNvbnMvaWNvbi5wbmcnKSwgLy8gdHJheSBpY29uXG4gICAgd2lkdGg6IDEwMjQsXG4gICAgaGVpZ2h0OiA3NjgsXG4gICAgdXNlQ29udGVudFNpemU6IHRydWUsXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcbiAgICAgIG5vZGVJbnRlZ3JhdGlvbjogdHJ1ZSxcbiAgICAgIHdlYlNlY3VyaXR5OiBmYWxzZSxcbiAgICAgIGNvbnRleHRJc29sYXRpb246IHRydWUsXG4gICAgICBzYW5kYm94OiBmYWxzZSxcbiAgICAgIC8vIE1vcmUgaW5mbzogaHR0cHM6Ly92Mi5xdWFzYXIuZGV2L3F1YXNhci1jbGktdml0ZS9kZXZlbG9waW5nLWVsZWN0cm9uLWFwcHMvZWxlY3Ryb24tcHJlbG9hZC1zY3JpcHRcbiAgICAgIHByZWxvYWQ6IHBhdGgucmVzb2x2ZShcbiAgICAgICAgY3VycmVudERpcixcbiAgICAgICAgcGF0aC5qb2luKHByb2Nlc3MuZW52LlFVQVNBUl9FTEVDVFJPTl9QUkVMT0FEX0ZPTERFUiwgJ2VsZWN0cm9uLXByZWxvYWQnICsgcHJvY2Vzcy5lbnYuUVVBU0FSX0VMRUNUUk9OX1BSRUxPQURfRVhURU5TSU9OKVxuICAgICAgKSxcbiAgICB9LFxuICB9KVxuXG4gIG1haW5XaW5kb3cud2ViQ29udGVudHMub24oJ2RpZC1maW5pc2gtbG9hZCcsICgpID0+IHtcbiAgICBtYWluV2luZG93Py5zZXRUaXRsZShgU2FtYW50aGEgJHtwYWNrYWdlSnNvbi52ZXJzaW9ufWApXG4gIH0pXG4gXG4gIGNvbnNvbGUubG9nKGBDdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5OiAke3Byb2Nlc3MuY3dkKCl9YClcbiAgY29uc3QgcHl0aG9uRXhlY3V0YWJsZSA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCAnaW1nJywgJ21haW4nKVxuICBjb25zb2xlLmxvZyhgUHl0aG9uIGV4ZWN1dGFibGUgcGF0aDogJHtweXRob25FeGVjdXRhYmxlfWApXG4gIC8vIFN0YXJ0IHRoZSBQeXRob24gcHJvY2Vzc1xuICBsZXQgcHl0aG9uUHJvY2VzczogUmV0dXJuVHlwZTx0eXBlb2Ygc3Bhd24+IHwgbnVsbCA9IG51bGxcbiAgcHl0aG9uUHJvY2VzcyA9IHNwYXduKHB5dGhvbkV4ZWN1dGFibGUsIFtdLCB7XG4gICAgc3RkaW86ICdwaXBlJ1xuICB9KVxuICBcblxuICBpZiAocHJvY2Vzcy5lbnYuREVWKSB7XG4gICAgYXdhaXQgbWFpbldpbmRvdy5sb2FkVVJMKHByb2Nlc3MuZW52LkFQUF9VUkwpXG4gIH0gXG4gIGVsc2Uge1xuICAgIGF3YWl0IG1haW5XaW5kb3cubG9hZEZpbGUoJ2luZGV4Lmh0bWwnKVxuICB9XG5cbiAgaWYgKHByb2Nlc3MuZW52LkRFQlVHR0lORykge1xuICAgIC8vIGlmIG9uIERFViBvciBQcm9kdWN0aW9uIHdpdGggZGVidWcgZW5hYmxlZFxuICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMub3BlbkRldlRvb2xzKClcbiAgfSBlbHNlIHtcbiAgICAvLyB3ZSdyZSBvbiBwcm9kdWN0aW9uOyBubyBhY2Nlc3MgdG8gZGV2dG9vbHMgcGxzXG4gICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5vbignZGV2dG9vbHMtb3BlbmVkJywgKCkgPT4ge1xuICAgICAgbWFpbldpbmRvdz8ud2ViQ29udGVudHMuY2xvc2VEZXZUb29scygpO1xuICAgIH0pXG4gIH1cblxuICBtYWluV2luZG93Lm9uKCdjbG9zZWQnLCAoKSA9PiB7XG4gICAgbWFpbldpbmRvdyA9IHVuZGVmaW5lZDtcbiAgfSlcbn1cblxudm9pZCBhcHAud2hlblJlYWR5KCkudGhlbihjcmVhdGVXaW5kb3cpO1xuXG4vLyBwaWNrIGEgZm9sZGVyIGZyb20gdGhlIGZpbGVzeXN0ZW1cbmlwY01haW4uaGFuZGxlKCdwaWNrLWZvbGRlcicsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nLnNob3dPcGVuRGlhbG9nKHtcbiAgICBwcm9wZXJ0aWVzOiBbJ29wZW5EaXJlY3RvcnknLCAnY3JlYXRlRGlyZWN0b3J5J10sIFxuICB9KVxuXG4gIGlmIChyZXN1bHQuY2FuY2VsZWQpIFxuICAgIHJldHVybiBudWxsXG5cbiAgcmV0dXJuIHJlc3VsdC5maWxlUGF0aHNbMF0gXG59KVxuXG4vLyBrZWVwIHRoZSB1c2VyIGluZm9ybWVkIGFib3V0IHRoZSBzZXR1cCBwcm9ncmVzc1xuaXBjTWFpbi5vbignc2V0dXAtcHJvZ3Jlc3MnLCAoZXZlbnQsIG1lc3NhZ2UpID0+IHtcbiAgaWYgKG1haW5XaW5kb3cpIFxuICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCBtZXNzYWdlKVxufSlcblxuLy8gb3BlbiBhIGZvbGRlciBpbiB0aGUgc3lzdGVtIGZpbGUgZXhwbG9yZXJcbmlwY01haW4ub24oJ29wZW4tZm9sZGVyJywgKGV2ZW50LCBmb2xkZXJQYXRoKSA9PiB7XG4gIHNoZWxsLm9wZW5QYXRoKGZvbGRlclBhdGgpXG59KVxuXG4vLyBkb3dubG9hZCBtb2RlbHMgZnJvbSBhIGdpdmVuIFVSTCBhbmQgc2F2ZSB0byBhIGRlc3RpbmF0aW9uIHBhdGhcbmlwY01haW4uaGFuZGxlKCdkb3dubG9hZC1tb2RlbHMnLCBhc3luYyAoX2V2ZW50LCBkZXN0OiBzdHJpbmcsIHVybDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KHVybCwgeyByZXNwb25zZVR5cGU6ICdzdHJlYW0nIH0pXG4gIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBzdHJlYW0gPSBjcmVhdGVXcml0ZVN0cmVhbShkZXN0KVxuICAgIHJlc3BvbnNlLmRhdGEucGlwZShzdHJlYW0pXG4gICAgc3RyZWFtLm9uKCdmaW5pc2gnLCByZXNvbHZlKVxuICAgIHN0cmVhbS5vbignZXJyb3InLCByZWplY3QpXG4gIH0pXG5cbiAgLy8gbWFrZSB0aGUgZmlsZSBleGVjdXRhYmxlXG4gIGF3YWl0IGZzLmNobW9kKGRlc3QsIDBvNzU1KVxuXG4gIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfVxufSlcblxuLy8gcmVhZCBhbGwgZGlyZWN0b3JpZXMgaW4gdGhlIHByb2plY3RzIGZvbGRlclxuaXBjTWFpbi5oYW5kbGUoJ3JlYWQtd29ya3NwYWNlJywgYXN5bmMgKF9ldmVudCwgZm9sZGVyUGF0aDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHByb2plY3RzUGF0aCA9IHBhdGguam9pbihmb2xkZXJQYXRoLCAncHJvamVjdHMnKVxuICBjb25zdCBkaXIgPSBhd2FpdCBmcy5vcGVuZGlyKHByb2plY3RzUGF0aClcbiAgY29uc3QgZGlyczogc3RyaW5nW10gPSBbXVxuXG4gIGZvciBhd2FpdCAoY29uc3QgZGlyZW50IG9mIGRpcilcbiAgICBpZiAoZGlyZW50LmlzRGlyZWN0b3J5KCkpIFxuICAgICAgZGlycy5wdXNoKGRpcmVudC5uYW1lKVxuICAgXG4gIHJldHVybiBkaXJzXG59KVxuXG4vLyBjaGVjayBpZiBhIGZpbGUgZXhpc3RzIG9uIHRoZSBmaWxlc3lzdGVtXG5pcGNNYWluLmhhbmRsZSgnZmlsZS1leGlzdHMnLCBhc3luYyAoX2V2ZW50LCBmaWxlUGF0aDogc3RyaW5nKSA9PiB7XG4gIHRyeSB7XG4gICAgYXdhaXQgZnMuYWNjZXNzKGZpbGVQYXRoKVxuICAgIHJldHVybiB0cnVlXG4gIH0gXG4gIGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSlcblxuLy8gb3BlbiBmaWxlIGV4cGxvcmVyIGFuZCBzZWxlY3QgYSB2aWRlbyBmaWxlXG5pcGNNYWluLmhhbmRsZSgncGljay1maWxlJywgYXN5bmMgKCkgPT4ge1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2cuc2hvd09wZW5EaWFsb2coe1xuICAgIHByb3BlcnRpZXM6IFsnb3BlbkZpbGUnXSxcbiAgICBmaWx0ZXJzOiBbXG4gICAgICB7IG5hbWU6ICdWaWRlb3MnLCBleHRlbnNpb25zOiBbJ21wNCcsICdhdmknLCAnbW92JywgJ21rdicsICd3ZWJtJywgJ3dtdicsICdmbHYnLCAnbXBlZycsICdtcGcnXSB9XG4gICAgXVxuICB9KVxuXG4gIGlmIChyZXN1bHQuY2FuY2VsZWQpIFxuICAgIHJldHVybiBudWxsXG5cbiAgcmV0dXJuIHJlc3VsdC5maWxlUGF0aHNbMF1cbn0pXG5cbmFwcC5vbignd2luZG93LWFsbC1jbG9zZWQnLCAoKSA9PiB7XG4gIGlmIChwbGF0Zm9ybSAhPT0gJ2RhcndpbicpIHtcbiAgICBhcHAucXVpdCgpXG4gIH1cbn0pO1xuXG5hcHAub24oJ2FjdGl2YXRlJywgKCkgPT4ge1xuICBpZiAobWFpbldpbmRvdyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdm9pZCBjcmVhdGVXaW5kb3coKVxuICB9XG59KTtcblxuIiwgIntcbiAgXCJuYW1lXCI6IFwic2FtYW50aGFcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMS4wLjBcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIlNhbWFudGhhIGlzIGEgdmlkZW8gcHJvY2Vzc2luZyBhcHBsaWNhdGlvbiB0aGF0IGFsbG93cyB1c2VycyB0byBlZGl0IGFuZCBtYW5hZ2UgdmlkZW8gZmlsZXMgd2l0aCBlYXNlLlwiLFxuICBcInByb2R1Y3ROYW1lXCI6IFwiU2FtYW50aGFcIixcbiAgXCJhdXRob3JcIjogXCJNYXJjZWwgR3Jvc2plYW4gPG1hcmNlbC5ncm9zamVhbkBoZXBsLmNoPlwiLFxuICBcInR5cGVcIjogXCJtb2R1bGVcIixcbiAgXCJwcml2YXRlXCI6IHRydWUsXG4gIFwic2NyaXB0c1wiOiB7XG4gICAgXCJ0ZXN0XCI6IFwiZWNobyBcXFwiTm8gdGVzdCBzcGVjaWZpZWRcXFwiICYmIGV4aXQgMFwiLFxuICAgIFwiZGV2XCI6IFwicXVhc2FyIGRldlwiLFxuICAgIFwiYnVpbGRcIjogXCJxdWFzYXIgYnVpbGRcIixcbiAgICBcInBvc3RpbnN0YWxsXCI6IFwicXVhc2FyIHByZXBhcmVcIlxuICB9LFxuICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJAcXVhc2FyL2V4dHJhc1wiOiBcIl4xLjE2LjRcIixcbiAgICBcImF4aW9zXCI6IFwiXjEuOS4wXCIsXG4gICAgXCJmZm1wZWctc3RhdGljXCI6IFwiXjUuMi4wXCIsXG4gICAgXCJmZnByb2JlLXN0YXRpY1wiOiBcIl4zLjEuMFwiLFxuICAgIFwiZmx1ZW50LWZmbXBlZ1wiOiBcIl4yLjEuM1wiLFxuICAgIFwicGluaWFcIjogXCJeMy4wLjFcIixcbiAgICBcInF1YXNhclwiOiBcIl4yLjE4LjJcIixcbiAgICBcInZpZGVvLmpzXCI6IFwiXjguMjIuMFwiLFxuICAgIFwidnVlXCI6IFwiXjMuNC4xOFwiLFxuICAgIFwidnVlLWkxOG5cIjogXCJeMTEuMC4wXCIsXG4gICAgXCJ2dWUtcm91dGVyXCI6IFwiXjQuMC4xMlwiXG4gIH0sXG4gIFwiZGV2RGVwZW5kZW5jaWVzXCI6IHtcbiAgICBcIkBlbGVjdHJvbi9wYWNrYWdlclwiOiBcIl4xOC4zLjZcIixcbiAgICBcIkBpbnRsaWZ5L3VucGx1Z2luLXZ1ZS1pMThuXCI6IFwiXjQuMC4wXCIsXG4gICAgXCJAcXVhc2FyL2FwcC12aXRlXCI6IFwiXjIuMy4wXCIsXG4gICAgXCJAdHlwZXMvZmZwcm9iZS1zdGF0aWNcIjogXCJeMi4wLjNcIixcbiAgICBcIkB0eXBlcy9mbHVlbnQtZmZtcGVnXCI6IFwiXjIuMS4yN1wiLFxuICAgIFwiQHR5cGVzL25vZGVcIjogXCJeMjAuNS45XCIsXG4gICAgXCJhdXRvcHJlZml4ZXJcIjogXCJeMTAuNC4yXCIsXG4gICAgXCJlbGVjdHJvblwiOiBcIl4zNS4xLjJcIixcbiAgICBcInR5cGVzY3JpcHRcIjogXCJ+NS41LjNcIlxuICB9LFxuICBcImVuZ2luZXNcIjoge1xuICAgIFwibm9kZVwiOiBcIl4yOCB8fCBeMjYgfHwgXjI0IHx8IF4yMiB8fCBeMjAgfHwgXjE4XCIsXG4gICAgXCJucG1cIjogXCI+PSA2LjEzLjRcIixcbiAgICBcInlhcm5cIjogXCI+PSAxLjIxLjFcIlxuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsU0FBUyxLQUFLLFNBQVMsZUFBZSxRQUFRLGFBQWE7QUFDM0QsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sUUFBUTtBQUNmLFNBQVMs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
