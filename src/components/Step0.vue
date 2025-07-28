<template>
  <div class="col row items-center justify-center">
    <div style="width:100%; max-width: 800px;">
      <div>
        <p class="text-center text-subtitle2">Video: {{ wp.selectedProject?.filePath }}</p> 
        <div v-if="next">
          <video
            ref="videoRef"
            class="video-js vjs-default-skin"
            controls
            preload="auto"
            :src="videoSrc"
          />
        </div>
        <div v-else>
          <p class="text-center text-h6">
            <q-icon name="warning" color="orange" size="xl" />
            An error has occurred while loading the video
            <q-icon name="warning" color="orange" size="xl" />
          </p>
        </div>
      </div>
    </div>
    <q-footer class="bg-dark text-black" elevated>
      <q-toolbar>
        <q-space/>
        <q-btn @click="wp.step = 1" color="primary" label="Next" :disable="!next" />
      </q-toolbar>
    </q-footer>
  </div>
</template>
  
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { type Ref } from 'vue'
import { appStore } from 'stores/appStore'
import { wpStore } from 'src/stores/wpStore'
import { useQuasar, QVueGlobals } from 'quasar'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

const q: QVueGlobals = useQuasar()
const store = appStore()
const wp = wpStore()
const next: Ref<boolean> = ref(true)

const videoSrc: string = `file://${wp.selectedProject?.filePath}`
const videoRef = ref<Element|string>('')
let player = null

onMounted(async () => {
  // @ts-ignore
  videoRef.value.addEventListener('loadeddata', () => {
    next.value = true
  })

  // @ts-ignore
  videoRef.value.addEventListener('error', () => {
    next.value = false
  })

  player = videojs(videoRef.value, { autoplay: false, controls: true, responsive: true, fluid: true})
})

</script>
  