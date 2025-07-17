<template>
  <div class="col row items-center justify-center" style="">

    <q-dialog class="full-width-dialog q-pa-xl" style="width:100%" v-model="detectModal" persistent backdrop-filter="blur(4px)">
      <div>
        <p class="text-center text-subtitle2">Detecting objects, this may take a while... <q-spinner color="primary" size="1.2em"/></p>
        <div id="detection"></div>
        <div class="text-center">
          <q-btn class="q-mt-lg align-center" label="CANCEL DETECTION" icon="mdi-cancel" color="deep-orange" @click="cancel" />
        </div>
      </div>
    </q-dialog>

    <div style="min-width: 350px;">
      <p class="text-center text-subtitle2">Object detection classes</p>
      
      <p>Please select the objects you want to detect in the video:</p>

      <div>
        <q-btn @click="selectClass(key as string)" class="q-ma-xs" v-for="(value, key) in detectionClasses" outline round :color="value.select ? `primary`: `grey`" :icon="value.icon" :key="key">
          <q-tooltip>
            {{ value.label }}
          </q-tooltip>
        </q-btn>
      </div>

    </div>

    <q-footer elevated class="bg-dark text-black" style="z-index:9999">
      <q-toolbar>
        <q-btn @click="wp.step = 1" color="primary" label="Previous" />
        <q-space/>
        <q-btn :disabled="!wp.selectedProject?.classes?.length || !wp.selectedProject?.detections" @click="wp.step = 3" color="primary" label="Next" />
        <q-btn @click="detect()" :disable="!wp.selectedProject?.classes?.length" color="deep-orange" label="Detect objects" class="q-ml-md" />
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

const q: QVueGlobals = useQuasar()
const store = appStore()
const wp = wpStore()
const detectModal: Ref<boolean> = ref(false)

const filePath: string = `${store.workSpacePath}/projects/${wp.selectedProject?.folder}/base.mp4`

let ws: WebSocket | null = null

type DetectionClassMap = {
  [className: string]: {
    label: string,
    icon: string,
    select: boolean,
    classes: Array<number>,
  }
}

const detectionClasses: Ref<DetectionClassMap> = ref({
  face: { label: 'Face', icon: 'mdi-face-recognition', select: true, classes: [-1] },
  person: { label: 'Person', icon: 'mdi-account', select: true, classes: [0] },
  vehicle: { label:'Bicycle, Car, Motorcycle, Airplane, Bus, Train, Truck, Boat', icon: 'mdi-car-multiple', select: false, classes: [1, 2, 3, 4, 5, 6, 7, 8] },
  street_object: { label:'Traffic light, Fire hydrant, Stop sign, Parking meter, Bench', icon: 'mdi-city', select: false, classes: [9, 10, 11, 12, 13] },
  animal: { label:'Bird, Cat, Dog, Horse, Sheep, Cow, Elephant, Bear, Zebra, Giraffe', icon: 'mdi-paw', select: false, classes: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
  bag: { label:'Backpack, Umbrella, Handbag, Tie, Suitcase', icon: 'mdi-bag-personal', select: false, classes: [24, 25, 26, 27, 28] },
  sports: { label:'Frisbee, Skis, Snowboard, Sports ball, Kite, Baseball bat, Baseball glove, Skateboard, Surfboard, Tennis racket', icon: 'mdi-soccer', select: false, classes: [29, 30, 31, 32, 33, 34, 35, 36, 37, 38] },
  tableware: { label:'Bottle, Wine glass, Cup, Fork, Knife, Spoon, Bowl', icon: 'mdi-bottle-soda-classic-outline', select: false, classes: [39, 40, 41, 42, 43, 44, 45] },
  food: { label:'Banana, Apple, Sandwich, Orange, Broccoli, Carrot, Hot dog, Pizza, Donut, Cake', icon: 'mdi-food', select: false, classes: [46, 47, 48, 49, 50, 51, 52, 53, 54, 55] },
  furniture: { label:'Chair, Couch, Potted plant, Bed, Dining table, Toilet', icon: 'mdi-sofa', select: false, classes: [56, 57, 58, 59, 60, 61] },
  electronics: { label:'TV, Laptop, Mouse, Remote, Keyboard, Cell phone', icon: 'mdi-monitor', select: false, classes: [62, 63, 64, 65, 66, 67] },
  kitchen: { label:'Microwave, Oven, Toaster, Sink, Refrigerator', icon: 'mdi-stove', select: false, classes: [68, 69, 70, 71, 72] },
  household_items: { label:'Book, Clock, Vase, Scissors, Teddy bear, Hair drier, Toothbrush', icon: 'mdi-home', select: false, classes: [73, 74, 75, 76, 77, 78, 79] },
})

function cancel() {
  if (ws) {
    ws.close()
    //ws = null
    console.log('close detection');
  }
  detectModal.value = false
}

async function detect(){
  if (!wp.selectedProject?.classes?.length)
    return

  ws = new WebSocket('ws://localhost:3000/detect')

  detectModal.value = true

  
  let lastObjectUrl: any = null // to hold the last object URL to avoid memory leaks
  ws.onmessage = (event) => {
    // parse json data
    if (typeof event.data === 'string' && event.data.startsWith('{')) {
      const data = JSON.parse(event.data)

      // detection is done, save the detections and go next
      if (data?.status == 'done'){
        const allSelections = data?.detections
        // add the others params for detection
        for (const selections of allSelections) {
          for (const selection of selections) {
            selection['blur'] = false
            selection['inpaint'] = false
          }
        }

        // keep only the selected classes
        for (const selections of allSelections) {
          for (let i = selections.length - 1; i >= 0; i--)
            if (!wp.selectedProject!.classes!.includes(selections[i].class))
              selections.splice(i, 1)
        }

        // save and go to next step
        wp.selectedProject!.detections = allSelections
        wp.persist()
        cancel()
        wp.step = 3

        console.log('Detection done!')
      }
    }
    else if (event.data instanceof Blob) {
      const detectionDiv = document.getElementById('detection')
      if (!detectionDiv) 
        return

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

  ws.onopen = () => {
    console.log('Detection ws connection opened')
    // send all the needed information to the server
    const data = {
      file: filePath,
      workspace: store.workSpacePath,
      classes: wp.selectedProject?.classes,
    }
    if (ws)
      ws.send(JSON.stringify(data))
  }

  ws.onclose = () => {
    console.log('Detection ws connection closed')
    detectModal.value = false
    ws = null
  }

  ws.onerror = (err) => {
    detectModal.value = false
    console.error('WebSocket error:', err)
    q.dialog({
      title: 'Error',
      message: `A WebSocket error occurred: ${err.type || err.toString()}`,
    })
  }
  
}

async function selectClass(key: string){
  if (detectionClasses.value[key] == null)
    return
  
  detectionClasses.value[key].select = !detectionClasses.value[key].select
  await persistClasses()
}

async function persistClasses() {
  const classes: Array<number> = []
  for (const [key, value] of Object.entries(detectionClasses.value)) 
    if (value.select)
      classes.push(...value.classes)

  wp.selectedProject!.classes = classes
  wp.persist()
} 

onMounted(async () => {
  // create the detection classes if it does not exist
  if (wp.selectedProject?.classes == null)
    await persistClasses()
  else {
    // if the classes are not empty, we need to sync the detection classes
    for (const [key, value] of Object.entries(detectionClasses.value)) {
      if (value.classes.some((c) => wp.selectedProject!.classes!.includes(c)))
        value.select = true
      else
        value.select = false
    }
  }
})


</script>

<style scoped>
.q-dialog__inner > div {
  width: 100vw !important;
  max-width: 100vw !important;
  min-width: 50vw !important;
  box-sizing: border-box;
}
</style>