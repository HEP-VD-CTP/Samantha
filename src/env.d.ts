declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
  }


}

export declare global {

  interface Window {
    electron: {
      ipcRenderer: {
        on: (channel: string, listener: (...args: any[]) => void) => void;
        send: (channel: string, ...args: any[]) => void;
      };
    };
    workspaceAPI: {
      readWorkspace: (filePath: string) => Promise<any>;
      writeWorkspace: (filePath: string, data: any) => Promise<void>;
      fileExists: (projectPath: string, projectName: string) => Promise<boolean>;
      getVideoFPS: (workspace: string, filePath: string) => Promise<number | null>;
      cutAndEncodeVideo: (
        workspace: string, 
        projectName: string,
        inputFilePath: string, 
        keepRanges: [string, string, number][]) => Promise<void>;
    };
    sys: {
      openFolder: (folderPath: string) => Promise<void>,
      pickFolder: () => Promise<string | null>,
      pickFile: () => Promise<string | null>,
      deleteFolder: (folderPath: string) => Promise<void>,
      createFolder: (folderPath: string) => Promise<void>,
      setupWorkspace: (path: string) => Promise<void>,
      platform: () => {
        name: string,
        version: string,
        arch: string
      },
      cpu: () => {
        cores: number,
        model: string,
        speed: number
      },
      mem: number,
      gpu: () => { 
        cuda?: boolean, 
        mps?: boolean, 
        name: string,
        memory: number
      },
      
    };
  }
}