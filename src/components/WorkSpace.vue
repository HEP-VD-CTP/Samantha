<template>
  <q-page style="width:100%" class="row items-center justify-evenly">
    <q-card>
      <q-card-section>
        <div v-if="workspace == null" class="text-center">
          <div class="text-h6">Workspace</div>
          <div class="text-subtitle2">Select a new or existing workspace on your file system to get started.</div>
          
          <q-separator class="q-my-md" />

          <q-btn @click="pickFolder" class="q-mb-md" color="primary" label="Select Workspace" />
        </div>
        <div v-else style="min-width:400px;border:0px solid red">
          <div class="text-center">
            <div class="text-h6">
              Setting up workspace 
              <q-spinner-ios v-if="!setupDone" color="primary" size="1em"/>
              <q-icon v-else color="positive" name="check" />
            </div>
            <div class="text-subtitle2">Path: {{ workspace }}</div>
          </div>
          
          <q-separator class="q-my-md" />

          <q-list>
            <q-item dense v-for="(item, index) in setupText" clickable v-ripple> 
              <q-item-section>
                <q-item-label>{{ item }}</q-item-label>
              </q-item-section>
              <q-item-section avatar>
                <q-icon v-if="(index < setupText.length - 1) || setupDone" color="positive" name="check" />
                <q-spinner-ios v-else color="primary" size="1.5em"/>
              </q-item-section>
            </q-item>
          </q-list>

        </div>
      </q-card-section>
    </q-card>    
  </q-page>
</template>
  
<script setup lang="ts">
//import { app } from 'electron';
import { ref, onMounted } from 'vue';
import { type Ref } from 'vue';
import { appStore } from 'stores/appStore'
import { useQuasar, QVueGlobals } from 'quasar'
import { wpStore } from 'src/stores/wpStore';

const q: QVueGlobals = useQuasar()
const store = appStore()
const wp = wpStore()
const workspace: Ref<string|null> = ref(null)
const setupDone: Ref<boolean|null> = ref(null)
const setupText: Ref<Array<string>> = ref([ ])

async function pickFolder() {
  const folder = await window.sys.pickFolder();
  if (folder){
    console.log('Selected Folder:', folder)
    workspace.value = folder
    await prepareWorkspace()
  }
}

async function prepareWorkspace() {
  console.log('Preparing workspace', workspace.value)
  if (workspace.value == null) 
    return
  
  try {
    await window.sys.setupWorkspace(workspace.value)
    
    setupDone.value = true
    store.workSpacePath = workspace.value

    // load wp 
    wp.loadWorkspace()

    store.appReady()
  }
  catch(err){
    q.dialog({
      title: 'Error',
      message: err instanceof Error ? err.message : String(err),
    })
    setupDone.value = false
  }
}

onMounted(async () => {
  // listen for setup progress messages
  window.electron.ipcRenderer.on('setup-progress', (_, message: string) => {
    setupText.value.push(message)
  });
  
  // if workspace is already set, prepare it
  workspace.value = store.workSpacePath
  if (workspace.value)
    await prepareWorkspace()
})

</script>
  