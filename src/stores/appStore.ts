import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Ref } from 'vue'

export const appStore = defineStore('appStore', () => {
  const ready: Ref<boolean> = ref(false)
  
  const sysOK: Ref<boolean> = ref(false)

  // /Users/marcel/samantha
  const workSpacePath: Ref<string|null> = ref(null)

  const splitter: Ref<number> = ref(0)
  const upperLimit: Ref<number> = ref(0)

  const tab: Ref<"projects"|null> = ref(null)

  function appReady(){
    console.log('appReady')
    tab.value = 'projects'
    ready.value = true
    splitter.value = 25
    upperLimit.value = 100
  }

  let oldTabSize = 0
  function openTab(tabName: "projects"){
    if (tab.value == null) {
      tab.value = tabName
      upperLimit.value = 100
      splitter.value = oldTabSize
    }
    else if (tab.value == tabName) {
      oldTabSize = splitter.value
      tab.value = null
      splitter.value = 0
      upperLimit.value = 0
    }
  }

  return {
    tab,
    openTab,
    appReady,
    ready,
    sysOK,
    workSpacePath,
    splitter,
    upperLimit
  }
})
