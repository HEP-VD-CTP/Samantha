import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import type { Ref } from 'vue'
import { appStore } from 'stores/appStore'
import path from 'path'

const store = appStore()

export type Detection = {
  id: number,
  classid: number,
  classname: string, 
  positions: {
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

export const wpStore = defineStore('wpStore', () => {
  
  const workspace: Ref<Workspace|null> = ref(null)
  const selectedProject: Ref<Project|null> = ref(null)
  const step: Ref<number> = ref(0)

  async function loadWorkspace() {
    const data = await window.workspaceAPI.readWorkspace(store.workSpacePath || '')
    workspace.value = data
  }

  async function persist(){
    await window.workspaceAPI.writeWorkspace(store.workSpacePath || '', JSON.stringify(workspace.value))
  }

  async function selectProjectById(id: string|null) {
    // close project is not tab is selected
    if (id == null) {
      selectedProject.value = null
      return
    }

    // chose and render new pages
    selectedProject.value = null
    await nextTick()
    if (workspace.value)
      selectedProject.value = workspace.value.projects.find(p => p.id === id) || null

    // always start at step 0
    step.value = 0
  }

  return {
    workspace,
    step,
    selectedProject,
    selectProjectById,
    loadWorkspace,
    persist,
  }
})
