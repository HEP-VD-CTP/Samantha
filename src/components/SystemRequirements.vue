<template>
  <q-page style="width:100%" class="row items-center justify-evenly">
    <q-card>
      <q-card-section>
        <div class="text-h6">Samantha</div>
        <div class="text-subtitle2">Minimum system requirements</div>
      </q-card-section>
      <q-card-section>
        <q-list>
          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon v-if="platform.name == 'Windows'" color="primary" name="mdi-microsoft-windows" />
              <q-icon v-else-if="platform.name == 'macOS'" color="primary" name="mdi-apple" />
              <q-icon v-else-if="platform.name == 'Linux'" color="primary" name="mdi-linux" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ `${platform.name} ${platform.version} - ${platform.arch}` }}</q-item-label>
            </q-item-section>
            <q-item-section avatar>
              <q-icon color="positive" name="check" />
            </q-item-section>
          </q-item>

          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon color="primary" name="mdi-chip" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ `${cpu.model} ${cpu.cores}c @${cpu.speed} MHz` }}</q-item-label>
              <q-item-label caption>Minimum: modern CPU with 4+ cores</q-item-label>
            </q-item-section>
            <q-item-section avatar>
              <q-icon v-if="okCPU" color="positive" name="check" />
              <q-icon v-else color="negative" name="clear" />
            </q-item-section>
          </q-item>

          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon color="primary" name="mdi-memory" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ memory }} GB system memory</q-item-label>
              <q-item-label caption>Minimum system memory: 16+ GB</q-item-label>
            </q-item-section>
            <q-item-section avatar>
              <q-icon v-if="okMemory" color="positive" name="check" />
              <q-icon v-else color="negative" name="clear" />
            </q-item-section>
          </q-item>

          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon color="primary" name="mdi-expansion-card" />
            </q-item-section>
            <q-item-section>
              <q-item-label v-if="gpu.mps">{{ gpu.name }}</q-item-label>
              <q-item-label v-else>{{ gpu.name }} - {{ gpu.memory }}GB</q-item-label>
              <q-item-label caption>MPS or  12+ GB CUDA compatible GPU</q-item-label>
            </q-item-section>
            <q-item-section avatar>
              <q-icon v-if="okGPU" color="positive" name="check" />
              <q-icon v-else color="negative" name="clear" />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
      <q-card-section>
        <p v-if="okSystem">Your computer is ready ! <q-icon color="positive" name="check" size="sm" /></p>
        <p v-else>Your computer does not meet<br/> the minimum system requirements <q-icon color="negative" name="clear" size="sm" /></p>
      </q-card-section> 
      <q-card-actions v-if="okSystem" align="right">
        <q-btn color="primary" flat @click="store.sysOK = true">Continue</q-btn>
      </q-card-actions>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
//import { app } from 'electron';
import { ref, onMounted } from 'vue';
import { type Ref } from 'vue';
import { appStore } from 'stores/appStore'

const store = appStore()

const platform = window.sys.platform()
const cpu = window.sys.cpu()
const memory = Math.round(window.sys.mem)
const gpu = window.sys.gpu()

const okCPU: Ref<boolean> = ref(false)
const okMemory: Ref<boolean> = ref(false)
const okGPU: Ref<boolean> = ref(false)
const okSystem: Ref<boolean> = ref(false) 

onMounted(() => {
  if (cpu.cores >= 4) 
    okCPU.value = true
  if (window.sys.mem >= 16) 
    okMemory.value = true
  if (gpu.mps || (gpu.cuda && gpu.memory >= 12))
    okGPU.value = true

  if (okCPU.value && okMemory.value && okGPU.value){
    okSystem.value = true 

    // automatically move to the next step
    setTimeout(() => {
      store.sysOK = true
    }, 1000)
  }
});

</script>
  