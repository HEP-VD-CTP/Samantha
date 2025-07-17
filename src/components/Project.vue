<template>
  <q-page style="width:100%" class="q-pl-xs q-pt-xs q-pr-xs fit column">
    <q-breadcrumbs>
      <q-breadcrumbs-el @click="wp.step = 0" class="cursor-pointer"
        :label="wp.selectedProject?.name ? `${wp.selectedProject.name.slice(0, 10)}${wp.selectedProject.name.length > 10 ? '...' : ''}`: ''"/>      
      
      <q-breadcrumbs-el v-if="wp.step >= 1" @click="wp.step = 1" class="cursor-pointer" label="Video encoding" />

      <q-breadcrumbs-el v-if="wp.step >= 2" @click="wp.step = 2" class="cursor-pointer" label="Object detection" />

      <q-breadcrumbs-el v-if="wp.step >= 3" @click="wp.step = 3" class="cursor-pointer" label="Object selection" />

      <q-breadcrumbs-el v-if="wp.step >= 4" @click="wp.step = 3" class="cursor-pointer" label="Final result" />
      
    </q-breadcrumbs>
    <div class="col fit column">
      <Step0 v-if="wp.step == 0" class="" />
      <Step1 v-else-if="wp.step == 1" class="" />
      <Step2 v-else-if="wp.step == 2" class="" />
      <Step3 v-else-if="wp.step == 3" class="" />
      <Step4 v-else-if="wp.step == 4" class="" />
    </div>
    
  </q-page>
</template>
  
<script setup lang="ts">
//import { app } from 'electron';
import { ref, onMounted, watch } from 'vue'
import { type Ref } from 'vue'
import { appStore } from 'stores/appStore'
import { wpStore } from 'src/stores/wpStore'
import { type Project } from 'src/stores/wpStore'
import utils from 'src/utils'
import { useQuasar, QVueGlobals } from 'quasar'
import Step0 from 'src/components/Step0.vue'
import Step1 from 'src/components/Step1.vue'
import Step2 from 'src/components/Step2.vue'
import Step3 from 'src/components/Step3.vue'
import Step4 from 'src/components/Step4.vue'

const q: QVueGlobals = useQuasar()
const store = appStore()
const wp = wpStore()

onMounted(async () => {

})

</script>
  