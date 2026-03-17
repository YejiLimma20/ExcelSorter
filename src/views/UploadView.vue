<script setup>
import { ref, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import { useDataStore } from '../dataStore'
import DataTable from '../components/DataTable.vue'
import BaseChart from '../components/BaseChart.vue'

const {
  state,
  requiredColumnLabels,
  setDataset,
  setLoading,
  setError,
  getRequiredMissingFromHeaders,
  getGradeLevelFromColumnHeader,
  filteredRows,
  aggregateCountByColumn,
  aggregatedTotals,
  schoolLevelMetrics,
} = useDataStore()

// Dashboard Logic
// Initialize defaults once columns are available
const hasData = computed(() => state.rows.length > 0)

const totalSchools = computed(() => filteredRows.value.length)

const regionCount = computed(() => {
  if (!state.columns.includes('Region')) return 0
  return aggregateCountByColumn('Region').length
})

const divisionCount = computed(() => {
  if (!state.columns.includes('Division')) return 0
  return aggregateCountByColumn('Division').length
})

const schoolTypeCount = computed(() => {
  if (!state.columns.includes('School Type')) return 0
  return aggregateCountByColumn('School Type').length
})

const sectorCount = computed(() => {
  if (!state.columns.includes('Sector')) return 0
  return aggregateCountByColumn('Sector').length
})

const totalEnrollment = computed(() => aggregatedTotals.value.totalEnrollment)
const totalCompleters = computed(() => aggregatedTotals.value.totalCompleters)
const totalConditional = computed(() => aggregatedTotals.value.totalConditional)
const completionRate = computed(() => aggregatedTotals.value.completionRate)
const totalTransferIn = computed(() => aggregatedTotals.value.totalTransferIn)
const totalTransferOut = computed(() => aggregatedTotals.value.totalTransferOut)
const totalLateEnrollees = computed(() => aggregatedTotals.value.totalLateEnrollees)
const totalRetained = computed(() => aggregatedTotals.value.totalRetained)

function buildColors(count, alpha) {
  const base = [
    [59, 130, 246], [16, 185, 129], [234, 179, 8], [239, 68, 68], [168, 85, 247],
    [99, 102, 241], [244, 114, 182], [34, 197, 94], [56, 189, 248], [251, 146, 60],
  ]
  const colors = []
  for (let index = 0; index < count; index += 1) {
    const [r, g, b] = base[index % base.length]
    colors.push(`rgba(${r}, ${g}, ${b}, ${alpha})`)
  }
  return colors
}

const completionTableRows = computed(() => schoolLevelMetrics.value)

const completionChartOrientation = ref('y')
const orientationOptions = [
  { value: 'x', label: 'Vertical' },
  { value: 'y', label: 'Horizontal' },
]

// Use the data store's paging and sorting directly for the chart
const pagedCompletionRows = computed(() => {
  // We need to group the paged rows by school since the table is at the row level
  // but the chart is at the school level.
  // However, schoolLevelMetrics is already grouped and respects sorting.
  // So we just need to slice schoolLevelMetrics using the same logic as pagedRows.
  
  const rows = schoolLevelMetrics.value
  if (!rows.length) return []
  
  // To match "paging just like on the data table", we use the store's current page and page size
  const start = (state.currentPage - 1) * state.pageSize
  return rows.slice(start, start + state.pageSize)
})

const completionChartTotalPages = computed(() => totalPages.value)

const completionRatePerSchoolConfig = computed(() => {
  const rows = pagedCompletionRows.value
  if (!rows.length) return { labels: [], datasets: [] }
  const labels = rows.map((row) => row.school)
  const values = rows.map((row) => Number.isFinite(row.completionRate) ? row.completionRate : 0)
  
  // Re-generate colors based on the current data to ensure consistency
  const colors = buildColors(values.length, 0.7)
  
  return {
    labels,
    datasets: [
      {
        label: 'Completion rate (%)',
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.7', '1')),
        borderWidth: 1,
      },
    ],
  }
})

// Original Upload Logic Below...
const fileName = ref('')
const fileSizeMb = ref(0)

const maxFileSizeMb = 50
const allowedExtensions = ['.xlsx', '.xls', '.csv']

function normalizeHeader(value) {
  if (!value) return ''
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function isImportantTotalHeader(header) {
  const key = normalizeHeader(header)
  const level = getGradeLevelFromColumnHeader(header)

  // Explicitly keep the user's requested SHS total columns (flexible: match by meaning)
  const shsSpecificTotals = [
    'shstotalenrollment', 'shstotalcompleterspromotees', 'shstotalcompleters',
    'shstotalincomplete', 'shstotalregular', 'shstotalirregular',
    'shstotaltransferin', 'shstotaltransferout', 'shstotaltransin', 'shstotaltransout',
    'shstotallateenrollees', 'shstotalretained',
  ]
  if (shsSpecificTotals.some((t) => key === t || key.includes(t) || t.includes(key))) {
    return true
  }

  const genderTokens = ['male', 'female', 'boys', 'girls']
  const hasGender = genderTokens.some((token) => key.includes(token))
  const keyIsCore =
    key.includes('enroll') || key.includes('enrol') || key.includes('completer') ||
    key.includes('promot') || key.includes('graduat') || key.includes('incomplete') ||
    key.includes('regular') || key.includes('irregular') || key.includes('transfer') ||
    key.includes('lateenrol') || key.includes('retained')

  // SHS: same as before
  if (level === 'shs') {
    if (hasGender) return false
    const keyIsShsTotal = key.includes('shstotal') || key.includes('totalshs') || key.includes('seniorhightotal')
    const keyIsTransfer = key.includes('transferin') || key.includes('transferout') || key.includes('transin') || key.includes('transout')
    const keyIsNewMetrics = key.includes('lateenrol') || key.includes('retained') || key.includes('late')
    if (keyIsShsTotal || (keyIsTransfer || keyIsNewMetrics || keyIsCore)) return true
    if (key.includes('total') && (key.includes('g11') || key.includes('g12') || key.includes('grade11') || key.includes('grade12'))) {
      return false
    }
    if (key.includes('total') && (key.includes('shs') || key.includes('seniorhigh'))) return true
    return false
  }

  // Elementary: keep Elem-level totals and core metrics (flexible header names)
  if (level === 'elem') {
    if (hasGender) return false
    const isElemToken = key.includes('elementary') || key.includes('elem') || key.includes('primary') || key.includes('kinder')
    if ((key.includes('total') || keyIsCore) && isElemToken) return true
    if (key.includes('eosy') && isElemToken) return true
    return false
  }

  // JHS: keep JHS-level totals and core metrics (flexible header names)
  if (level === 'jhs') {
    if (hasGender) return false
    const isJhsToken = key.includes('jhs') || key.includes('juniorhigh') || key.includes('junior')
    if ((key.includes('total') || keyIsCore) && isJhsToken) return true
    if (key.includes('eosy') && isJhsToken) return true
    return false
  }

  const unwantedTokens = ['repeater', 'repeaters', 'overage', ...genderTokens]
  for (const token of unwantedTokens) {
    if (key.includes(token)) return false
  }
  // Only exclude generic "grade" / g[0-9] when column is NOT a recognized grade-level column
  // so that "Grade 1-6", "Grade 7-10" etc. are kept when matched by level above
  if (!level && key.includes('grade')) return false
  if (!level && key.match(/g[0-9]/)) return false

  if (key.includes('eosy') && (key.includes('elementary') || key.includes('elem') || key.includes('primary') || key.includes('kinder') || key.includes('jhs') || key.includes('juniorhigh') || key.includes('shs') || key.includes('seniorhigh'))) {
    return true
  }
  return false
}

function getExtension(name) {
  const index = name.lastIndexOf('.')
  if (index === -1) return ''
  return name.slice(index).toLowerCase()
}

function handleFileChange(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return
  fileName.value = file.name
  fileSizeMb.value = file.size / (1024 * 1024)
  const ext = getExtension(file.name)
  if (!allowedExtensions.includes(ext)) {
    setError('Unsupported file type. Please upload .xlsx, .xls, or .csv.')
    return
  }
  if (fileSizeMb.value > maxFileSizeMb) {
    setError('File is too large. Maximum allowed size is 50 MB.')
    return
  }
  readFile(file)
}

function readFile(file) {
  const reader = new FileReader()
  setLoading(true)
  setError('')
  reader.onload = (event) => {
    try {
      const data = event.target.result
      const workbook = XLSX.read(data, { type: 'array' })
      if (!workbook.SheetNames.length) {
        setError('No sheets found in file.')
        setLoading(false)
        return
      }
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const headerRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      })
      if (!headerRows.length) {
        setError('No header row found in sheet.')
        setLoading(false)
        return
      }

      let headers = []
      let bestPresentCount = -1
      let bestHeaderRowIndex = -1

      for (let index = 0; index < Math.min(headerRows.length, 10); index += 1) {
        const rawRow = headerRows[index]
        if (!rawRow || !rawRow.length) continue
        const candidate = rawRow
          .map((h) => (h == null ? '' : String(h).trim()))
          .filter((h) => h)
        if (!candidate.length) continue
        const missingForRow = getRequiredMissingFromHeaders(candidate)
        const presentCount = requiredColumnLabels.length - missingForRow.length
        if (presentCount > bestPresentCount) {
          bestPresentCount = presentCount
          headers = candidate
          bestHeaderRowIndex = index
        }
        if (!missingForRow.length) {
          break
        }
      }

      if (!headers.length) {
        setError('Could not detect a valid header row. Please check the first rows of the sheet.')
        setLoading(false)
        return
      }

      const missing = getRequiredMissingFromHeaders(headers)
      if (missing.length) {
        setError('Missing required columns: ' + missing.join(', '))
        setLoading(false)
        return
      }

      const dataRange = typeof bestHeaderRowIndex === 'number' && bestHeaderRowIndex >= 0
        ? bestHeaderRowIndex + 1
        : 1

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: headers,
        range: dataRange,
        blankrows: false,
        defval: '',
      })

      // Pre-normalize all headers to avoid repeated normalization in loops
      const normalizedHeaderMap = new Map()
      const allHeaders = Object.keys(rows[0] || {})
      allHeaders.forEach(h => normalizedHeaderMap.set(h, normalizeHeader(h)))

      const virtualHeaders = []
      const shsTotalSpecs = [
        { label: 'SHS Total Enrollment', keys: ['enroll', 'enrol'], normLabel: normalizeHeader('SHS Total Enrollment') },
        { label: 'SHS Total Completers', keys: ['completer', 'promot', 'graduat'], normLabel: normalizeHeader('SHS Total Completers') },
        { label: 'SHS Total Incomplete', keys: ['incomplete', 'inc'], normLabel: normalizeHeader('SHS Total Incomplete') },
        { label: 'SHS Total Regular', keys: ['regular', 'reg'], normLabel: normalizeHeader('SHS Total Regular') },
        { label: 'SHS Total Irregular', keys: ['irregular', 'irreg'], normLabel: normalizeHeader('SHS Total Irregular') },
        { label: 'SHS Total Transfer In', keys: ['transferin', 'transin', 'transferredin'], normLabel: normalizeHeader('SHS Total Transfer In') },
        { label: 'SHS Total Transfer Out', keys: ['transferout', 'transout', 'transferredout'], normLabel: normalizeHeader('SHS Total Transfer Out') },
        { label: 'SHS Total Late Enrollees', keys: ['lateenrol', 'late'], normLabel: normalizeHeader('SHS Total Late Enrollees') },
        { label: 'SHS Total Retained', keys: ['retained', 'retain'], normLabel: normalizeHeader('SHS Total Retained') }
      ]
      const jhsTotalSpecs = [
        { label: 'JHS Total Enrollment', keys: ['enroll', 'enrol'], normLabel: normalizeHeader('JHS Total Enrollment') },
        { label: 'JHS Total Completers', keys: ['completer', 'promot', 'graduat'], normLabel: normalizeHeader('JHS Total Completers') },
        { label: 'JHS Total Incomplete', keys: ['incomplete', 'inc'], normLabel: normalizeHeader('JHS Total Incomplete') },
        { label: 'JHS Total Regular', keys: ['regular', 'reg'], normLabel: normalizeHeader('JHS Total Regular') },
        { label: 'JHS Total Irregular', keys: ['irregular', 'irreg'], normLabel: normalizeHeader('JHS Total Irregular') },
        { label: 'JHS Total Transfer In', keys: ['transferin', 'transin', 'transferredin'], normLabel: normalizeHeader('JHS Total Transfer In') },
        { label: 'JHS Total Transfer Out', keys: ['transferout', 'transout', 'transferredout'], normLabel: normalizeHeader('JHS Total Transfer Out') },
        { label: 'JHS Total Late Enrollees', keys: ['lateenrol', 'late'], normLabel: normalizeHeader('JHS Total Late Enrollees') },
        { label: 'JHS Total Retained', keys: ['retained', 'retain'], normLabel: normalizeHeader('JHS Total Retained') }
      ]
      const elemTotalSpecs = [
        { label: 'Elementary Total Enrollment', keys: ['enroll', 'enrol'], normLabel: normalizeHeader('Elementary Total Enrollment') },
        { label: 'Elementary Total Completers', keys: ['completer', 'promot', 'graduat'], normLabel: normalizeHeader('Elementary Total Completers') },
        { label: 'Elementary Total Incomplete', keys: ['incomplete', 'inc'], normLabel: normalizeHeader('Elementary Total Incomplete') },
        { label: 'Elementary Total Regular', keys: ['regular', 'reg'], normLabel: normalizeHeader('Elementary Total Regular') },
        { label: 'Elementary Total Irregular', keys: ['irregular', 'irreg'], normLabel: normalizeHeader('Elementary Total Irregular') },
        { label: 'Elementary Total Transfer In', keys: ['transferin', 'transin', 'transferredin'], normLabel: normalizeHeader('Elementary Total Transfer In') },
        { label: 'Elementary Total Transfer Out', keys: ['transferout', 'transout', 'transferredout'], normLabel: normalizeHeader('Elementary Total Transfer Out') },
        { label: 'Elementary Total Late Enrollees', keys: ['lateenrol', 'late'], normLabel: normalizeHeader('Elementary Total Late Enrollees') },
        { label: 'Elementary Total Retained', keys: ['retained', 'retain'], normLabel: normalizeHeader('Elementary Total Retained') }
      ]

      // Identify which headers belong to which spec once
      const hasGradeToken = (hk, n) => {
        const re = new RegExp(`(?:grade0?${n}|g0?${n})(?![0-9])`)
        return re.test(hk)
      }
      const isElemGrade = (hk) =>
        hasGradeToken(hk, 1) || hasGradeToken(hk, 2) || hasGradeToken(hk, 3) ||
        hasGradeToken(hk, 4) || hasGradeToken(hk, 5) || hasGradeToken(hk, 6) ||
        hk.includes('kinder') || hk.includes('kindergarten') ||
        hk.includes('kgarten') || hk.includes('kindergarden') ||
        hk.includes('prep') || hk.includes('nursery') ||
        /^k(male|female|enroll|promot|trans|late|cond|retain)/.test(hk) ||
        hk.includes('ngelem') || hk.includes('ng elem')
      const isJhsGrade = (hk) =>
        hasGradeToken(hk, 7)  || hasGradeToken(hk, 8) ||
        hasGradeToken(hk, 9)  || hasGradeToken(hk, 10) ||
        hk.includes('ngsecond') || hk.includes('ng second') ||
        hk.includes('ngsec')
      const isShsGrade = (hk) =>
        hasGradeToken(hk, 11) || hasGradeToken(hk, 12) ||
        /\b11th\b/.test(hk) || /\b12th\b/.test(hk) ||
        hk.includes('gr11') || hk.includes('gr12') ||
        hk.includes('g11') || hk.includes('g12')

      const specHeaderMap = shsTotalSpecs.map(spec => {
        const components = allHeaders.filter(h => {
          const hk = normalizedHeaderMap.get(h)
          const isGradeLevel = isShsGrade(hk)
          const isShsTotal = hk.includes('shs') || hk.includes('seniorhigh')
          
          let matchesSpec = false
          if (spec.keys.includes('regular')) {
            // Use regex for "regular" to avoid matching "irregular"
            matchesSpec = spec.keys.some(k => 
              k === 'regular' ? /(?:^|[^a-z])regular(?:[^a-z]|$)/.test(hk) : hk.includes(k)
            )
          } else {
            matchesSpec = spec.keys.some(k => hk.includes(k))
          }
          
          const isConditional = hk.includes('cond')

          // We want columns that are grade-level specific for this category
          // but NOT the combined SHS total itself
          return isGradeLevel && matchesSpec && !isConditional && !isShsTotal
        })

        // Find if the total already exists in headers (detect variations: Total, EOSY Total, Grand Total, Overall Total)
        const totalVariationTokens = ['total', 'all', 'eosy', 'grand', 'overall']
        const isGenderColumn = (hk) => ['male', 'female', 'boys', 'girls'].some(t => hk.includes(t))
        const expandedMetricKeys = [...spec.keys, 'enrollment', 'enrollee', 'enrolled', 'completers', 'completed', 'graduate', 'promoted', 'transferin', 'transferout', 'trans in', 'trans out', 'lateenrollee', 'late enrollee']
        const shsLevelKeywords = ['shs', 'senior', 'seniorhigh', 'grade11', 'grade 11', 'g11', 'seniorhighschool', 'strand']

        const candidates = headers.filter(h => {
          const hk = normalizedHeaderMap.get(h)
          const matchesSpec = expandedMetricKeys.some(k => hk.includes(k))
          const isConditional = hk.includes('cond')
          const hasTotalVariation = totalVariationTokens.some(t => hk.includes(t))
          
          // Fix 1: Explicit level exclusion
          const hasCrossLevelToken = hk.includes('elem') || hk.includes('jhs') || hk.includes('junior') || hk.includes('elementary')
          
          return matchesSpec && hasTotalVariation && !isGenderColumn(hk) && !isConditional && !hasCrossLevelToken
        })

        // Fix 1: Priority for G11&12 combined totals
        let existingTotalHeader = null
        if (spec.label.includes('Enrollment')) {
          existingTotalHeader = candidates.find(h => {
            const hk = normalizedHeaderMap.get(h)
            return hk.includes('g1112') && hk.includes('total') && !isGenderColumn(hk)
          })
          if (!existingTotalHeader) {
            existingTotalHeader = candidates.find(h => {
              const hk = normalizedHeaderMap.get(h)
              return hk.includes('g11') && hk.includes('total') && !isGenderColumn(hk)
            })
          }
        }

        if (!existingTotalHeader) {
          existingTotalHeader = candidates.find(h => {
            const hk = normalizedHeaderMap.get(h)
            return shsLevelKeywords.some(lk => hk.includes(lk)) &&
                   spec.keys.some(k => hk.includes(k))
          }) || null
        }

        // Step 3: Fallback Total Search
        if (!existingTotalHeader) {
          const fallbackTotal = allHeaders.find(h => {
            const hk = normalizedHeaderMap.get(h)
            const matchesSpec = expandedMetricKeys.some(k => hk.includes(k))
            const isConditional = hk.includes('cond')
            const hasTotal = ['total', 'grand', 'overall', 'eosy'].some(t => hk.includes(t))
            const hasCrossLevelToken = hk.includes('elem') || hk.includes('jhs') || hk.includes('junior') || hk.includes('elementary')
            return matchesSpec && hasTotal && !isConditional && !hasCrossLevelToken
          })
          if (fallbackTotal) {
            existingTotalHeader = fallbackTotal
          }
        }

        return { ...spec, components, existingTotalHeader }
      })
      const specHeaderMapJhs = jhsTotalSpecs.map(spec => {
        const components = allHeaders.filter(h => {
          const hk = normalizedHeaderMap.get(h)
          const isGradeLevel = isJhsGrade(hk)
          const isJhsTotal = (hk.includes('jhs') || hk.includes('junior') || hk.includes('second')) && !hk.includes('ngsecond')
          const matchesSpec = spec.keys.some(k => hk.includes(k))
          const isConditional = hk.includes('cond')
          return isGradeLevel && matchesSpec && !isConditional && !isJhsTotal
        })
        const totalVariationTokens = ['total', 'all', 'eosy', 'grand', 'overall']
        const isGenderColumn = (hk) => ['male', 'female', 'boys', 'girls'].some(t => hk.includes(t))
        const expandedMetricKeys = [...spec.keys, 'enrollment', 'enrollee', 'enrolled', 'completers', 'completed', 'graduate', 'promoted', 'transferin', 'transferout', 'trans in', 'trans out', 'lateenrollee', 'late enrollee']
        const jhsLevelKeywords = ['jhs', 'junior', 'juniorhigh', 'grade7', 'grade 7', 'g7', 'grade8', 'secondary', 'high school']

        const candidates = headers.filter(h => {
          const hk = normalizedHeaderMap.get(h)
          const matchesSpec = expandedMetricKeys.some(k => hk.includes(k))
          const isConditional = hk.includes('cond')
          const hasTotalVariation = totalVariationTokens.some(t => hk.includes(t))
          
          // Fix 1: Explicit level exclusion
          const hasCrossLevelToken = hk.includes('elem') || hk.includes('shs') || hk.includes('senior') || hk.includes('elementary')
          
          return matchesSpec && hasTotalVariation && !isGenderColumn(hk) && !isConditional && !hasCrossLevelToken
        })
        let existingTotalHeader = candidates.find(h => {
          const hk = normalizedHeaderMap.get(h)
          return jhsLevelKeywords.some(lk => hk.includes(lk)) &&
                 spec.keys.some(k => hk.includes(k))
        }) || null

        // Step 3: Fallback Total Search
        if (!existingTotalHeader) {
          const fallbackTotal = allHeaders.find(h => {
            const hk = normalizedHeaderMap.get(h)
            const matchesSpec = expandedMetricKeys.some(k => hk.includes(k))
            const isConditional = hk.includes('cond')
            const hasTotal = ['total', 'grand', 'overall', 'eosy'].some(t => hk.includes(t))
            const hasCrossLevelToken = hk.includes('elem') || hk.includes('shs') || hk.includes('senior') || hk.includes('elementary')
            return matchesSpec && hasTotal && !isConditional && !hasCrossLevelToken
          })
          if (fallbackTotal) {
            existingTotalHeader = fallbackTotal
          }
        }
        return { ...spec, components, existingTotalHeader }
      })
      const specHeaderMapElem = elemTotalSpecs.map(spec => {
        const components = allHeaders.filter(h => {
          const hk = normalizedHeaderMap.get(h)
          const isGradeLevel = isElemGrade(hk)
          const isElemTotal = (hk.includes('elem') || hk.includes('elementary')) && !hk.includes('ngelem')
          const matchesSpec = spec.keys.some(k => hk.includes(k))
          const isConditional = hk.includes('cond')
          return isGradeLevel && matchesSpec && !isConditional && !isElemTotal
        })
        const totalVariationTokens = ['total', 'all', 'eosy', 'grand', 'overall']
        const isGenderColumn = (hk) => ['male', 'female', 'boys', 'girls'].some(t => hk.includes(t))
        const expandedMetricKeys = [...spec.keys, 'enrollment', 'enrollee', 'enrolled', 'completers', 'completed', 'graduate', 'promoted', 'transferin', 'transferout', 'trans in', 'trans out', 'lateenrollee', 'late enrollee']
        const elemLevelKeywords = ['elem', 'elementary', 'primary', 'element', 'kinder', 'grade1', 'grade 1', 'g1']

        const candidates = headers.filter(h => {
          const hk = normalizedHeaderMap.get(h)
          const matchesSpec = expandedMetricKeys.some(k => hk.includes(k))
          const isConditional = hk.includes('cond')
          const hasTotalVariation = totalVariationTokens.some(t => hk.includes(t))
          
          // Fix 1: Explicit level exclusion
          const hasCrossLevelToken = hk.includes('jhs') || hk.includes('shs') || hk.includes('senior') || hk.includes('junior')
          
          return matchesSpec && hasTotalVariation && !isGenderColumn(hk) && !isConditional && !hasCrossLevelToken
        })
        let existingTotalHeader = candidates.find(h => {
          const hk = normalizedHeaderMap.get(h)
          return elemLevelKeywords.some(lk => hk.includes(lk)) &&
                 spec.keys.some(k => hk.includes(k))
        }) || null

        // Step 3: Fallback Total Search
        if (!existingTotalHeader) {
          const fallbackTotal = allHeaders.find(h => {
            const hk = normalizedHeaderMap.get(h)
            const matchesSpec = expandedMetricKeys.some(k => hk.includes(k))
            const isConditional = hk.includes('cond')
            const hasTotal = ['total', 'grand', 'overall', 'eosy'].some(t => hk.includes(t))
            const hasCrossLevelToken = hk.includes('jhs') || hk.includes('shs') || hk.includes('senior') || hk.includes('junior')
            return matchesSpec && hasTotal && !isConditional && !hasCrossLevelToken
          })
          if (fallbackTotal) {
            existingTotalHeader = fallbackTotal
          }
        }
        return { ...spec, components, existingTotalHeader }
      })

      const processedRows = rows.map((row) => {
        const rowCopy = { ...row }
        
        function applySpecTotals(map) {
          for (const specInfo of map) {
            const { label, existingTotalHeader, components } = specInfo
            let currentVal = null
            if (existingTotalHeader) {
              const raw = Number(rowCopy[existingTotalHeader])
              currentVal = Number.isFinite(raw) ? raw : null
            }
            if (components.length > 0) {
              if (currentVal === null) {
                let sum = 0
                let hasAtLeastOneValue = false
                for (const h of components) {
                  const rawVal = rowCopy[h]
                  if (rawVal !== null && rawVal !== '' && rawVal !== undefined) {
                    const val = Number(rawVal)
                    if (Number.isFinite(val)) {
                      sum += val
                      hasAtLeastOneValue = true
                    }
                  }
                }
                if (hasAtLeastOneValue) {
                  if (existingTotalHeader) {
                    rowCopy[existingTotalHeader] = sum
                  } else {
                    rowCopy[label] = sum
                    if (!virtualHeaders.includes(label)) virtualHeaders.push(label)
                  }
                }
              }
            }
          }
        }
        applySpecTotals(specHeaderMap)
        applySpecTotals(specHeaderMapJhs)
        applySpecTotals(specHeaderMapElem)

        // Generic recalculation for total columns (includes Total, EOSY Total, Grand Total, Overall Total)
        const rowTotalHeaders = headers.filter(h => {
          const hk = normalizedHeaderMap.get(h)
        return hk.includes('total') || hk.includes('grand') || hk.includes('overall') || hk.includes('eosy')
        })
        for (const targetHeader of rowTotalHeaders) {
          const currentVal = Number(rowCopy[targetHeader]) || 0
          if (currentVal === 0) {
            const targetKey = normalizedHeaderMap.get(targetHeader)
            const targetParts = targetKey.replace('total', '').split(/[^a-z0-9]+/).filter(p => p.length > 2)
            if (targetParts.length === 0) continue

            let calculatedSum = 0
            let foundBreakdown = false
            
            for (const otherHeader of allHeaders) {
              if (otherHeader === targetHeader) continue
              const otherKey = normalizedHeaderMap.get(otherHeader)
              if (otherKey.includes('total')) continue
              
              if (targetParts.every(part => otherKey.includes(part))) {
                const val = Number(rowCopy[otherHeader])
                if (Number.isFinite(val)) {
                  calculatedSum += val
                  foundBreakdown = true
                }
              }
            }
            if (foundBreakdown && calculatedSum > 0) rowCopy[targetHeader] = calculatedSum
          }
        }
        return rowCopy
      })

      const finalHeaders = Array.from(new Set([...headers, ...virtualHeaders]))
      const requiredKeys = requiredColumnLabels.map((label) => normalizeHeader(label))
      const importantHeaders = []
      for (const header of finalHeaders) {
        const key = normalizeHeader(header)
        let keep = false
        for (const requiredKey of requiredKeys) {
          if (
            key === requiredKey ||
            key.includes(requiredKey) ||
            requiredKey.includes(key)
          ) {
            keep = true
            break
          }
        }
        if (!keep && isImportantTotalHeader(header)) {
          keep = true
        }
        if (keep) {
          importantHeaders.push(header)
        }
      }

      const trimmedRows = processedRows.map((row) => {
        const cleaned = {}
        for (const header of importantHeaders) {
          cleaned[header] = row[header]
        }
        return cleaned
      })

      setDataset(importantHeaders, trimmedRows, [])
    } catch (error) {
      setError('Failed to read file. Please check that it is a valid Excel or CSV file.')
    } finally {
      setLoading(false)
    }
  }
  reader.onerror = () => {
    setError('Failed to read file.')
    setLoading(false)
  }
  reader.readAsArrayBuffer(file)
}
</script>

<template>
  <div class="view-container">
    <h1 class="view-title">Upload Data</h1>
    <div class="card upload-card">
      <div class="upload-row">
        <label class="file-input-label">
          <span>Select Excel or CSV file</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            class="file-input"
            @change="handleFileChange"
          />
        </label>
        <div v-if="fileName" class="file-meta">
          <div class="file-name">{{ fileName }}</div>
          <div class="file-size">{{ fileSizeMb.toFixed(2) }} MB</div>
        </div>
      </div>
      <div class="upload-info">
        <p>Supported formats: .xlsx, .xls, .csv</p>
        <p>Maximum file size: {{ maxFileSizeMb }} MB</p>
      </div>
      <div v-if="state.loading" class="status status-loading">
        <span class="spinner"></span>
        <span>Processing file. This may take a moment for large datasets.</span>
      </div>
      <div v-if="state.error" class="status status-error">
        <span>{{ state.error }}</span>
      </div>
      <div v-if="!state.loading && !state.error && state.rows.length" class="status status-success">
        <span>Loaded {{ state.rows.length.toLocaleString() }} rows and {{ state.columns.length }} columns.</span>
      </div>
    </div>
    <div class="card">
      <DataTable />
    </div>

    <!-- Integrated Dashboard -->
    <div v-if="hasData" class="dashboard-section">
      <h1 class="view-title">Dashboard</h1>
      <div class="grid summary-grid">
        <div class="card summary-card">
          <div class="summary-label">Total schools</div>
          <div class="summary-value">{{ totalSchools.toLocaleString() }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Regions</div>
          <div class="summary-value">{{ regionCount.toLocaleString() }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Divisions</div>
          <div class="summary-value">{{ divisionCount.toLocaleString() }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">School types</div>
          <div class="summary-value">{{ schoolTypeCount.toLocaleString() }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Sectors</div>
          <div class="summary-value">{{ sectorCount.toLocaleString() }}</div>
        </div>
      </div>
      <div class="grid completion-summary-grid">
        <div class="card summary-card">
          <div class="summary-label">Total enrollment</div>
          <div class="summary-value">
            {{ totalEnrollment.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Total completers</div>
          <div class="summary-value">
            {{ totalCompleters.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Total conditional</div>
          <div class="summary-value">
            {{ totalConditional.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Completion rate</div>
          <div class="summary-value">
            <template v-if="Number.isFinite(completionRate) && completionRate > 0">
              {{ completionRate.toFixed(2) }}%
            </template>
            <template v-else>
              0.00%
            </template>
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Total transfer in</div>
          <div class="summary-value">
            {{ totalTransferIn.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Total transfer out</div>
          <div class="summary-value">
            {{ totalTransferOut.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Total late enrollees</div>
          <div class="summary-value">
            {{ totalLateEnrollees.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">Total retained</div>
          <div class="summary-value">
            {{ totalRetained.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
          </div>
        </div>
      </div>
      <div class="card completion-rate-card" v-if="completionRatePerSchoolConfig.labels.length">
        <div class="chart-header-row">
          <h2 class="chart-title-main">Completion rate per school</h2>
          <div class="chart-controls-compact">
            <label class="field-label-row">
              <span>Orientation:</span>
              <select class="select select-compact" v-model="completionChartOrientation">
                <option v-for="opt in orientationOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </label>
          </div>
        </div>
        <BaseChart
          type="bar"
          :index-axis="completionChartOrientation"
          :max-value="100"
          :labels="completionRatePerSchoolConfig.labels"
          :datasets="completionRatePerSchoolConfig.datasets"
        />
      </div>
      <!-- Completion metrics table hidden for now -->
      <div v-if="false" class="card completion-table-card">
        <h2>Completion metrics per school</h2>
        <div v-if="completionTableRows.length">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="header-cell">
                    <div class="header-content">
                      <span class="header-label">School</span>
                    </div>
                  </th>
                  <th class="header-cell">
                    <div class="header-content">
                      <span class="header-label">Total enrollment</span>
                    </div>
                  </th>
                  <th class="header-cell">
                    <div class="header-content">
                      <span class="header-label">Total completers</span>
                    </div>
                  </th>
                  <th class="header-cell">
                    <div class="header-content">
                      <span class="header-label">Total conditional</span>
                    </div>
                  </th>
                  <th class="header-cell">
                    <div class="header-content">
                      <span class="header-label">Completion rate (%)</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in completionTableRows" :key="row.school">
                  <td>{{ row.school }}</td>
                  <td>{{ row.totalEnrollment.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</td>
                  <td>{{ row.totalCompleters.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</td>
                  <td>{{ row.totalConditional.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</td>
                  <td>
                    <template v-if="Number.isFinite(row.completionRate) && row.totalEnrollment > 0">
                      {{ row.completionRate.toFixed(2) }}
                    </template>
                    <template v-else>
                      0.00
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>No numeric completion data found in the current dataset.</p>
        </div>
      </div>
      <!-- Custom visualization hidden for now -->
      <div v-if="false" class="card user-chart-card">
        <h2>Custom visualization</h2>
        <div class="user-chart-controls">
          <label class="field-label">
            <span>Dimension</span>
            <select v-model="selectedDimension" class="select">
              <option value="">Select column</option>
              <option v-for="column in dimensionOptions" :key="column" :value="column">
                {{ column }}
              </option>
            </select>
          </label>
          <label class="field-label">
            <span>Chart type</span>
            <select v-model="selectedChartType" class="select">
              <option v-for="type in chartTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
          </label>
          <label class="field-label">
            <span>Stacked by</span>
            <select v-model="selectedStackSeriesDimension" class="select">
              <option value="">None</option>
              <option v-for="column in dimensionOptions" :key="column" :value="column">
                {{ column }}
              </option>
            </select>
          </label>
        </div>
        <div v-if="userChartConfig.labels.length" class="user-chart">
          <BaseChart
            :type="userChartConfig.type"
            title="Custom chart"
            :labels="userChartConfig.labels"
            :datasets="userChartConfig.datasets"
            :stacked="userChartConfig.stacked"
          />
        </div>
        <div v-else class="empty-state">
          <p>Select a column dimension to generate a custom chart.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.chart-title-main {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.chart-controls-compact {
  display: flex;
  align-items: center;
}

.field-label-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #9ca3af;
}

.select-compact {
  height: 28px;
  padding: 0 0.5rem;
  font-size: 0.8rem;
}

.dashboard-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(30, 64, 175, 0.4);
}
</style>
