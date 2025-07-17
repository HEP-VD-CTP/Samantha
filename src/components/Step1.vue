<template>
  <div class="col row" style="">
    <div class="" style="width:170px;float:left;border-right:1px solid grey;">
      <p class="text-center text-subtitle2 q-mt-lg">Cuts</p> 
      <q-scroll-area visible style="height: calc(100vh - 150px)">
        <q-item-label header v-if="!cuts.length">No cuts</q-item-label>
        <q-list separator>
          <q-item :focused="currentFrame==item" dense v-for="(item, index) in cuts" clickable v-ripple>
            <q-item-section @click="goToFrame(item)">{{ frameToTime(item, fps) }}</q-item-section>
            <q-item-section avatar>
              <q-btn @click="cut(item)" flat dense round icon="clear" />  
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </div>
    <div class="row items-center justify-center" style="flex:1;">
      <div style="width:100%" class="q-pa-xs">
        <p class="text-center text-subtitle2">Cut and encode video</p> 
        <div :class="['video-wrapper', { 'show-stripes':   ranges.some(([start, end]) => typeof start === 'number' && typeof end === 'number' && currentFrame >= start && currentFrame <= end) }]"
          :style="{ '--progress-gradient': progressGradient }">
          <video style="border:1px solid grey; border-radius: 5px;"
            ref="videoRef"
            class="video-js vjs-default-skin"
            controls
            preload="auto"
            :src="videoSrc"
          />
          <q-btn @click="cut(currentFrame)" style="position:absolute; z-index: 30;bottom:10%;right:5%" size="xl" color="red-14" :label="cuts.includes(currentFrame) ? 'UNCUT' : 'CUT' " icon="mdi-content-cut"/>
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
        <q-btn @click="wp.step = 0" color="primary" label="Previous" />
        <q-space/>
        <q-btn @click="wp.step = 2" color="primary" label="Next" :disable="!next" />
        <q-btn @click="encode()" color="deep-orange" label="Encode video" class="q-ml-md" />
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
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

const q: QVueGlobals = useQuasar()
const store = appStore()
const wp = wpStore()
const next: Ref<boolean> = ref(false)

const videoSrc: Ref<string> = ref(`file://${wp.selectedProject?.filePath}`)
const videoRef = ref<Element|string>('')
let player: any = null
let fps = 25
const isPlaying: Ref<boolean> = ref(false)
const totalFrames: Ref<number> = ref(0)
const currentFrame: Ref<number> = ref(0)
const cuts: Ref<Array<number>> = ref([])
const ranges: Ref<Array<Array<number>>> = ref([])

  
function computeRange(){
  // copy the cuts
  const r = cuts.value.map(Number)
  // add the last frame if the number of cuts is odd
  if (r.length % 2 === 1)
    r.push(totalFrames.value)
  
  // group the cuts in pairs
  ranges.value = []
  for (let i = 0; i < r.length; i += 2) {
    // @ts-ignore
    ranges.value.push([r[i], r[i + 1]])
  }
}

function cut(frame: number){
  // if the frame is already in the cuts, remove it
  if (cuts.value.includes(frame)) 
    cuts.value = cuts.value.filter((item) => item !== frame)
  else {
    // otherwise add it at the right place 
    const index = cuts.value.findIndex((item) => item > frame)
    if (index === -1) 
      cuts.value.push(frame)
    else 
      cuts.value.splice(index, 0, frame)
  }

  computeRange()
  //persistCuts()
}

function persistCuts(){
  wp.selectedProject!.cuts = cuts.value
  wp.persist()
}

// compute the ranges for the video progress bar
const progressGradient = computed(() => {
  if (!totalFrames.value || !ranges.value.length) {
    return 'linear-gradient(to right, #4caf50 0%, #4caf50 100%)';
  }
  let stops: string[] = [];
  let last = 0;

  const sortedRanges = ranges.value
    .filter(([start, end]) => typeof start === 'number' && typeof end === 'number')
    // @ts-ignore
    .sort((a, b) => a[0] - b[0])
  sortedRanges.forEach(([start, end]) => {
    // @ts-ignore
    const startPct = Math.max(0, Math.min(100, (start / totalFrames.value) * 100))
    // @ts-ignore
    const endPct = Math.max(0, Math.min(100, (end / totalFrames.value) * 100))
    if (startPct > last) 
      stops.push(`#4caf50 ${last}%`, `#4caf50 ${startPct}%`)
    stops.push(`#f44336 ${startPct}%`, `#f44336 ${endPct}%`)
    last = endPct
  })
  if (last < 100) {
    stops.push(`#4caf50 ${last}%`, `#4caf50 100%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`
})

// go to a specific frame
function goToFrame(frame: number) {
  if (player)
    player.currentTime(Math.min(frame / fps, player.duration()))
}

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

function frameToTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return (
    hours.toString().padStart(2, '0') + ':' +
    minutes.toString().padStart(2, '0') + ':' +
    seconds.toFixed(3).padStart(6, '0')
  )
}

async function encode(){
  q.loading.show({
    message: 'Video encoding in progress. This may take a while...',
  })
  // inverts cut ranges 
  // ffmpeg need the ranges to kept and not removed
  const keep: [number, number][] = []
  let last = 0
  for (const [start, end] of ranges.value as [number, number][]) {
    if (start > last) 
      keep.push([last, start])
    last = Math.max(last, end) 
  }
  if (last < totalFrames.value) 
    keep.push([last, totalFrames.value])

  // convert frames to time
  const rangesTimes: [string, string, number][] = keep.map(tuple => [
    frameToTime(tuple[0], fps), 
    frameToTime(tuple[1], fps),
    (tuple[1] - tuple[0]) / fps // range duration
  ])
  
  // encode the video
  try {
    await window.workspaceAPI.cutAndEncodeVideo(
      store.workSpacePath || '',
      wp.selectedProject?.folder || '',
      wp.selectedProject?.filePath || '', 
      rangesTimes,
    )
  }
  catch(err){
    console.error('Error encoding video:', err)
    q.dialog({
      title: 'Error',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  // persist the cuts
  persistCuts()

  next.value = true

  q.loading.hide()

  wp.step = 2
}

onMounted(async () => {
  // get video framerate
  try {
    fps = await window.workspaceAPI.getVideoFPS(store.workSpacePath || '', wp.selectedProject?.filePath || '') || 25
    console.log('FPS:', fps)
  }
  catch (e) {
    console.error('Error getting video framerate:', e)
  }

  // load cuts
  cuts.value = wp.selectedProject?.cuts || []
  
  // check if the video has already been encoded
  next.value = await window.workspaceAPI.fileExists(store.workSpacePath || '', wp.selectedProject?.folder || '')

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
    console.log('Video loaded')
    const duration = (videoRef.value as HTMLVideoElement).duration
    totalFrames.value = Math.round(duration * fps)
    computeRange()
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

.video-wrapper {
  position: relative;
}

/* Hide stripes by default */
:deep(.video-wrapper .video-js::after) {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: none;
  pointer-events: none;
  border-radius: 5px;
  z-index: 1;
}

/* Show stripes only when .show-stripes is present */
:deep(.video-wrapper.show-stripes .video-js::after) {
  background: repeating-linear-gradient(
    45deg,
    rgba(255,0,0,0.3) 0px,
    rgba(255,0,0,0.3) 20px,
    transparent 20px,
    transparent 40px
  );
}

/* colorize the progress bar */
:deep(.video-js .vjs-progress-holder)::before {
  content: '';
  position: absolute;
  left: 0; top: 0; right: 0; bottom: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: 4px;
  background: var(--progress-gradient, #4caf50);
}

/* always show the progress bar even when inactive */
:deep(.video-js.vjs-user-inactive .vjs-control-bar) {
  z-index: 2;
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
  transition: none !important;
}

:deep(.video-js .vjs-control-bar) {
  z-index: 10 !important;
  
}



</style>