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
  //readWorkspace: (filePath: string) => ipcRenderer.invoke('read-workspace', path.join(filePath, 'data.json')),
  readWorkspace: (folderPath) => import_electron.ipcRenderer.invoke("read-workspace", folderPath),
  writeWorkspace: async (wpPath, project, data) => {
    const filePath = import_node_path.default.join(wpPath, "projects", project, "data.json");
    try {
      await import_promises.default.writeFile(filePath, JSON.stringify(data), "utf-8");
    } catch (err) {
      const msg = `Error writing workspace: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(msg);
      throw new Error(msg);
    }
  },
  loadProject: async (wpPath, project) => {
    const dataFilePath = import_node_path.default.join(wpPath, "projects", project, "data.json");
    try {
      return JSON.parse(await import_promises.default.readFile(dataFilePath, "utf-8"));
    } catch (err) {
      console.error("Error reading project data:", err);
      throw new Error(`Could not load project ${project}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  },
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
  deleteFolder: async (wpPath, folder) => await import_promises.default.rm(import_node_path.default.join(wpPath, "projects", folder), { recursive: true, force: true }),
  createFolder: async (wpPath, folder, project) => {
    const fullPath = import_node_path.default.join(wpPath, "projects", folder);
    try {
      await import_promises.default.access(fullPath);
      throw new Error("This project already exists");
    } catch (err) {
      if (err && err.code === "ENOENT") {
        await import_promises.default.mkdir(fullPath, { recursive: true });
        const dataFilePath = import_node_path.default.join(fullPath, "data.json");
        await import_promises.default.writeFile(dataFilePath, JSON.stringify(project), "utf-8");
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
    await import_promises.default.mkdir(import_node_path.default.join(wpPath, "projects"), { recursive: true });
    const modelsFolderPath = import_node_path.default.join(wpPath, "models");
    await import_promises.default.mkdir(modelsFolderPath, { recursive: true });
    const files = await import_promises.default.readdir(modelsFolderPath);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjLWVsZWN0cm9uL2VsZWN0cm9uLXByZWxvYWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNvbnRleHRCcmlkZ2UsIGlwY1JlbmRlcmVyIH0gIGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IG9zLCB7IHBsYXRmb3JtIH0gZnJvbSAnb3MnXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcy9wcm9taXNlcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB7IHR5cGUgV29ya3NwYWNlIH0gZnJvbSAnc3JjL3N0b3Jlcy93cFN0b3JlJ1xuaW1wb3J0IHV0aWxzIGZyb20gJ3NyYy91dGlscydcbmltcG9ydCBmZm1wZWcgZnJvbSAnZmx1ZW50LWZmbXBlZydcbmltcG9ydCB7IFByb2plY3QgfSBmcm9tICdzcmMvc3RvcmVzL3dwU3RvcmUnXG5cbi8vIGRvd25sb2FkIG1vZGVscyBpZiB0aGV5IGRvbid0IGV4aXN0XG5hc3luYyBmdW5jdGlvbiBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGg6IHN0cmluZywgZmlsZXM6IHN0cmluZ1tdLCBmaWxlOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gIGlmICghZmlsZXMuaW5jbHVkZXMoZmlsZSkpIHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKCdzZXR1cC1wcm9ncmVzcycsIGBEb3dubG9hZGluZyAke2ZpbGV9Li4uYClcbiAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoJ2Rvd25sb2FkLW1vZGVscycsIHBhdGguam9pbihtb2RlbHNGb2xkZXJQYXRoLCBmaWxlKSwgdXJsKVxuICB9XG4gIGVsc2Uge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgYCR7ZmlsZX0gYWxyZWFkeSBleGlzdHMsIHNraXBwaW5nIGRvd25sb2FkLi4uYClcbiAgfVxufVxuXG4vLyByZW1vdmUgYWxsIHNlZ21lbnRzICh2aWRlbyBjdXRzKSBmcm9tIHRoZSBvdXRwdXRQYXRoIGZvbGRlclxuYXN5bmMgZnVuY3Rpb24gcmVtb3ZlU2VnbWVudHMob3V0cHV0UGF0aDogc3RyaW5nKSB7XG4gIGNvbnN0IHNlZ21lbnRzID0gW11cbiAgZm9yIChjb25zdCBmaWxlIG9mIGF3YWl0IGZzLnJlYWRkaXIob3V0cHV0UGF0aCkpXG4gICAgaWYgKGZpbGUuc3RhcnRzV2l0aCgnc2VnbWVudCcpKSBcbiAgICAgIHNlZ21lbnRzLnB1c2goZnMucm0ocGF0aC5qb2luKG91dHB1dFBhdGgsIGZpbGUpKSlcblxuICBhd2FpdCBQcm9taXNlLmFsbChzZWdtZW50cylcbn1cblxuY29udGV4dEJyaWRnZS5leHBvc2VJbk1haW5Xb3JsZCgnZWxlY3Ryb24nLCB7XG4gIGlwY1JlbmRlcmVyOiB7XG4gICAgb246IChjaGFubmVsOiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogYW55W10pID0+IHZvaWQpID0+IGlwY1JlbmRlcmVyLm9uKGNoYW5uZWwsIGxpc3RlbmVyKSxcbiAgICBzZW5kOiAoY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSkgPT4gaXBjUmVuZGVyZXIuc2VuZChjaGFubmVsLCAuLi5hcmdzKSxcbiAgfSxcbn0pXG5cbmNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ3dvcmtzcGFjZUFQSScsIHtcbiAgLy9yZWFkV29ya3NwYWNlOiAoZmlsZVBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdyZWFkLXdvcmtzcGFjZScsIHBhdGguam9pbihmaWxlUGF0aCwgJ2RhdGEuanNvbicpKSxcbiAgcmVhZFdvcmtzcGFjZTogKGZvbGRlclBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdyZWFkLXdvcmtzcGFjZScsIGZvbGRlclBhdGgpLFxuICB3cml0ZVdvcmtzcGFjZTogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBwcm9qZWN0OiBzdHJpbmcsIGRhdGE6IGFueSkgPT4ge1xuICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgcHJvamVjdCwgJ2RhdGEuanNvbicpXG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShmaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkoZGF0YSksICd1dGYtOCcpXG4gICAgfVxuICAgIGNhdGNoIChlcnIpe1xuICAgICAgY29uc3QgbXNnID0gYEVycm9yIHdyaXRpbmcgd29ya3NwYWNlOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YFxuICAgICAgY29uc29sZS5lcnJvcihtc2cpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKVxuICAgIH1cbiAgfSxcbiAgbG9hZFByb2plY3Q6IGFzeW5jICh3cFBhdGg6IHN0cmluZywgcHJvamVjdDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgZGF0YUZpbGVQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgcHJvamVjdCwgJ2RhdGEuanNvbicpXG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGF3YWl0IGZzLnJlYWRGaWxlKGRhdGFGaWxlUGF0aCwgJ3V0Zi04JykpXG4gICAgfVxuICAgIGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJlYWRpbmcgcHJvamVjdCBkYXRhOicsIGVycilcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGxvYWQgcHJvamVjdCAke3Byb2plY3R9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YClcbiAgICB9XG4gIH0sXG4gIGZpbGVFeGlzdHM6IChwcm9qZWN0UGF0aDogc3RyaW5nLCBwcm9qZWN0TmFtZTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGUtZXhpc3RzJywgcGF0aC5qb2luKHByb2plY3RQYXRoLCAncHJvamVjdHMnLCBwcm9qZWN0TmFtZSwgJ2Jhc2UubXA0JykpLFxuICBnZXRWaWRlb0ZQUzogKHdvcmtzcGFjZTogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXIgfCBudWxsPiA9PiB7XG4gICAgZmZtcGVnLnNldEZmcHJvYmVQYXRoKHBhdGguam9pbih3b3Jrc3BhY2UsICdtb2RlbHMnLCAnZmZwcm9iZScpKVxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBmZm1wZWcuZmZwcm9iZShmaWxlUGF0aCwgKGVyciwgbWV0YWRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycikgXG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpXG4gICAgICAgIC8vIEZpbmQgdGhlIHZpZGVvIHN0cmVhbVxuICAgICAgICBjb25zdCB2aWRlb1N0cmVhbSA9IG1ldGFkYXRhLnN0cmVhbXMuZmluZChzID0+IHMuY29kZWNfdHlwZSA9PT0gJ3ZpZGVvJylcbiAgICAgICAgaWYgKCF2aWRlb1N0cmVhbSB8fCAhdmlkZW9TdHJlYW0ucl9mcmFtZV9yYXRlKSBcbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZShudWxsKVxuICAgICAgICAvLyByX2ZyYW1lX3JhdGUgaXMgYSBzdHJpbmcgbGlrZSBcIjI1LzFcIiBvciBcIjMwMDAwLzEwMDFcIlxuICAgICAgICBjb25zdCBbbnVtLCBkZW5vbV0gPSB2aWRlb1N0cmVhbS5yX2ZyYW1lX3JhdGUuc3BsaXQoJy8nKS5tYXAoTnVtYmVyKVxuICAgICAgICBpZiAoIW51bSB8fCAhZGVub20pIFxuICAgICAgICAgIHJldHVybiByZXNvbHZlKG51bGwpXG4gICAgICAgIHJlc29sdmUobnVtIC8gZGVub20pXG4gICAgICB9KVxuICAgIH0pXG4gIH0sXG4gIGN1dEFuZEVuY29kZVZpZGVvOiBhc3luYyAod29ya2RzcGFjZTogc3RyaW5nLCBwcm9qZWN0TmFtZTogc3RyaW5nLCBpbnB1dEZpbGVQYXRoOiBzdHJpbmcsIGtlZXBSYW5nZXM6IFtzdHJpbmcsIHN0cmluZywgbnVtYmVyXVtdKSA9PiB7XG4gICAgY29uc29sZS5sb2coJ2N1dHRpbmcgYW5kIGVuY29kaW5nIHZpZGVvJylcbiAgICBjb25zdCBvdXRwdXRQYXRoID0gcGF0aC5qb2luKHdvcmtkc3BhY2UsICdwcm9qZWN0cycsIHByb2plY3ROYW1lKVxuICAgIC8vIHJlbW92ZSBhbGwgZmlsZXMgdGhhdCBzdGFydCB3aXRoICdzZWdtZW50JyBpbiB0aGUgb3V0cHV0UGF0aCBmb2xkZXJcbiAgICBhd2FpdCByZW1vdmVTZWdtZW50cyhvdXRwdXRQYXRoKVxuXG4gICAgLy8gc2VnbWVudCB0aGUgdmlkZW9cbiAgICBmZm1wZWcuc2V0RmZtcGVnUGF0aChwYXRoLmpvaW4od29ya2RzcGFjZSwgJ21vZGVscycsICdmZm1wZWcnKSlcbiAgICBjb25zdCBzZWdtZW50RmlsZXM6IHN0cmluZ1tdID0gW11cbiAgICBcbiAgICAvLyBsb29wIHRocm91Z2ggdGhlIGtlZXBSYW5nZXMgYW5kIGNyZWF0ZSB2aWRlbyBzZWdtZW50c1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2VlcFJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcmFuZ2UgPSBrZWVwUmFuZ2VzW2ldXG4gICAgICBpZiAoIXJhbmdlKSBcbiAgICAgICAgY29udGludWVcbiAgICAgIGNvbnN0IFtzdGFydCwgZW5kLCBkdXJhdGlvbl0gPSByYW5nZVxuXG4gICAgICBjb25zdCBzZWdGaWxlID0gcGF0aC5qb2luKG91dHB1dFBhdGgsIGBzZWdtZW50XyR7aX0ubXA0YClcbiAgICAgIHNlZ21lbnRGaWxlcy5wdXNoKHNlZ0ZpbGUpXG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGZmbXBlZyhpbnB1dEZpbGVQYXRoKVxuICAgICAgICAgIC5zZXRTdGFydFRpbWUoc3RhcnQpXG4gICAgICAgICAgLnNldER1cmF0aW9uKGR1cmF0aW9uKVxuICAgICAgICAgIC52aWRlb0NvZGVjKCdsaWJ4MjY0JykgLy8gUmUtZW5jb2RlIHRvIGVuc3VyZSBNUDQgY29tcGF0aWJpbGl0eVxuICAgICAgICAgIC5hdWRpb0NvZGVjKCdhYWMnKVxuICAgICAgICAgIC5vdXRwdXRPcHRpb25zKCctbW92ZmxhZ3MnLCAnZmFzdHN0YXJ0JykgLy8gZm9yIGJldHRlciBtcDQgY29tcGF0aWJpbGl0eVxuICAgICAgICAgIC5vdXRwdXRPcHRpb25zKCctcHJlc2V0JywgJ2Zhc3QnKVxuICAgICAgICAgIC5vdXRwdXRPcHRpb25zKCctY3JmJywgJzIzJylcbiAgICAgICAgICAub3V0cHV0KHNlZ0ZpbGUpXG4gICAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgU2VnbWVudCAke2l9IGRvbmVgKVxuICAgICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgICAgfSlcbiAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIHByb2Nlc3Npbmcgc2VnbWVudCAke2l9YClcbiAgICAgICAgICAgIHJlamVjdChlKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgLnJ1bigpXG4gICAgICB9KVxuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCdBbGwgc2VnbWVudHMgZG9uZScpXG5cbiAgICAvLyBDb25jYXRlbmF0ZSB0aGUgc2VnbWVudHMgaW50byBhIHNpbmdsZSB2aWRlbyBmaWxlXG4gICAgY29uc3QgbGlzdEZpbGUgPSBwYXRoLmpvaW4ob3V0cHV0UGF0aCwgJ3NlZ21lbnRzLnR4dCcpXG4gICAgYXdhaXQgZnMud3JpdGVGaWxlKGxpc3RGaWxlLCBzZWdtZW50RmlsZXMubWFwKGYgPT4gYGZpbGUgJyR7Zn0nYCkuam9pbignXFxuJykpXG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZmZtcGVnKClcbiAgICAgICAgLmlucHV0KGxpc3RGaWxlKVxuICAgICAgICAuaW5wdXRPcHRpb25zKCctZicsICdjb25jYXQnLCAnLXNhZmUnLCAnMCcpXG4gICAgICAgIC5vdXRwdXRPcHRpb25zKCctYycsICdjb3B5JylcbiAgICAgICAgLm91dHB1dChwYXRoLmpvaW4ob3V0cHV0UGF0aCwgJ2Jhc2UubXA0JykpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdDb25jYXRlbmF0aW9uIGRvbmUnKVxuICAgICAgICAgIHJlc29sdmUoKVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgY29uY2F0ZW5hdGlvbicpXG4gICAgICAgICAgcmVqZWN0KGUpXG4gICAgICAgIH0pXG4gICAgICAgIC5ydW4oKVxuICAgICAgfVxuICAgIClcblxuICAgIC8vIFJlbW92ZSB0aGUgc2VnbWVudHNcbiAgICBhd2FpdCByZW1vdmVTZWdtZW50cyhvdXRwdXRQYXRoKVxuICB9XG59KVxuXG4vLyBnZXQgc3lzdGVtIGluZm9ybWF0aW9uXG5jb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdzeXMnLCB7XG4gIG9wZW5Gb2xkZXI6IChmb2xkZXJQYXRoOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLnNlbmQoJ29wZW4tZm9sZGVyJywgZm9sZGVyUGF0aCksXG4gIHBpY2tGb2xkZXI6ICgpID0+IGlwY1JlbmRlcmVyLmludm9rZSgncGljay1mb2xkZXInKSxcbiAgcGlja0ZpbGU6ICgpID0+IGlwY1JlbmRlcmVyLmludm9rZSgncGljay1maWxlJyksXG4gIGRlbGV0ZUZvbGRlcjogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBmb2xkZXI6IHN0cmluZykgPT4gYXdhaXQgZnMucm0ocGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgZm9sZGVyKSwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pLFxuICBjcmVhdGVGb2xkZXI6IGFzeW5jICh3cFBhdGg6IHN0cmluZywgZm9sZGVyOiBzdHJpbmcsIHByb2plY3Q6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgZm9sZGVyKVxuICAgIC8vIHRyeSB0byBjcmVhdGUgdGhlIHByb2plY3QgZm9sZGVyXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhmdWxsUGF0aClcbiAgICAgIC8vIElmIG5vIGVycm9yLCB0aGUgZm9sZGVyIGV4aXN0c1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGlzIHByb2plY3QgYWxyZWFkeSBleGlzdHMnKVxuICAgIH1cbiAgICBjYXRjaChlcnI6IGFueSkge1xuICAgICAgLy8gT25seSBjcmVhdGUgdGhlIGZvbGRlciBpZiB0aGUgZXJyb3IgaXMgXCJub3QgZXhpc3RzXCJcbiAgICAgIGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdFTk9FTlQnKSB7XG4gICAgICAgIC8vIEZvbGRlciBkb2VzIG5vdCBleGlzdCwgY3JlYXRlIGl0XG4gICAgICAgIGF3YWl0IGZzLm1rZGlyKGZ1bGxQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuXG4gICAgICAgIC8vIGNyZWF0ZSB0aGUgZGF0YS5qc29uIGZpbGVcbiAgICAgICAgY29uc3QgZGF0YUZpbGVQYXRoID0gcGF0aC5qb2luKGZ1bGxQYXRoLCAnZGF0YS5qc29uJylcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShkYXRhRmlsZVBhdGgsIEpTT04uc3RyaW5naWZ5KHByb2plY3QpLCAndXRmLTgnKVxuICAgICAgfSBcbiAgICAgIGVsc2VcbiAgICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9LFxuICBzZXR1cFdvcmtzcGFjZTogYXN5bmMgKHdwUGF0aDogc3RyaW5nKSA9PiB7XG4gICAgY29uc29sZS5sb2coYHNldHRpbmcgd29ya2RzcGFjZSBhdCAke3dwUGF0aH1gKVxuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgJ1N0YXJ0aW5nIHdvcmtzcGFjZSBzZXR1cC4uLicpXG4gICAgXG4gICAgLy8gbWFrZSBzdXJlIHBhdGggZXhpc3RzXG4gICAgYXdhaXQgZnMubWtkaXIod3BQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuXG5cbiAgICAvKlxuICAgIFRPLURPOiByZW1vdmUgdGhpcyBsYXRlclxuICAgICovXG4gICAgLy8gQ2hlY2sgaWYgZGF0YS5qc29uIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBpdFxuICAgIGNvbnN0IGRhdGFGaWxlUGF0aCA9IHBhdGguam9pbih3cFBhdGgsICdkYXRhLmpzb24nKVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5hY2Nlc3MoZGF0YUZpbGVQYXRoKVxuICAgICAgaXBjUmVuZGVyZXIuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCAnRGF0YSBmaWxlIGFscmVhZHkgZXhpc3RzLCBza2lwcGluZyBjcmVhdGlvbi4uLicpXG4gICAgfSBcbiAgICBjYXRjaCB7XG4gICAgICBpcGNSZW5kZXJlci5zZW5kKCdzZXR1cC1wcm9ncmVzcycsICdDcmVhdGluZyBkYXRhIGZpbGUuLi4nKVxuICAgICAgY29uc3QgYmFzZURhdGEgPSB7XG4gICAgICAgIHByb2plY3RzOiBbXSxcbiAgICAgIH0gYXMgV29ya3NwYWNlXG4gICAgICBhd2FpdCBmcy53cml0ZUZpbGUoZGF0YUZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShiYXNlRGF0YSksICd1dGYtOCcpIC8vIENyZWF0ZSBhbiBlbXB0eSBKU09OIGZpbGVcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBwcm9qZWN0cyBmb2xkZXIgZXhpc3RzLCBvdGhlcndpc2UgY3JlYXRlIGl0XG4gICAgYXdhaXQgZnMubWtkaXIocGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cbiAgICAvLyBDaGVjayBpZiBtb2RlbHMgZm9sZGVyIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBpdFxuICAgIGNvbnN0IG1vZGVsc0ZvbGRlclBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAnbW9kZWxzJylcbiAgICBhd2FpdCBmcy5ta2Rpcihtb2RlbHNGb2xkZXJQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICAgIFxuICAgIC8vIExpc3QgYWxsIGZpbGVzIGluIHRoZSBtb2RlbHMgZm9sZGVyXG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmcy5yZWFkZGlyKG1vZGVsc0ZvbGRlclBhdGgpXG5cbiAgICAvLyBkb3dubG9hZCB0aGUgZm9sbG93aW5nIGZpbGVzIGlmIHRoZXkgZG9uJ3QgZXhpc3RcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAneW9sb3YxMmwucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL3VsdHJhbHl0aWNzL2Fzc2V0cy9yZWxlYXNlcy9kb3dubG9hZC92OC4zLjAveW9sbzEybC5wdCcpXG4gICAgYXdhaXQgY2hlY2tBbmREb3dubG9hZChtb2RlbHNGb2xkZXJQYXRoLCBmaWxlcywgJ3lvbG92MTFsLWZhY2UucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL2FrYW5hbWV0b3YveW9sby1mYWNlL3JlbGVhc2VzL2Rvd25sb2FkL3YwLjAuMC95b2xvdjExbC1mYWNlLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAncnQtZGV0ci1sLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS91bHRyYWx5dGljcy9hc3NldHMvcmVsZWFzZXMvZG93bmxvYWQvdjguMy4wL3J0ZGV0ci1sLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAncnQtZGV0ci14LWZhY2UucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DU2VML1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL3J0LWRldHIteC1mYWNlLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnbW9iaWxlX3NhbS5wdCcsICdodHRwczovL2dpdGh1Yi5jb20vdWx0cmFseXRpY3MvYXNzZXRzL3JlbGVhc2VzL2Rvd25sb2FkL3Y4LjMuMC9tb2JpbGVfc2FtLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnRmFzdFNBTS14LnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS91bHRyYWx5dGljcy9hc3NldHMvcmVsZWFzZXMvZG93bmxvYWQvdjguMy4wL0Zhc3RTQU0teC5wdCcpXG4gICAgYXdhaXQgY2hlY2tBbmREb3dubG9hZChtb2RlbHNGb2xkZXJQYXRoLCBmaWxlcywgJ2JpZy1sYW1hLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9lbmVzbXNhaGluL3NpbXBsZS1sYW1hLWlucGFpbnRpbmcvcmVsZWFzZXMvZG93bmxvYWQvdjAuMS4wL2JpZy1sYW1hLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnZmZtcGVnJywgJ2h0dHA6Ly9zdGF0aWMuZ3Jvc2plYW4uaW8vc2FtYW50aGEvZmZtcGVnX29zeCcpIFxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdmZnByb2JlJywgJ2h0dHA6Ly9zdGF0aWMuZ3Jvc2plYW4uaW8vc2FtYW50aGEvZmZwcm9iZV9vc3gnKVxuXG4gICAgY29uc29sZS5sb2coYFNldHVwIERPTkVgKTtcbiAgfSxcbiAgcGxhdGZvcm06ICgpID0+IHtcbiAgICBsZXQgbmFtZTtcbiAgICBzd2l0Y2ggKG9zLnBsYXRmb3JtKCkpIHtcbiAgICAgIGNhc2UgJ3dpbjMyJzpcbiAgICAgICAgbmFtZSA9ICdXaW5kb3dzJzsgYnJlYWs7XG4gICAgICBjYXNlICdkYXJ3aW4nOlxuICAgICAgICBuYW1lID0gJ21hY09TJzsgYnJlYWs7XG4gICAgICBjYXNlICdsaW51eCc6XG4gICAgICAgIG5hbWUgPSAnTGludXgnOyBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIG5hbWUgPSAnVW5rbm93bic7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBuYW1lLFxuICAgICAgdmVyc2lvbjogb3MucmVsZWFzZSgpLFxuICAgICAgYXJjaDogb3MuYXJjaCgpLFxuICAgIH1cbiAgfSxcbiAgY3B1OiAoKSA9PiB7XG4gICAgY29uc3QgY3B1cyA9IG9zLmNwdXMoKTtcbiAgICByZXR1cm4ge1xuICAgICAgY29yZXM6IG9zLmNwdXMoKS5sZW5ndGgsXG4gICAgICBtb2RlbDogb3MuY3B1cygpWzBdPy5tb2RlbCxcbiAgICAgIHNwZWVkOiBvcy5jcHVzKClbMF0/LnNwZWVkLFxuICAgIH1cbiAgfSxcbiAgbWVtOiAob3MudG90YWxtZW0oKSAvIDEwMjQgLyAxMDI0IC8gMTAyNCkudG9GaXhlZCgyKSxcbiAgZ3B1OiAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBsYXRmb3JtID0gb3MucGxhdGZvcm0oKTtcbiAgICAgIGlmIChwbGF0Zm9ybSA9PT0gJ3dpbjMyJyB8fCBwbGF0Zm9ybSA9PT0gJ2xpbnV4Jykge1xuICAgICAgICAvLyBDaGVjayBmb3IgQ1VEQSBjb21wYXRpYmlsaXR5IGFuZCBHUFUgbWVtb3J5IHVzaW5nIG52aWRpYS1zbWlcbiAgICAgICAgY29uc3QgY3VkYU91dHB1dCA9IGV4ZWNTeW5jKCdudmlkaWEtc21pIC0tcXVlcnktZ3B1PW5hbWUsbWVtb3J5LnRvdGFsIC0tZm9ybWF0PWNzdixub2hlYWRlcicsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSk7XG4gICAgICAgIGNvbnN0IFtncHVOYW1lLCBncHVNZW1vcnldID0gY3VkYU91dHB1dC50cmltKCkuc3BsaXQoJywnKS5tYXAoKGl0ZW0pID0+IGl0ZW0udHJpbSgpKTtcbiAgICAgICAgcmV0dXJuIHsgY3VkYTogdHJ1ZSwgbmFtZTogZ3B1TmFtZSwgbWVtb3J5OiBwYXJzZUludChncHVNZW1vcnkgfHwgJzAnICkgLyAxMDI0fTtcbiAgICAgIH0gXG4gICAgICBlbHNlIGlmIChwbGF0Zm9ybSA9PT0gJ2RhcndpbicpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIE1QUyBjb21wYXRpYmlsaXR5IChNZXRhbCkgb24gbWFjT1NcbiAgICAgICAgY29uc3QgbXBzT3V0cHV0ID0gZXhlY1N5bmMoJ3N5c3RlbV9wcm9maWxlciBTUERpc3BsYXlzRGF0YVR5cGUgfCBncmVwIFwiTWV0YWxcIicsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSk7XG4gICAgICAgIHJldHVybiB7IG1wczogbXBzT3V0cHV0LmluY2x1ZGVzKCdNZXRhbCcpLCBuYW1lOiAnTWV0YWwtY29tcGF0aWJsZSBHUFUnLCBtZW1vcnk6ICdOb3QgYXZhaWxhYmxlJyB9O1xuICAgICAgfVxuICAgIH0gXG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4geyBjdWRhOiBmYWxzZSwgbXBzOiBmYWxzZSwgbmFtZTogJ1Vua25vd24nLCBtZW1vcnk6ICdVbmtub3duJyB9O1xuICAgIH1cbiAgfSxcblxufSlcblxuXG5cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHNCQUE0QztBQUM1QyxnQkFBNkI7QUFDN0IsMkJBQXlCO0FBQ3pCLHNCQUFlO0FBQ2YsdUJBQWlCO0FBR2pCLDJCQUFtQjtBQUluQixlQUFlLGlCQUFpQixrQkFBMEIsT0FBaUIsTUFBYyxLQUFhO0FBQ3BHLE1BQUksQ0FBQyxNQUFNLFNBQVMsSUFBSSxHQUFHO0FBQ3pCLGdDQUFZLEtBQUssa0JBQWtCLGVBQWUsSUFBSSxLQUFLO0FBQzNELFVBQU0sNEJBQVksT0FBTyxtQkFBbUIsaUJBQUFBLFFBQUssS0FBSyxrQkFBa0IsSUFBSSxHQUFHLEdBQUc7QUFBQSxFQUNwRixPQUNLO0FBQ0gsZ0NBQVksS0FBSyxr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QUlDLGNBQWEsV0FBV0EsY0FBYSxTQUFTO0FBRWhELGNBQU0saUJBQWEsK0JBQVMsa0VBQWtFLEVBQUUsVUFBVSxRQUFRLENBQUM7QUFDbkgsY0FBTSxDQUFDLFNBQVMsU0FBUyxJQUFJLFdBQVcsS0FBSyxFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUksQ0FBQyxTQUFTLEtBQUssS0FBSyxDQUFDO0FBQ25GLGVBQU8sRUFBRSxNQUFNLE1BQU0sTUFBTSxTQUFTLFFBQVEsU0FBUyxhQUFhLEdBQUksSUFBSSxLQUFJO0FBQUEsTUFDaEYsV0FDU0EsY0FBYSxVQUFVO0FBRTlCLGNBQU0sZ0JBQVksK0JBQVMscURBQXFELEVBQUUsVUFBVSxRQUFRLENBQUM7QUFDckcsZUFBTyxFQUFFLEtBQUssVUFBVSxTQUFTLE9BQU8sR0FBRyxNQUFNLHdCQUF3QixRQUFRLGdCQUFnQjtBQUFBLE1BQ25HO0FBQUEsSUFDRixTQUNPLE9BQU87QUFDWixhQUFPLEVBQUUsTUFBTSxPQUFPLEtBQUssT0FBTyxNQUFNLFdBQVcsUUFBUSxVQUFVO0FBQUEsSUFDdkU7QUFBQSxFQUNGO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFsicGF0aCIsICJmcyIsICJmZm1wZWciLCAib3MiLCAicGxhdGZvcm0iXQp9Cg==
