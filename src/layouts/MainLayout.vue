<template>
  <q-dialog v-model="about" persistent>
    <q-card>
      <q-card-section>
        <div class="text-h6">About</div>
      </q-card-section>

      <q-card-section class="q-pt-none text-justify">
        <p>
          This anonymization software was developed at the University of Teacher Education, Vaud (HEP Vaud), 
          to facilitate the ethical and secure handling of sensitive data used in research and educational projects.
          It enables the automatic anonymization of video files by removing or pseudonymizing personally identifiable information, 
          while ensuring traceability and reproducibility of the applied processes.
        </p>

        <p>
          Designed to meet the specific needs of the academic environment, the tool emphasizes ease of use, process transparency, 
          and compliance with current ethical and legal standards, including data protection regulations (GDPR, Swiss FADP).
        </p>

        <p>
          The development of this software is part of a broader commitment to responsible research and open knowledge sharing, 
          offering a free, adaptable, and sustainable solution to the educational community.
        </p>
        
        <q-separator class="q-my-md" />

        <div class="text-center">
          <img width="350px" src="img/logo-hep-vaud.svg" /><br/><br/>
          Haute École Pédagogique Vaud (HEP-Vaud)<br />
          Centre de soutien à l’e-learning (CSeL)<br/>
          Avenue de Cour 33<br/>
          1014 Lausanne, Switzerland<br />
          <a href="https://www.hepl.ch" style="color:inherit" target="_blank">www.hepl.ch</a><br />
        </div>

      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="OK" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <q-layout view="lHh Lpr lFf">

    <q-drawer v-model="drawer" show-if-above :mini="true" :breakpoint="0" bordered class="bg-dark">
      <div class="column fit" style="overflow: hidden;">
        <q-scroll-area class="col">
          <q-list v-if="store.ready">
            <q-item @click="store.openTab('projects')" :style="store.tab == 'projects' ? `border-left:3px solid #1976D2`:``" :active="store.tab == 'projects'" clickable v-ripple>
              <q-item-section avatar>
                <q-icon name="mdi-file-multiple" />
              </q-item-section>
            </q-item>
            <q-separator />
          </q-list>
        </q-scroll-area>

        <q-item @click="about = true" clickable v-ripple>
          <q-item-section avatar>
            <q-icon name="mdi-information" />
          </q-item-section> 
        </q-item>
      </div>
    </q-drawer>

    <q-page-container class="fit">

      <q-splitter v-model="store.splitter" 
                  :limits="[0, store.upperLimit]" 
                  separator-class="bg-grey" 
                  :separator-style="store.upperLimit > 0 ? `width: 2px`: `width: 0px`" 
                  class="fit">
        <template v-slot:before>
          <Projects v-if="store.tab == 'projects'" />
        </template>
        <template v-slot:after>
          <template v-if="!store.sysOK">
            <SystemRequirements />
          </template>
          <template v-else>
            <WorkSpace v-if="!store.ready" />
            <div v-else>
              <NoProject v-if="wp.selectedProject == null" />
              <Project v-else />
            </div>
          </template>
        </template>
      </q-splitter>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { type Ref } from 'vue'
import { useQuasar, QVueGlobals } from 'quasar'
import { appStore } from 'stores/appStore'
import { wpStore } from 'src/stores/wpStore'
import SystemRequirements from 'src/components/SystemRequirements.vue'
import WorkSpace from 'src/components/WorkSpace.vue'
import Projects from 'src/components/Projects.vue'
import NoProject from 'src/components/NoProject.vue'
import Project from 'src/components/Project.vue'

const store = appStore()
const wp = wpStore()
const drawer: Ref<boolean> = ref(true)

const about: Ref<boolean> = ref(false)
const q: QVueGlobals = useQuasar()

onMounted(() => {
  q.dark.set(true)
})

</script>
