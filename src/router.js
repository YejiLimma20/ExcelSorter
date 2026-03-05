import { createRouter, createWebHistory } from 'vue-router'
import UploadView from './views/UploadView.vue'

const routes = [
  { path: '/', redirect: '/upload' },
  { path: '/upload', component: UploadView },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
