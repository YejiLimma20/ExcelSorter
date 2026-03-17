<script setup>
import { computed, ref } from 'vue'
import * as XLSX from 'xlsx'
import { useDataStore } from '../dataStore'
import ColumnFilterMenu from './ColumnFilterMenu.vue'

const {
  state,
  visibleColumns,
  completionRateColumnLabel,
  getRowCompletionRate,
  pagedRows,
  sortedRows,
  filteredSortedRows,
  totalPages,
  setGlobalSearch,
  setColumnFilter,
  setSort,
  setPageSize,
  setCurrentPage,
  columnDistinctValues,
  setGradeLevelFilter,
  getGradeLevelFromColumnHeader,
} = useDataStore()

const hasData = computed(() => state.rows.length > 0)
const openColumn = ref('')
const zoomLevel = ref(1)

function downloadExcel() {
  const rowsToExport = filteredSortedRows.value
  if (!rowsToExport.length) return

  const exportRows = rowsToExport.map(row => {
    const obj = {}
    visibleColumns.value.forEach(col => {
      let value = row[col]
      if (col === completionRateColumnLabel) {
        const rate = getRowCompletionRate(row)
        value = rate != null && Number.isFinite(rate) ? `${rate.toFixed(2)}%` : ''
      }
      obj[col] = value ?? ''
    })
    return obj
  })

  const ws = XLSX.utils.json_to_sheet(exportRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Export')
  
  const date = new Date().toISOString().split('T')[0]
  const filename = `export_${date}.xlsx`
  XLSX.writeFile(wb, filename)
}

function zoomIn() {
  if (zoomLevel.value < 1.5) {
    zoomLevel.value = Math.min(1.5, zoomLevel.value + 0.1)
  }
}

function zoomOut() {
  if (zoomLevel.value > 0.5) {
    zoomLevel.value = Math.max(0.5, zoomLevel.value - 0.1)
  }
}

function resetZoom() {
  zoomLevel.value = 1
}

function toggleGradeLevel(level) {
  const next = state.gradeLevelFilter === level ? '' : level
  setGradeLevelFilter(next)
}

const tableStyle = computed(() => ({
  fontSize: `${0.8 * zoomLevel.value}rem`,
  '--cell-padding': `${0.45 * zoomLevel.value}rem ${0.5 * zoomLevel.value}rem`,
  '--header-padding': `${0.5 * zoomLevel.value}rem`,
  '--min-col-width': `${160 * zoomLevel.value}px`
}))

function isTotalColumn(column) {
  if (column === completionRateColumnLabel) return false
  const value = String(column).toLowerCase()
  return value.includes('total')
}

function isCompletionColumn(column) {
  return column === completionRateColumnLabel
}

function getGradeLevelClass(column) {
  return getGradeLevelFromColumnHeader(column) || ''
}

function formatCompletionRate(row) {
  const rate = getRowCompletionRate(row)
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${rate.toFixed(2)}%`
}

function handleGlobalSearch(event) {
  setGlobalSearch(event.target.value)
}

function handlePageSizeChange(event) {
  const size = Number(event.target.value) || 25
  setPageSize(size)
}

function goToPreviousPage() {
  if (state.currentPage > 1) {
    setCurrentPage(state.currentPage - 1)
  }
}

function goToNextPage() {
  if (state.currentPage < totalPages.value) {
    setCurrentPage(state.currentPage + 1)
  }
}

function getSortDirection(column) {
  const entry = state.sortState.find((s) => s.column === column)
  return entry ? entry.direction : ''
}

function openMenu(column) {
  if (openColumn.value === column) {
    openColumn.value = ''
  } else {
    openColumn.value = column
  }
}

function closeMenu() {
  openColumn.value = ''
}

function applyFilter(column, values) {
  setColumnFilter(column, values)
  closeMenu()
}

function sortAsc(column) {
  setSort(column, 'asc', false)
}

function sortDesc(column) {
  setSort(column, 'desc', false)
}

function clearSort(column) {
  setSort(column, '', false)
}
</script>

<template>
  <div class="table-container">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-group">
          <label class="field-label">
            <span>Global search</span>
            <input
              type="text"
              class="input"
              placeholder="Search all columns"
              :value="state.globalSearch"
              @input="handleGlobalSearch"
            />
          </label>
          <button
            type="button"
            class="button button-primary download-button"
            :disabled="!filteredSortedRows.length"
            @click="downloadExcel"
          >
            Download Excel
          </button>
        </div>
      </div>
      <div class="toolbar-right">
        <div class="toolbar-actions">
          <div class="color-legend">
            <span class="field-label">Grade Levels</span>
            <div class="legend-items">
              <div
                class="legend-item legend-item-clickable"
                :class="{ 'legend-item-active': state.gradeLevelFilter === 'elem' }"
                title="Elementary"
                @click="toggleGradeLevel('elem')"
              >
                <span class="legend-box legend-elem"></span>
                <span class="legend-text">Elem</span>
              </div>
              <div
                class="legend-item legend-item-clickable"
                :class="{ 'legend-item-active': state.gradeLevelFilter === 'jhs' }"
                title="Junior High School"
                @click="toggleGradeLevel('jhs')"
              >
                <span class="legend-box legend-jhs"></span>
                <span class="legend-text">JHS</span>
              </div>
              <div
                class="legend-item legend-item-clickable"
                :class="{ 'legend-item-active': state.gradeLevelFilter === 'shs' }"
                title="Senior High School"
                @click="toggleGradeLevel('shs')"
              >
                <span class="legend-box legend-shs"></span>
                <span class="legend-text">SHS</span>
              </div>
              <div class="legend-item" title="Completion Rate">
                <span class="legend-box legend-completion"></span>
                <span class="legend-text">Rate</span>
              </div>
            </div>
          </div>
          <div class="field-label">
            <span>Table Zoom</span>
            <div class="button-group">
              <button type="button" class="button button-compact" @click="zoomOut" title="Zoom Out">
                −
              </button>
              <button type="button" class="button button-compact zoom-value" @click="resetZoom" title="Reset Zoom">
                {{ Math.round(zoomLevel * 100) }}%
              </button>
              <button type="button" class="button button-compact" @click="zoomIn" title="Zoom In">
                +
              </button>
            </div>
          </div>
          <label class="field-label">
            <span>Rows per page</span>
            <select class="select" :value="state.pageSize" @change="handlePageSizeChange">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
        </div>
      </div>
    </div>
    <div v-if="!hasData" class="empty-state">
      <p>No data loaded yet. Upload an Excel or CSV file to begin.</p>
    </div>
    <div v-else class="table-wrapper">
      <table class="data-table" :style="tableStyle">
        <thead>
          <tr>
            <th class="header-cell header-cell-number">#</th>
            <th
              v-for="column in visibleColumns"
              :key="column"
              :class="[
                'header-cell',
                'header-cell-filterable',
                isCompletionColumn(column)
                  ? 'header-cell-completion'
                  : getGradeLevelClass(column)
                  ? `header-cell-${getGradeLevelClass(column)}`
                  : isTotalColumn(column)
                  ? 'header-cell-total'
                  : 'header-cell-dimension',
              ]"
            >
              <div
                class="header-content"
                @click.stop="() => openMenu(column)"
              >
                <span class="header-label">{{ column }}</span>
                <div class="header-actions">
                  <span class="sort-indicator">
                    <span v-if="getSortDirection(column) === 'asc'">▲</span>
                    <span v-else-if="getSortDirection(column) === 'desc'">▼</span>
                  </span>
                  <span class="dropdown-arrow">▼</span>
                </div>
              </div>
              <ColumnFilterMenu
                v-if="openColumn === column"
                :column="column"
                :values="columnDistinctValues[column] || []"
                :model-value="state.columnFilters[column] || []"
                @update:modelValue="(values) => setColumnFilter(column, values)"
                @confirm="(values) => applyFilter(column, values)"
                @cancel="closeMenu"
                @sortAsc="() => sortAsc(column)"
                @sortDesc="() => sortDesc(column)"
                @clearSort="() => clearSort(column)"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in pagedRows" :key="index">
            <td class="cell cell-number">
              {{ (state.currentPage - 1) * state.pageSize + index + 1 }}
            </td>
            <td
                v-for="column in visibleColumns"
                :key="column"
                :class="[
                  'cell',
                  isCompletionColumn(column)
                    ? 'cell-completion'
                    : getGradeLevelClass(column)
                    ? `cell-${getGradeLevelClass(column)}`
                    : isTotalColumn(column)
                    ? 'cell-total'
                    : 'cell-dimension',
                ]"
              >
                <template v-if="column === completionRateColumnLabel">
                  <span>
                    {{ formatCompletionRate(row) }}
                  </span>
                </template>
                <template v-else>
                  {{ row[column] }}
                </template>
              </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="hasData" class="table-footer">
      <div class="pagination">
        <button type="button" class="button" :disabled="state.currentPage === 1" @click="goToPreviousPage">
          Previous
        </button>
        <span class="page-indicator">
          Page {{ state.currentPage }} of {{ totalPages }}
        </span>
        <button
          type="button"
          class="button"
          :disabled="state.currentPage === totalPages"
          @click="goToNextPage"
        >
          Next
        </button>
      </div>
      <div class="row-count">
        Showing
        <strong>{{ pagedRows.length }}</strong>
        of
        <strong>{{ state.rows.length }}</strong>
        rows
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar-group {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}

.download-button {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.table-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>
