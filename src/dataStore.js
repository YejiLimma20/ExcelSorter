import { reactive, computed } from 'vue'

const requiredColumnLabels = [
  'Region',
  'Division',
  'BEIS School ID',
  'School Name',
  'Province',
  'Municipality',
  'School Subclassification',
  'Sector',
  'Curricular Offering Classification',
  'School Type',
]

function normalizeHeader(value) {
  if (!value) return ''
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

// Flexible grade-level header tokens: recognize Elem/JHS/SHS by meaning, not exact text
// Order matters: SHS then JHS then Elem so "grade11" matches SHS not Elem
const GRADE_LEVEL_HEADER_TOKENS = {
  shs: [
    'shs', 'seniorhigh', 'seniorhighschool', 'grade11', 'grade12', 'grade1112', 'grades1112',
    'grade11to12', 'g11', 'g12', 'g11g12',
  ],
  jhs: [
    'jhs', 'juniorhigh', 'juniorhighschool', 'grade7', 'grade8', 'grade9', 'grade10',
    'grade710', 'grades710', 'grade7to10', 'g7g10', 'g7', 'g8', 'g9', 'g10',
  ],
  elem: [
    'elem', 'elementary', 'primary', 'kinder', 'kindergarten', 'grade16', 'grades16',
    'grade1to6', 'g1g6', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6',
  ],
}

function getGradeLevelFromNormalizedKey(normalizedKey) {
  if (!normalizedKey) return ''
  const k = normalizedKey
  // Check SHS first (grade 11/12), then JHS (7-10), then Elem (1-6, kinder) to avoid wrong matches
  if (GRADE_LEVEL_HEADER_TOKENS.shs.some((t) => k.includes(t) || t.includes(k))) return 'shs'
  if (GRADE_LEVEL_HEADER_TOKENS.jhs.some((t) => k.includes(t) || t.includes(k))) return 'jhs'
  if (GRADE_LEVEL_HEADER_TOKENS.elem.some((t) => k.includes(t) || t.includes(k))) return 'elem'
  return ''
}

function getGradeLevelFromColumnHeader(header) {
  return getGradeLevelFromNormalizedKey(normalizeHeader(header))
}

const requiredNormalized = requiredColumnLabels.map((label) => ({
  label,
  key: normalizeHeader(label),
}))

const requiredDimensionKeys = requiredNormalized.map((entry) => entry.key)

const state = reactive({
  columns: [],
  rows: [],
  requiredMissing: [],
  loading: false,
  error: '',
  globalSearch: '',
  columnSearch: {},
  columnFilters: {},
  sortState: [],
  groupBy: [],
  pageSize: 25,
  currentPage: 1,
  gradeLevelFilter: '',
})

function setDataset(columns, rows, requiredMissing) {
  state.columns = columns
  state.rows = rows
  state.requiredMissing = requiredMissing || []
  state.globalSearch = ''
  state.columnSearch = {}
  state.columnFilters = {}
  state.sortState = []
  state.groupBy = []
  state.currentPage = 1
}

function setLoading(loading) {
  state.loading = loading
}

function setError(message) {
  state.error = message || ''
}

function setGlobalSearch(value) {
  state.globalSearch = value
  state.currentPage = 1
}

function setColumnSearch(column, value) {
  state.columnSearch = {
    ...state.columnSearch,
    [column]: value,
  }
  state.currentPage = 1
}

function setColumnFilter(column, value) {
  let nextValue = value
  if (!Array.isArray(nextValue)) {
    if (!nextValue) {
      nextValue = []
    } else {
      nextValue = [nextValue]
    }
  }
  state.columnFilters = {
    ...state.columnFilters,
    [column]: nextValue,
  }
  state.currentPage = 1
}

function clearFilters() {
  state.globalSearch = ''
  state.columnSearch = {}
  state.columnFilters = {}
  state.gradeLevelFilter = ''
  state.currentPage = 1
}

function setSort(column, direction, multi) {
  if (!multi) {
    state.sortState = direction ? [{ column, direction }] : []
    return
  }
  const existingIndex = state.sortState.findIndex((s) => s.column === column)
  const next = [...state.sortState]
  if (!direction) {
    if (existingIndex !== -1) {
      next.splice(existingIndex, 1)
    }
  } else if (existingIndex === -1) {
    next.push({ column, direction })
  } else {
    next[existingIndex] = { column, direction }
  }
  state.sortState = next
}

function setGroupBy(columns) {
  state.groupBy = columns
}

function setPageSize(size) {
  state.pageSize = size
  state.currentPage = 1
}

function setCurrentPage(page) {
  state.currentPage = page
}

function setGradeLevelFilter(level) {
  state.gradeLevelFilter = level || ''
  state.currentPage = 1
}

function getRowGradeLevel(row) {
  if (!state.columns.length) return ''

  let combined = ''
  for (const column of state.columns) {
    const value = row[column]
    if (value != null && value !== '') {
      combined += ` ${String(value).toLowerCase()}`
    }
  }

  if (!combined) return ''

  if (combined.includes('elem')) return 'elem'
  if (combined.includes('junior') || combined.includes('jhs')) return 'jhs'
  if (combined.includes('senior') || combined.includes('shs') || combined.includes('high school')) return 'shs'

  return ''
}

function getClassificationColumn() {
  const targetKey = 'curricularofferingclassification'
  let best = null
  for (const col of state.columns) {
    const k = normalizeHeader(col)
    if (k === targetKey || k.includes(targetKey)) {
      best = col
      break
    }
    const alts = REQUIRED_KEY_ALTERNATES[targetKey]
    if (alts && alts.some(tokens => tokens.every(t => k.includes(t)))) {
      best = col
      break
    }
  }
  return best
}

function rowOffersLevel(row, level) {
  const col = getClassificationColumn()
  if (col) {
    const raw = row[col]
    const s = raw == null ? '' : String(raw).toLowerCase()
    if (!s) return false
    if (level === 'elem') {
      return (
        s.includes('elementary') ||
        s.includes('elem') ||
        s.includes('primary') ||
        s.includes('kinder') ||
        s.includes('kindergarten') ||
        s.includes('grade 1') ||
        s.includes('grade1') ||
        s.includes('g1')
      )
    }
    if (level === 'jhs') {
      const jhsTokens = ['junior', 'jhs', 'junior high', 'grade7', 'grade 7', 'g7', 'grade8', 'grade 8', 'g8', 'grade9', 'grade 9', 'g9', 'grade10', 'grade 10', 'g10']
      return jhsTokens.some(t => s.includes(t))
    }
    if (level === 'shs') {
      const shsTokens = ['senior', 'shs', 'senior high', 'grade11', 'grade 11', 'g11', 'grade12', 'grade 12', 'g12']
      return shsTokens.some(t => s.includes(t))
    }
    return true
  }
  // Fallback to heuristic if classification missing
  if (!level) return true
  const detected = getRowGradeLevel(row)
  if (!detected) return false
  if (level === 'elem') return detected === 'elem'
  if (level === 'jhs') return detected === 'jhs'
  if (level === 'shs') return detected === 'shs'
  return false
}

function rowHasLevelData(row, level) {
  const levelTokens = {
    elem: ['elem', 'elementary', 'primary', 'kinder'],
    jhs: ['jhs', 'juniorhigh', 'junior'],
    shs: ['shs', 'seniorhigh', 'senior'],
  }
  const metricTokens = ['enrol', 'enroll', 'completer', 'promot', 'graduat', 'conditional', 'transferin', 'transin', 'transferout', 'transout', 'lateenrol', 'late', 'retained', 'retain']
  const genderTokens = ['male', 'female', 'boys', 'girls']
  for (const col of state.columns) {
    const hk = normalizeHeader(col)
    if (genderTokens.some(t => hk.includes(t))) continue
    if (hk.includes('rate')) continue
    if (!levelTokens[level].some(t => hk.includes(t))) continue
    if (!metricTokens.some(t => hk.includes(t))) continue
    const val = parseNumber(row[col])
    if (val > 0) return true
  }
  // Fallback: check virtual totals commonly created
  const virtualLabels = {
    elem: ['Elementary Total Enrollment', 'Elementary Total Completers', 'Elementary Total Incomplete', 'Elementary Total Regular', 'Elementary Total Irregular', 'Elementary Total Transfer In', 'Elementary Total Transfer Out', 'Elementary Total Late Enrollees', 'Elementary Total Retained'],
    jhs: ['JHS Total Enrollment', 'JHS Total Completers', 'JHS Total Incomplete', 'JHS Total Regular', 'JHS Total Irregular', 'JHS Total Transfer In', 'JHS Total Transfer Out', 'JHS Total Late Enrollees', 'JHS Total Retained'],
    shs: ['SHS Total Enrollment', 'SHS Total Completers', 'SHS Total Incomplete', 'SHS Total Regular', 'SHS Total Irregular', 'SHS Total Transfer In', 'SHS Total Transfer Out', 'SHS Total Late Enrollees', 'SHS Total Retained'],
  }
  for (const label of virtualLabels[level]) {
    if (state.columns.includes(label)) {
      const v = parseNumber(row[label])
      if (v > 0) return true
    }
  }
  return false
}

const filteredRows = computed(() => {
  if (!state.rows.length) return []
  const global = state.globalSearch.trim().toLowerCase()
  const columnSearch = state.columnSearch
  const columnFilters = state.columnFilters
  return state.rows.filter((row) => {
    if (global) {
      const match = state.columns.some((column) => {
        const value = row[column]
        if (value == null) return false
        return String(value).toLowerCase().includes(global)
      })
      if (!match) return false
    }
    for (const [column, value] of Object.entries(columnSearch)) {
      if (!value) continue
      let cell = row[column]
      if (column === completionRateColumnLabel) {
        cell = `${getRowCompletionRate(row).toFixed(2)}%`
      }
      if (cell == null) return false
      if (!String(cell).toLowerCase().includes(String(value).toLowerCase())) {
        return false
      }
    }
    for (const [column, filterValue] of Object.entries(columnFilters)) {
      if (!filterValue || !Array.isArray(filterValue) || !filterValue.length) continue
      let cell = row[column]
      if (column === completionRateColumnLabel) {
        cell = `${getRowCompletionRate(row).toFixed(2)}%`
      }
      const cellString = cell == null ? '' : String(cell)
      if (!filterValue.includes(cellString)) return false
    }
    if (state.gradeLevelFilter) {
      if (!rowOffersLevel(row, state.gradeLevelFilter)) return false
      if (!rowHasLevelData(row, state.gradeLevelFilter)) return false
    }
    return true
  })
})

const sortedRows = computed(() => {
  const rows = filteredRows.value.slice()
  const sorters = state.sortState
  const levelOrder = { elem: 1, jhs: 2, shs: 3 }
  function levelPriority(row) {
    const lvl = getRowGradeLevel(row)
    return levelOrder[lvl] || 4
  }
  rows.sort((a, b) => {
    const pa = levelPriority(a)
    const pb = levelPriority(b)
    if (pa !== pb) return pa - pb
    for (const sorter of sorters) {
      let av = a[sorter.column]
      let bv = b[sorter.column]
      
      if (sorter.column === completionRateColumnLabel) {
        av = getRowCompletionRate(a)
        bv = getRowCompletionRate(b)
      }

      if (av == null && bv == null) continue
      if (av == null) return sorter.direction === 'asc' ? 1 : -1
      if (bv == null) return sorter.direction === 'asc' ? -1 : 1
      if (av === bv) continue
      if (av > bv) return sorter.direction === 'asc' ? 1 : -1
      if (av < bv) return sorter.direction === 'asc' ? -1 : 1
    }
    return 0
  })
  return rows
})

const pagedRows = computed(() => {
  const start = (state.currentPage - 1) * state.pageSize
  return sortedRows.value.slice(start, start + state.pageSize)
})

const totalPages = computed(() => {
  if (!state.pageSize) return 1
  return Math.max(1, Math.ceil(sortedRows.value.length / state.pageSize))
})

const columnDistinctValues = computed(() => {
  const result = {}
  const allCols = [...state.columns, completionRateColumnLabel]
  
  // Use filtered rows to get distinct values that match current filters
  const rowsToUse = filteredRows.value.length > 0 ? filteredRows.value : state.rows
  
  // Cache the completion rates to avoid re-calculating for every column
  const completionRates = rowsToUse.map(row => `${getRowCompletionRate(row).toFixed(2)}%`)
  
  for (const column of allCols) {
    const values = new Set()
    const isCompletionRate = column === completionRateColumnLabel
    
    for (let i = 0; i < rowsToUse.length; i++) {
      let value = isCompletionRate ? completionRates[i] : rowsToUse[i][column]
      if (value != null && value !== '') {
        values.add(String(value))
      }
    }
    result[column] = Array.from(values).sort((a, b) => {
      // Natural sort for numbers/percentages
      const aNum = parseFloat(a)
      const bNum = parseFloat(b)
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
      return String(a).localeCompare(String(b))
    })
  }
  return result
})

function aggregateCountByColumn(column) {
  const counts = new Map()
  for (const row of filteredRows.value) {
    const key = row[column] == null || row[column] === '' ? 'Unknown' : String(row[column])
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

function aggregateMultiLevel(columns) {
  function buildLevel(rows, depth) {
    if (depth >= columns.length) return []
    const column = columns[depth]
    const groups = new Map()
    for (const row of rows) {
      const key = row[column] == null || row[column] === '' ? 'Unknown' : String(row[column])
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(row)
    }
    const result = []
    for (const [label, groupRows] of groups.entries()) {
      const node = {
        label,
        value: groupRows.length,
        children: buildLevel(groupRows, depth + 1),
      }
      result.push(node)
    }
    result.sort((a, b) => b.value - a.value)
    return result
  }
  return buildLevel(filteredRows.value, 0)
}

const completionRateColumnLabel = 'Completion Rate (%)'

const visibleColumns = computed(() => {
  const originalOrder = state.columns.slice()
  const dims = new Set(requiredColumnLabels.filter((c) => state.columns.includes(c)))
  const dimList = originalOrder.filter((c) => dims.has(c))
  let others = originalOrder.filter((c) => !dims.has(c))
  if (state.gradeLevelFilter) {
    others = others.filter((c) => {
      const lvl = getGradeLevelFromColumnHeader(c)
      return lvl === state.gradeLevelFilter
    })
  }
  const order = { elem: 1, jhs: 2, shs: 3, '': 4 }
  const categoryOrder = [
    ['enrollment', 'enrolment', 'enrollee', 'enrollees', 'enrollement'],
    ['completer', 'completers', 'promotee', 'promotees', 'promoted', 'graduate', 'graduates', 'promot'],
    ['incomplete', 'inc'],
    ['regular', 'reg'],
    ['irregular', 'irreg'],
    ['transferin', 'transin', 'transferredin'],
    ['transferout', 'transout', 'transferredout'],
    ['retained', 'retain', 'retainee', 'retention'],
  ]
  function categoryIndex(header) {
    const k = normalizeHeader(header)
    const hasTotal = k.includes('total') || k.includes('grand') || k.includes('overall') || k.includes('eosy') || k.includes('eoy')
    if (!hasTotal) return 999
    for (let i = 0; i < categoryOrder.length; i += 1) {
      const tokens = categoryOrder[i]
      if (tokens.some(t => k.includes(t))) return i
    }
    return 999
  }
  const sortedOthers = others.slice().sort((a, b) => {
    const la = getGradeLevelFromColumnHeader(a) || ''
    const lb = getGradeLevelFromColumnHeader(b) || ''
    const pa = order[la] || 4
    const pb = order[lb] || 4
    if (pa !== pb) return pa - pb
    const ia = categoryIndex(a)
    const ib = categoryIndex(b)
    if (ia !== ib) return ia - ib
    // stable by original Excel order
    return originalOrder.indexOf(a) - originalOrder.indexOf(b)
  })
  const columns = [...dimList, ...sortedOthers]
  if (!columns.includes(completionRateColumnLabel)) {
    columns.push(completionRateColumnLabel)
  }
  return columns
})

// Flexible required column matching: accept headers that contain equivalent meaning
const REQUIRED_KEY_ALTERNATES = {
  curricularofferingclassification: [['curricular', 'offering'], ['curricular', 'classification'], ['offering', 'classification'], ['curriculum', 'offering']],
  schoolsubclassification: [['school', 'subclass']],
  schoolname: [['school', 'name']],
  region: [['region']],
  division: [['division']],
  province: [['province']],
  municipality: [['municipality']],
  sector: [['sector']],
  schooltype: [['school', 'type'], ['schooltype']],
  beisschoolid: [['beis'], ['school', 'id']],
}

function getRequiredMissingFromHeaders(headers) {
  const normalizedHeaders = headers.map((h) => normalizeHeader(h)).filter((h) => h)
  const presentKeys = new Set()
  for (const def of requiredNormalized) {
    const key = def.key
    let found = false
    for (const headerKey of normalizedHeaders) {
      if (!headerKey) continue
      if (headerKey === key || headerKey.includes(key) || key.includes(headerKey)) {
        presentKeys.add(key)
        found = true
        break
      }
    }
    if (found) continue
    const alternates = REQUIRED_KEY_ALTERNATES[key]
    if (alternates) {
      for (const headerKey of normalizedHeaders) {
        if (!headerKey) continue
        const matches = alternates.some((tokens) => tokens.every((t) => headerKey.includes(t)))
        if (matches) {
          presentKeys.add(key)
          break
        }
      }
    }
  }
  const missing = []
  for (const def of requiredNormalized) {
    if (!presentKeys.has(def.key)) {
      missing.push(def.label)
    }
  }
  return missing
}

const numericMeasureDefs = [
  {
    id: 'totalEnrollment',
    label: 'Total Enrollment',
    keys: [
      'totalenrollment',
      'eosytotalenrollment',
      'grandtotalenrollment',
      'overalltotalenrollment',
      'eosytotalenrol',
      'grandtotalenrol',
      'enrollment',
      'enrolment',
      'enrollee',
      'enrollees',
      'shstotalenrollment',
      'totalshsenrollment',
      'shsenrollment',
      'elementarytotalenrollment',
      'jhstotalenrollment',
    ],
  },
  {
    id: 'totalCompleters',
    label: 'Total Completers',
    keys: [
      'totalcompleters',
      'eosytotalcompleters',
      'grandtotalcompleters',
      'overalltotalcompleters',
      'totalcompleter',
      'completers',
      'promotees',
      'promoted',
      'shstotalcompleterspromotees',
      'shstotalcompleters',
      'totalshscompleters',
      'shscompleters',
      'graduate',
      'graduates',
      'elementarytotalcompleters',
      'jhstotalcompleters',
    ],
  },
  {
    id: 'totalConditional',
    label: 'Total Conditional',
    keys: [
      'totalconditional',
      'eosytotalconditional',
      'grandtotalconditional',
      'overalltotalconditional',
      'conditional',
      'conditionals',
      'shstotalconditional',
      'totalshsconditional',
      'shsconditional',
      'elementarytotalconditional',
      'jhstotalconditional',
    ],
  },
  {
    id: 'totalTransferIn',
    label: 'Total Transfer In',
    keys: [
      'totaltransferin',
      'eosytotaltransferin',
      'grandtotaltransferin',
      'overalltotaltransferin',
      'transferin',
      'transin',
      'transferredin',
      'shstotaltransferin',
      'elementarytotaltransferin',
      'jhstotaltransferin',
    ],
  },
  {
    id: 'totalTransferOut',
    label: 'Total Transfer Out',
    keys: [
      'totaltransferout',
      'eosytotaltransferout',
      'grandtotaltransferout',
      'overalltotaltransferout',
      'transferout',
      'transout',
      'transferredout',
      'shstotaltransferout',
      'elementarytotaltransferout',
      'jhstotaltransferout',
    ],
  },
  {
    id: 'totalLateEnrollees',
    label: 'Total Late Enrollees',
    keys: [
      'totallateenrollees',
      'eosytotallateenrollees',
      'grandtotallateenrollees',
      'overalltotallateenrollees',
      'lateenrol',
      'late',
      'shstotallateenrollees',
      'elementarytotallateenrollees',
      'jhstotallateenrollees',
    ],
  },
  {
    id: 'totalRetained',
    label: 'Total Retained',
    keys: [
      'totalretained',
      'eosytotalretained',
      'grandtotalretained',
      'overalltotalretained',
      'retained',
      'retain',
      'shstotalretained',
      'elementarytotalretained',
      'jhstotalretained',
    ],
  },
]

const measureColumns = computed(() => {
  const headerKeys = state.columns.map((column) => normalizeHeader(column))
  const result = {}

  const genderTokens = ['male', 'female', 'boys', 'girls']
  const totalPreferenceTokens = ['total', 'grand', 'overall', 'eosy', 'eoy']
  const gradeRegex = /g[0-9]/

  function scoreHeader(headerKey, def) {
    if (!headerKey) return -Infinity

    const matchesDef = def.keys.some((key) => {
      return (
        headerKey === key ||
        headerKey.includes(key) ||
        key.includes(headerKey)
      )
    })
    if (!matchesDef) return -Infinity

    let score = 0

    if (totalPreferenceTokens.some((t) => headerKey.includes(t))) score += 20
    if (headerKey.includes('total')) score += 5
    if (headerKey.includes('eosy') || headerKey.includes('eoy')) score += 5
    if (headerKey.includes('grand') || headerKey.includes('overall')) score += 3

    if (genderTokens.some((t) => headerKey.includes(t))) score -= 30
    if (headerKey.includes('grade') || gradeRegex.test(headerKey)) score -= 10

    if (state.gradeLevelFilter) {
      const k = headerKey
      const level = state.gradeLevelFilter
      const isShs = k.includes('shs') || k.includes('seniorhigh')
      const isJhs = k.includes('jhs') || k.includes('juniorhigh')
      const isElem = k.includes('elem') || k.includes('elementary') || k.includes('primary') || k.includes('kinder')
      if (level === 'shs') score += isShs ? 25 : (isJhs || isElem ? -8 : 0)
      if (level === 'jhs') score += isJhs ? 25 : (isShs || isElem ? -8 : 0)
      if (level === 'elem') score += isElem ? 25 : (isShs || isJhs ? -8 : 0)
    }

    return score
  }

  for (const def of numericMeasureDefs) {
    let bestIndex = -1
    let bestScore = -Infinity

    headerKeys.forEach((headerKey, index) => {
      const s = scoreHeader(headerKey, def)
      if (s > bestScore) {
        bestScore = s
        bestIndex = index
      }
    })

    if (bestIndex !== -1 && bestScore > -Infinity) {
      result[def.id] = state.columns[bestIndex]
    }
  }

  return result
})

function parseNumber(value) {
  if (value == null || value === '' || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = String(value).replace(/[^0-9.-]+/g, '').trim()
  if (cleaned === '') return 0
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

const totalVariationTokens = ['total', 'grand', 'overall', 'eosy']

function isOverallTotalColumn(normalizedHeader, metricTokens, excludeGender = true) {
  const hasTotalVariation = totalVariationTokens.some((t) => normalizedHeader.includes(t))
  const hasMetric = metricTokens.some((t) => normalizedHeader.includes(t))
  const genderTokens = ['male', 'female', 'boys', 'girls']
  const hasGender = excludeGender && genderTokens.some((t) => normalizedHeader.includes(t))
  return hasTotalVariation && hasMetric && !hasGender
}

function findFallbackTotalColumn(normalizedColumns, metricTokens) {
  for (let i = 0; i < state.columns.length; i++) {
    const key = normalizedColumns[i] || ''
    if (isOverallTotalColumn(key, metricTokens)) return state.columns[i]
  }
  return null
}

function getRowEnrollment(row) {
  const enrollmentColumn = measureColumns.value.totalEnrollment
  const level = getRowGradeLevel(row)
  if (level !== 'shs') {
    return enrollmentColumn ? parseNumber(row[enrollmentColumn]) : 0
  }
  // Preserve previous SHS fallback behavior
  let enrollment = enrollmentColumn ? parseNumber(row[enrollmentColumn]) : 0
  if (enrollment === 0) {
    const normalizedCols = state.columns.map((c) => normalizeHeader(c))
    const fallbackTotal = findFallbackTotalColumn(normalizedCols, ['enroll', 'enrol'])
    if (fallbackTotal) enrollment = parseNumber(row[fallbackTotal])
  }
  if (enrollment === 0) {
    let sum = 0
    for (const col of state.columns) {
      const lowCol = normalizeHeader(col)
      const isTotalLike = totalVariationTokens.some((t) => lowCol.includes(t))
      const isMetric = lowCol.includes('enroll') || lowCol.includes('enrol')
      if (isMetric && !lowCol.includes('rate') && !isTotalLike) sum += parseNumber(row[col])
    }
    enrollment = sum
  }
  return enrollment
}

function getRowCompleters(row) {
  const completersColumn = measureColumns.value.totalCompleters
  const level = getRowGradeLevel(row)
  if (level !== 'shs') {
    return completersColumn ? parseNumber(row[completersColumn]) : 0
  }
  // Preserve previous SHS fallback behavior
  let completers = completersColumn ? parseNumber(row[completersColumn]) : 0
  if (completers === 0) {
    const normalizedCols = state.columns.map((c) => normalizeHeader(c))
    const fallbackTotal = findFallbackTotalColumn(normalizedCols, ['completer', 'promot', 'graduat'])
    if (fallbackTotal) completers = parseNumber(row[fallbackTotal])
  }
  if (completers === 0) {
    let sum = 0
    for (const col of state.columns) {
      const lowCol = normalizeHeader(col)
      const isTotalLike = totalVariationTokens.some((t) => lowCol.includes(t))
      const isMetric = lowCol.includes('completer') || lowCol.includes('promot') || lowCol.includes('graduat')
      if (isMetric && !lowCol.includes('rate') && !isTotalLike) sum += parseNumber(row[col])
    }
    completers = sum
  }
  if (completers === 0) {
    for (const col of state.columns) {
      const lowCol = normalizeHeader(col)
      if ((lowCol.includes('completer') || lowCol.includes('promot') || lowCol.includes('graduat')) && !lowCol.includes('rate')) {
        const val = parseNumber(row[col])
        if (val > 0) { completers = val; break }
      }
    }
  }
  return completers
}

function sumByTokens(row, tokens) {
  let sum = 0
  for (const col of state.columns) {
    const lowCol = normalizeHeader(col)
    const isTotalLike = totalVariationTokens.some((t) => lowCol.includes(t))
    const isMetric = tokens.some((t) => lowCol.includes(t))
    const isGender = ['male', 'female', 'boys', 'girls'].some((t) => lowCol.includes(t))
    if (isMetric && !isTotalLike && !isGender) {
      sum += parseNumber(row[col])
    }
  }
  return sum
}

function getRowByMeasure(row, id, tokens) {
  const col = measureColumns.value[id]
  const level = getRowGradeLevel(row)
  if (level !== 'shs') {
    return col ? parseNumber(row[col]) : 0
  }
  // Preserve previous SHS fallback behavior
  let val = col ? parseNumber(row[col]) : 0
  if (val === 0) {
    const normalizedCols = state.columns.map((c) => normalizeHeader(c))
    const fb = findFallbackTotalColumn(normalizedCols, tokens)
    if (fb) val = parseNumber(row[fb])
  }
  if (val === 0) val = sumByTokens(row, tokens)
  if (val === 0) {
    for (const c of state.columns) {
      const k = normalizeHeader(c)
      const match = tokens.some((t) => k.includes(t))
      if (match && !k.includes('rate')) {
        const v = parseNumber(row[c])
        if (v > 0) { val = v; break }
      }
    }
  }
  return val
}

function getRowTransferIn(row) {
  return getRowByMeasure(row, 'totalTransferIn', ['transferin', 'transin', 'transferredin'])
}

function getRowTransferOut(row) {
  return getRowByMeasure(row, 'totalTransferOut', ['transferout', 'transout', 'transferredout'])
}

function getRowLateEnrollees(row) {
  return getRowByMeasure(row, 'totalLateEnrollees', ['lateenrol', 'late'])
}

function getRowRetained(row) {
  return getRowByMeasure(row, 'totalRetained', ['retained', 'retain'])
}

function getRowCompletionRate(row) {
  const enrollment = getRowEnrollment(row)
  const completers = getRowCompleters(row)
  
  if (enrollment <= 0) return 0
  return (completers / enrollment) * 100
}

const aggregatedTotals = computed(() => {
  const totals = {
    totalEnrollment: 0,
    totalCompleters: 0,
    totalConditional: 0,
    totalTransferIn: 0,
    totalTransferOut: 0,
    totalLateEnrollees: 0,
    totalRetained: 0,
  }
  const conditionalColumn = measureColumns.value.totalConditional
  
  for (const row of filteredRows.value) {
    totals.totalEnrollment += getRowEnrollment(row)
    totals.totalCompleters += getRowCompleters(row)
    
    if (conditionalColumn) {
      totals.totalConditional += parseNumber(row[conditionalColumn])
    }
    totals.totalTransferIn += getRowTransferIn(row)
    totals.totalTransferOut += getRowTransferOut(row)
    totals.totalLateEnrollees += getRowLateEnrollees(row)
    totals.totalRetained += getRowRetained(row)
  }
  
  let completionRate = 0
  if (totals.totalEnrollment > 0) {
    completionRate = (totals.totalCompleters / totals.totalEnrollment) * 100
  }
  
  return {
    ...totals,
    completionRate,
  }
})

const schoolLevelMetrics = computed(() => {
  const schoolHeaders = state.columns.map((column) => ({
    original: column,
    key: normalizeHeader(column),
  }))
  let schoolColumn = null
  for (const candidate of ['schoolname', 'school']) {
    const match = schoolHeaders.find(
      (header) => header.key === candidate || header.key.includes(candidate) || candidate.includes(header.key)
    )
    if (match) {
      schoolColumn = match.original
      break
    }
  }
  if (!schoolColumn) return []
  const conditionalColumn = measureColumns.value.totalConditional
  
  const groups = new Map()
  for (const row of filteredRows.value) {
    const key = row[schoolColumn] == null || row[schoolColumn] === '' ? 'Unknown' : String(row[schoolColumn])
    if (!groups.has(key)) {
      groups.set(key, {
        school: key,
        totalEnrollment: 0,
        totalCompleters: 0,
        totalConditional: 0,
      })
    }
    const group = groups.get(key)
    group.totalEnrollment += getRowEnrollment(row)
    group.totalCompleters += getRowCompleters(row)
    
    if (conditionalColumn) {
      group.totalConditional += parseNumber(row[conditionalColumn])
    }
  }
  
  const result = []
  for (const group of groups.values()) {
    const completionRate = group.totalEnrollment > 0 
      ? (group.totalCompleters / group.totalEnrollment) * 100 
      : 0
      
    result.push({
      ...group,
      completionRate,
    })
  }
  result.sort((a, b) => b.totalEnrollment - a.totalEnrollment)
  return result
})

export function useDataStore() {
  return {
    state,
    requiredColumnLabels,
    setDataset,
    setLoading,
    setError,
    setGlobalSearch,
    setColumnSearch,
    setColumnFilter,
    clearFilters,
    setSort,
    setGroupBy,
    setPageSize,
    setCurrentPage,
    setGradeLevelFilter,
    filteredRows,
    sortedRows,
    pagedRows,
    totalPages,
    columnDistinctValues,
    visibleColumns,
    completionRateColumnLabel,
    getRowCompletionRate,
    aggregateCountByColumn,
    aggregateMultiLevel,
    getRequiredMissingFromHeaders,
    aggregatedTotals,
    schoolLevelMetrics,
    getRowGradeLevel,
    getGradeLevelFromColumnHeader,
    getGradeLevelFromNormalizedKey,
    normalizeHeader: normalizeHeader,
  }
}
