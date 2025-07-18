<template>
  <div class="col row" style="">
    <q-dialog class="full-width-dialog q-pa-xl" style="width:100%" v-model="anonymizationModal" persistent backdrop-filter="blur(4px)">
      <div>
        <p class="text-center text-subtitle2">Anonymization, this may take a while... <q-spinner color="primary" size="1.2em"/></p>
        <div id="detection"></div>
        <div class="text-center">
          <q-btn class="q-mt-lg align-center" label="CANCEL ANONYMIZATION" icon="mdi-cancel" color="deep-orange" @click="cancel" />
        </div>
      </div>
    </q-dialog>

    <div class="" style="width:200px;float:left;border-right:1px solid grey;">
      <p class="text-center text-subtitle2 q-mt-lg">Detections</p> 
      <q-scroll-area visible style="height: calc(100vh - 150px)">
        <q-list separator>
          <q-item 
            v-if="wp.selectedProject?.detections" v-for="(detection, index) in (wp.selectedProject?.detections[currentFrame] || []).filter(det => (wp.selectedProject?.classes || []).includes(det.cid))" dense clickable v-ripple
            class="q-pa-xs"
            :focused="detection.id == highlightedDetection?.id && detection.cid == highlightedDetection?.cid">
            <q-item-section @click="highlightDetection(detection)">{{getIcon(detection)}} {{ cocoClassMap[detection.cid.toString()] }} {{ detection.id }}</q-item-section>
            <q-item-section avatar>
              <q-btn flat dense round icon="mdi-dots-vertical">
                <q-menu>
                  <q-item @click="split(detection, currentFrame)" clickable v-close-popup>
                    <q-item-section>Split</q-item-section>
                  </q-item>
                  <q-list style="min-width: 100px">
                    <q-item @click="applyFilter(detection.cid, detection.id, true, null)" clickable v-close-popup>
                      <q-item-section>Blur</q-item-section>
                    </q-item>
                  </q-list>
                  <q-list style="min-width: 100px">
                    <q-item @click="applyFilter(detection.cid, detection.id, null, true)" clickable v-close-popup>
                      <q-item-section>Inpaint</q-item-section>
                    </q-item>
                  </q-list>
                  <q-list style="min-width: 100px">
                    <q-item @click="deleteDetection(detection.cid, detection.id)" clickable v-close-popup>
                      <q-item-section>Delete</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </div>
    <div class="row items-center justify-center" style="flex:1;">
      <div style="width:100%" class="q-pa-xs">
        <p class="text-center text-subtitle2">Select all the objects you want to anonymize</p> 
        <div style="position:relative;">
          <video
            ref="videoRef"
            class="video-js vjs-default-skin"
            controls
            preload="auto"
            :src="filePath"
          />
          <canvas
            ref="canvasRef"
            style="position:absolute; top:0; left:0; width:100%; height:100%;"
          ></canvas>
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
        <q-btn @click="wp.step = 2" color="primary" label="Previous" />
        <q-space/>
        <q-btn @click="wp.step = 4" color="primary" label="Next" :disable="!next" />
        <q-btn @click="startAnonymization()" color="deep-orange" label="start anonymization" class="q-ml-md" />
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

const filePath: string = `file://${store.workSpacePath}/projects/${wp.selectedProject?.folder}/base.mp4?cb=${Date.now()}`
const videoRef = ref<Element|string>('')
let player: any = null
let fps = 25
const isPlaying: Ref<boolean> = ref(false)
const totalFrames: Ref<number> = ref(0)
const currentFrame: Ref<number> = ref(0)
const canvasRef = ref<HTMLCanvasElement|null>(null)
const anonymizationModal: Ref<boolean> = ref(false)

const cocoClassMap: { [id: string]: string } = {
  "-1": "face",
  "0": "person",
  "1": "bicycle",
  "2": "car",
  "3": "motorcycle",
  "4": "airplane",
  "5": "bus",
  "6": "train",
  "7": "truck",
  "8": "boat",
  "9": "traffic light",
  "10": "fire hydrant",
  "11": "stop sign",
  "12": "parking meter",
  "13": "bench",
  "14": "bird",
  "15": "cat",
  "16": "dog",
  "17": "horse",
  "18": "sheep",
  "19": "cow",
  "20": "elephant",
  "21": "bear",
  "22": "zebra",
  "23": "giraffe",
  "24": "backpack",
  "25": "umbrella",
  "26": "handbag",
  "27": "tie",
  "28": "suitcase",
  "29": "frisbee",
  "30": "skis",
  "31": "snowboard",
  "32": "sports ball",
  "33": "kite",
  "34": "baseball bat",
  "35": "baseball glove",
  "36": "skateboard",
  "37": "surfboard",
  "38": "tennis racket",
  "39": "bottle",
  "40": "wine glass",
  "41": "cup",
  "42": "fork",
  "43": "knife",
  "44": "spoon",
  "45": "bowl",
  "46": "banana",
  "47": "apple",
  "48": "sandwich",
  "49": "orange",
  "50": "broccoli",
  "51": "carrot",
  "52": "hot dog",
  "53": "pizza",
  "54": "donut",
  "55": "cake",
  "56": "chair",
  "57": "couch",
  "58": "potted plant",
  "59": "bed",
  "60": "dining table",
  "61": "toilet",
  "62": "tv",
  "63": "laptop",
  "64": "mouse",
  "65": "remote",
  "66": "keyboard",
  "67": "cell phone",
  "68": "microwave",
  "69": "oven",
  "70": "toaster",
  "71": "sink",
  "72": "refrigerator",
  "73": "book",
  "74": "clock",
  "75": "vase",
  "76": "scissors",
  "77": "teddy bear",
  "78": "hair drier",
  "79": "toothbrush"
}

let iconHitboxes: Array<{x: number, y: number, w: number, h: number, cid: number, detid: number, isSplit?: boolean,   detection?: Detection, frame?: number}> = []
const highlightedDetection = ref<{ cid: number, id: number } | null>(null)

function deleteDetection(cid: number, id: number) {
  for (const detections of wp.selectedProject?.detections || []) {
    for (const detection of detections) {
      if (detection.cid === cid && detection.id === id) {
        detections.splice(detections.indexOf(detection), 1)
      }
    }
  }
  wp.persist()
  drawDetections()
}

function highlightDetection(detection:  Detection){
  highlightedDetection.value = { cid: detection.cid, id: detection.id }
  drawDetections()
}

function getIcon(det: Detection){
  if (det.blur)
    return '☁️'
  else if (det.inpaint)
    return '🚫'
  return '🟢'
}

function split(detection: Detection, frame: number) {
  if (!wp.selectedProject?.detections) return

  // Find all ids for this class
  const allIds = new Set<number>()
  for (const frameDetections of wp.selectedProject.detections) {
    for (const det of frameDetections) {
      if (det.cid === detection.cid) {
        allIds.add(det.id)
      }
    }
  }

  // Generate a new id (max id + 1)
  let newId = Math.max(...Array.from(allIds)) + 1

  // Always look for the original id in all future frames
  const originalId = detection.id

  // For all frames from 'frame' to the end, update the detection
  for (let f = frame; f < wp.selectedProject.detections.length; f++) {
    const frameDetections = wp.selectedProject.detections[f]
    for (const det of frameDetections || []) {
      if (det.cid === detection.cid && det.id === originalId) {
        det.id = newId
        det.blur = false
        det.inpaint = false
      }
    }
  }

  drawDetections()
  wp.persist()
}

function drawDetections() {
  const detections = wp.selectedProject?.detections?.[currentFrame.value] || []
  const allowedClasses = wp.selectedProject?.classes || []
  const video = videoRef.value as HTMLVideoElement
  const canvas = canvasRef.value
  if (!canvas || !video) return

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  iconHitboxes = []

  // Split detections into normal and highlighted
  let highlighted: Detection | null = null
  const filtered = detections.filter(det => allowedClasses.includes(det.cid))
  filtered.forEach(det => {
    if (highlightedDetection.value && det.cid === highlightedDetection.value.cid && det.id === highlightedDetection.value.id) {
      highlighted = det
    } 
    else {
      drawDetection(ctx, det)
    }
  })
  if (highlighted) 
    drawDetection(ctx, highlighted, true)

  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
}

// Helper to draw a single detection (optionally highlighted)
function drawDetection(ctx: CanvasRenderingContext2D, det: Detection, isHighlight = false) {
  const { x1, y1, x2, y2 } = det.pos
  ctx.font = '30px Arial'
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
  const icon = getIcon(det)
  const labelMain = `${icon} ${cocoClassMap[det.cid.toString()]} ${det.id} `
  const splitIcon = '⎇'
  const textWidth = ctx.measureText(labelMain).width
  const splitIconWidth = ctx.measureText(splitIcon).width
  const labelX = x1 + 8
  const labelY = y1 - 16

  // Draw label background
  const padding = 5
  ctx.fillStyle = isHighlight ? 'rgba(255,215,0,0.8)' : 'rgba(0,0,0,0.6)'
  ctx.fillRect(
    labelX - 6 - padding,
    y1 - 34 - padding - 8,
    textWidth + splitIconWidth + 12 + 2 * padding,
    34 + 2 * padding
  )

  // Draw bounding box
  ctx.strokeStyle = isHighlight ? '#FFD600' : (det.inpaint ? '#FF4136' : (det.blur ? '#0074D9' : '#00FF00'));
  ctx.lineWidth = isHighlight ? 8 : 6
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

  // Draw label text (all except the split icon)
  ctx.fillStyle = '#fff'
  ctx.fillText(labelMain, labelX, labelY)

  // Draw the split icon in a different color (e.g., orange)
  ctx.fillStyle = '#FFA500'
  ctx.fillText(splitIcon, labelX + textWidth, labelY)

  // Store icon hitbox (for click detection)
  const iconWidth = ctx.measureText(icon).width
  iconHitboxes.push({
    x: labelX,
    y: labelY - 30 + 8,
    w: iconWidth,
    h: 30,
    cid: det.cid,
    detid: det.id
  })

  // Store split icon hitbox for click detection
  iconHitboxes.push({
    x: labelX + textWidth,
    y: labelY - 30 + 8,
    w: splitIconWidth,
    h: 30,
    cid: det.cid,
    detid: det.id,
    isSplit: true, // mark this as the split icon
    detection: det,
    frame: currentFrame.value
  })
}

function onVideoFrame(now: number, metadata: VideoFrameCallbackMetadata) {
  const el = videoRef.value as HTMLVideoElement
  currentFrame.value = Math.floor(el.currentTime * fps)
  drawDetections()
  el.requestVideoFrameCallback(onVideoFrame)
}

function togglePlay() {
  const el = player || videoRef.value
  if (el) {
    el.play()
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

function applyFilter(cid: number, detId: number, blur: boolean|null = null, inpaint: boolean|null = null) {
  for (const detections of wp.selectedProject?.detections || []) {
    for (const detection of detections) {
      if (detection.cid === cid && detection.id === detId){
        // we want to set the blur
        if (blur !== null) {
          detection.blur = blur
          detection.inpaint = false
        }
        // we want to set the inpaint
        else if (inpaint !== null) {
          detection.inpaint = inpaint
          detection.blur = false
        }
        // no filter was specified, toggle the current state
        else {
          // if none is selected, we blur
          if (!detection.blur && !detection.inpaint){
            detection.blur = true
            detection.inpaint = false
          }
          else if (detection.blur && !detection.inpaint){
            detection.blur = false
            detection.inpaint = true
          }
          else {
            detection.blur = false
            detection.inpaint = false
          }
        }
      }
    }
  }
  drawDetections()
  wp.persist()
}

let ws: WebSocket | null = null
async function startAnonymization(){
  ws = new WebSocket('ws://localhost:3000/anonymize')
  anonymizationModal.value = true

  let lastObjectUrl: any = null
  ws.onmessage = (event) => {
    // parse json data
    if (typeof event.data === 'string' && event.data.startsWith('{')) {
      const data = JSON.parse(event.data)
      
      // detection is done, save the detections and go next
      if (data?.status == 'done'){
        console.log(`Anonymization done !`)
        wp.step = 4
      }
    }
    else if (event.data instanceof Blob) {
      const detectionDiv = document.getElementById('detection')
      if (detectionDiv) {
        // Remove all previous images
        detectionDiv.innerHTML = ''
        // Add the new image
        const img = document.createElement('img')
        img.id = 'detection-img'
        img.style.display = 'block'
        
        img.style.margin = 'auto'
        img.style.maxWidth = '100%'
        img.style.height = 'auto'

        // Revoke the previous object URL to free memory
        if (lastObjectUrl) 
          URL.revokeObjectURL(lastObjectUrl)

        img.src = URL.createObjectURL(event.data)
        lastObjectUrl = img.src

        detectionDiv.appendChild(img)
      }
    }
  }

  ws.onopen = () => {
    console.log('Anonymization ws connection opened')
    // send all the needed information to the server
    const data = {
      file: filePath.split('?')[0],
      workspace: store.workSpacePath,
      name: wp.selectedProject?.name,
      detections: wp.selectedProject?.detections,
    }
    if (ws)
      ws.send(JSON.stringify(data))
  }

  ws.onclose = () => {
    console.log('Anonymization ws connection closed')
    anonymizationModal.value = false
  }

  ws.onerror = (err) => {
    anonymizationModal.value = false
    console.error('WebSocket error:', err)
    q.dialog({
      title: 'Error',
      message: `A WebSocket error occurred: ${err.type || err.toString()}`,
    })
  }
}

function cancel() {
  if (ws) {
    ws.close()
    ws = null
  }
  anonymizationModal.value = false
}

onMounted(async () => {
  // get video framerate
  try {

    console.log()

    fps = await window.workspaceAPI.getVideoFPS(store.workSpacePath || '', filePath.split('?')[0] as string) || 25
    console.log('FPS:', fps)

    next.value = await window.workspaceAPI.fileExists(store.workSpacePath || '', wp.selectedProject?.folder || '')
  }
  catch (e) {
    console.error(`Error: ${e}`)
  }

  const el = videoRef.value as HTMLVideoElement
  el.requestVideoFrameCallback(onVideoFrame)
  
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
    drawDetections()
  })

  player.on('timeupdate', () => {
    const el = videoRef.value as HTMLVideoElement
    currentFrame.value = Math.floor(el.currentTime * fps)
    drawDetections()
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

  // make the canvas clickable
  const canvas = canvasRef.value
  if (canvas) {
    // split icon hover effect
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY
      let overIcon = false
      for (const hit of iconHitboxes) {
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
          overIcon = true
          break
        }
      }
      canvas.style.cursor = overIcon ? 'pointer' : 'default'
    })

    canvas.addEventListener('click', (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY
      for (const hit of iconHitboxes) {
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
          if (hit.isSplit) {
            if (hit.detection && typeof hit.frame === 'number') {
              split(hit.detection, hit.frame)
            }
            break
          } 
          else {
            applyFilter(hit.cid, hit.detid)
            break
          }
        }
      }
    })
  }
})


</script>

<style scoped>
:deep(.vjs-big-play-button) {
  display: none !important;
}

:deep(.vjs-control-bar) {
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
  z-index: 10 !important;
  transition: none !important;
}

:deep(.vjs-has-started .vjs-control-bar) {
  display: flex !important;
}

.q-dialog__inner > div {
  width: 100vw !important;
  max-width: 100vw !important;
  min-width: 50vw !important;
  box-sizing: border-box;
}

</style>