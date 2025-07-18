"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src-electron/electron-preload.ts
var import_electron = require("electron");
var import_os = __toESM(require("os"), 1);
var import_child_process = require("child_process");
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_fluent_ffmpeg = __toESM(require("fluent-ffmpeg"), 1);
async function checkAndDownload(modelsFolderPath, files, file, url) {
  if (!files.includes(file)) {
    import_electron.ipcRenderer.send("setup-progress", `Downloading ${file}...`);
    await import_electron.ipcRenderer.invoke("download-models", import_node_path.default.join(modelsFolderPath, file), url);
  } else {
    import_electron.ipcRenderer.send("setup-progress", `${file} already exists, skipping download...`);
  }
}
async function removeSegments(outputPath) {
  const segments = [];
  for (const file of await import_promises.default.readdir(outputPath))
    if (file.startsWith("segment"))
      segments.push(import_promises.default.rm(import_node_path.default.join(outputPath, file)));
  await Promise.all(segments);
}
import_electron.contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    on: (channel, listener) => import_electron.ipcRenderer.on(channel, listener),
    send: (channel, ...args) => import_electron.ipcRenderer.send(channel, ...args)
  }
});
import_electron.contextBridge.exposeInMainWorld("workspaceAPI", {
  readWorkspace: (filePath) => import_electron.ipcRenderer.invoke("read-workspace", import_node_path.default.join(filePath, "data.json")),
  writeWorkspace: (filePath, data) => import_electron.ipcRenderer.invoke("write-workspace", import_node_path.default.join(filePath, "data.json"), data),
  fileExists: (projectPath, projectName) => import_electron.ipcRenderer.invoke("file-exists", import_node_path.default.join(projectPath, "projects", projectName, "base.mp4")),
  getVideoFPS: (workspace, filePath) => {
    import_fluent_ffmpeg.default.setFfprobePath(import_node_path.default.join(workspace, "models", "ffprobe"));
    return new Promise((resolve, reject) => {
      import_fluent_ffmpeg.default.ffprobe(filePath, (err, metadata) => {
        if (err)
          return reject(err);
        const videoStream = metadata.streams.find((s) => s.codec_type === "video");
        if (!videoStream || !videoStream.r_frame_rate)
          return resolve(null);
        const [num, denom] = videoStream.r_frame_rate.split("/").map(Number);
        if (!num || !denom)
          return resolve(null);
        resolve(num / denom);
      });
    });
  },
  cutAndEncodeVideo: async (workdspace, projectName, inputFilePath, keepRanges) => {
    console.log("cutting and encoding video");
    const outputPath = import_node_path.default.join(workdspace, "projects", projectName);
    await removeSegments(outputPath);
    import_fluent_ffmpeg.default.setFfmpegPath(import_node_path.default.join(workdspace, "models", "ffmpeg"));
    const segmentFiles = [];
    for (let i = 0; i < keepRanges.length; i++) {
      const range = keepRanges[i];
      if (!range)
        continue;
      const [start, end, duration] = range;
      const segFile = import_node_path.default.join(outputPath, `segment_${i}.mp4`);
      segmentFiles.push(segFile);
      await new Promise((resolve, reject) => {
        (0, import_fluent_ffmpeg.default)(inputFilePath).setStartTime(start).setDuration(duration).videoCodec("libx264").audioCodec("aac").outputOptions("-movflags", "faststart").outputOptions("-preset", "fast").outputOptions("-crf", "23").output(segFile).on("end", () => {
          console.log(`Segment ${i} done`);
          resolve();
        }).on("error", (e) => {
          console.error(`Error processing segment ${i}`);
          reject(e);
        }).run();
      });
    }
    console.log("All segments done");
    const listFile = import_node_path.default.join(outputPath, "segments.txt");
    await import_promises.default.writeFile(listFile, segmentFiles.map((f) => `file '${f}'`).join("\n"));
    await new Promise(
      (resolve, reject) => {
        (0, import_fluent_ffmpeg.default)().input(listFile).inputOptions("-f", "concat", "-safe", "0").outputOptions("-c", "copy").output(import_node_path.default.join(outputPath, "base.mp4")).on("end", () => {
          console.log("Concatenation done");
          resolve();
        }).on("error", (e) => {
          console.error("Error during concatenation");
          reject(e);
        }).run();
      }
    );
    await removeSegments(outputPath);
  }
});
import_electron.contextBridge.exposeInMainWorld("sys", {
  openFolder: (folderPath) => import_electron.ipcRenderer.send("open-folder", folderPath),
  pickFolder: () => import_electron.ipcRenderer.invoke("pick-folder"),
  pickFile: () => import_electron.ipcRenderer.invoke("pick-file"),
  deleteFolder: async (folderPath) => await import_promises.default.rm(folderPath, { recursive: true, force: true }),
  createFolder: async (folderPath) => {
    try {
      await import_promises.default.access(folderPath);
      throw new Error("This project already exists");
    } catch (err) {
      if (err && err.code === "ENOENT") {
        await import_promises.default.mkdir(folderPath, { recursive: true });
      } else
        throw err;
    }
  },
  setupWorkspace: async (wpPath) => {
    console.log(`setting workdspace at ${wpPath}`);
    import_electron.ipcRenderer.send("setup-progress", "Starting workspace setup...");
    await import_promises.default.mkdir(wpPath, { recursive: true });
    const dataFilePath = import_node_path.default.join(wpPath, "data.json");
    try {
      await import_promises.default.access(dataFilePath);
      import_electron.ipcRenderer.send("setup-progress", "Data file already exists, skipping creation...");
    } catch {
      import_electron.ipcRenderer.send("setup-progress", "Creating data file...");
      const baseData = {
        projects: []
      };
      await import_promises.default.writeFile(dataFilePath, JSON.stringify(baseData), "utf-8");
    }
    const modelsFolderPath = import_node_path.default.join(wpPath, "models");
    await import_promises.default.mkdir(modelsFolderPath, { recursive: true });
    const files = await import_promises.default.readdir(modelsFolderPath);
    await import_promises.default.mkdir(import_node_path.default.join(wpPath, "projects"), { recursive: true });
    await checkAndDownload(modelsFolderPath, files, "yolov12l.pt", "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo12l.pt");
    await checkAndDownload(modelsFolderPath, files, "yolov11l-face.pt", "https://github.com/akanametov/yolo-face/releases/download/v0.0.0/yolov11l-face.pt");
    await checkAndDownload(modelsFolderPath, files, "rt-detr-l.pt", "https://github.com/ultralytics/assets/releases/download/v8.3.0/rtdetr-l.pt");
    await checkAndDownload(modelsFolderPath, files, "rt-detr-x-face.pt", "https://github.com/HEP-VD-CSeL/Samantha/raw/refs/heads/main/models/rt-detr-x-face.pt");
    await checkAndDownload(modelsFolderPath, files, "mobile_sam.pt", "https://github.com/ultralytics/assets/releases/download/v8.3.0/mobile_sam.pt");
    await checkAndDownload(modelsFolderPath, files, "FastSAM-x.pt", "https://github.com/ultralytics/assets/releases/download/v8.3.0/FastSAM-x.pt");
    await checkAndDownload(modelsFolderPath, files, "big-lama.pt", "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt");
    await checkAndDownload(modelsFolderPath, files, "ffmpeg", "http://static.grosjean.io/samantha/ffmpeg_osx");
    await checkAndDownload(modelsFolderPath, files, "ffprobe", "http://static.grosjean.io/samantha/ffprobe_osx");
    console.log(`Setup DONE`);
  },
  platform: () => {
    let name;
    switch (import_os.default.platform()) {
      case "win32":
        name = "Windows";
        break;
      case "darwin":
        name = "macOS";
        break;
      case "linux":
        name = "Linux";
        break;
      default:
        name = "Unknown";
    }
    return {
      name,
      version: import_os.default.release(),
      arch: import_os.default.arch()
    };
  },
  cpu: () => {
    const cpus = import_os.default.cpus();
    return {
      cores: import_os.default.cpus().length,
      model: import_os.default.cpus()[0]?.model,
      speed: import_os.default.cpus()[0]?.speed
    };
  },
  mem: (import_os.default.totalmem() / 1024 / 1024 / 1024).toFixed(2),
  gpu: () => {
    try {
      const platform2 = import_os.default.platform();
      if (platform2 === "win32" || platform2 === "linux") {
        const cudaOutput = (0, import_child_process.execSync)("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", { encoding: "utf-8" });
        const [gpuName, gpuMemory] = cudaOutput.trim().split(",").map((item) => item.trim());
        return { cuda: true, name: gpuName, memory: parseInt(gpuMemory || "0") / 1024 };
      } else if (platform2 === "darwin") {
        const mpsOutput = (0, import_child_process.execSync)('system_profiler SPDisplaysDataType | grep "Metal"', { encoding: "utf-8" });
        return { mps: mpsOutput.includes("Metal"), name: "Metal-compatible GPU", memory: "Not available" };
      }
    } catch (error) {
      return { cuda: false, mps: false, name: "Unknown", memory: "Unknown" };
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjLWVsZWN0cm9uL2VsZWN0cm9uLXByZWxvYWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNvbnRleHRCcmlkZ2UsIGlwY1JlbmRlcmVyIH0gIGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IG9zLCB7IHBsYXRmb3JtIH0gZnJvbSAnb3MnXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcy9wcm9taXNlcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB7IHR5cGUgV29ya3NwYWNlIH0gZnJvbSAnc3JjL3N0b3Jlcy93cFN0b3JlJ1xuaW1wb3J0IHV0aWxzIGZyb20gJ3NyYy91dGlscydcbmltcG9ydCBmZm1wZWcgZnJvbSAnZmx1ZW50LWZmbXBlZydcblxuLy8gZG93bmxvYWQgbW9kZWxzIGlmIHRoZXkgZG9uJ3QgZXhpc3RcbmFzeW5jIGZ1bmN0aW9uIGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aDogc3RyaW5nLCBmaWxlczogc3RyaW5nW10sIGZpbGU6IHN0cmluZywgdXJsOiBzdHJpbmcpIHtcbiAgaWYgKCFmaWxlcy5pbmNsdWRlcyhmaWxlKSkge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgYERvd25sb2FkaW5nICR7ZmlsZX0uLi5gKVxuICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZSgnZG93bmxvYWQtbW9kZWxzJywgcGF0aC5qb2luKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGUpLCB1cmwpXG4gIH1cbiAgZWxzZSB7XG4gICAgaXBjUmVuZGVyZXIuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCBgJHtmaWxlfSBhbHJlYWR5IGV4aXN0cywgc2tpcHBpbmcgZG93bmxvYWQuLi5gKVxuICB9XG59XG5cbi8vIHJlbW92ZSBhbGwgc2VnbWVudHMgKHZpZGVvIGN1dHMpIGZyb20gdGhlIG91dHB1dFBhdGggZm9sZGVyXG5hc3luYyBmdW5jdGlvbiByZW1vdmVTZWdtZW50cyhvdXRwdXRQYXRoOiBzdHJpbmcpIHtcbiAgY29uc3Qgc2VnbWVudHMgPSBbXVxuICBmb3IgKGNvbnN0IGZpbGUgb2YgYXdhaXQgZnMucmVhZGRpcihvdXRwdXRQYXRoKSlcbiAgICBpZiAoZmlsZS5zdGFydHNXaXRoKCdzZWdtZW50JykpIFxuICAgICAgc2VnbWVudHMucHVzaChmcy5ybShwYXRoLmpvaW4ob3V0cHV0UGF0aCwgZmlsZSkpKVxuXG4gIGF3YWl0IFByb21pc2UuYWxsKHNlZ21lbnRzKVxufVxuXG5jb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdlbGVjdHJvbicsIHtcbiAgaXBjUmVuZGVyZXI6IHtcbiAgICBvbjogKGNoYW5uZWw6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCkgPT4gaXBjUmVuZGVyZXIub24oY2hhbm5lbCwgbGlzdGVuZXIpLFxuICAgIHNlbmQ6IChjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKSA9PiBpcGNSZW5kZXJlci5zZW5kKGNoYW5uZWwsIC4uLmFyZ3MpLFxuICB9LFxufSlcblxuY29udGV4dEJyaWRnZS5leHBvc2VJbk1haW5Xb3JsZCgnd29ya3NwYWNlQVBJJywge1xuICByZWFkV29ya3NwYWNlOiAoZmlsZVBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdyZWFkLXdvcmtzcGFjZScsIHBhdGguam9pbihmaWxlUGF0aCwgJ2RhdGEuanNvbicpKSxcbiAgd3JpdGVXb3Jrc3BhY2U6IChmaWxlUGF0aDogc3RyaW5nLCBkYXRhOiBhbnkpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnd3JpdGUtd29ya3NwYWNlJywgcGF0aC5qb2luKGZpbGVQYXRoLCAnZGF0YS5qc29uJyksIGRhdGEpLFxuICBmaWxlRXhpc3RzOiAocHJvamVjdFBhdGg6IHN0cmluZywgcHJvamVjdE5hbWU6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmaWxlLWV4aXN0cycsIHBhdGguam9pbihwcm9qZWN0UGF0aCwgJ3Byb2plY3RzJywgcHJvamVjdE5hbWUsICdiYXNlLm1wNCcpKSxcbiAgZ2V0VmlkZW9GUFM6ICh3b3Jrc3BhY2U6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4gPT4ge1xuICAgIGZmbXBlZy5zZXRGZnByb2JlUGF0aChwYXRoLmpvaW4od29ya3NwYWNlLCAnbW9kZWxzJywgJ2ZmcHJvYmUnKSlcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZmZtcGVnLmZmcHJvYmUoZmlsZVBhdGgsIChlcnIsIG1ldGFkYXRhKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIFxuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKVxuICAgICAgICAvLyBGaW5kIHRoZSB2aWRlbyBzdHJlYW1cbiAgICAgICAgY29uc3QgdmlkZW9TdHJlYW0gPSBtZXRhZGF0YS5zdHJlYW1zLmZpbmQocyA9PiBzLmNvZGVjX3R5cGUgPT09ICd2aWRlbycpXG4gICAgICAgIGlmICghdmlkZW9TdHJlYW0gfHwgIXZpZGVvU3RyZWFtLnJfZnJhbWVfcmF0ZSkgXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUobnVsbClcbiAgICAgICAgLy8gcl9mcmFtZV9yYXRlIGlzIGEgc3RyaW5nIGxpa2UgXCIyNS8xXCIgb3IgXCIzMDAwMC8xMDAxXCJcbiAgICAgICAgY29uc3QgW251bSwgZGVub21dID0gdmlkZW9TdHJlYW0ucl9mcmFtZV9yYXRlLnNwbGl0KCcvJykubWFwKE51bWJlcilcbiAgICAgICAgaWYgKCFudW0gfHwgIWRlbm9tKSBcbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZShudWxsKVxuICAgICAgICByZXNvbHZlKG51bSAvIGRlbm9tKVxuICAgICAgfSlcbiAgICB9KVxuICB9LFxuICBjdXRBbmRFbmNvZGVWaWRlbzogYXN5bmMgKHdvcmtkc3BhY2U6IHN0cmluZywgcHJvamVjdE5hbWU6IHN0cmluZywgaW5wdXRGaWxlUGF0aDogc3RyaW5nLCBrZWVwUmFuZ2VzOiBbc3RyaW5nLCBzdHJpbmcsIG51bWJlcl1bXSkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdjdXR0aW5nIGFuZCBlbmNvZGluZyB2aWRlbycpXG4gICAgY29uc3Qgb3V0cHV0UGF0aCA9IHBhdGguam9pbih3b3JrZHNwYWNlLCAncHJvamVjdHMnLCBwcm9qZWN0TmFtZSlcbiAgICAvLyByZW1vdmUgYWxsIGZpbGVzIHRoYXQgc3RhcnQgd2l0aCAnc2VnbWVudCcgaW4gdGhlIG91dHB1dFBhdGggZm9sZGVyXG4gICAgYXdhaXQgcmVtb3ZlU2VnbWVudHMob3V0cHV0UGF0aClcblxuICAgIC8vIHNlZ21lbnQgdGhlIHZpZGVvXG4gICAgZmZtcGVnLnNldEZmbXBlZ1BhdGgocGF0aC5qb2luKHdvcmtkc3BhY2UsICdtb2RlbHMnLCAnZmZtcGVnJykpXG4gICAgY29uc3Qgc2VnbWVudEZpbGVzOiBzdHJpbmdbXSA9IFtdXG4gICAgXG4gICAgLy8gbG9vcCB0aHJvdWdoIHRoZSBrZWVwUmFuZ2VzIGFuZCBjcmVhdGUgdmlkZW8gc2VnbWVudHNcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtlZXBSYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHJhbmdlID0ga2VlcFJhbmdlc1tpXVxuICAgICAgaWYgKCFyYW5nZSkgXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICBjb25zdCBbc3RhcnQsIGVuZCwgZHVyYXRpb25dID0gcmFuZ2VcblxuICAgICAgY29uc3Qgc2VnRmlsZSA9IHBhdGguam9pbihvdXRwdXRQYXRoLCBgc2VnbWVudF8ke2l9Lm1wNGApXG4gICAgICBzZWdtZW50RmlsZXMucHVzaChzZWdGaWxlKVxuICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBmZm1wZWcoaW5wdXRGaWxlUGF0aClcbiAgICAgICAgICAuc2V0U3RhcnRUaW1lKHN0YXJ0KVxuICAgICAgICAgIC5zZXREdXJhdGlvbihkdXJhdGlvbilcbiAgICAgICAgICAudmlkZW9Db2RlYygnbGlieDI2NCcpIC8vIFJlLWVuY29kZSB0byBlbnN1cmUgTVA0IGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAuYXVkaW9Db2RlYygnYWFjJylcbiAgICAgICAgICAub3V0cHV0T3B0aW9ucygnLW1vdmZsYWdzJywgJ2Zhc3RzdGFydCcpIC8vIGZvciBiZXR0ZXIgbXA0IGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAub3V0cHV0T3B0aW9ucygnLXByZXNldCcsICdmYXN0JylcbiAgICAgICAgICAub3V0cHV0T3B0aW9ucygnLWNyZicsICcyMycpXG4gICAgICAgICAgLm91dHB1dChzZWdGaWxlKVxuICAgICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFNlZ21lbnQgJHtpfSBkb25lYClcbiAgICAgICAgICAgIHJlc29sdmUoKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBwcm9jZXNzaW5nIHNlZ21lbnQgJHtpfWApXG4gICAgICAgICAgICByZWplY3QoZSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5ydW4oKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygnQWxsIHNlZ21lbnRzIGRvbmUnKVxuXG4gICAgLy8gQ29uY2F0ZW5hdGUgdGhlIHNlZ21lbnRzIGludG8gYSBzaW5nbGUgdmlkZW8gZmlsZVxuICAgIGNvbnN0IGxpc3RGaWxlID0gcGF0aC5qb2luKG91dHB1dFBhdGgsICdzZWdtZW50cy50eHQnKVxuICAgIGF3YWl0IGZzLndyaXRlRmlsZShsaXN0RmlsZSwgc2VnbWVudEZpbGVzLm1hcChmID0+IGBmaWxlICcke2Z9J2ApLmpvaW4oJ1xcbicpKVxuICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGZmbXBlZygpXG4gICAgICAgIC5pbnB1dChsaXN0RmlsZSlcbiAgICAgICAgLmlucHV0T3B0aW9ucygnLWYnLCAnY29uY2F0JywgJy1zYWZlJywgJzAnKVxuICAgICAgICAub3V0cHV0T3B0aW9ucygnLWMnLCAnY29weScpXG4gICAgICAgIC5vdXRwdXQocGF0aC5qb2luKG91dHB1dFBhdGgsICdiYXNlLm1wNCcpKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnQ29uY2F0ZW5hdGlvbiBkb25lJylcbiAgICAgICAgICByZXNvbHZlKClcbiAgICAgICAgfSlcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZHVyaW5nIGNvbmNhdGVuYXRpb24nKVxuICAgICAgICAgIHJlamVjdChlKVxuICAgICAgICB9KVxuICAgICAgICAucnVuKClcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyBSZW1vdmUgdGhlIHNlZ21lbnRzXG4gICAgYXdhaXQgcmVtb3ZlU2VnbWVudHMob3V0cHV0UGF0aClcbiAgfVxufSlcblxuLy8gZ2V0IHN5c3RlbSBpbmZvcm1hdGlvblxuY29udGV4dEJyaWRnZS5leHBvc2VJbk1haW5Xb3JsZCgnc3lzJywge1xuICBvcGVuRm9sZGVyOiAoZm9sZGVyUGF0aDogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5zZW5kKCdvcGVuLWZvbGRlcicsIGZvbGRlclBhdGgpLFxuICBwaWNrRm9sZGVyOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ3BpY2stZm9sZGVyJyksXG4gIHBpY2tGaWxlOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ3BpY2stZmlsZScpLFxuICBkZWxldGVGb2xkZXI6IGFzeW5jIChmb2xkZXJQYXRoOiBzdHJpbmcpID0+IGF3YWl0IGZzLnJtKGZvbGRlclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KSxcbiAgY3JlYXRlRm9sZGVyOiBhc3luYyAoZm9sZGVyUGF0aDogc3RyaW5nKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2Vzcyhmb2xkZXJQYXRoKVxuICAgICAgLy8gSWYgbm8gZXJyb3IsIHRoZSBmb2xkZXIgZXhpc3RzXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgcHJvamVjdCBhbHJlYWR5IGV4aXN0cycpXG4gICAgfSBcbiAgICBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgIC8vIE9ubHkgY3JlYXRlIHRoZSBmb2xkZXIgaWYgdGhlIGVycm9yIGlzIFwibm90IGV4aXN0c1wiXG4gICAgICBpZiAoZXJyICYmIGVyci5jb2RlID09PSAnRU5PRU5UJykge1xuICAgICAgICAvLyBGb2xkZXIgZG9lcyBub3QgZXhpc3QsIGNyZWF0ZSBpdFxuICAgICAgICBhd2FpdCBmcy5ta2Rpcihmb2xkZXJQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICAgICAgfSBcbiAgICAgIGVsc2VcbiAgICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9LFxuICBzZXR1cFdvcmtzcGFjZTogYXN5bmMgKHdwUGF0aDogc3RyaW5nKSA9PiB7XG4gICAgY29uc29sZS5sb2coYHNldHRpbmcgd29ya2RzcGFjZSBhdCAke3dwUGF0aH1gKVxuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgJ1N0YXJ0aW5nIHdvcmtzcGFjZSBzZXR1cC4uLicpXG4gICAgXG4gICAgLy8gbWFrZSBzdXJlIHBhdGggZXhpc3RzXG4gICAgYXdhaXQgZnMubWtkaXIod3BQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuXG4gICAgLy8gQ2hlY2sgaWYgZGF0YS5qc29uIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBpdFxuICAgIGNvbnN0IGRhdGFGaWxlUGF0aCA9IHBhdGguam9pbih3cFBhdGgsICdkYXRhLmpzb24nKVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5hY2Nlc3MoZGF0YUZpbGVQYXRoKVxuICAgICAgaXBjUmVuZGVyZXIuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCAnRGF0YSBmaWxlIGFscmVhZHkgZXhpc3RzLCBza2lwcGluZyBjcmVhdGlvbi4uLicpXG4gICAgfSBcbiAgICBjYXRjaCB7XG4gICAgICBpcGNSZW5kZXJlci5zZW5kKCdzZXR1cC1wcm9ncmVzcycsICdDcmVhdGluZyBkYXRhIGZpbGUuLi4nKVxuICAgICAgY29uc3QgYmFzZURhdGEgPSB7XG4gICAgICAgIHByb2plY3RzOiBbXSxcbiAgICAgIH0gYXMgV29ya3NwYWNlXG4gICAgICBhd2FpdCBmcy53cml0ZUZpbGUoZGF0YUZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShiYXNlRGF0YSksICd1dGYtOCcpIC8vIENyZWF0ZSBhbiBlbXB0eSBKU09OIGZpbGVcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBtb2RlbHMgZm9sZGVyIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBpdFxuICAgIGNvbnN0IG1vZGVsc0ZvbGRlclBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAnbW9kZWxzJylcbiAgICBhd2FpdCBmcy5ta2Rpcihtb2RlbHNGb2xkZXJQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICAgIFxuICAgIC8vIExpc3QgYWxsIGZpbGVzIGluIHRoZSBtb2RlbHMgZm9sZGVyXG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmcy5yZWFkZGlyKG1vZGVsc0ZvbGRlclBhdGgpXG5cbiAgICAvLyBDaGVjayBpZiBwcm9qZWN0cyBmb2xkZXIgZXhpc3RzLCBvdGhlcndpc2UgY3JlYXRlIGl0XG4gICAgYXdhaXQgZnMubWtkaXIocGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cbiAgICAvLyBkb3dubG9hZCB0aGUgZm9sbG93aW5nIGZpbGVzIGlmIHRoZXkgZG9uJ3QgZXhpc3RcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAneW9sb3YxMmwucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL3VsdHJhbHl0aWNzL2Fzc2V0cy9yZWxlYXNlcy9kb3dubG9hZC92OC4zLjAveW9sbzEybC5wdCcpXG4gICAgYXdhaXQgY2hlY2tBbmREb3dubG9hZChtb2RlbHNGb2xkZXJQYXRoLCBmaWxlcywgJ3lvbG92MTFsLWZhY2UucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL2FrYW5hbWV0b3YveW9sby1mYWNlL3JlbGVhc2VzL2Rvd25sb2FkL3YwLjAuMC95b2xvdjExbC1mYWNlLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAncnQtZGV0ci1sLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS91bHRyYWx5dGljcy9hc3NldHMvcmVsZWFzZXMvZG93bmxvYWQvdjguMy4wL3J0ZGV0ci1sLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAncnQtZGV0ci14LWZhY2UucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DU2VML1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL3J0LWRldHIteC1mYWNlLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnbW9iaWxlX3NhbS5wdCcsICdodHRwczovL2dpdGh1Yi5jb20vdWx0cmFseXRpY3MvYXNzZXRzL3JlbGVhc2VzL2Rvd25sb2FkL3Y4LjMuMC9tb2JpbGVfc2FtLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnRmFzdFNBTS14LnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS91bHRyYWx5dGljcy9hc3NldHMvcmVsZWFzZXMvZG93bmxvYWQvdjguMy4wL0Zhc3RTQU0teC5wdCcpXG4gICAgYXdhaXQgY2hlY2tBbmREb3dubG9hZChtb2RlbHNGb2xkZXJQYXRoLCBmaWxlcywgJ2JpZy1sYW1hLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9lbmVzbXNhaGluL3NpbXBsZS1sYW1hLWlucGFpbnRpbmcvcmVsZWFzZXMvZG93bmxvYWQvdjAuMS4wL2JpZy1sYW1hLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnZmZtcGVnJywgJ2h0dHA6Ly9zdGF0aWMuZ3Jvc2plYW4uaW8vc2FtYW50aGEvZmZtcGVnX29zeCcpIFxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdmZnByb2JlJywgJ2h0dHA6Ly9zdGF0aWMuZ3Jvc2plYW4uaW8vc2FtYW50aGEvZmZwcm9iZV9vc3gnKVxuXG4gICAgY29uc29sZS5sb2coYFNldHVwIERPTkVgKTtcbiAgfSxcbiAgcGxhdGZvcm06ICgpID0+IHtcbiAgICBsZXQgbmFtZTtcbiAgICBzd2l0Y2ggKG9zLnBsYXRmb3JtKCkpIHtcbiAgICAgIGNhc2UgJ3dpbjMyJzpcbiAgICAgICAgbmFtZSA9ICdXaW5kb3dzJzsgYnJlYWs7XG4gICAgICBjYXNlICdkYXJ3aW4nOlxuICAgICAgICBuYW1lID0gJ21hY09TJzsgYnJlYWs7XG4gICAgICBjYXNlICdsaW51eCc6XG4gICAgICAgIG5hbWUgPSAnTGludXgnOyBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIG5hbWUgPSAnVW5rbm93bic7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBuYW1lLFxuICAgICAgdmVyc2lvbjogb3MucmVsZWFzZSgpLFxuICAgICAgYXJjaDogb3MuYXJjaCgpLFxuICAgIH1cbiAgfSxcbiAgY3B1OiAoKSA9PiB7XG4gICAgY29uc3QgY3B1cyA9IG9zLmNwdXMoKTtcbiAgICByZXR1cm4ge1xuICAgICAgY29yZXM6IG9zLmNwdXMoKS5sZW5ndGgsXG4gICAgICBtb2RlbDogb3MuY3B1cygpWzBdPy5tb2RlbCxcbiAgICAgIHNwZWVkOiBvcy5jcHVzKClbMF0/LnNwZWVkLFxuICAgIH1cbiAgfSxcbiAgbWVtOiAob3MudG90YWxtZW0oKSAvIDEwMjQgLyAxMDI0IC8gMTAyNCkudG9GaXhlZCgyKSxcbiAgZ3B1OiAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBsYXRmb3JtID0gb3MucGxhdGZvcm0oKTtcbiAgICAgIGlmIChwbGF0Zm9ybSA9PT0gJ3dpbjMyJyB8fCBwbGF0Zm9ybSA9PT0gJ2xpbnV4Jykge1xuICAgICAgICAvLyBDaGVjayBmb3IgQ1VEQSBjb21wYXRpYmlsaXR5IGFuZCBHUFUgbWVtb3J5IHVzaW5nIG52aWRpYS1zbWlcbiAgICAgICAgY29uc3QgY3VkYU91dHB1dCA9IGV4ZWNTeW5jKCdudmlkaWEtc21pIC0tcXVlcnktZ3B1PW5hbWUsbWVtb3J5LnRvdGFsIC0tZm9ybWF0PWNzdixub2hlYWRlcicsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSk7XG4gICAgICAgIGNvbnN0IFtncHVOYW1lLCBncHVNZW1vcnldID0gY3VkYU91dHB1dC50cmltKCkuc3BsaXQoJywnKS5tYXAoKGl0ZW0pID0+IGl0ZW0udHJpbSgpKTtcbiAgICAgICAgcmV0dXJuIHsgY3VkYTogdHJ1ZSwgbmFtZTogZ3B1TmFtZSwgbWVtb3J5OiBwYXJzZUludChncHVNZW1vcnkgfHwgJzAnICkgLyAxMDI0fTtcbiAgICAgIH0gXG4gICAgICBlbHNlIGlmIChwbGF0Zm9ybSA9PT0gJ2RhcndpbicpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIE1QUyBjb21wYXRpYmlsaXR5IChNZXRhbCkgb24gbWFjT1NcbiAgICAgICAgY29uc3QgbXBzT3V0cHV0ID0gZXhlY1N5bmMoJ3N5c3RlbV9wcm9maWxlciBTUERpc3BsYXlzRGF0YVR5cGUgfCBncmVwIFwiTWV0YWxcIicsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSk7XG4gICAgICAgIHJldHVybiB7IG1wczogbXBzT3V0cHV0LmluY2x1ZGVzKCdNZXRhbCcpLCBuYW1lOiAnTWV0YWwtY29tcGF0aWJsZSBHUFUnLCBtZW1vcnk6ICdOb3QgYXZhaWxhYmxlJyB9O1xuICAgICAgfVxuICAgIH0gXG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4geyBjdWRhOiBmYWxzZSwgbXBzOiBmYWxzZSwgbmFtZTogJ1Vua25vd24nLCBtZW1vcnk6ICdVbmtub3duJyB9O1xuICAgIH1cbiAgfSxcblxufSlcblxuXG5cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHNCQUE0QztBQUM1QyxnQkFBNkI7QUFDN0IsMkJBQXlCO0FBQ3pCLHNCQUFlO0FBQ2YsdUJBQWlCO0FBR2pCLDJCQUFtQjtBQUduQixlQUFlLGlCQUFpQixrQkFBMEIsT0FBaUIsTUFBYyxLQUFhO0FBQ3BHLE1BQUksQ0FBQyxNQUFNLFNBQVMsSUFBSSxHQUFHO0FBQ3pCLGdDQUFZLEtBQUssa0JBQWtCLGVBQWUsSUFBSSxLQUFLO0FBQzNELFVBQU0sNEJBQVksT0FBTyxtQkFBbUIsaUJBQUFBLFFBQUssS0FBSyxrQkFBa0IsSUFBSSxHQUFHLEdBQUc7QUFBQSxFQUNwRixPQUNLO0FBQ0gsZ0NBQVksS0FBSyxrQkFBa0IsR0FBRyxJQUFJLHVDQUF1QztBQUFBLEVBQ25GO0FBQ0Y7QUFHQSxlQUFlLGVBQWUsWUFBb0I7QUFDaEQsUUFBTSxXQUFXLENBQUM7QUFDbEIsYUFBVyxRQUFRLE1BQU0sZ0JBQUFDLFFBQUcsUUFBUSxVQUFVO0FBQzVDLFFBQUksS0FBSyxXQUFXLFNBQVM7QUFDM0IsZUFBUyxLQUFLLGdCQUFBQSxRQUFHLEdBQUcsaUJBQUFELFFBQUssS0FBSyxZQUFZLElBQUksQ0FBQyxDQUFDO0FBRXBELFFBQU0sUUFBUSxJQUFJLFFBQVE7QUFDNUI7QUFFQSw4QkFBYyxrQkFBa0IsWUFBWTtBQUFBLEVBQzFDLGFBQWE7QUFBQSxJQUNYLElBQUksQ0FBQyxTQUFpQixhQUF1Qyw0QkFBWSxHQUFHLFNBQVMsUUFBUTtBQUFBLElBQzdGLE1BQU0sQ0FBQyxZ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QWUsMkZBQTJGO0FBQzFKLFVBQU0saUJBQWlCLGtCQUFrQixPQUFPLFVBQVUsK0NBQStDO0FBQ3pHLFVBQU0saUJBQWlCLGtCQUFrQixPQUFPLFdBQVcsZ0RBQWdEO0FBRTNHLFlBQVEsSUFBSSxZQUFZO0FBQUEsRUFDMUI7QUFBQSxFQUNBLFVBQVUsTUFBTTtBQUNkLFFBQUk7QUFDSixZQUFRLFVBQUFHLFFBQUcsU0FBUyxHQUFHO0FBQUEsTUFDckIsS0FBSztBQUNILGVBQU87QUFBVztBQUFBLE1BQ3BCLEtBQUs7QUFDSCxlQUFPO0FBQVM7QUFBQSxNQUNsQixLQUFLO0FBQ0gsZUFBTztBQUFTO0FBQUEsTUFDbEI7QUFDRSxlQUFPO0FBQUEsSUFDWDtBQUNBLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQSxTQUFTLFVBQUFBLFFBQUcsUUFBUTtBQUFBLE1BQ3BCLE1BQU0sVUFBQUEsUUFBRyxLQUFLO0FBQUEsSUFDaEI7QUFBQSxFQUNGO0FBQUEsRUFDQSxLQUFLLE1BQU07QUFDVCxVQUFNLE9BQU8sVUFBQUEsUUFBRyxLQUFLO0FBQ3JCLFdBQU87QUFBQSxNQUNMLE9BQU8sVUFBQUEsUUFBRyxLQUFLLEVBQUU7QUFBQSxNQUNqQixPQUFPLFVBQUFBLFFBQUcsS0FBSyxFQUFFLENBQUMsR0FBRztBQUFBLE1BQ3JCLE9BQU8sVUFBQUEsUUFBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHO0FBQUEsSUFDdkI7QUFBQSxFQUNGO0FBQUEsRUFDQSxNQUFNLFVBQUFBLFFBQUcsU0FBUyxJQUFJLE9BQU8sT0FBTyxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQ25ELEtBQUssTUFBTTtBQUNULFFBQUk7QUFDRixZQUFNQyxZQUFXLFVBQUFELFFBQUcsU0FBUztBQUM3QixVQUFJQyxjQUFhLFdBQVdBLGNBQWEsU0FBUztBQUVoRCxjQUFNLGlCQUFhLCtCQUFTLGtFQUFrRSxFQUFFLFVBQVUsUUFBUSxDQUFDO0FBQ25ILGNBQU0sQ0FBQyxTQUFTLFNBQVMsSUFBSSxXQUFXLEtBQUssRUFBRSxNQUFNLEdBQUcsRUFBRSxJQUFJLENBQUMsU0FBUyxLQUFLLEtBQUssQ0FBQztBQUNuRixlQUFPLEVBQUUsTUFBTSxNQUFNLE1BQU0sU0FBUyxRQUFRLFNBQVMsYUFBYSxHQUFJLElBQUksS0FBSTtBQUFBLE1BQ2hGLFdBQ1NBLGNBQWEsVUFBVTtBQUU5QixjQUFNLGdCQUFZLCtCQUFTLHFEQUFxRCxFQUFFLFVBQVUsUUFBUSxDQUFDO0FBQ3JHLGVBQU8sRUFBRSxLQUFLLFVBQVUsU0FBUyxPQUFPLEdBQUcsTUFBTSx3QkFBd0IsUUFBUSxnQkFBZ0I7QUFBQSxNQUNuRztBQUFBLElBQ0YsU0FDTyxPQUFPO0FBQ1osYUFBTyxFQUFFLE1BQU0sT0FBTyxLQUFLLE9BQU8sTUFBTSxXQUFXLFFBQVEsVUFBVTtBQUFBLElBQ3ZFO0FBQUEsRUFDRjtBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbInBhdGgiLCAiZnMiLCAiZmZtcGVnIiwgIm9zIiwgInBsYXRmb3JtIl0KfQo=
