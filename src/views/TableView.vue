<script setup>
import { computed, ref, watch } from 'vue'
import { useDataStore } from '../dataStore'
import DataTable from '../components/DataTable.vue'

const { state, setGroupBy, aggregateMultiLevel } = useDataStore()

const groupLevel1 = ref('')
const groupLevel2 = ref('')
const groupLevel3 = ref('')

const availableColumns = computed(() => state.columns)

watch(
  () => [groupLevel1.value, groupLevel2.value, groupLevel3.value],
  (values) => {
    const unique = []
    for (const value of values) {
      if (value && !unique.includes(value)) {
        unique.push(value)
      }
    }
    setGroupBy(unique)
  }
)

const groupedSummary = computed(() => {
  if (!state.groupBy.length) return []
  return aggregateMultiLevel(state.groupBy)
})
</script>

<template>
  <div class="view-container">
    <h1 class="view-title">Data Table View</h1>
    <div class="card">
      <DataTable />
    </div>
    <div class="card grouping-card">
      <h2>Grouping</h2>
      <p class="description">
        Select up to three columns to build a multi-level grouping hierarchy such as
        Region → Division → School Type.
      </p>
      <div class="grouping-controls">
        <label class="field-label">
          <span>Level 1</span>
          <select v-model="groupLevel1" class="select">
            <option value="">None</option>
            <option v-for="column in availableColumns" :key="column" :value="column">
              {{ column }}
            </option>
          </select>
        </label>
        <label class="field-label">
          <span>Level 2</span>
          <select v-model="groupLevel2" class="select">
            <option value="">None</option>
            <option v-for="column in availableColumns" :key="column" :value="column">
              {{ column }}
            </option>
          </select>
        </label>
        <label class="field-label">
          <span>Level 3</span>
          <select v-model="groupLevel3" class="select">
            <option value="">None</option>
            <option v-for="column in availableColumns" :key="column" :value="column">
              {{ column }}
            </option>
          </select>
        </label>
      </div>
      <div v-if="state.groupBy.length && groupedSummary.length" class="grouping-summary">
        <h3>Grouping summary</h3>
        <ul class="group-list level-1">
          <li v-for="node in groupedSummary" :key="node.label" class="group-item">
            <div class="group-label">
              <span>{{ state.groupBy[0] }}: {{ node.label }}</span>
              <span class="group-count">{{ node.value.toLocaleString() }} schools</span>
            </div>
            <ul v-if="node.children && node.children.length" class="group-list level-2">
              <li v-for="child in node.children" :key="child.label" class="group-item">
                <div class="group-label">
                  <span>{{ state.groupBy[1] }}: {{ child.label }}</span>
                  <span class="group-count">{{ child.value.toLocaleString() }} schools</span>
                </div>
                <ul v-if="child.children && child.children.length" class="group-list level-3">
                  <li v-for="leaf in child.children" :key="leaf.label" class="group-item">
                    <div class="group-label">
                      <span>{{ state.groupBy[2] }}: {{ leaf.label }}</span>
                      <span class="group-count">{{ leaf.value.toLocaleString() }} schools</span>
                    </div>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </div>
      <div v-else class="grouping-empty">
        <p>Select a grouping configuration to see a hierarchical summary of the dataset.</p>
      </div>
    </div>
  </div>
</template>

