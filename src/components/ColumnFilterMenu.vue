<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  column: {
    type: String,
    required: true,
  },
  values: {
    type: Array,
    default: () => [],
  },
  modelValue: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits([
  'update:modelValue',
  'confirm',
  'cancel',
  'sortAsc',
  'sortDesc',
  'clearSort',
])

const localSelected = ref([...props.modelValue])
const search = ref('')

watch(
  () => props.modelValue,
  (value) => {
    localSelected.value = [...value]
  }
)

const filteredValues = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return props.values
  return props.values.filter((value) => String(value).toLowerCase().includes(term))
})

function toggleValue(value) {
  const current = new Set(localSelected.value)
  if (current.has(value)) {
    current.delete(value)
  } else {
    current.add(value)
  }
  localSelected.value = Array.from(current)
}

function isChecked(value) {
  return localSelected.value.includes(value)
}

function selectAll() {
  localSelected.value = [...props.values]
}

function clearSelection() {
  localSelected.value = []
}

function confirm() {
  emit('update:modelValue', localSelected.value)
  emit('confirm', localSelected.value)
}

function cancel() {
  localSelected.value = [...props.modelValue]
  emit('cancel')
}

function handleSortAsc() {
  emit('sortAsc')
}

function handleSortDesc() {
  emit('sortDesc')
}

function handleClearSort() {
  emit('clearSort')
}
</script>

<template>
  <div class="filter-menu" @click.stop>
    <div class="filter-menu-section filter-menu-section-actions">
      <button type="button" class="filter-menu-item" @click="handleSortAsc">
        Sort A to Z
      </button>
      <button type="button" class="filter-menu-item" @click="handleSortDesc">
        Sort Z to A
      </button>
      <button type="button" class="filter-menu-item" @click="handleClearSort">
        Clear sort
      </button>
    </div>
    <div class="filter-menu-section">
      <div class="filter-menu-header">Filter by values</div>
      <div class="filter-menu-toolbar">
        <button type="button" class="filter-menu-link" @click="selectAll">Select all</button>
        <span>·</span>
        <button type="button" class="filter-menu-link" @click="clearSelection">Clear</button>
      </div>
      <div class="filter-menu-search">
        <input
          v-model="search"
          type="text"
          class="input input-compact filter-search-input"
          placeholder="Search values"
        />
      </div>
      <div class="filter-menu-values">
        <label
          v-for="value in filteredValues"
          :key="value"
          class="filter-menu-checkbox"
        >
          <input
            type="checkbox"
            :checked="isChecked(value)"
            @change="() => toggleValue(value)"
          />
          <span>{{ value }}</span>
        </label>
        <div v-if="!filteredValues.length" class="filter-menu-empty">
          No values match this search.
        </div>
      </div>
    </div>
    <div class="filter-menu-footer">
      <button type="button" class="button button-ghost" @click="cancel">
        Cancel
      </button>
      <button type="button" class="button" @click="confirm">
        OK
      </button>
    </div>
  </div>
</template>

