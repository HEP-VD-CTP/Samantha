import { app, ipcMain, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url'
import axios from 'axios'
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';


// needed in case process is undefined under Linux
const platform = process.platform || os.platform();

const currentDir = fileURLToPath(new URL('.', import.meta.url));

let mainWindow: BrowserWindow | undefined;

async function createWindow() {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    icon: path.resolve(currentDir, 'icons/icon.png'), // tray icon
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
        path.join(process.env.QUASAR_ELECTRON_PRELOAD_FOLDER, 'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION)
      ),
    },
  });

  if (process.env.DEV) {
    await mainWindow.loadURL(process.env.APP_URL);
  } else {
    await mainWindow.loadFile('index.html');
  }

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools();
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

void app.whenReady().then(createWindow);

// pick a folder from the filesystem
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'], 
  })

  if (result.canceled) 
    return null

  return result.filePaths[0] 
})

// keep the user informed about the setup progress
ipcMain.on('setup-progress', (event, message) => {
  if (mainWindow) 
    mainWindow.webContents.send('setup-progress', message)
});

// open a folder in the system file explorer
ipcMain.on('open-folder', (event, folderPath) => {
  shell.openPath(folderPath)
})

// download models from a given URL and save to a destination path
ipcMain.handle('download-models', async (_event, dest: string, url: string) => {
  const response = await axios.get(url, { responseType: 'stream' })
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(dest)
    response.data.pipe(stream)
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  // make the files executable
  await fs.chmod(dest, 0o755)

  return { success: true }
})

// read file and parse as JSON
ipcMain.handle('read-workspace', async (_event, filePath: string) => {
  const data = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(data)
})

// write 
ipcMain.handle('write-workspace', async (_event, filePath: string, data: any) => {
  try {
    await fs.writeFile(filePath, data, 'utf-8')
    return true
  }
  catch (err){
    console.error('Error writing workspace:', err)
    return false
  }
})

// check if a file exists on the filesystem
ipcMain.handle('file-exists', async (_event, filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } 
  catch {
    return false
  }
})

// open file explorer and select a video file
ipcMain.handle('pick-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', 'mpeg', 'mpg'] }
    ]
  })
  if (result.canceled) 
    return null
  return result.filePaths[0]
})

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === undefined) {
    void createWindow();
  }
});

