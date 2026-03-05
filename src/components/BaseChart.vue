<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  ArcElement,
  LineController,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
  Title,
} from 'chart.js'

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  ArcElement,
  LineController,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
  Title
)

const props = defineProps({
  type: {
    type: String,
    default: 'bar',
  },
  indexAxis: {
    type: String,
    default: 'x',
  },
  maxValue: {
    type: Number,
    default: null,
  },
  title: {
    type: String,
    default: '',
  },
  labels: {
    type: Array,
    default: () => [],
  },
  datasets: {
    type: Array,
    default: () => [],
  },
  stacked: {
    type: Boolean,
    default: false,
  },
})

const canvasRef = ref(null)
let chartInstance = null

function buildConfig() {
  const isBar = props.type === 'bar'
  const isLine = props.type === 'line'
  const isPie = props.type === 'pie'
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
      },
      title: {
        display: !!props.title,
        text: props.title,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
  }
  if (isBar) {
    options.indexAxis = props.indexAxis === 'y' ? 'y' : 'x'
  }
  if (isBar || isLine) {
    const horizontalBar = isBar && options.indexAxis === 'y'
    const numericAxis = horizontalBar ? 'x' : 'y'
    const categoryAxis = horizontalBar ? 'y' : 'x'

    options.scales = {
      [categoryAxis]: {
        stacked: props.stacked,
      },
      [numericAxis]: {
        stacked: props.stacked,
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
      },
    }

    if (props.maxValue != null && Number.isFinite(props.maxValue)) {
      options.scales[numericAxis].max = props.maxValue
    }
  }
  return {
    type: props.type,
    data: {
      labels: props.labels,
      datasets: props.datasets,
    },
    options,
  }
}

function renderChart() {
  const canvas = canvasRef.value
  if (!canvas) return
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  const context = canvas.getContext('2d')
  chartInstance = new Chart(context, buildConfig())
}

onMounted(() => {
  renderChart()
})

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})

watch(
  () => ({
    type: props.type,
    indexAxis: props.indexAxis,
    maxValue: props.maxValue,
    labels: props.labels,
    datasets: props.datasets,
    stacked: props.stacked,
    title: props.title,
  }),
  () => {
    renderChart()
  },
  { deep: true }
)

function exportImage() {
  if (!chartInstance) return
  const url = chartInstance.toBase64Image()
  const link = document.createElement('a')
  link.href = url
  link.download = 'chart.png'
  link.click()
}
</script>

<template>
  <div class="chart-wrapper">
    <div class="chart-header">
      <div class="chart-title">{{ title }}</div>
      <button type="button" class="button button-ghost" @click="exportImage">
        Export PNG
      </button>
    </div>
    <div class="chart-canvas">
      <canvas ref="canvasRef" />
    </div>
  </div>
</template>

