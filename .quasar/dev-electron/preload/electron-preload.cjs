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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjLWVsZWN0cm9uL2VsZWN0cm9uLXByZWxvYWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNvbnRleHRCcmlkZ2UsIGlwY1JlbmRlcmVyIH0gIGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IG9zLCB7IHBsYXRmb3JtIH0gZnJvbSAnb3MnXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcy9wcm9taXNlcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB7IHR5cGUgV29ya3NwYWNlIH0gZnJvbSAnc3JjL3N0b3Jlcy93cFN0b3JlJ1xuaW1wb3J0IHV0aWxzIGZyb20gJ3NyYy91dGlscydcbmltcG9ydCBmZm1wZWcgZnJvbSAnZmx1ZW50LWZmbXBlZydcbmltcG9ydCB7IFByb2plY3QgfSBmcm9tICdzcmMvc3RvcmVzL3dwU3RvcmUnXG5cbi8vIGRvd25sb2FkIG1vZGVscyBpZiB0aGV5IGRvbid0IGV4aXN0XG5hc3luYyBmdW5jdGlvbiBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGg6IHN0cmluZywgZmlsZXM6IHN0cmluZ1tdLCBmaWxlOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gIGlmICghZmlsZXMuaW5jbHVkZXMoZmlsZSkpIHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKCdzZXR1cC1wcm9ncmVzcycsIGBEb3dubG9hZGluZyAke2ZpbGV9Li4uYClcbiAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoJ2Rvd25sb2FkLW1vZGVscycsIHBhdGguam9pbihtb2RlbHNGb2xkZXJQYXRoLCBmaWxlKSwgdXJsKVxuICB9XG4gIGVsc2Uge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgYCR7ZmlsZX0gYWxyZWFkeSBleGlzdHMsIHNraXBwaW5nIGRvd25sb2FkLi4uYClcbiAgfVxufVxuXG4vLyByZW1vdmUgYWxsIHNlZ21lbnRzICh2aWRlbyBjdXRzKSBmcm9tIHRoZSBvdXRwdXRQYXRoIGZvbGRlclxuYXN5bmMgZnVuY3Rpb24gcmVtb3ZlU2VnbWVudHMob3V0cHV0UGF0aDogc3RyaW5nKSB7XG4gIGNvbnN0IHNlZ21lbnRzID0gW11cbiAgZm9yIChjb25zdCBmaWxlIG9mIGF3YWl0IGZzLnJlYWRkaXIob3V0cHV0UGF0aCkpXG4gICAgaWYgKGZpbGUuc3RhcnRzV2l0aCgnc2VnbWVudCcpKSBcbiAgICAgIHNlZ21lbnRzLnB1c2goZnMucm0ocGF0aC5qb2luKG91dHB1dFBhdGgsIGZpbGUpKSlcblxuICBhd2FpdCBQcm9taXNlLmFsbChzZWdtZW50cylcbn1cblxuY29udGV4dEJyaWRnZS5leHBvc2VJbk1haW5Xb3JsZCgnZWxlY3Ryb24nLCB7XG4gIGlwY1JlbmRlcmVyOiB7XG4gICAgb246IChjaGFubmVsOiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogYW55W10pID0+IHZvaWQpID0+IGlwY1JlbmRlcmVyLm9uKGNoYW5uZWwsIGxpc3RlbmVyKSxcbiAgICBzZW5kOiAoY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSkgPT4gaXBjUmVuZGVyZXIuc2VuZChjaGFubmVsLCAuLi5hcmdzKSxcbiAgfSxcbn0pXG5cbmNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ3dvcmtzcGFjZUFQSScsIHtcbiAgLy9yZWFkV29ya3NwYWNlOiAoZmlsZVBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdyZWFkLXdvcmtzcGFjZScsIHBhdGguam9pbihmaWxlUGF0aCwgJ2RhdGEuanNvbicpKSxcbiAgcmVhZFdvcmtzcGFjZTogKGZvbGRlclBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdyZWFkLXdvcmtzcGFjZScsIGZvbGRlclBhdGgpLFxuICB3cml0ZVdvcmtzcGFjZTogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBwcm9qZWN0OiBzdHJpbmcsIGRhdGE6IGFueSkgPT4ge1xuICAgIC8vIGlwY1JlbmRlcmVyLmludm9rZSgnd3JpdGUtd29ya3NwYWNlJywgcGF0aC5qb2luKGZpbGVQYXRoLCAnZGF0YS5qc29uJyksIGRhdGEpLFxuICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJywgcHJvamVjdCwgJ2RhdGEuanNvbicpXG4gICAgLy9pcGNSZW5kZXJlci5pbnZva2UoJ3dyaXRlLXdvcmtzcGFjZScsIGZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShkYXRhKSlcbiAgICBcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZnMud3JpdGVGaWxlKGZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShkYXRhKSwgJ3V0Zi04JylcbiAgICB9XG4gICAgY2F0Y2ggKGVycil7XG4gICAgICBjb25zdCBtc2cgPSBgRXJyb3Igd3JpdGluZyB3b3Jrc3BhY2U6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gXG4gICAgICBjb25zb2xlLmVycm9yKG1zZylcbiAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpXG4gICAgfVxuICB9LFxuICBsb2FkUHJvamVjdDogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBwcm9qZWN0OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBkYXRhRmlsZVBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnLCBwcm9qZWN0LCAnZGF0YS5qc29uJylcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEpTT04ucGFyc2UoYXdhaXQgZnMucmVhZEZpbGUoZGF0YUZpbGVQYXRoLCAndXRmLTgnKSlcbiAgICB9XG4gICAgY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgcmVhZGluZyBwcm9qZWN0IGRhdGE6JywgZXJyKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgbG9hZCBwcm9qZWN0ICR7cHJvamVjdH06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKVxuICAgIH1cbiAgfSxcbiAgZmlsZUV4aXN0czogKHByb2plY3RQYXRoOiBzdHJpbmcsIHByb2plY3ROYW1lOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZmlsZS1leGlzdHMnLCBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICdwcm9qZWN0cycsIHByb2plY3ROYW1lLCAnYmFzZS5tcDQnKSksXG4gIGdldFZpZGVvRlBTOiAod29ya3NwYWNlOiBzdHJpbmcsIGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlciB8IG51bGw+ID0+IHtcbiAgICBmZm1wZWcuc2V0RmZwcm9iZVBhdGgocGF0aC5qb2luKHdvcmtzcGFjZSwgJ21vZGVscycsICdmZnByb2JlJykpXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGZmbXBlZy5mZnByb2JlKGZpbGVQYXRoLCAoZXJyLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICBpZiAoZXJyKSBcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycilcbiAgICAgICAgLy8gRmluZCB0aGUgdmlkZW8gc3RyZWFtXG4gICAgICAgIGNvbnN0IHZpZGVvU3RyZWFtID0gbWV0YWRhdGEuc3RyZWFtcy5maW5kKHMgPT4gcy5jb2RlY190eXBlID09PSAndmlkZW8nKVxuICAgICAgICBpZiAoIXZpZGVvU3RyZWFtIHx8ICF2aWRlb1N0cmVhbS5yX2ZyYW1lX3JhdGUpIFxuICAgICAgICAgIHJldHVybiByZXNvbHZlKG51bGwpXG4gICAgICAgIC8vIHJfZnJhbWVfcmF0ZSBpcyBhIHN0cmluZyBsaWtlIFwiMjUvMVwiIG9yIFwiMzAwMDAvMTAwMVwiXG4gICAgICAgIGNvbnN0IFtudW0sIGRlbm9tXSA9IHZpZGVvU3RyZWFtLnJfZnJhbWVfcmF0ZS5zcGxpdCgnLycpLm1hcChOdW1iZXIpXG4gICAgICAgIGlmICghbnVtIHx8ICFkZW5vbSkgXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUobnVsbClcbiAgICAgICAgcmVzb2x2ZShudW0gLyBkZW5vbSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSxcbiAgY3V0QW5kRW5jb2RlVmlkZW86IGFzeW5jICh3b3JrZHNwYWNlOiBzdHJpbmcsIHByb2plY3ROYW1lOiBzdHJpbmcsIGlucHV0RmlsZVBhdGg6IHN0cmluZywga2VlcFJhbmdlczogW3N0cmluZywgc3RyaW5nLCBudW1iZXJdW10pID0+IHtcbiAgICBjb25zb2xlLmxvZygnY3V0dGluZyBhbmQgZW5jb2RpbmcgdmlkZW8nKVxuICAgIGNvbnN0IG91dHB1dFBhdGggPSBwYXRoLmpvaW4od29ya2RzcGFjZSwgJ3Byb2plY3RzJywgcHJvamVjdE5hbWUpXG4gICAgLy8gcmVtb3ZlIGFsbCBmaWxlcyB0aGF0IHN0YXJ0IHdpdGggJ3NlZ21lbnQnIGluIHRoZSBvdXRwdXRQYXRoIGZvbGRlclxuICAgIGF3YWl0IHJlbW92ZVNlZ21lbnRzKG91dHB1dFBhdGgpXG5cbiAgICAvLyBzZWdtZW50IHRoZSB2aWRlb1xuICAgIGZmbXBlZy5zZXRGZm1wZWdQYXRoKHBhdGguam9pbih3b3JrZHNwYWNlLCAnbW9kZWxzJywgJ2ZmbXBlZycpKVxuICAgIGNvbnN0IHNlZ21lbnRGaWxlczogc3RyaW5nW10gPSBbXVxuICAgIFxuICAgIC8vIGxvb3AgdGhyb3VnaCB0aGUga2VlcFJhbmdlcyBhbmQgY3JlYXRlIHZpZGVvIHNlZ21lbnRzXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZWVwUmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCByYW5nZSA9IGtlZXBSYW5nZXNbaV1cbiAgICAgIGlmICghcmFuZ2UpIFxuICAgICAgICBjb250aW51ZVxuICAgICAgY29uc3QgW3N0YXJ0LCBlbmQsIGR1cmF0aW9uXSA9IHJhbmdlXG5cbiAgICAgIGNvbnN0IHNlZ0ZpbGUgPSBwYXRoLmpvaW4ob3V0cHV0UGF0aCwgYHNlZ21lbnRfJHtpfS5tcDRgKVxuICAgICAgc2VnbWVudEZpbGVzLnB1c2goc2VnRmlsZSlcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgZmZtcGVnKGlucHV0RmlsZVBhdGgpXG4gICAgICAgICAgLnNldFN0YXJ0VGltZShzdGFydClcbiAgICAgICAgICAuc2V0RHVyYXRpb24oZHVyYXRpb24pXG4gICAgICAgICAgLnZpZGVvQ29kZWMoJ2xpYngyNjQnKSAvLyBSZS1lbmNvZGUgdG8gZW5zdXJlIE1QNCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgLmF1ZGlvQ29kZWMoJ2FhYycpXG4gICAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1tb3ZmbGFncycsICdmYXN0c3RhcnQnKSAvLyBmb3IgYmV0dGVyIG1wNCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1wcmVzZXQnLCAnZmFzdCcpXG4gICAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1jcmYnLCAnMjMnKVxuICAgICAgICAgIC5vdXRwdXQoc2VnRmlsZSlcbiAgICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBTZWdtZW50ICR7aX0gZG9uZWApXG4gICAgICAgICAgICByZXNvbHZlKClcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgcHJvY2Vzc2luZyBzZWdtZW50ICR7aX1gKVxuICAgICAgICAgICAgcmVqZWN0KGUpXG4gICAgICAgICAgfSlcbiAgICAgICAgICAucnVuKClcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ0FsbCBzZWdtZW50cyBkb25lJylcblxuICAgIC8vIENvbmNhdGVuYXRlIHRoZSBzZWdtZW50cyBpbnRvIGEgc2luZ2xlIHZpZGVvIGZpbGVcbiAgICBjb25zdCBsaXN0RmlsZSA9IHBhdGguam9pbihvdXRwdXRQYXRoLCAnc2VnbWVudHMudHh0JylcbiAgICBhd2FpdCBmcy53cml0ZUZpbGUobGlzdEZpbGUsIHNlZ21lbnRGaWxlcy5tYXAoZiA9PiBgZmlsZSAnJHtmfSdgKS5qb2luKCdcXG4nKSlcbiAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBmZm1wZWcoKVxuICAgICAgICAuaW5wdXQobGlzdEZpbGUpXG4gICAgICAgIC5pbnB1dE9wdGlvbnMoJy1mJywgJ2NvbmNhdCcsICctc2FmZScsICcwJylcbiAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1jJywgJ2NvcHknKVxuICAgICAgICAub3V0cHV0KHBhdGguam9pbihvdXRwdXRQYXRoLCAnYmFzZS5tcDQnKSlcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0NvbmNhdGVuYXRpb24gZG9uZScpXG4gICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGR1cmluZyBjb25jYXRlbmF0aW9uJylcbiAgICAgICAgICByZWplY3QoZSlcbiAgICAgICAgfSlcbiAgICAgICAgLnJ1bigpXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8gUmVtb3ZlIHRoZSBzZWdtZW50c1xuICAgIGF3YWl0IHJlbW92ZVNlZ21lbnRzKG91dHB1dFBhdGgpXG4gIH1cbn0pXG5cbi8vIGdldCBzeXN0ZW0gaW5mb3JtYXRpb25cbmNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ3N5cycsIHtcbiAgb3BlbkZvbGRlcjogKGZvbGRlclBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuc2VuZCgnb3Blbi1mb2xkZXInLCBmb2xkZXJQYXRoKSxcbiAgcGlja0ZvbGRlcjogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdwaWNrLWZvbGRlcicpLFxuICBwaWNrRmlsZTogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdwaWNrLWZpbGUnKSxcbiAgZGVsZXRlRm9sZGVyOiBhc3luYyAod3BQYXRoOiBzdHJpbmcsIGZvbGRlcjogc3RyaW5nKSA9PiBhd2FpdCBmcy5ybShwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnLCBmb2xkZXIpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSksXG4gIGNyZWF0ZUZvbGRlcjogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBmb2xkZXI6IHN0cmluZywgcHJvamVjdDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnLCBmb2xkZXIpXG4gICAgLy8gdHJ5IHRvIGNyZWF0ZSB0aGUgcHJvamVjdCBmb2xkZXJcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZnMuYWNjZXNzKGZ1bGxQYXRoKVxuICAgICAgLy8gSWYgbm8gZXJyb3IsIHRoZSBmb2xkZXIgZXhpc3RzXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgcHJvamVjdCBhbHJlYWR5IGV4aXN0cycpXG4gICAgfVxuICAgIGNhdGNoKGVycjogYW55KSB7XG4gICAgICAvLyBPbmx5IGNyZWF0ZSB0aGUgZm9sZGVyIGlmIHRoZSBlcnJvciBpcyBcIm5vdCBleGlzdHNcIlxuICAgICAgaWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgICAgLy8gRm9sZGVyIGRvZXMgbm90IGV4aXN0LCBjcmVhdGUgaXRcbiAgICAgICAgYXdhaXQgZnMubWtkaXIoZnVsbFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cbiAgICAgICAgLy8gY3JlYXRlIHRoZSBkYXRhLmpzb24gZmlsZVxuICAgICAgICBjb25zdCBkYXRhRmlsZVBhdGggPSBwYXRoLmpvaW4oZnVsbFBhdGgsICdkYXRhLmpzb24nKVxuICAgICAgICBcbiAgICAgICAgYXdhaXQgZnMud3JpdGVGaWxlKGRhdGFGaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkocHJvamVjdCksICd1dGYtOCcpXG4gICAgICB9IFxuICAgICAgZWxzZVxuICAgICAgICB0aHJvdyBlcnJcbiAgICB9XG4gIH0sXG4gIHNldHVwV29ya3NwYWNlOiBhc3luYyAod3BQYXRoOiBzdHJpbmcpID0+IHtcbiAgICBjb25zb2xlLmxvZyhgc2V0dGluZyB3b3JrZHNwYWNlIGF0ICR7d3BQYXRofWApXG4gICAgaXBjUmVuZGVyZXIuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCAnU3RhcnRpbmcgd29ya3NwYWNlIHNldHVwLi4uJylcbiAgICBcbiAgICAvLyBtYWtlIHN1cmUgcGF0aCBleGlzdHNcbiAgICBhd2FpdCBmcy5ta2Rpcih3cFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cblxuICAgIC8qXG4gICAgVE8tRE86IHJlbW92ZSB0aGlzIGxhdGVyXG4gICAgKi9cbiAgICAvLyBDaGVjayBpZiBkYXRhLmpzb24gZXhpc3RzLCBvdGhlcndpc2UgY3JlYXRlIGl0XG4gICAgY29uc3QgZGF0YUZpbGVQYXRoID0gcGF0aC5qb2luKHdwUGF0aCwgJ2RhdGEuanNvbicpXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhkYXRhRmlsZVBhdGgpXG4gICAgICBpcGNSZW5kZXJlci5zZW5kKCdzZXR1cC1wcm9ncmVzcycsICdEYXRhIGZpbGUgYWxyZWFkeSBleGlzdHMsIHNraXBwaW5nIGNyZWF0aW9uLi4uJylcbiAgICB9IFxuICAgIGNhdGNoIHtcbiAgICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgJ0NyZWF0aW5nIGRhdGEgZmlsZS4uLicpXG4gICAgICBjb25zdCBiYXNlRGF0YSA9IHtcbiAgICAgICAgcHJvamVjdHM6IFtdLFxuICAgICAgfSBhcyBXb3Jrc3BhY2VcbiAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShkYXRhRmlsZVBhdGgsIEpTT04uc3RyaW5naWZ5KGJhc2VEYXRhKSwgJ3V0Zi04JykgLy8gQ3JlYXRlIGFuIGVtcHR5IEpTT04gZmlsZVxuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHByb2plY3RzIGZvbGRlciBleGlzdHMsIG90aGVyd2lzZSBjcmVhdGUgaXRcbiAgICBhd2FpdCBmcy5ta2RpcihwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnKSwgeyByZWN1cnNpdmU6IHRydWUgfSlcblxuICAgIC8vIENoZWNrIGlmIG1vZGVscyBmb2xkZXIgZXhpc3RzLCBvdGhlcndpc2UgY3JlYXRlIGl0XG4gICAgY29uc3QgbW9kZWxzRm9sZGVyUGF0aCA9IHBhdGguam9pbih3cFBhdGgsICdtb2RlbHMnKVxuICAgIGF3YWl0IGZzLm1rZGlyKG1vZGVsc0ZvbGRlclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG4gICAgXG4gICAgLy8gTGlzdCBhbGwgZmlsZXMgaW4gdGhlIG1vZGVscyBmb2xkZXJcbiAgICBjb25zdCBmaWxlcyA9IGF3YWl0IGZzLnJlYWRkaXIobW9kZWxzRm9sZGVyUGF0aClcblxuICAgIC8vIGRvd25sb2FkIHRoZSBmb2xsb3dpbmcgZmlsZXMgaWYgdGhleSBkb24ndCBleGlzdFxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICd5b2xvdjEybC5wdCcsICdodHRwczovL2dpdGh1Yi5jb20vdWx0cmFseXRpY3MvYXNzZXRzL3JlbGVhc2VzL2Rvd25sb2FkL3Y4LjMuMC95b2xvMTJsLnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAneW9sb3YxMWwtZmFjZS5wdCcsICdodHRwczovL2dpdGh1Yi5jb20vYWthbmFtZXRvdi95b2xvLWZhY2UvcmVsZWFzZXMvZG93bmxvYWQvdjAuMC4wL3lvbG92MTFsLWZhY2UucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdydC1kZXRyLWwucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL3VsdHJhbHl0aWNzL2Fzc2V0cy9yZWxlYXNlcy9kb3dubG9hZC92OC4zLjAvcnRkZXRyLWwucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdydC1kZXRyLXgtZmFjZS5wdCcsICdodHRwczovL2dpdGh1Yi5jb20vSEVQLVZELUNTZUwvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMvcnQtZGV0ci14LWZhY2UucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdtb2JpbGVfc2FtLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS91bHRyYWx5dGljcy9hc3NldHMvcmVsZWFzZXMvZG93bmxvYWQvdjguMy4wL21vYmlsZV9zYW0ucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdGYXN0U0FNLXgucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL3VsdHJhbHl0aWNzL2Fzc2V0cy9yZWxlYXNlcy9kb3dubG9hZC92OC4zLjAvRmFzdFNBTS14LnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnYmlnLWxhbWEucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL2VuZXNtc2FoaW4vc2ltcGxlLWxhbWEtaW5wYWludGluZy9yZWxlYXNlcy9kb3dubG9hZC92MC4xLjAvYmlnLWxhbWEucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdmZm1wZWcnLCAnaHR0cDovL3N0YXRpYy5ncm9zamVhbi5pby9zYW1hbnRoYS9mZm1wZWdfb3N4JykgXG4gICAgYXdhaXQgY2hlY2tBbmREb3dubG9hZChtb2RlbHNGb2xkZXJQYXRoLCBmaWxlcywgJ2ZmcHJvYmUnLCAnaHR0cDovL3N0YXRpYy5ncm9zamVhbi5pby9zYW1hbnRoYS9mZnByb2JlX29zeCcpXG5cbiAgICBjb25zb2xlLmxvZyhgU2V0dXAgRE9ORWApO1xuICB9LFxuICBwbGF0Zm9ybTogKCkgPT4ge1xuICAgIGxldCBuYW1lO1xuICAgIHN3aXRjaCAob3MucGxhdGZvcm0oKSkge1xuICAgICAgY2FzZSAnd2luMzInOlxuICAgICAgICBuYW1lID0gJ1dpbmRvd3MnOyBicmVhaztcbiAgICAgIGNhc2UgJ2Rhcndpbic6XG4gICAgICAgIG5hbWUgPSAnbWFjT1MnOyBicmVhaztcbiAgICAgIGNhc2UgJ2xpbnV4JzpcbiAgICAgICAgbmFtZSA9ICdMaW51eCc7IGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbmFtZSA9ICdVbmtub3duJztcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWUsXG4gICAgICB2ZXJzaW9uOiBvcy5yZWxlYXNlKCksXG4gICAgICBhcmNoOiBvcy5hcmNoKCksXG4gICAgfVxuICB9LFxuICBjcHU6ICgpID0+IHtcbiAgICBjb25zdCBjcHVzID0gb3MuY3B1cygpO1xuICAgIHJldHVybiB7XG4gICAgICBjb3Jlczogb3MuY3B1cygpLmxlbmd0aCxcbiAgICAgIG1vZGVsOiBvcy5jcHVzKClbMF0/Lm1vZGVsLFxuICAgICAgc3BlZWQ6IG9zLmNwdXMoKVswXT8uc3BlZWQsXG4gICAgfVxuICB9LFxuICBtZW06IChvcy50b3RhbG1lbSgpIC8gMTAyNCAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDIpLFxuICBncHU6ICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGxhdGZvcm0gPSBvcy5wbGF0Zm9ybSgpO1xuICAgICAgaWYgKHBsYXRmb3JtID09PSAnd2luMzInIHx8IHBsYXRmb3JtID09PSAnbGludXgnKSB7XG4gICAgICAgIC8vIENoZWNrIGZvciBDVURBIGNvbXBhdGliaWxpdHkgYW5kIEdQVSBtZW1vcnkgdXNpbmcgbnZpZGlhLXNtaVxuICAgICAgICBjb25zdCBjdWRhT3V0cHV0ID0gZXhlY1N5bmMoJ252aWRpYS1zbWkgLS1xdWVyeS1ncHU9bmFtZSxtZW1vcnkudG90YWwgLS1mb3JtYXQ9Y3N2LG5vaGVhZGVyJywgeyBlbmNvZGluZzogJ3V0Zi04JyB9KTtcbiAgICAgICAgY29uc3QgW2dwdU5hbWUsIGdwdU1lbW9yeV0gPSBjdWRhT3V0cHV0LnRyaW0oKS5zcGxpdCgnLCcpLm1hcCgoaXRlbSkgPT4gaXRlbS50cmltKCkpO1xuICAgICAgICByZXR1cm4geyBjdWRhOiB0cnVlLCBuYW1lOiBncHVOYW1lLCBtZW1vcnk6IHBhcnNlSW50KGdwdU1lbW9yeSB8fCAnMCcgKSAvIDEwMjR9O1xuICAgICAgfSBcbiAgICAgIGVsc2UgaWYgKHBsYXRmb3JtID09PSAnZGFyd2luJykge1xuICAgICAgICAvLyBDaGVjayBmb3IgTVBTIGNvbXBhdGliaWxpdHkgKE1ldGFsKSBvbiBtYWNPU1xuICAgICAgICBjb25zdCBtcHNPdXRwdXQgPSBleGVjU3luYygnc3lzdGVtX3Byb2ZpbGVyIFNQRGlzcGxheXNEYXRhVHlwZSB8IGdyZXAgXCJNZXRhbFwiJywgeyBlbmNvZGluZzogJ3V0Zi04JyB9KTtcbiAgICAgICAgcmV0dXJuIHsgbXBzOiBtcHNPdXRwdXQuaW5jbHVkZXMoJ01ldGFsJyksIG5hbWU6ICdNZXRhbC1jb21wYXRpYmxlIEdQVScsIG1lbW9yeTogJ05vdCBhdmFpbGFibGUnIH07XG4gICAgICB9XG4gICAgfSBcbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB7IGN1ZGE6IGZhbHNlLCBtcHM6IGZhbHNlLCBuYW1lOiAnVW5rbm93bicsIG1lbW9yeTogJ1Vua25vd24nIH07XG4gICAgfVxuICB9LFxuXG59KVxuXG5cblxuXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsc0JBQTRDO0FBQzVDLGdCQUE2QjtBQUM3QiwyQkFBeUI7QUFDekIsc0JBQWU7QUFDZix1QkFBaUI7QUFHakIsMkJBQW1CO0FBSW5CLGVBQWUsaUJBQWlCLGtCQUEwQixPQUFpQixNQUFjLEtBQWE7QUFDcEcsTUFBSSxD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
