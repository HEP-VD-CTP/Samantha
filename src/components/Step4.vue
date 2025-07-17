<template>
  <div class="col row" style="">
    
    <div class="row items-center justify-center" style="flex:1;">
      <div style="width:100%" class="q-pa-xs">
        <p class="text-center text-subtitle2">Final result</p> 
        <div>
          <video
            ref="videoRef"
            class="video-js vjs-default-skin"
            controls
            preload="auto"
            :src="filePath"
          />
        </div>
        <div class="q-mt-md text-center" style="">
          <q-btn round icon="mdi-skip-backward" color="secondary" @click="skipFrame(fps, 'backward')" class="q-mrl-sm q-mr-sm">
            <q-tooltip>Skip back {{ fps }} frames</q-tooltip>
          </q-btn>
          <q-btn round icon="mdi-skip-previous" color="secondary" @click="skipFrame(1, 'backward')" class="q-mrl-sm q-mr-sm">
            <q-tooltip>Skip back 1 frame</q-tooltip>
          </q-btn>
          <q-btn round :icon="isPlaying ? 'mdi-pause' : 'mdi-play'" color="primary" @click="togglePlay" class="q-mrl-sm q-mr-sm">
            <q-tooltip>{{ isPlaying ? 'Pause' : 'Play' }}</q-tooltip>
          </q-btn>
          <q-btn round icon="mdi-skip-next" color="secondary" @click="skipFrame(1, 'forward')" class="q-mrl-sm q-mr-sm">
            <q-tooltip>Step forward 1 frame</q-tooltip>
          </q-btn>
          <q-btn round icon="mdi-skip-forward" color="secondary" @click="skipFrame(fps, 'forward')" class="q-mrl-sm q-mr-sm">
            <q-tooltip>Skip forward {{ fps }} frames</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>
    <q-footer elevated class="bg-dark text-black" style="z-index:9999">
      <q-toolbar>
        <q-btn @click="wp.step = 3" color="primary" label="Previous" />
        <q-space/>
        <q-btn @click="openFolder" color="deep-orange" label="Open result" />
      </q-toolbar>
    </q-footer>
  </div>
</template>
    
<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import { type Ref } from 'vue'
import { appStore } from 'stores/appStore'
import { wpStore } from 'src/stores/wpStore'
import { type Project } from 'src/stores/wpStore'
import utils from 'src/utils'
import { useQuasar, QVueGlobals } from 'quasar'
import { type Detection } from 'src/stores/wpStore'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

const q: QVueGlobals = useQuasar()
const store = appStore()
const wp = wpStore()
const next: Ref<boolean> = ref(false)

const filePath: string = `file://${store.workSpacePath}/projects/${wp.selectedProject?.folder}/final.mp4?cb=${Date.now()}`
const videoRef = ref<Element|string>('')
let player: any = null
let fps = 25
const isPlaying: Ref<boolean> = ref(false)
const totalFrames: Ref<number> = ref(0)
const currentFrame: Ref<number> = ref(0)

function togglePlay() {
  const el = player || videoRef.value
  if (el) {
    if (isPlaying.value)
      el.pause()
    else
      el.play()
  }
}

function skipFrame(nbFrames: number, direction: "forward"|"backward") {
  const el = videoRef.value as HTMLVideoElement
  if (el && typeof el.currentTime === 'number') 
    el.currentTime = Math.min(el.currentTime + (direction == 'forward' ? nbFrames : -nbFrames) / fps, el.duration)
}

function openFolder() {
  window.sys.openFolder(`${store.workSpacePath}/projects/${wp.selectedProject?.folder}`)
}

onMounted(async () => {
  // get video framerate
  try {
    fps = await window.workspaceAPI.getVideoFPS(store.workSpacePath || '', filePath.split('?')[0] as string) || 25
  }
  catch (e) {
    console.error('Error getting video framerate:', e)
  }

  // video js player initialization without controls
  player = videojs(videoRef.value, { 
    autoplay: false, 
    responsive: true, 
    fluid: true,
    controlBar: {
      playToggle: false,
      volumePanel: true,
      pictureInPictureToggle: false,
      fullscreenToggle: false
    }
  })

  player.on('loadedmetadata', () => {
    const duration = (videoRef.value as HTMLVideoElement).duration
    totalFrames.value = Math.floor(duration * fps)
  })

  player.on('timeupdate', () => {
    const el = videoRef.value as HTMLVideoElement
    currentFrame.value = Math.floor(el.currentTime * fps)
  })

  // @ts-ignore
  player.on('error', () => {
    next.value = false
  })

  // @ts-ignore
  player.on('play', () => {
    isPlaying.value = true 
  })

  // @ts-ignore
  player.on('pause', () => { 
    isPlaying.value = false 
  })  
})


</script>

<style scoped>


</style>