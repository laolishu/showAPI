import { ref, computed } from 'vue'

/** 最大源文件大小：10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024

export type InputSource = 'file' | 'paste' | null
export type InputFormat = 'json' | 'yaml' | 'unknown'

export interface ApiInputState {
  /** 原始文本内容（JSON 或 YAML） */
  rawText: string
  /** 输入来源 */
  source: InputSource
  /** 检测到的格式 */
  format: InputFormat
  /** 文件名（来源为文件时） */
  fileName: string
  /** 文件大小（字节，来源为文件时） */
  fileSize: number
  /** 错误信息 */
  error: string
  /** 是否已加载有效内容 */
  hasContent: boolean
}

/** 根据文本内容推断格式 */
function detectFormat(text: string): InputFormat {
  const trimmed = text.trim()
  if (!trimmed) return 'unknown'
  // JSON：以 { 或 [ 开头
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  // YAML：通常以字母、-、# 开头，或包含 "key: value" 模式
  if (/^[a-zA-Z#-]/.test(trimmed) || /^\s*[\w-]+\s*:/.test(trimmed)) return 'yaml'
  return 'unknown'
}

export function useApiInput() {
  const rawText = ref('')
  const source = ref<InputSource>(null)
  const fileName = ref('')
  const fileSize = ref(0)
  const error = ref('')
  const isDragging = ref(false)

  const format = computed<InputFormat>(() => detectFormat(rawText.value))
  const hasContent = computed(() => rawText.value.trim().length > 0)

  function clearError() {
    error.value = ''
  }

  function setError(msg: string) {
    error.value = msg
  }

  /** 处理文件输入（点击选择或拖拽） */
  function handleFile(file: File) {
    clearError()

    // 校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      setError(`文件 ${formatFileSize(file.size)} 超过 10 MB 限制，请拆分后重试。`)
      return
    }

    // 校验扩展名（宽松：允许 .json .yaml .yml .txt 或无扩展名）
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext && !['json', 'yaml', 'yml', 'txt', 'openapi'].includes(ext)) {
      setError(`不支持的文件类型 ".${ext}"，请上传 .json 或 .yaml 文件。`)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        setError('文件读取失败，请重试。')
        return
      }
      rawText.value = text
      source.value = 'file'
      fileName.value = file.name
      fileSize.value = file.size
    }
    reader.onerror = () => {
      setError('文件读取失败，请重试。')
    }
    reader.readAsText(file, 'utf-8')
  }

  /** 处理粘贴文本 */
  function handlePaste(text: string) {
    clearError()
    const trimmed = text.trim()
    if (!trimmed) {
      setError('粘贴内容为空，请粘贴有效的 JSON 或 YAML。')
      return
    }
    rawText.value = trimmed
    source.value = 'paste'
    fileName.value = ''
    fileSize.value = new Blob([trimmed]).size
  }

  /** 清空输入 */
  function reset() {
    rawText.value = ''
    source.value = null
    fileName.value = ''
    fileSize.value = 0
    error.value = ''
  }

  /** 拖拽状态管理 */
  function onDragEnter(e: DragEvent) {
    e.preventDefault()
    isDragging.value = true
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    isDragging.value = false
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    isDragging.value = false
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  return {
    // state
    rawText,
    source,
    fileName,
    fileSize,
    error,
    format,
    hasContent,
    isDragging,
    // actions
    handleFile,
    handlePaste,
    reset,
    onDragEnter,
    onDragLeave,
    onDrop,
    clearError,
    setError,
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
