import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { Ref } from 'vue'
import { appStore } from 'stores/appStore'

const store = appStore()

export type Detection = {
  id: number,
  cid: number,
  pos: {
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  },
  blur: boolean,
  inpaint: boolean,
}

export type Project = {
  id: string,
  name: string,
  folder: string,
  filePath: string,
  createdAt: string,
  cuts: Array<number> | null,
  classes: Array<number> | null,
  detections: Array<Array<Detection>> | null,
}

export type Workspace = {
  projects: Array<Project>,
}

let persistTimeout: ReturnType<typeof setTimeout> | null = null

export const wpStore = defineStore('wpStore', () => {
  
  const projects: Ref<Array<string>> = ref([])

  const selectedProject: Ref<Project|null> = ref(null)
  const step: Ref<number> = ref(0)

  async function loadWorkspace() {
    projects.value = await window.workspaceAPI.readWorkspace(store.workSpacePath || '')
  }

  async function persist(){
    if (persistTimeout) 
      clearTimeout(persistTimeout)
    
    persistTimeout = setTimeout(async () => {
      await window.workspaceAPI.writeWorkspace(
        store.workSpacePath || '',
        selectedProject.value?.folder || '',
        toRaw(selectedProject.value) || {}
      )
    }, 2000)
  }

  async function selectProject(name: string|null) {
    if (name == null) {
      selectedProject.value = null
      return
    }

    selectedProject.value = await window.workspaceAPI.loadProject(store.workSpacePath || '', name || '')

    // always start at step 0
    step.value = 0
  }

  return {
    projects,
    step,
    selectedProject,
    selectProject,
    loadWorkspace,
    persist,
  }
})
