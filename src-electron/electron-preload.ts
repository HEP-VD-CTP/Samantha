import { contextBridge, ipcRenderer }  from 'electron'
import os, { platform } from 'os'
import { execSync } from 'child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { type Workspace } from 'src/stores/wpStore'
import utils from 'src/utils'
import ffmpeg from 'fluent-ffmpeg'
import { Project } from 'src/stores/wpStore'

// download models if they don't exist
async function checkAndDownload(modelsFolderPath: string, files: string[], file: string, url: string) {
  if (!files.includes(file)) {
    ipcRenderer.send('setup-progress', `Downloading ${file}...`)
    await ipcRenderer.invoke('download-models', path.join(modelsFolderPath, file), url)
  }
  else {
    ipcRenderer.send('setup-progress', `${file} already exists, skipping download...`)
  }
}

// remove all segments (video cuts) from the outputPath folder
async function removeSegments(outputPath: string) {
  const segments = []
  for (const file of await fs.readdir(outputPath))
    if (file.startsWith('segment')) 
      segments.push(fs.rm(path.join(outputPath, file)))

  await Promise.all(segments)
}

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.on(channel, listener),
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  },
})

contextBridge.exposeInMainWorld('workspaceAPI', {
  //readWorkspace: (filePath: string) => ipcRenderer.invoke('read-workspace', path.join(filePath, 'data.json')),
  readWorkspace: (folderPath: string) => ipcRenderer.invoke('read-workspace', folderPath),
  writeWorkspace: async (wpPath: string, project: string, data: any) => {
    // ipcRenderer.invoke('write-workspace', path.join(filePath, 'data.json'), data),
    const filePath = path.join(wpPath, 'projects', project, 'data.json')
    //ipcRenderer.invoke('write-workspace', filePath, JSON.stringify(data))
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8')
    }
    catch (err){
      const msg = `Error writing workspace: ${err instanceof Error ? err.message : 'Unknown error'}`
      console.error(msg)
      throw new Error(msg)
    }
  },
  loadProject: async (wpPath: string, project: string) => {
    const dataFilePath = path.join(wpPath, 'projects', project, 'data.json')
    try {
      return JSON.parse(await fs.readFile(dataFilePath, 'utf-8'))
    }
    catch (err) {
      console.error('Error reading project data:', err)
      throw new Error(`Could not load project ${project}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  },
  fileExists: (projectPath: string, projectName: string) => ipcRenderer.invoke('file-exists', path.join(projectPath, 'projects', projectName, 'base.mp4')),
  getVideoFPS: (workspace: string, filePath: string): Promise<number | null> => {
    ffmpeg.setFfprobePath(path.join(workspace, 'models', 'ffprobe'))
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) 
          return reject(err)
        // Find the video stream
        const videoStream = metadata.streams.find(s => s.codec_type === 'video')
        if (!videoStream || !videoStream.r_frame_rate) 
          return resolve(null)
        // r_frame_rate is a string like "25/1" or "30000/1001"
        const [num, denom] = videoStream.r_frame_rate.split('/').map(Number)
        if (!num || !denom) 
          return resolve(null)
        resolve(num / denom)
      })
    })
  },
  cutAndEncodeVideo: async (workdspace: string, projectName: string, inputFilePath: string, keepRanges: [string, string, number][]) => {
    console.log('cutting and encoding video')
    const outputPath = path.join(workdspace, 'projects', projectName)
    // remove all files that start with 'segment' in the outputPath folder
    await removeSegments(outputPath)

    // segment the video
    ffmpeg.setFfmpegPath(path.join(workdspace, 'models', 'ffmpeg'))
    const segmentFiles: string[] = []
    
    // loop through the keepRanges and create video segments
    for (let i = 0; i < keepRanges.length; i++) {
      const range = keepRanges[i]
      if (!range) 
        continue
      const [start, end, duration] = range

      const segFile = path.join(outputPath, `segment_${i}.mp4`)
      segmentFiles.push(segFile)
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputFilePath)
          .setStartTime(start)
          .setDuration(duration)
          .videoCodec('libx264') // Re-encode to ensure MP4 compatibility
          .audioCodec('aac')
          .outputOptions('-movflags', 'faststart') // for better mp4 compatibility
          .outputOptions('-preset', 'fast')
          .outputOptions('-crf', '23')
          .output(segFile)
          .on('end', () => {
            console.log(`Segment ${i} done`)
            resolve()
          })
          .on('error', (e) => {
            console.error(`Error processing segment ${i}`)
            reject(e)
          })
          .run()
      })
    }

    console.log('All segments done')

    // Concatenate the segments into a single video file
    const listFile = path.join(outputPath, 'segments.txt')
    await fs.writeFile(listFile, segmentFiles.map(f => `file '${f}'`).join('\n'))
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions('-f', 'concat', '-safe', '0')
        .outputOptions('-c', 'copy')
        .output(path.join(outputPath, 'base.mp4'))
        .on('end', () => {
          console.log('Concatenation done')
          resolve()
        })
        .on('error', (e) => {
          console.error('Error during concatenation')
          reject(e)
        })
        .run()
      }
    )

    // Remove the segments
    await removeSegments(outputPath)
  }
})

// get system information
contextBridge.exposeInMainWorld('sys', {
  openFolder: (folderPath: string) => ipcRenderer.send('open-folder', folderPath),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFile: () => ipcRenderer.invoke('pick-file'),
  deleteFolder: async (wpPath: string, folder: string) => await fs.rm(path.join(wpPath, 'projects', folder), { recursive: true, force: true }),
  createFolder: async (wpPath: string, folder: string, project: string) => {
    const fullPath = path.join(wpPath, 'projects', folder)
    // try to create the project folder
    try {
      await fs.access(fullPath)
      // If no error, the folder exists
      throw new Error('This project already exists')
    }
    catch(err: any) {
      // Only create the folder if the error is "not exists"
      if (err && err.code === 'ENOENT') {
        // Folder does not exist, create it
        await fs.mkdir(fullPath, { recursive: true })

        // create the data.json file
        const dataFilePath = path.join(fullPath, 'data.json')
        
        await fs.writeFile(dataFilePath, JSON.stringify(project), 'utf-8')
      } 
      else
        throw err
    }
  },
  setupWorkspace: async (wpPath: string) => {
    console.log(`setting workdspace at ${wpPath}`)
    ipcRenderer.send('setup-progress', 'Starting workspace setup...')
    
    // make sure path exists
    await fs.mkdir(wpPath, { recursive: true })


    /*
    TO-DO: remove this later
    */
    // Check if data.json exists, otherwise create it
    const dataFilePath = path.join(wpPath, 'data.json')
    try {
      await fs.access(dataFilePath)
      ipcRenderer.send('setup-progress', 'Data file already exists, skipping creation...')
    } 
    catch {
      ipcRenderer.send('setup-progress', 'Creating data file...')
      const baseData = {
        projects: [],
      } as Workspace
      await fs.writeFile(dataFilePath, JSON.stringify(baseData), 'utf-8') // Create an empty JSON file
    }

    // Check if projects folder exists, otherwise create it
    await fs.mkdir(path.join(wpPath, 'projects'), { recursive: true })

    // Check if models folder exists, otherwise create it
    const modelsFolderPath = path.join(wpPath, 'models')
    await fs.mkdir(modelsFolderPath, { recursive: true })
    
    // List all files in the models folder
    const files = await fs.readdir(modelsFolderPath)

    // download the following files if they don't exist
    await checkAndDownload(modelsFolderPath, files, 'yolov12l.pt', 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo12l.pt')
    await checkAndDownload(modelsFolderPath, files, 'yolov11l-face.pt', 'https://github.com/akanametov/yolo-face/releases/download/v0.0.0/yolov11l-face.pt')
    await checkAndDownload(modelsFolderPath, files, 'rt-detr-l.pt', 'https://github.com/ultralytics/assets/releases/download/v8.3.0/rtdetr-l.pt')
    await checkAndDownload(modelsFolderPath, files, 'rt-detr-x-face.pt', 'https://github.com/HEP-VD-CSeL/Samantha/raw/refs/heads/main/models/rt-detr-x-face.pt')
    await checkAndDownload(modelsFolderPath, files, 'mobile_sam.pt', 'https://github.com/ultralytics/assets/releases/download/v8.3.0/mobile_sam.pt')
    await checkAndDownload(modelsFolderPath, files, 'FastSAM-x.pt', 'https://github.com/ultralytics/assets/releases/download/v8.3.0/FastSAM-x.pt')
    await checkAndDownload(modelsFolderPath, files, 'big-lama.pt', 'https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt')
    await checkAndDownload(modelsFolderPath, files, 'ffmpeg', 'http://static.grosjean.io/samantha/ffmpeg_osx') 
    await checkAndDownload(modelsFolderPath, files, 'ffprobe', 'http://static.grosjean.io/samantha/ffprobe_osx')

    console.log(`Setup DONE`);
  },
  platform: () => {
    let name;
    switch (os.platform()) {
      case 'win32':
        name = 'Windows'; break;
      case 'darwin':
        name = 'macOS'; break;
      case 'linux':
        name = 'Linux'; break;
      default:
        name = 'Unknown';
    }
    return {
      name,
      version: os.release(),
      arch: os.arch(),
    }
  },
  cpu: () => {
    const cpus = os.cpus();
    return {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model,
      speed: os.cpus()[0]?.speed,
    }
  },
  mem: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
  gpu: () => {
    try {
      const platform = os.platform();
      if (platform === 'win32' || platform === 'linux') {
        // Check for CUDA compatibility and GPU memory using nvidia-smi
        const cudaOutput = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { encoding: 'utf-8' });
        const [gpuName, gpuMemory] = cudaOutput.trim().split(',').map((item) => item.trim());
        return { cuda: true, name: gpuName, memory: parseInt(gpuMemory || '0' ) / 1024};
      } 
      else if (platform === 'darwin') {
        // Check for MPS compatibility (Metal) on macOS
        const mpsOutput = execSync('system_profiler SPDisplaysDataType | grep "Metal"', { encoding: 'utf-8' });
        return { mps: mpsOutput.includes('Metal'), name: 'Metal-compatible GPU', memory: 'Not available' };
      }
    } 
    catch (error) {
      return { cuda: false, mps: false, name: 'Unknown', memory: 'Unknown' };
    }
  },

})




