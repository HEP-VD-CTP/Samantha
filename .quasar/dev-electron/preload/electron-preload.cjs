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
    await checkAndDownload(modelsFolderPath, files, "yolov12l.pt", "https://github.com/HEP-VD-CTP/Samantha/raw/refs/heads/main/models/yolov12l.pt");
    await checkAndDownload(modelsFolderPath, files, "yolov11l-face.pt", "https://github.com/HEP-VD-CTP/Samantha/raw/refs/heads/main/models/yolov11l-face.pt");
    await checkAndDownload(modelsFolderPath, files, "mobile_sam.pt", "https://github.com/HEP-VD-CTP/Samantha/raw/refs/heads/main/models/mobile_sam.pt");
    await checkAndDownload(modelsFolderPath, files, "FastSAM-x.pt", "https://github.com/HEP-VD-CTP/Samantha/raw/refs/heads/main/models/FastSAM-x.pt");
    await checkAndDownload(modelsFolderPath, files, "big-lama.pt", "https://github.com/HEP-VD-CTP/Samantha/raw/refs/heads/main/models/big-lama.pt");
    await checkAndDownload(modelsFolderPath, files, "ffmpeg", "https://github.com/HEP-VD-CTP/Samantha/raw/refs/heads/main/models/ffmpeg_osx");
    await checkAndDownload(modelsFolderPath, files, "ffprobe", "https://github.com/HEP-VD-CTP/Samantha/raw/refs/heads/main/models/ffprobe_osx");
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjLWVsZWN0cm9uL2VsZWN0cm9uLXByZWxvYWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNvbnRleHRCcmlkZ2UsIGlwY1JlbmRlcmVyIH0gIGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IG9zLCB7IHBsYXRmb3JtIH0gZnJvbSAnb3MnXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcy9wcm9taXNlcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB7IHR5cGUgV29ya3NwYWNlIH0gZnJvbSAnc3JjL3N0b3Jlcy93cFN0b3JlJ1xuaW1wb3J0IHV0aWxzIGZyb20gJ3NyYy91dGlscydcbmltcG9ydCBmZm1wZWcgZnJvbSAnZmx1ZW50LWZmbXBlZydcbmltcG9ydCB7IFByb2plY3QgfSBmcm9tICdzcmMvc3RvcmVzL3dwU3RvcmUnXG5cbi8vIGRvd25sb2FkIG1vZGVscyBpZiB0aGV5IGRvbid0IGV4aXN0XG5hc3luYyBmdW5jdGlvbiBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGg6IHN0cmluZywgZmlsZXM6IHN0cmluZ1tdLCBmaWxlOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gIGlmICghZmlsZXMuaW5jbHVkZXMoZmlsZSkpIHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKCdzZXR1cC1wcm9ncmVzcycsIGBEb3dubG9hZGluZyAke2ZpbGV9Li4uYClcbiAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoJ2Rvd25sb2FkLW1vZGVscycsIHBhdGguam9pbihtb2RlbHNGb2xkZXJQYXRoLCBmaWxlKSwgdXJsKVxuICB9XG4gIGVsc2Uge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgYCR7ZmlsZX0gYWxyZWFkeSBleGlzdHMsIHNraXBwaW5nIGRvd25sb2FkLi4uYClcbiAgfVxufVxuXG4vLyByZW1vdmUgYWxsIHNlZ21lbnRzICh2aWRlbyBjdXRzKSBmcm9tIHRoZSBvdXRwdXRQYXRoIGZvbGRlclxuYXN5bmMgZnVuY3Rpb24gcmVtb3ZlU2VnbWVudHMob3V0cHV0UGF0aDogc3RyaW5nKSB7XG4gIGNvbnN0IHNlZ21lbnRzID0gW11cbiAgZm9yIChjb25zdCBmaWxlIG9mIGF3YWl0IGZzLnJlYWRkaXIob3V0cHV0UGF0aCkpXG4gICAgaWYgKGZpbGUuc3RhcnRzV2l0aCgnc2VnbWVudCcpKSBcbiAgICAgIHNlZ21lbnRzLnB1c2goZnMucm0ocGF0aC5qb2luKG91dHB1dFBhdGgsIGZpbGUpKSlcblxuICBhd2FpdCBQcm9taXNlLmFsbChzZWdtZW50cylcbn1cblxuY29udGV4dEJyaWRnZS5leHBvc2VJbk1haW5Xb3JsZCgnZWxlY3Ryb24nLCB7XG4gIGlwY1JlbmRlcmVyOiB7XG4gICAgb246IChjaGFubmVsOiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogYW55W10pID0+IHZvaWQpID0+IGlwY1JlbmRlcmVyLm9uKGNoYW5uZWwsIGxpc3RlbmVyKSxcbiAgICBzZW5kOiAoY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSkgPT4gaXBjUmVuZGVyZXIuc2VuZChjaGFubmVsLCAuLi5hcmdzKSxcbiAgfSxcbn0pXG5cbmNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ3dvcmtzcGFjZUFQSScsIHtcbiAgLy9yZWFkV29ya3NwYWNlOiAoZmlsZVBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdyZWFkLXdvcmtzcGFjZScsIHBhdGguam9pbihmaWxlUGF0aCwgJ2RhdGEuanNvbicpKSxcbiAgcmVhZFdvcmtzcGFjZTogKGZvbGRlclBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdyZWFkLXdvcmtzcGFjZScsIGZvbGRlclBhdGgpLFxuICB3cml0ZVdvcmtzcGFjZTogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBwcm9qZWN0OiBzdHJpbmcsIGRhdGE6IGFueSkgPT4ge1xuICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgcHJvamVjdCwgJ2RhdGEuanNvbicpXG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShmaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkoZGF0YSksICd1dGYtOCcpXG4gICAgfVxuICAgIGNhdGNoIChlcnIpe1xuICAgICAgY29uc3QgbXNnID0gYEVycm9yIHdyaXRpbmcgd29ya3NwYWNlOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YFxuICAgICAgY29uc29sZS5lcnJvcihtc2cpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKVxuICAgIH1cbiAgfSxcbiAgbG9hZFByb2plY3Q6IGFzeW5jICh3cFBhdGg6IHN0cmluZywgcHJvamVjdDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgZGF0YUZpbGVQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgcHJvamVjdCwgJ2RhdGEuanNvbicpXG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGF3YWl0IGZzLnJlYWRGaWxlKGRhdGFGaWxlUGF0aCwgJ3V0Zi04JykpXG4gICAgfVxuICAgIGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJlYWRpbmcgcHJvamVjdCBkYXRhOicsIGVycilcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGxvYWQgcHJvamVjdCAke3Byb2plY3R9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YClcbiAgICB9XG4gIH0sXG4gIGZpbGVFeGlzdHM6IChwcm9qZWN0UGF0aDogc3RyaW5nLCBwcm9qZWN0TmFtZTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGUtZXhpc3RzJywgcGF0aC5qb2luKHByb2plY3RQYXRoLCAncHJvamVjdHMnLCBwcm9qZWN0TmFtZSwgJ2Jhc2UubXA0JykpLFxuICBnZXRWaWRlb0ZQUzogKHdvcmtzcGFjZTogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXIgfCBudWxsPiA9PiB7XG4gICAgZmZtcGVnLnNldEZmcHJvYmVQYXRoKHBhdGguam9pbih3b3Jrc3BhY2UsICdtb2RlbHMnLCAnZmZwcm9iZScpKVxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBmZm1wZWcuZmZwcm9iZShmaWxlUGF0aCwgKGVyciwgbWV0YWRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycikgXG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpXG4gICAgICAgIC8vIEZpbmQgdGhlIHZpZGVvIHN0cmVhbVxuICAgICAgICBjb25zdCB2aWRlb1N0cmVhbSA9IG1ldGFkYXRhLnN0cmVhbXMuZmluZChzID0+IHMuY29kZWNfdHlwZSA9PT0gJ3ZpZGVvJylcbiAgICAgICAgaWYgKCF2aWRlb1N0cmVhbSB8fCAhdmlkZW9TdHJlYW0ucl9mcmFtZV9yYXRlKSBcbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZShudWxsKVxuICAgICAgICAvLyByX2ZyYW1lX3JhdGUgaXMgYSBzdHJpbmcgbGlrZSBcIjI1LzFcIiBvciBcIjMwMDAwLzEwMDFcIlxuICAgICAgICBjb25zdCBbbnVtLCBkZW5vbV0gPSB2aWRlb1N0cmVhbS5yX2ZyYW1lX3JhdGUuc3BsaXQoJy8nKS5tYXAoTnVtYmVyKVxuICAgICAgICBpZiAoIW51bSB8fCAhZGVub20pIFxuICAgICAgICAgIHJldHVybiByZXNvbHZlKG51bGwpXG4gICAgICAgIHJlc29sdmUobnVtIC8gZGVub20pXG4gICAgICB9KVxuICAgIH0pXG4gIH0sXG4gIGN1dEFuZEVuY29kZVZpZGVvOiBhc3luYyAod29ya2RzcGFjZTogc3RyaW5nLCBwcm9qZWN0TmFtZTogc3RyaW5nLCBpbnB1dEZpbGVQYXRoOiBzdHJpbmcsIGtlZXBSYW5nZXM6IFtzdHJpbmcsIHN0cmluZywgbnVtYmVyXVtdKSA9PiB7XG4gICAgY29uc29sZS5sb2coJ2N1dHRpbmcgYW5kIGVuY29kaW5nIHZpZGVvJylcbiAgICBjb25zdCBvdXRwdXRQYXRoID0gcGF0aC5qb2luKHdvcmtkc3BhY2UsICdwcm9qZWN0cycsIHByb2plY3ROYW1lKVxuICAgIC8vIHJlbW92ZSBhbGwgZmlsZXMgdGhhdCBzdGFydCB3aXRoICdzZWdtZW50JyBpbiB0aGUgb3V0cHV0UGF0aCBmb2xkZXJcbiAgICBhd2FpdCByZW1vdmVTZWdtZW50cyhvdXRwdXRQYXRoKVxuXG4gICAgLy8gc2VnbWVudCB0aGUgdmlkZW9cbiAgICBmZm1wZWcuc2V0RmZtcGVnUGF0aChwYXRoLmpvaW4od29ya2RzcGFjZSwgJ21vZGVscycsICdmZm1wZWcnKSlcbiAgICBjb25zdCBzZWdtZW50RmlsZXM6IHN0cmluZ1tdID0gW11cbiAgICBcbiAgICAvLyBsb29wIHRocm91Z2ggdGhlIGtlZXBSYW5nZXMgYW5kIGNyZWF0ZSB2aWRlbyBzZWdtZW50c1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2VlcFJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcmFuZ2UgPSBrZWVwUmFuZ2VzW2ldXG4gICAgICBpZiAoIXJhbmdlKSBcbiAgICAgICAgY29udGludWVcbiAgICAgIGNvbnN0IFtzdGFydCwgZW5kLCBkdXJhdGlvbl0gPSByYW5nZVxuXG4gICAgICBjb25zdCBzZWdGaWxlID0gcGF0aC5qb2luKG91dHB1dFBhdGgsIGBzZWdtZW50XyR7aX0ubXA0YClcbiAgICAgIHNlZ21lbnRGaWxlcy5wdXNoKHNlZ0ZpbGUpXG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGZmbXBlZyhpbnB1dEZpbGVQYXRoKVxuICAgICAgICAgIC5zZXRTdGFydFRpbWUoc3RhcnQpXG4gICAgICAgICAgLnNldER1cmF0aW9uKGR1cmF0aW9uKVxuICAgICAgICAgIC52aWRlb0NvZGVjKCdsaWJ4MjY0JykgLy8gUmUtZW5jb2RlIHRvIGVuc3VyZSBNUDQgY29tcGF0aWJpbGl0eVxuICAgICAgICAgIC5hdWRpb0NvZGVjKCdhYWMnKVxuICAgICAgICAgIC5vdXRwdXRPcHRpb25zKCctbW92ZmxhZ3MnLCAnZmFzdHN0YXJ0JykgLy8gZm9yIGJldHRlciBtcDQgY29tcGF0aWJpbGl0eVxuICAgICAgICAgIC5vdXRwdXRPcHRpb25zKCctcHJlc2V0JywgJ2Zhc3QnKVxuICAgICAgICAgIC5vdXRwdXRPcHRpb25zKCctY3JmJywgJzIzJylcbiAgICAgICAgICAub3V0cHV0KHNlZ0ZpbGUpXG4gICAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgU2VnbWVudCAke2l9IGRvbmVgKVxuICAgICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgICAgfSlcbiAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIHByb2Nlc3Npbmcgc2VnbWVudCAke2l9YClcbiAgICAgICAgICAgIHJlamVjdChlKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgLnJ1bigpXG4gICAgICB9KVxuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCdBbGwgc2VnbWVudHMgZG9uZScpXG5cbiAgICAvLyBDb25jYXRlbmF0ZSB0aGUgc2VnbWVudHMgaW50byBhIHNpbmdsZSB2aWRlbyBmaWxlXG4gICAgY29uc3QgbGlzdEZpbGUgPSBwYXRoLmpvaW4ob3V0cHV0UGF0aCwgJ3NlZ21lbnRzLnR4dCcpXG4gICAgYXdhaXQgZnMud3JpdGVGaWxlKGxpc3RGaWxlLCBzZWdtZW50RmlsZXMubWFwKGYgPT4gYGZpbGUgJyR7Zn0nYCkuam9pbignXFxuJykpXG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZmZtcGVnKClcbiAgICAgICAgLmlucHV0KGxpc3RGaWxlKVxuICAgICAgICAuaW5wdXRPcHRpb25zKCctZicsICdjb25jYXQnLCAnLXNhZmUnLCAnMCcpXG4gICAgICAgIC5vdXRwdXRPcHRpb25zKCctYycsICdjb3B5JylcbiAgICAgICAgLm91dHB1dChwYXRoLmpvaW4ob3V0cHV0UGF0aCwgJ2Jhc2UubXA0JykpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdDb25jYXRlbmF0aW9uIGRvbmUnKVxuICAgICAgICAgIHJlc29sdmUoKVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgY29uY2F0ZW5hdGlvbicpXG4gICAgICAgICAgcmVqZWN0KGUpXG4gICAgICAgIH0pXG4gICAgICAgIC5ydW4oKVxuICAgICAgfVxuICAgIClcblxuICAgIC8vIFJlbW92ZSB0aGUgc2VnbWVudHNcbiAgICBhd2FpdCByZW1vdmVTZWdtZW50cyhvdXRwdXRQYXRoKVxuICB9XG59KVxuXG4vLyBnZXQgc3lzdGVtIGluZm9ybWF0aW9uXG5jb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdzeXMnLCB7XG4gIG9wZW5Gb2xkZXI6IChmb2xkZXJQYXRoOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLnNlbmQoJ29wZW4tZm9sZGVyJywgZm9sZGVyUGF0aCksXG4gIHBpY2tGb2xkZXI6ICgpID0+IGlwY1JlbmRlcmVyLmludm9rZSgncGljay1mb2xkZXInKSxcbiAgcGlja0ZpbGU6ICgpID0+IGlwY1JlbmRlcmVyLmludm9rZSgncGljay1maWxlJyksXG4gIGRlbGV0ZUZvbGRlcjogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBmb2xkZXI6IHN0cmluZykgPT4gYXdhaXQgZnMucm0ocGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgZm9sZGVyKSwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pLFxuICBjcmVhdGVGb2xkZXI6IGFzeW5jICh3cFBhdGg6IHN0cmluZywgZm9sZGVyOiBzdHJpbmcsIHByb2plY3Q6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgZm9sZGVyKVxuICAgIC8vIHRyeSB0byBjcmVhdGUgdGhlIHByb2plY3QgZm9sZGVyXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhmdWxsUGF0aClcbiAgICAgIC8vIElmIG5vIGVycm9yLCB0aGUgZm9sZGVyIGV4aXN0c1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGlzIHByb2plY3QgYWxyZWFkeSBleGlzdHMnKVxuICAgIH1cbiAgICBjYXRjaChlcnI6IGFueSkge1xuICAgICAgLy8gT25seSBjcmVhdGUgdGhlIGZvbGRlciBpZiB0aGUgZXJyb3IgaXMgXCJub3QgZXhpc3RzXCJcbiAgICAgIGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdFTk9FTlQnKSB7XG4gICAgICAgIC8vIEZvbGRlciBkb2VzIG5vdCBleGlzdCwgY3JlYXRlIGl0XG4gICAgICAgIGF3YWl0IGZzLm1rZGlyKGZ1bGxQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuXG4gICAgICAgIC8vIGNyZWF0ZSB0aGUgZGF0YS5qc29uIGZpbGVcbiAgICAgICAgY29uc3QgZGF0YUZpbGVQYXRoID0gcGF0aC5qb2luKGZ1bGxQYXRoLCAnZGF0YS5qc29uJylcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShkYXRhRmlsZVBhdGgsIEpTT04uc3RyaW5naWZ5KHByb2plY3QpLCAndXRmLTgnKVxuICAgICAgfSBcbiAgICAgIGVsc2VcbiAgICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9LFxuICBzZXR1cFdvcmtzcGFjZTogYXN5bmMgKHdwUGF0aDogc3RyaW5nKSA9PiB7XG4gICAgY29uc29sZS5sb2coYHNldHRpbmcgd29ya2RzcGFjZSBhdCAke3dwUGF0aH1gKVxuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgJ1N0YXJ0aW5nIHdvcmtzcGFjZSBzZXR1cC4uLicpXG4gICAgXG4gICAgLy8gbWFrZSBzdXJlIHBhdGggZXhpc3RzXG4gICAgYXdhaXQgZnMubWtkaXIod3BQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuXG5cbiAgICAvKlxuICAgIFRPLURPOiByZW1vdmUgdGhpcyBsYXRlclxuICAgICovXG4gICAgLy8gQ2hlY2sgaWYgZGF0YS5qc29uIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBpdFxuICAgIGNvbnN0IGRhdGFGaWxlUGF0aCA9IHBhdGguam9pbih3cFBhdGgsICdkYXRhLmpzb24nKVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5hY2Nlc3MoZGF0YUZpbGVQYXRoKVxuICAgICAgaXBjUmVuZGVyZXIuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCAnRGF0YSBmaWxlIGFscmVhZHkgZXhpc3RzLCBza2lwcGluZyBjcmVhdGlvbi4uLicpXG4gICAgfSBcbiAgICBjYXRjaCB7XG4gICAgICBpcGNSZW5kZXJlci5zZW5kKCdzZXR1cC1wcm9ncmVzcycsICdDcmVhdGluZyBkYXRhIGZpbGUuLi4nKVxuICAgICAgY29uc3QgYmFzZURhdGEgPSB7XG4gICAgICAgIHByb2plY3RzOiBbXSxcbiAgICAgIH0gYXMgV29ya3NwYWNlXG4gICAgICBhd2FpdCBmcy53cml0ZUZpbGUoZGF0YUZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShiYXNlRGF0YSksICd1dGYtOCcpIC8vIENyZWF0ZSBhbiBlbXB0eSBKU09OIGZpbGVcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBwcm9qZWN0cyBmb2xkZXIgZXhpc3RzLCBvdGhlcndpc2UgY3JlYXRlIGl0XG4gICAgYXdhaXQgZnMubWtkaXIocGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cbiAgICAvLyBDaGVjayBpZiBtb2RlbHMgZm9sZGVyIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBpdFxuICAgIGNvbnN0IG1vZGVsc0ZvbGRlclBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAnbW9kZWxzJylcbiAgICBhd2FpdCBmcy5ta2Rpcihtb2RlbHNGb2xkZXJQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICAgIFxuICAgIC8vIExpc3QgYWxsIGZpbGVzIGluIHRoZSBtb2RlbHMgZm9sZGVyXG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmcy5yZWFkZGlyKG1vZGVsc0ZvbGRlclBhdGgpXG5cbiAgICAvLyBkb3dubG9hZCB0aGUgZm9sbG93aW5nIGZpbGVzIGlmIHRoZXkgZG9uJ3QgZXhpc3RcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAneW9sb3YxMmwucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMveW9sb3YxMmwucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICd5b2xvdjExbC1mYWNlLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9IRVAtVkQtQ1RQL1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL3lvbG92MTFsLWZhY2UucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdtb2JpbGVfc2FtLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9IRVAtVkQtQ1RQL1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL21vYmlsZV9zYW0ucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdGYXN0U0FNLXgucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMvRmFzdFNBTS14LnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnYmlnLWxhbWEucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMvYmlnLWxhbWEucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdmZm1wZWcnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMvZmZtcGVnX29zeCcpIFxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdmZnByb2JlJywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9IRVAtVkQtQ1RQL1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL2ZmcHJvYmVfb3N4JylcblxuICAgIGNvbnNvbGUubG9nKGBTZXR1cCBET05FYCk7XG4gIH0sXG4gIHBsYXRmb3JtOiAoKSA9PiB7XG4gICAgbGV0IG5hbWU7XG4gICAgc3dpdGNoIChvcy5wbGF0Zm9ybSgpKSB7XG4gICAgICBjYXNlICd3aW4zMic6XG4gICAgICAgIG5hbWUgPSAnV2luZG93cyc7IGJyZWFrO1xuICAgICAgY2FzZSAnZGFyd2luJzpcbiAgICAgICAgbmFtZSA9ICdtYWNPUyc7IGJyZWFrO1xuICAgICAgY2FzZSAnbGludXgnOlxuICAgICAgICBuYW1lID0gJ0xpbnV4JzsgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBuYW1lID0gJ1Vua25vd24nO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgbmFtZSxcbiAgICAgIHZlcnNpb246IG9zLnJlbGVhc2UoKSxcbiAgICAgIGFyY2g6IG9zLmFyY2goKSxcbiAgICB9XG4gIH0sXG4gIGNwdTogKCkgPT4ge1xuICAgIGNvbnN0IGNwdXMgPSBvcy5jcHVzKCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvcmVzOiBvcy5jcHVzKCkubGVuZ3RoLFxuICAgICAgbW9kZWw6IG9zLmNwdXMoKVswXT8ubW9kZWwsXG4gICAgICBzcGVlZDogb3MuY3B1cygpWzBdPy5zcGVlZCxcbiAgICB9XG4gIH0sXG4gIG1lbTogKG9zLnRvdGFsbWVtKCkgLyAxMDI0IC8gMTAyNCAvIDEwMjQpLnRvRml4ZWQoMiksXG4gIGdwdTogKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwbGF0Zm9ybSA9IG9zLnBsYXRmb3JtKCk7XG4gICAgICBpZiAocGxhdGZvcm0gPT09ICd3aW4zMicgfHwgcGxhdGZvcm0gPT09ICdsaW51eCcpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIENVREEgY29tcGF0aWJpbGl0eSBhbmQgR1BVIG1lbW9yeSB1c2luZyBudmlkaWEtc21pXG4gICAgICAgIGNvbnN0IGN1ZGFPdXRwdXQgPSBleGVjU3luYygnbnZpZGlhLXNtaSAtLXF1ZXJ5LWdwdT1uYW1lLG1lbW9yeS50b3RhbCAtLWZvcm1hdD1jc3Ysbm9oZWFkZXInLCB7IGVuY29kaW5nOiAndXRmLTgnIH0pO1xuICAgICAgICBjb25zdCBbZ3B1TmFtZSwgZ3B1TWVtb3J5XSA9IGN1ZGFPdXRwdXQudHJpbSgpLnNwbGl0KCcsJykubWFwKChpdGVtKSA9PiBpdGVtLnRyaW0oKSk7XG4gICAgICAgIHJldHVybiB7IGN1ZGE6IHRydWUsIG5hbWU6IGdwdU5hbWUsIG1lbW9yeTogcGFyc2VJbnQoZ3B1TWVtb3J5IHx8ICcwJyApIC8gMTAyNH07XG4gICAgICB9IFxuICAgICAgZWxzZSBpZiAocGxhdGZvcm0gPT09ICdkYXJ3aW4nKSB7XG4gICAgICAgIC8vIENoZWNrIGZvciBNUFMgY29tcGF0aWJpbGl0eSAoTWV0YWwpIG9uIG1hY09TXG4gICAgICAgIGNvbnN0IG1wc091dHB1dCA9IGV4ZWNTeW5jKCdzeXN0ZW1fcHJvZmlsZXIgU1BEaXNwbGF5c0RhdGFUeXBlIHwgZ3JlcCBcIk1ldGFsXCInLCB7IGVuY29kaW5nOiAndXRmLTgnIH0pO1xuICAgICAgICByZXR1cm4geyBtcHM6IG1wc091dHB1dC5pbmNsdWRlcygnTWV0YWwnKSwgbmFtZTogJ01ldGFsLWNvbXBhdGlibGUgR1BVJywgbWVtb3J5OiAnTm90IGF2YWlsYWJsZScgfTtcbiAgICAgIH1cbiAgICB9IFxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHsgY3VkYTogZmFsc2UsIG1wczogZmFsc2UsIG5hbWU6ICdVbmtub3duJywgbWVtb3J5OiAnVW5rbm93bicgfTtcbiAgICB9XG4gIH0sXG5cbn0pXG5cblxuXG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxzQkFBNEM7QUFDNUMsZ0JBQTZCO0FBQzdCLDJCQUF5QjtBQUN6QixzQkFBZTtBQUNmLHVCQUFpQjtBQUdqQiwyQkFBbUI7QUFJbkIsZUFBZSxpQkFBaUIsa0JBQTBCLE9BQWlCLE1BQWMsS0FBYTtBQUNwRyxNQUFJLENBQUMsTUFBTSxTQUFTLElBQUksR0FBRztBQUN6QixnQ0FBWSxLQUFLLGtCQUFrQixlQUFlLElBQUksS0FBSztBQUMzRCxVQUFNLDRCQUFZLE9BQU8sbUJBQW1CLGlCQUFBQSxRQUFLLEtBQUssa0JBQWtCLElBQUksR0FBRyxHQUFHO0FBQUEsRUFDcEYsT0FDSztBQUNILGdDQUFZLEtBQUssa0JBQWtCLEdBQUcsSUFBSSx1Q0FBdUM7QUFBQSxFQUNuRjtBQUNGO0FBR0EsZUFBZSxlQUFlLFlBQW9CO0FBQ2hELFFBQU0sV0FBVyxDQUFDO0FBQ2xCLGFBQVcsUUFBUSxNQUFNLGdCQUFBQyxRQUFHLFFBQVEsVUFBVTtBQUM1QyxRQUFJLEtBQUssV0FBVyxTQUFTO0FBQzNCLGVBQVMsS0FBSyxnQkFBQUEsUUFBRyxHQUFHLGlCQUFBRCxRQUFLLEtBQUssWUFBWSxJQUFJLENBQUMsQ0FBQztBQUVwRCxRQUFNLFFBQVEsSUFBSSxRQUFRO0FBQzVCO0FBRUEsOEJBQWMsa0JBQWtCLFlBQVk7QUFBQSxFQUMxQyxhQUFhO0FBQUEsSUFDWCxJQUFJLENBQUMsU0FBaUIsYUFBdUMsNEJBQVksR0FBRyxTQUFTLFFBQVE7QUFBQSxJQUM3RixNQUFNLENBQUMsWUFBb0IsU0FBZ0IsNEJBQVksS0FBSyxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQzlFO0FBQ0YsQ0FBQztBQUVELDhCQUFjLGtCQUFrQixnQkFBZ0I7QUFBQTtBQUFBLEVBRTlDLGVBQWUsQ0FBQyxlQUF1Qiw0QkFBWSxPQUFPLGtCQUFrQixVQUFVO0FBQUEsRUFDdEYsZ0JBQWdCLE9BQU8sUUFBZ0IsU0FBaUIsU0FBYztBQUNwRSxVQUFNLFdBQVcsaUJBQUFBLFFBQUssS0FBSyxRQUFRLFlBQVksU0FBUyxXQUFXO0FBRW5FLFFBQUk7QUFDRixZQUFNLGdCQUFBQyxRQUFHLFVBQVUsVUFBVSxLQUFLLFVBQVUsSUFBSSxHQUFHLE9BQU87QUFBQSxJQUM1RCxTQUNPLEtBQUk7QUFDVCxZQUFNLE1BQU0sNEJBQTRCLGVBQWUsUUFBUSxJQUFJLFVBQVUsZUFBZTtBQUM1RixjQUFRLE1BQU0sR0FBRztBQUNqQixZQUFNLElBQUksTUFBTSxHQUFHO0FBQUEsSUFDckI7QUFBQSxFQUNGO0FBQUEsRUFDQSxhQUFhLE9BQU8sUUFBZ0IsWUFBb0I7QUFDdEQsVUFBTSxlQUFlLGlCQUFBRCxRQUFLLEtBQUssUUFBUSxZQUFZLFNBQVMsV0FBVztBQUN2RSxRQUFJO0FBQ0YsYUFBTyxLQUFLLE1BQU0sTUFBTSxnQkFBQUMsUUFBRyxTQUFTLGNBQWMsT0FBTyxDQUFDO0FBQUEsSUFDNUQsU0FDTyxLQUFLO0FBQ1YsY0FBUSxNQUFNLCtCQUErQixHQUFHO0FBQ2hELFlBQU0sSUFBSSxNQUFNLDBCQUEwQixPQUFPLEtBQUssZUFBZSxRQUFRLElBQUksVUFBVSxlQUFlLEVBQUU7QUFBQSxJQUM5RztBQUFBLEVBQ0Y7QUFBQSxFQUNBLFlBQVksQ0FBQyxhQUFxQixnQkFBd0IsNEJBQVksT0FBTyxlQUFlLGlCQUFBRCxRQUFLLEtBQUssYUFBYSxZQUFZLGFBQWEsVUFBVSxDQUFDO0FBQUEsRUFDdkosYUFBYSxDQUFDLFdBQW1CLGFBQTZDO0FBQzVFLHlCQUFBRSxRQUFPLGVBQWUsaUJBQUFGLFFBQUssS0FBSyxXQUFXLFVBQVUsU0FBUyxDQUFDO0FBQy9ELFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3RDLDJCQUFBRSxRQUFPLFFBQVEsVUFBVSxDQUFDLEtBQUssYUFBYTtBQUMxQyxZQUFJO0FBQ0YsaUJBQU8sT0FBTyxHQUFHO0FBRW5CLGNBQU0sY0FBYyxTQUFTLFFBQVEsS0FBSyxPQUFLLEVBQUUsZUFBZSxPQUFPO0FBQ3ZFLFlBQUksQ0FBQyxlQUFlLENBQUMsWUFBWTtBQUMvQixpQkFBTyxRQUFRLElBQUk7QUFFckIsY0FBTSxDQUFDLEtBQUssS0FBSyxJQUFJLFlBQVksYUFBYSxNQUFNLEdBQUcsRUFBRSxJQUFJLE1BQU07QUFDbkUsWUFBSSxDQUFDLE9BQU8sQ0FBQztBQUNYLGlCQUFPLFFBQVEsSUFBSTtBQUNyQixnQkFBUSxNQUFNLEtBQUs7QUFBQSxNQUNyQixDQUFDO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsbUJBQW1CLE9BQU8sWUFBb0IsYUFBcUIsZUFBdUIsZUFBMkM7QUFDbkksWUFBUSxJQUFJLDRCQUE0QjtBQUN4QyxVQUFNLGFBQWEsaUJBQUFGLFFBQUssS0FBSyxZQUFZLFlBQVksV0FBVztBQUVoRSxVQUFNLGVBQWUsVUFBVTtBQUcvQix5QkFBQUUsUUFBTyxjQUFjLGlCQUFBRixRQUFLLEtBQUssWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUM5RCxVQUFNLGVBQXlCLENBQUM7QUFHaEMsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMxQyxZQUFNLFFBQVEsV0FBVyxDQUFDO0FBQzFCLFVBQUksQ0FBQztBQUNIO0FBQ0YsWUFBTSxDQUFDLE9BQU8sS0FBSyxRQUFRLElBQUk7QUFFL0IsWUFBTSxVQUFVLGlCQUFBQSxRQUFLLEtBQUssWUFBWSxXQUFXLENBQUMsTUFBTTtBQUN4RCxtQkFBYSxLQUFLLE9BQU87QUFDekIsWUFBTSxJQUFJLFFBQWMsQ0FBQyxTQUFTLFdBQVc7QUFDM0MsaUNBQUFFLFNBQU8sYUFBYSxFQUNqQixhQUFhLEtBQUssRUFDbEIsWUFBWSxRQUFRLEVBQ3BCLFdBQVcsU0FBUyxFQUNwQixXQUFXLEtBQUssRUFDaEIsY0FBYyxhQUFhLFdBQVcsRUFDdEMsY0FBYyxXQUFXLE1BQU0sRUFDL0IsY0FBYyxRQUFRLElBQUksRUFDMUIsT0FBTyxPQUFPLEVBQ2QsR0FBRyxPQUFPLE1BQU07QUFDZixrQkFBUSxJQUFJLFdBQVcsQ0FBQyxPQUFPO0FBQy9CLGtCQUFRO0FBQUEsUUFDVixDQUFDLEVBQ0EsR0FBRyxTQUFTLENBQUMsTUFBTTtBQUNsQixrQkFBUSxNQUFNLDRCQUE0QixDQUFDLEVBQUU7QUFDN0MsaUJBQU8sQ0FBQztBQUFBLFFBQ1YsQ0FBQyxFQUNBLElBQUk7QUFBQSxNQUNULENBQUM7QUFBQSxJQUNIO0FBRUEsWUFBUSxJQUFJLG1CQUFtQjtBQUcvQixVQUFNLFdBQVcsaUJBQUFGLFFBQUssS0FBSyxZQUFZLGNBQWM7QUFDckQsVUFBTSxnQkFBQUMsUUFBRyxVQUFVLFVBQVUsYUFBYSxJQUFJLE9BQUssU0FBUyxDQUFDLEdBQUcsRUFBRSxLQUFLLElBQUksQ0FBQztBQUM1RSxVQUFNLElBQUk7QUFBQSxNQUFjLENBQUMsU0FBUyxXQUFXO0FBQzNDLGlDQUFBQyxTQUFPLEVBQ0osTUFBTSxRQUFRLEVBQ2QsYUFBYSxNQUFNLFVBQVUsU0FBUyxHQUFHLEVBQ3pDLGNBQWMsTUFBTSxNQUFNLEVBQzFCLE9BQU8saUJBQUFGLFFBQUssS0FBSyxZQUFZLFVBQVUsQ0FBQyxFQUN4QyxHQUFHLE9BQU8sTUFBTTtBQUNmLGtCQUFRLElBQUksb0JBQW9CO0FBQ2hDLGtCQUFRO0FBQUEsUUFDVixDQUFDLEVBQ0EsR0FBRyxTQUFTLENBQUMsTUFBTTtBQUNsQixrQkFBUSxNQUFNLDRCQUE0QjtBQUMxQyxpQkFBTyxDQUFDO0FBQUEsUUFDVixDQUFDLEVBQ0EsSUFBSTtBQUFBLE1BQ1A7QUFBQSxJQUNGO0FBR0EsVUFBTSxlQUFlLFVBQVU7QUFBQSxFQUNqQztBQUNGLENBQUM7QUFHRCw4QkFBYyxrQkFBa0IsT0FBTztBQUFBLEVBQ3JDLFlBQVksQ0FBQyxlQUF1Qiw0QkFBWSxLQUFLLGVBQWUsVUFBVTtBQUFBLEVBQzlFLFlBQVksTUFBTSw0QkFBWSxPQUFPLGFBQWE7QUFBQSxFQUNsRCxVQUFVLE1BQU0sNEJBQVksT0FBTyxXQUFXO0FBQUEsRUFDOUMsY0FBYyxPQUFPLFFBQWdCLFdBQW1CLE1BQU0sZ0JBQUFDLFFBQUcsR0FBRyxpQkFBQUQsUUFBSyxLQUFLLFFBQVEsWUFBWSxNQUFNLEdBQUcsRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFBQSxFQUMzSSxjQUFjLE9BQU8sUUFBZ0IsUUFBZ0IsWUFBb0I7QUFDdkUsVUFBTSxXQUFXLGlCQUFBQSxRQUFLLEtBQUssUUFBUSxZQUFZLE1BQU07QUFFckQsUUFBSTtBQUNGLFlBQU0sZ0JBQUFDLFFBQUcsT0FBTyxRQUFRO0FBRXhCLFlBQU0sSUFBSSxNQUFNLDZCQUE2QjtBQUFBLElBQy9DLFNBQ00sS0FBVTtBQUVkLFVBQUksT0FBTyxJQUFJLFNBQVMsVUFBVTtBQUVoQyxjQUFNLGdCQUFBQSxRQUFHLE1BQU0sVUFBVSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBRzVDLGNBQU0sZUFBZSxpQkFBQUQsUUFBSyxLQUFLLFVBQVUsV0FBVztBQUVwRCxjQUFNLGdCQUFBQyxRQUFHLFVBQVUsY0FBYyxLQUFLLFVBQVUsT0FBTyxHQUFHLE9BQU87QUFBQSxNQUNuRTtBQUVFLGNBQU07QUFBQSxJQUNWO0FBQUEsRUFDRjtBQUFBLEVBQ0EsZ0JBQWdCLE9BQU8sV0FBbUI7QUFDeEMsWUFBUSxJQUFJLHlCQUF5QixNQUFNLEVBQUU7QUFDN0MsZ0NBQVksS0FBSyxrQkFBa0IsNkJBQTZCO0FBR2hFLFVBQU0sZ0JBQUFBLFFBQUcsTUFBTSxRQUFRLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFPMUMsVUFBTSxlQUFlLGlCQUFBRCxRQUFLLEtBQUssUUFBUSxXQUFXO0FBQ2xELFFBQUk7QUFDRixZQUFNLGdCQUFBQyxRQUFHLE9BQU8sWUFBWTtBQUM1QixrQ0FBWSxLQUFLLGtCQUFrQixnREFBZ0Q7QUFBQSxJQUNyRixRQUNNO0FBQ0osa0NBQVksS0FBSyxrQkFBa0IsdUJBQXVCO0FBQzFELFlBQU0sV0FBVztBQUFBLFFBQ2YsVUFBVSxDQUFDO0FBQUEsTUFDYjtBQUNBLFlBQU0sZ0JBQUFBLFFBQUcsVUFBVSxjQUFjLEtBQUssVUFBVSxRQUFRLEdBQUcsT0FBTztBQUFBLElBQ3BFO0FBR0EsVUFBTSxnQkFBQUEsUUFBRyxNQUFNLGlCQUFBRCxRQUFLLEtBQUssUUFBUSxVQUFVLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUdqRSxVQUFNLG1CQUFtQixpQkFBQUEsUUFBSyxLQUFLLFFBQVEsUUFBUTtBQUNuRCxVQUFNLGdCQUFBQyxRQUFHLE1BQU0sa0JBQWtCLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFHcEQsVUFBTSxRQUFRLE1BQU0sZ0JBQUFBLFFBQUcsUUFBUSxnQkFBZ0I7QUFHL0MsVUFBTSxpQkFBaUIsa0JBQWtCLE9BQU8sZUFBZSwrRUFBK0U7QUFDOUksVUFBTSxpQkFBaUIsa0JBQWtCLE9BQU8sb0JBQW9CLG9GQUFvRjtBQUN4SixVQUFNLGlCQUFpQixrQkFBa0IsT0FBTyxpQkFBaUIsaUZBQWlGO0FBQ2xKLFVBQU0saUJBQWlCLGtCQUFrQixPQUFPLGdCQUFnQixnRkFBZ0Y7QUFDaEosVUFBTSxpQkFBaUIsa0JBQWtCLE9BQU8sZUFBZSwrRUFBK0U7QUFDOUksVUFBTSxpQkFBaUIsa0JBQWtCLE9BQU8sVUFBVSw4RUFBOEU7QUFDeEksVUFBTSxpQkFBaUIsa0JBQWtCLE9BQU8sV0FBVywrRUFBK0U7QUFFMUksWUFBUSxJQUFJLFlBQVk7QUFBQSxFQUMxQjtBQUFBLEVBQ0EsVUFBVSxNQUFNO0FBQ2QsUUFBSTtBQUNKLFlBQVEsVUFBQUUsUUFBRyxTQUFTLEdBQUc7QUFBQSxNQUNyQixLQUFLO0FBQ0gsZUFBTztBQUFXO0FBQUEsTUFDcEIsS0FBSztBQUNILGVBQU87QUFBUztBQUFBLE1BQ2xCLEtBQUs7QUFDSCxlQUFPO0FBQVM7QUFBQSxNQUNsQjtBQUNFLGVBQU87QUFBQSxJQUNYO0FBQ0EsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBLFNBQVMsVUFBQUEsUUFBRyxRQUFRO0FBQUEsTUFDcEIsTUFBTSxVQUFBQSxRQUFHLEtBQUs7QUFBQSxJQUNoQjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLEtBQUssTUFBTTtBQUNULFVBQU0sT0FBTyxVQUFBQSxRQUFHLEtBQUs7QUFDckIsV0FBTztBQUFBLE1BQ0wsT0FBTyxVQUFBQSxRQUFHLEtBQUssRUFBRTtBQUFBLE1BQ2pCLE9BQU8sVUFBQUEsUUFBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHO0FBQUEsTUFDckIsT0FBTyxVQUFBQSxRQUFHLEtBQUssRUFBRSxDQUFDLEdBQUc7QUFBQSxJQUN2QjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE1BQU0sVUFBQUEsUUFBRyxTQUFTLElBQUksT0FBTyxPQUFPLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDbkQsS0FBSyxNQUFNO0FBQ1QsUUFBSTtBQUNGLFlBQU1DLFlBQVcsVUFBQUQsUUFBRyxTQUFTO0FBQzdCLFVBQUlDLGNBQWEsV0FBV0EsY0FBYSxTQUFTO0FBRWhELGNBQU0saUJBQWEsK0JBQVMsa0VBQWtFLEVBQUUsVUFBVSxRQUFRLENBQUM7QUFDbkgsY0FBTSxDQUFDLFNBQVMsU0FBUyxJQUFJLFdBQVcsS0FBSyxFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUksQ0FBQyxTQUFTLEtBQUssS0FBSyxDQUFDO0FBQ25GLGVBQU8sRUFBRSxNQUFNLE1BQU0sTUFBTSxTQUFTLFFBQVEsU0FBUyxhQUFhLEdBQUksSUFBSSxLQUFJO0FBQUEsTUFDaEYsV0FDU0EsY0FBYSxVQUFVO0FBRTlCLGNBQU0sZ0JBQVksK0JBQVMscURBQXFELEVBQUUsVUFBVSxRQUFRLENBQUM7QUFDckcsZUFBTyxFQUFFLEtBQUssVUFBVSxTQUFTLE9BQU8sR0FBRyxNQUFNLHdCQUF3QixRQUFRLGdCQUFnQjtBQUFBLE1BQ25HO0FBQUEsSUFDRixTQUNPLE9BQU87QUFDWixhQUFPLEVBQUUsTUFBTSxPQUFPLEtBQUssT0FBTyxNQUFNLFdBQVcsUUFBUSxVQUFVO0FBQUEsSUFDdkU7QUFBQSxFQUNGO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFsicGF0aCIsICJmcyIsICJmZm1wZWciLCAib3MiLCAicGxhdGZvcm0iXQp9Cg==
