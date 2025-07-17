<template>
  <q-dialog v-model="newProjectAlert" persistent>
    <q-card style="min-width:350px;">
      <q-card-section>
        <div class="text-h6">Create a new project</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <q-input v-model="newProjectName" 
          lazy-rules 
          label="Project name" 
          filled 
          type="text" 
          :rules="[
            v => !!v || `Mandatory field`,
            v => v.length <= 255 || `Maximum length is 255 characters`,
          ]" />

        <q-btn @click="selectFile" color="primary q-mt-md" label="Select a video file" />

        <p v-if="videoFilePath" class="q-mt-md">File path: {{ videoFilePath }}</p>

      </q-card-section>

      <q-card-actions align="right">
        <q-btn @click="newProjectAlert = false" flat label="Cancel" color="negative" />
        <q-btn @click="createProject" flat label="Create" color="primary" :disable="!newProjectName.length || newProjectName.length > 255 || videoFilePath == null" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <q-page style="width:100%" class="">
    <q-list>
      <q-item @click="newProject()" clickable v-ripple>
        <q-item-section>
          <q-item-label>
            <q-icon name="add" /> Create a new project
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <q-item-label header>My projects ({{ wp.workspace?.projects.length }})</q-item-label>

    <div v-if="!wp.workspace?.projects.length" class="q-mt-sm text-center">
      <span>You have no projects</span>
    </div>
    <div v-else>
      <q-list separator>
        <q-separator spaced />

        <q-item @click="wp.selectProjectById(project.id)" :focused="wp.selectedProject?.id == project.id" v-for="(project, index) of wp.workspace?.projects" clickable>
          <q-item-section>
            <q-item-label>{{ project.name }}</q-item-label>
            <q-item-label caption>{{ project.createdAt }}</q-item-label>
          </q-item-section>
          <q-item-section avatar>
            <q-btn flat dense round icon="mdi-dots-vertical">
              <q-menu>
                <q-list style="min-width: 100px">
                  <q-item @click="deleteProject(project)" clickable v-close-popup>
                    <q-item-section>Delete</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </q-item-section>
        </q-item>
      </q-list>
    </div>

  </q-page>
</template>

<script setup lang="ts">
//import { app } from 'electron';
import { ref, onMounted, watch } from 'vue';
import { type Ref } from 'vue';
import { appStore } from 'stores/appStore'
import { wpStore } from 'src/stores/wpStore';
import { type Project } from 'src/stores/wpStore';
import utils from 'src/utils'
import { useQuasar, QVueGlobals } from 'quasar'

const q: QVueGlobals = useQuasar()
const store = appStore()
const wp = wpStore()
const newProjectAlert: Ref<boolean> = ref(false)
const newProjectName: Ref<string> = ref('')
const videoFilePath: Ref<string|null> = ref(null)

function newProject(){
  newProjectAlert.value = true
  newProjectName.value = ''
  videoFilePath.value = null
}

async function createProject(){
  const folder = utils.sanitize(newProjectName.value.trim())

  const project: Project = {
    id: utils.uid(),
    name: newProjectName.value.trim(),
    folder: folder,
    filePath: videoFilePath.value || '',
    createdAt: utils.getCurrentDataTime(),
    cuts: null,
    classes: null,
    detections: null,
  }

  try {
    // try to create the project folder first
    await window.sys.createFolder(`${store.workSpacePath}/projects/${folder}`)
  }
  catch (e) {
    console.error('Error creating project folder:', e)
    return q.dialog({ title: 'Error', message: e instanceof Error ? e.message : String(e) })
  }
  
  wp.workspace?.projects.unshift(project)
  await wp.persist()

  newProjectAlert.value = false
}

async function deleteProject(project: Project) {
  try {
    // delete folder
    await window.sys.deleteFolder(`${store.workSpacePath}/projects/${project.folder}`)
    // delete the project in the workspace
    const index = wp.workspace?.projects.findIndex(p => p.id === project.id)
    if (index !== undefined && index >= 0) {
      wp.workspace?.projects.splice(index, 1)
      wp.persist()
    }

    wp.selectedProject = null
  } 
  catch (e) {
    console.error('Error deleting project folder:', e)
    q.dialog({ title: 'Error', message: e instanceof Error ? e.message : String(e) })
  }
}

async function selectFile() {
  const filePath = await window.sys.pickFile()
  if (filePath) {
    console.log('Selected file:', filePath)
    videoFilePath.value = filePath
  }
  else {
    console.log('No file selected')
    videoFilePath.value = null
  }
}

onMounted(async () => {

});

</script>
  