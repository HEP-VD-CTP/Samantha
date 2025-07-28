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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjLWVsZWN0cm9uL2VsZWN0cm9uLXByZWxvYWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNvbnRleHRCcmlkZ2UsIGlwY1JlbmRlcmVyIH0gIGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IG9zLCB7IHBsYXRmb3JtIH0gZnJvbSAnb3MnXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcy9wcm9taXNlcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCBmZm1wZWcgZnJvbSAnZmx1ZW50LWZmbXBlZydcblxuLy8gZG93bmxvYWQgbW9kZWxzIGlmIHRoZXkgZG9uJ3QgZXhpc3RcbmFzeW5jIGZ1bmN0aW9uIGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aDogc3RyaW5nLCBmaWxlczogc3RyaW5nW10sIGZpbGU6IHN0cmluZywgdXJsOiBzdHJpbmcpIHtcbiAgaWYgKCFmaWxlcy5pbmNsdWRlcyhmaWxlKSkge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ3NldHVwLXByb2dyZXNzJywgYERvd25sb2FkaW5nICR7ZmlsZX0uLi5gKVxuICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZSgnZG93bmxvYWQtbW9kZWxzJywgcGF0aC5qb2luKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGUpLCB1cmwpXG4gIH1cbiAgZWxzZSB7XG4gICAgaXBjUmVuZGVyZXIuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCBgJHtmaWxlfSBhbHJlYWR5IGV4aXN0cywgc2tpcHBpbmcgZG93bmxvYWQuLi5gKVxuICB9XG59XG5cbi8vIHJlbW92ZSBhbGwgc2VnbWVudHMgKHZpZGVvIGN1dHMpIGZyb20gdGhlIG91dHB1dFBhdGggZm9sZGVyXG5hc3luYyBmdW5jdGlvbiByZW1vdmVTZWdtZW50cyhvdXRwdXRQYXRoOiBzdHJpbmcpIHtcbiAgY29uc3Qgc2VnbWVudHMgPSBbXVxuICBmb3IgKGNvbnN0IGZpbGUgb2YgYXdhaXQgZnMucmVhZGRpcihvdXRwdXRQYXRoKSlcbiAgICBpZiAoZmlsZS5zdGFydHNXaXRoKCdzZWdtZW50JykpIFxuICAgICAgc2VnbWVudHMucHVzaChmcy5ybShwYXRoLmpvaW4ob3V0cHV0UGF0aCwgZmlsZSkpKVxuXG4gIGF3YWl0IFByb21pc2UuYWxsKHNlZ21lbnRzKVxufVxuXG5jb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdlbGVjdHJvbicsIHtcbiAgaXBjUmVuZGVyZXI6IHtcbiAgICBvbjogKGNoYW5uZWw6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCkgPT4gaXBjUmVuZGVyZXIub24oY2hhbm5lbCwgbGlzdGVuZXIpLFxuICAgIHNlbmQ6IChjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKSA9PiBpcGNSZW5kZXJlci5zZW5kKGNoYW5uZWwsIC4uLmFyZ3MpLFxuICB9LFxufSlcblxuY29udGV4dEJyaWRnZS5leHBvc2VJbk1haW5Xb3JsZCgnd29ya3NwYWNlQVBJJywge1xuICByZWFkV29ya3NwYWNlOiAoZm9sZGVyUGF0aDogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ3JlYWQtd29ya3NwYWNlJywgZm9sZGVyUGF0aCksXG4gIHdyaXRlV29ya3NwYWNlOiBhc3luYyAod3BQYXRoOiBzdHJpbmcsIHByb2plY3Q6IHN0cmluZywgZGF0YTogYW55KSA9PiB7XG4gICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnLCBwcm9qZWN0LCAnZGF0YS5qc29uJylcbiAgICBcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZnMud3JpdGVGaWxlKGZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShkYXRhKSwgJ3V0Zi04JylcbiAgICB9XG4gICAgY2F0Y2ggKGVycil7XG4gICAgICBjb25zdCBtc2cgPSBgRXJyb3Igd3JpdGluZyB3b3Jrc3BhY2U6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gXG4gICAgICBjb25zb2xlLmVycm9yKG1zZylcbiAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpXG4gICAgfVxuICB9LFxuICBsb2FkUHJvamVjdDogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBwcm9qZWN0OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBkYXRhRmlsZVBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnLCBwcm9qZWN0LCAnZGF0YS5qc29uJylcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEpTT04ucGFyc2UoYXdhaXQgZnMucmVhZEZpbGUoZGF0YUZpbGVQYXRoLCAndXRmLTgnKSlcbiAgICB9XG4gICAgY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgcmVhZGluZyBwcm9qZWN0IGRhdGE6JywgZXJyKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgbG9hZCBwcm9qZWN0ICR7cHJvamVjdH06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKVxuICAgIH1cbiAgfSxcbiAgZmlsZUV4aXN0czogKHByb2plY3RQYXRoOiBzdHJpbmcsIHByb2plY3ROYW1lOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZmlsZS1leGlzdHMnLCBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICdwcm9qZWN0cycsIHByb2plY3ROYW1lLCAnYmFzZS5tcDQnKSksXG4gIGdldFZpZGVvRlBTOiAod29ya3NwYWNlOiBzdHJpbmcsIGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlciB8IG51bGw+ID0+IHtcbiAgICBmZm1wZWcuc2V0RmZwcm9iZVBhdGgocGF0aC5qb2luKHdvcmtzcGFjZSwgJ21vZGVscycsICdmZnByb2JlJykpXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGZmbXBlZy5mZnByb2JlKGZpbGVQYXRoLCAoZXJyLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICBpZiAoZXJyKSBcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycilcbiAgICAgICAgLy8gRmluZCB0aGUgdmlkZW8gc3RyZWFtXG4gICAgICAgIGNvbnN0IHZpZGVvU3RyZWFtID0gbWV0YWRhdGEuc3RyZWFtcy5maW5kKHMgPT4gcy5jb2RlY190eXBlID09PSAndmlkZW8nKVxuICAgICAgICBpZiAoIXZpZGVvU3RyZWFtIHx8ICF2aWRlb1N0cmVhbS5yX2ZyYW1lX3JhdGUpIFxuICAgICAgICAgIHJldHVybiByZXNvbHZlKG51bGwpXG4gICAgICAgIC8vIHJfZnJhbWVfcmF0ZSBpcyBhIHN0cmluZyBsaWtlIFwiMjUvMVwiIG9yIFwiMzAwMDAvMTAwMVwiXG4gICAgICAgIGNvbnN0IFtudW0sIGRlbm9tXSA9IHZpZGVvU3RyZWFtLnJfZnJhbWVfcmF0ZS5zcGxpdCgnLycpLm1hcChOdW1iZXIpXG4gICAgICAgIGlmICghbnVtIHx8ICFkZW5vbSkgXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUobnVsbClcbiAgICAgICAgcmVzb2x2ZShudW0gLyBkZW5vbSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSxcbiAgY3V0QW5kRW5jb2RlVmlkZW86IGFzeW5jICh3b3JrZHNwYWNlOiBzdHJpbmcsIHByb2plY3ROYW1lOiBzdHJpbmcsIGlucHV0RmlsZVBhdGg6IHN0cmluZywga2VlcFJhbmdlczogW3N0cmluZywgc3RyaW5nLCBudW1iZXJdW10pID0+IHtcbiAgICBjb25zb2xlLmxvZygnY3V0dGluZyBhbmQgZW5jb2RpbmcgdmlkZW8nKVxuICAgIGNvbnN0IG91dHB1dFBhdGggPSBwYXRoLmpvaW4od29ya2RzcGFjZSwgJ3Byb2plY3RzJywgcHJvamVjdE5hbWUpXG4gICAgLy8gcmVtb3ZlIGFsbCBmaWxlcyB0aGF0IHN0YXJ0IHdpdGggJ3NlZ21lbnQnIGluIHRoZSBvdXRwdXRQYXRoIGZvbGRlclxuICAgIGF3YWl0IHJlbW92ZVNlZ21lbnRzKG91dHB1dFBhdGgpXG5cbiAgICAvLyBzZWdtZW50IHRoZSB2aWRlb1xuICAgIGZmbXBlZy5zZXRGZm1wZWdQYXRoKHBhdGguam9pbih3b3JrZHNwYWNlLCAnbW9kZWxzJywgJ2ZmbXBlZycpKVxuICAgIGNvbnN0IHNlZ21lbnRGaWxlczogc3RyaW5nW10gPSBbXVxuICAgIFxuICAgIC8vIGxvb3AgdGhyb3VnaCB0aGUga2VlcFJhbmdlcyBhbmQgY3JlYXRlIHZpZGVvIHNlZ21lbnRzXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZWVwUmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCByYW5nZSA9IGtlZXBSYW5nZXNbaV1cbiAgICAgIGlmICghcmFuZ2UpIFxuICAgICAgICBjb250aW51ZVxuICAgICAgY29uc3QgW3N0YXJ0LCBlbmQsIGR1cmF0aW9uXSA9IHJhbmdlXG5cbiAgICAgIGNvbnN0IHNlZ0ZpbGUgPSBwYXRoLmpvaW4ob3V0cHV0UGF0aCwgYHNlZ21lbnRfJHtpfS5tcDRgKVxuICAgICAgc2VnbWVudEZpbGVzLnB1c2goc2VnRmlsZSlcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgZmZtcGVnKGlucHV0RmlsZVBhdGgpXG4gICAgICAgICAgLnNldFN0YXJ0VGltZShzdGFydClcbiAgICAgICAgICAuc2V0RHVyYXRpb24oZHVyYXRpb24pXG4gICAgICAgICAgLnZpZGVvQ29kZWMoJ2xpYngyNjQnKSAvLyBSZS1lbmNvZGUgdG8gZW5zdXJlIE1QNCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgLmF1ZGlvQ29kZWMoJ2FhYycpXG4gICAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1tb3ZmbGFncycsICdmYXN0c3RhcnQnKSAvLyBmb3IgYmV0dGVyIG1wNCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1wcmVzZXQnLCAnZmFzdCcpXG4gICAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1jcmYnLCAnMjMnKVxuICAgICAgICAgIC5vdXRwdXQoc2VnRmlsZSlcbiAgICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBTZWdtZW50ICR7aX0gZG9uZWApXG4gICAgICAgICAgICByZXNvbHZlKClcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgcHJvY2Vzc2luZyBzZWdtZW50ICR7aX1gKVxuICAgICAgICAgICAgcmVqZWN0KGUpXG4gICAgICAgICAgfSlcbiAgICAgICAgICAucnVuKClcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ0FsbCBzZWdtZW50cyBkb25lJylcblxuICAgIC8vIENvbmNhdGVuYXRlIHRoZSBzZWdtZW50cyBpbnRvIGEgc2luZ2xlIHZpZGVvIGZpbGVcbiAgICBjb25zdCBsaXN0RmlsZSA9IHBhdGguam9pbihvdXRwdXRQYXRoLCAnc2VnbWVudHMudHh0JylcbiAgICBhd2FpdCBmcy53cml0ZUZpbGUobGlzdEZpbGUsIHNlZ21lbnRGaWxlcy5tYXAoZiA9PiBgZmlsZSAnJHtmfSdgKS5qb2luKCdcXG4nKSlcbiAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBmZm1wZWcoKVxuICAgICAgICAuaW5wdXQobGlzdEZpbGUpXG4gICAgICAgIC5pbnB1dE9wdGlvbnMoJy1mJywgJ2NvbmNhdCcsICctc2FmZScsICcwJylcbiAgICAgICAgLm91dHB1dE9wdGlvbnMoJy1jJywgJ2NvcHknKVxuICAgICAgICAub3V0cHV0KHBhdGguam9pbihvdXRwdXRQYXRoLCAnYmFzZS5tcDQnKSlcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0NvbmNhdGVuYXRpb24gZG9uZScpXG4gICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGR1cmluZyBjb25jYXRlbmF0aW9uJylcbiAgICAgICAgICByZWplY3QoZSlcbiAgICAgICAgfSlcbiAgICAgICAgLnJ1bigpXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8gUmVtb3ZlIHRoZSBzZWdtZW50c1xuICAgIGF3YWl0IHJlbW92ZVNlZ21lbnRzKG91dHB1dFBhdGgpXG4gIH1cbn0pXG5cbi8vIGdldCBzeXN0ZW0gaW5mb3JtYXRpb25cbmNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ3N5cycsIHtcbiAgb3BlbkZvbGRlcjogKGZvbGRlclBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuc2VuZCgnb3Blbi1mb2xkZXInLCBmb2xkZXJQYXRoKSxcbiAgcGlja0ZvbGRlcjogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdwaWNrLWZvbGRlcicpLFxuICBwaWNrRmlsZTogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdwaWNrLWZpbGUnKSxcbiAgZGVsZXRlRm9sZGVyOiBhc3luYyAod3BQYXRoOiBzdHJpbmcsIGZvbGRlcjogc3RyaW5nKSA9PiBhd2FpdCBmcy5ybShwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnLCBmb2xkZXIpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSksXG4gIGNyZWF0ZUZvbGRlcjogYXN5bmMgKHdwUGF0aDogc3RyaW5nLCBmb2xkZXI6IHN0cmluZywgcHJvamVjdDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAncHJvamVjdHMnLCBmb2xkZXIpXG4gICAgLy8gdHJ5IHRvIGNyZWF0ZSB0aGUgcHJvamVjdCBmb2xkZXJcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZnMuYWNjZXNzKGZ1bGxQYXRoKVxuICAgICAgLy8gSWYgbm8gZXJyb3IsIHRoZSBmb2xkZXIgZXhpc3RzXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgcHJvamVjdCBhbHJlYWR5IGV4aXN0cycpXG4gICAgfVxuICAgIGNhdGNoKGVycjogYW55KSB7XG4gICAgICAvLyBPbmx5IGNyZWF0ZSB0aGUgZm9sZGVyIGlmIHRoZSBlcnJvciBpcyBcIm5vdCBleGlzdHNcIlxuICAgICAgaWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgICAgLy8gRm9sZGVyIGRvZXMgbm90IGV4aXN0LCBjcmVhdGUgaXRcbiAgICAgICAgYXdhaXQgZnMubWtkaXIoZnVsbFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cbiAgICAgICAgLy8gY3JlYXRlIHRoZSBkYXRhLmpzb24gZmlsZVxuICAgICAgICBjb25zdCBkYXRhRmlsZVBhdGggPSBwYXRoLmpvaW4oZnVsbFBhdGgsICdkYXRhLmpzb24nKVxuICAgICAgICBcbiAgICAgICAgYXdhaXQgZnMud3JpdGVGaWxlKGRhdGFGaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkocHJvamVjdCksICd1dGYtOCcpXG4gICAgICB9IFxuICAgICAgZWxzZVxuICAgICAgICB0aHJvdyBlcnJcbiAgICB9XG4gIH0sXG4gIHNldHVwV29ya3NwYWNlOiBhc3luYyAod3BQYXRoOiBzdHJpbmcpID0+IHtcbiAgICBjb25zb2xlLmxvZyhgc2V0dGluZyB3b3JrZHNwYWNlIGF0ICR7d3BQYXRofWApXG4gICAgaXBjUmVuZGVyZXIuc2VuZCgnc2V0dXAtcHJvZ3Jlc3MnLCAnU3RhcnRpbmcgd29ya3NwYWNlIHNldHVwLi4uJylcbiAgICBcbiAgICAvLyBtYWtlIHN1cmUgcGF0aCBleGlzdHNcbiAgICBhd2FpdCBmcy5ta2Rpcih3cFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cbiAgICAvLyBDaGVjayBpZiBwcm9qZWN0cyBmb2xkZXIgZXhpc3RzLCBvdGhlcndpc2UgY3JlYXRlIGl0XG4gICAgYXdhaXQgZnMubWtkaXIocGF0aC5qb2luKHdwUGF0aCwgJ3Byb2plY3RzJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG5cbiAgICAvLyBDaGVjayBpZiBtb2RlbHMgZm9sZGVyIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBpdFxuICAgIGNvbnN0IG1vZGVsc0ZvbGRlclBhdGggPSBwYXRoLmpvaW4od3BQYXRoLCAnbW9kZWxzJylcbiAgICBhd2FpdCBmcy5ta2Rpcihtb2RlbHNGb2xkZXJQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICAgIFxuICAgIC8vIExpc3QgYWxsIGZpbGVzIGluIHRoZSBtb2RlbHMgZm9sZGVyXG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmcy5yZWFkZGlyKG1vZGVsc0ZvbGRlclBhdGgpXG5cbiAgICAvLyBkb3dubG9hZCB0aGUgZm9sbG93aW5nIGZpbGVzIGlmIHRoZXkgZG9uJ3QgZXhpc3RcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAneW9sb3YxMmwucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMveW9sb3YxMmwucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICd5b2xvdjExbC1mYWNlLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9IRVAtVkQtQ1RQL1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL3lvbG92MTFsLWZhY2UucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdtb2JpbGVfc2FtLnB0JywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9IRVAtVkQtQ1RQL1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL21vYmlsZV9zYW0ucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdGYXN0U0FNLXgucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMvRmFzdFNBTS14LnB0JylcbiAgICBhd2FpdCBjaGVja0FuZERvd25sb2FkKG1vZGVsc0ZvbGRlclBhdGgsIGZpbGVzLCAnYmlnLWxhbWEucHQnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMvYmlnLWxhbWEucHQnKVxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdmZm1wZWcnLCAnaHR0cHM6Ly9naXRodWIuY29tL0hFUC1WRC1DVFAvU2FtYW50aGEvcmF3L3JlZnMvaGVhZHMvbWFpbi9tb2RlbHMvZmZtcGVnX29zeCcpIFxuICAgIGF3YWl0IGNoZWNrQW5kRG93bmxvYWQobW9kZWxzRm9sZGVyUGF0aCwgZmlsZXMsICdmZnByb2JlJywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9IRVAtVkQtQ1RQL1NhbWFudGhhL3Jhdy9yZWZzL2hlYWRzL21haW4vbW9kZWxzL2ZmcHJvYmVfb3N4JylcblxuICAgIGNvbnNvbGUubG9nKGBTZXR1cCBET05FYClcbiAgfSxcbiAgcGxhdGZvcm06ICgpID0+IHtcbiAgICBsZXQgbmFtZVxuICAgIHN3aXRjaCAob3MucGxhdGZvcm0oKSkge1xuICAgICAgY2FzZSAnd2luMzInOlxuICAgICAgICBuYW1lID0gJ1dpbmRvd3MnOyBicmVhaztcbiAgICAgIGNhc2UgJ2Rhcndpbic6XG4gICAgICAgIG5hbWUgPSAnbWFjT1MnOyBicmVhaztcbiAgICAgIGNhc2UgJ2xpbnV4JzpcbiAgICAgICAgbmFtZSA9ICdMaW51eCc7IGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbmFtZSA9ICdVbmtub3duJztcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWUsXG4gICAgICB2ZXJzaW9uOiBvcy5yZWxlYXNlKCksXG4gICAgICBhcmNoOiBvcy5hcmNoKCksXG4gICAgfVxuICB9LFxuICBjcHU6ICgpID0+IHtcbiAgICBjb25zdCBjcHVzID0gb3MuY3B1cygpO1xuICAgIHJldHVybiB7XG4gICAgICBjb3Jlczogb3MuY3B1cygpLmxlbmd0aCxcbiAgICAgIG1vZGVsOiBvcy5jcHVzKClbMF0/Lm1vZGVsLFxuICAgICAgc3BlZWQ6IG9zLmNwdXMoKVswXT8uc3BlZWQsXG4gICAgfVxuICB9LFxuICBtZW06IChvcy50b3RhbG1lbSgpIC8gMTAyNCAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDIpLFxuICBncHU6ICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGxhdGZvcm0gPSBvcy5wbGF0Zm9ybSgpXG4gICAgICBpZiAocGxhdGZvcm0gPT09ICd3aW4zMicgfHwgcGxhdGZvcm0gPT09ICdsaW51eCcpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIENVREEgY29tcGF0aWJpbGl0eSBhbmQgR1BVIG1lbW9yeSB1c2luZyBudmlkaWEtc21pXG4gICAgICAgIGNvbnN0IGN1ZGFPdXRwdXQgPSBleGVjU3luYygnbnZpZGlhLXNtaSAtLXF1ZXJ5LWdwdT1uYW1lLG1lbW9yeS50b3RhbCAtLWZvcm1hdD1jc3Ysbm9oZWFkZXInLCB7IGVuY29kaW5nOiAndXRmLTgnIH0pXG4gICAgICAgIGNvbnN0IFtncHVOYW1lLCBncHVNZW1vcnldID0gY3VkYU91dHB1dC50cmltKCkuc3BsaXQoJywnKS5tYXAoKGl0ZW0pID0+IGl0ZW0udHJpbSgpKVxuICAgICAgICByZXR1cm4geyBjdWRhOiB0cnVlLCBuYW1lOiBncHVOYW1lLCBtZW1vcnk6IHBhcnNlSW50KGdwdU1lbW9yeSB8fCAnMCcgKSAvIDEwMjR9XG4gICAgICB9IFxuICAgICAgZWxzZSBpZiAocGxhdGZvcm0gPT09ICdkYXJ3aW4nKSB7XG4gICAgICAgIC8vIENoZWNrIGZvciBNUFMgY29tcGF0aWJpbGl0eSAoTWV0YWwpIG9uIG1hY09TXG4gICAgICAgIGNvbnN0IG1wc091dHB1dCA9IGV4ZWNTeW5jKCdzeXN0ZW1fcHJvZmlsZXIgU1BEaXNwbGF5c0RhdGFUeXBlIHwgZ3JlcCBcIk1ldGFsXCInLCB7IGVuY29kaW5nOiAndXRmLTgnIH0pXG4gICAgICAgIHJldHVybiB7IG1wczogbXBzT3V0cHV0LmluY2x1ZGVzKCdNZXRhbCcpLCBuYW1lOiAnTWV0YWwtY29tcGF0aWJsZSBHUFUnLCBtZW1vcnk6ICdOb3QgYXZhaWxhYmxlJyB9XG4gICAgICB9XG4gICAgfSBcbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB7IGN1ZGE6IGZhbHNlLCBtcHM6IGZhbHNlLCBuYW1lOiAnVW5rbm93bicsIG1lbW9yeTogJ1Vua25vd24nIH1cbiAgICB9XG4gIH0sXG5cbn0pXG5cblxuXG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxzQkFBNEM7QUFDNUMsZ0JBQTZCO0FBQzdCLDJCQUF5QjtBQUN6QixzQkFBZTtBQUNmLHVCQUFpQjtBQUNqQiwyQkFBbUI7QUFHbkIsZUFBZSxpQkFBaUIsa0JBQTBCLE9BQWlCLE1BQWMsS0FBYTtBQUNwRyxNQUFJLENBQUMsTUFBTSxTQUFTLElBQUksR0FBRztBQUN6QixnQ0FBWSxLQUFLLGtCQUFrQixlQUFlLElBQUksS0FBSztBQUMzRCxVQUFNLDRCQUFZLE9BQU8sbUJBQW1CLGlCQUFBQSxRQUFLLEtBQUssa0JBQWtCLElBQUksR0FBRyxHQUFHO0FBQUEsRUFDcEYsT0FDSztBQUNILGdDQUFZLEtBQUssa0JBQWtCLEdBQUcsSUFBSSx1Q0FBdUM7QUFBQSxFQUNuRjtBQUNGO0FBR0EsZUFBZSxlQUFlLFlBQW9CO0FBQ2hELFFBQU0sV0FBVyxDQUFDO0FBQ2xCLGFBQVcsUUFBUSxNQUFNLGdCQUFBQyxRQUFHLFFBQVEsVUFBVTtBQUM1QyxRQUFJLEtBQUssV0FBVyxTQUFTO0FBQzNCLGVBQVMsS0FBSyxnQkFBQUEs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
