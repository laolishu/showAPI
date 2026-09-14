<script setup lang="ts">
import { ref } from "vue";
import { useApiInput } from "./composables/useApiInput";
import { useApiParser } from "./composables/useApiParser";
import { useI18n } from "./composables/useI18n";
import { exportToWord } from "./exporters/word-exporter";

declare const __BUILD_VERSION__: string;

const { lang, t } = useI18n();

const projectName = ref("");
const buildVersion = __BUILD_VERSION__ || "v0.0.0-unknown";

// 从 config.js 读取配置（编译后可直接修改 dist/config.js）
const contactEmail = window.APP_CONFIG?.contactEmail || "";

const {
  rawText,
  source,
  fileName,
  fileSize,
  error: inputError,
  format,
  hasContent,
  isDragging,
  handleFile,
  handlePaste,
  reset,
  onDragEnter,
  onDragLeave,
  onDrop,
} = useApiInput();

const {
  isParsing,
  parseError,
  warnings,
  document: apiDoc,
  operations,
  tags,
  selectedTag,
  filteredOperations,
} = useApiParser({ rawText, format, hasContent });

// 隐藏的文件选择输入
const fileInputRef = ref<HTMLInputElement | null>(null);

function openFilePicker() {
  fileInputRef.value?.click();
}

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    handleFile(file);
  }
  input.value = "";
}

function onTextareaInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value;
  if (value.trim()) {
    handlePaste(value);
  }
}

function clearInput() {
  reset();
}

// 导出
const exporting = ref<"word" | null>(null);
const exportError = ref("");
const exportSuccess = ref("");

async function onExportWord() {
  if (!apiDoc.value) return;
  exporting.value = "word";
  exportError.value = "";
  exportSuccess.value = "";
  try {
    await exportToWord(apiDoc.value, projectName.value, selectedTag.value);
    exportSuccess.value = t.value.exportSuccess;
    // 3秒后自动消失
    setTimeout(() => {
      exportSuccess.value = "";
    }, 3000);
  } catch (e: any) {
    exportError.value = t.value.exportFail(e.message || "");
  } finally {
    exporting.value = null;
  }
}

// 展开/折叠接口
const expandedOps = ref<Set<string>>(new Set());
function toggleOp(key: string) {
  if (expandedOps.value.has(key)) {
    expandedOps.value.delete(key);
  } else {
    expandedOps.value.add(key);
  }
}
function isExpanded(key: string) {
  return expandedOps.value.has(key);
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="lang-toggle">
        <button
          class="lang-btn"
          :class="{ active: lang === 'zh' }"
          @click="lang = 'zh'"
        >
          中文
        </button>
        <button
          class="lang-btn"
          :class="{ active: lang === 'en' }"
          @click="lang = 'en'"
        >
          EN
        </button>
      </div>
      <h1>{{ t.title }}</h1>
      <p class="subtitle">{{ t.subtitle }}</p>
    </header>

    <main class="app-main">
      <!-- 步骤 1：输入 -->
      <section class="card">
        <h2>{{ t.step1 }}</h2>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,.yaml,.yml,.txt"
          style="display: none"
          @change="onFileInputChange"
        />
        <div class="input-area">
          <div
            class="drop-zone"
            :class="{ dragging: isDragging }"
            @click="openFilePicker"
            @dragenter="onDragEnter"
            @dragover.prevent
            @dragleave="onDragLeave"
            @drop.prevent="onDrop"
          >
            <p>{{ t.dragHint }}</p>
            <p class="hint">{{ t.dragSub }}</p>
          </div>
          <div class="paste-area">
            <label>{{ t.pasteLabel }}</label>
            <textarea
              v-model="rawText"
              rows="6"
              placeholder='{"swagger": "2.0", "info": {...}, "paths": {...}}'
              @input="onTextareaInput"
            ></textarea>
          </div>
        </div>

        <!-- 文件信息 -->
        <div v-if="hasContent" class="file-info">
          <span v-if="source === 'file'">
            {{ t.fileInfo(fileName, fileSize) }}
          </span>
          <span v-else>{{ t.pastedInfo(rawText.length) }}</span>
          <span class="format-badge">{{ format.toUpperCase() }}</span>
          <button class="btn-clear" @click="clearInput">{{ t.clear }}</button>
        </div>

        <!-- 输入错误提示 -->
        <div v-if="inputError" class="error-msg">{{ inputError }}</div>

        <!-- 解析错误提示 -->
        <div v-if="parseError" class="error-msg">{{ parseError }}</div>

        <!-- 解析中 -->
        <div v-if="isParsing" class="parsing-msg">{{ t.parsing }}</div>

        <!-- 解析成功摘要 -->
        <div v-if="apiDoc" class="parse-summary">
          <div class="summary-item">
            <span class="summary-label">{{ t.specVersion }}</span>
            <span class="summary-value">{{ apiDoc.sourceVersion }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">{{ t.opCount }}</span>
            <span class="summary-value">{{ operations.length }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">{{ t.tagCount }}</span>
            <span class="summary-value">{{ tags.length }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">{{ t.schemaCount }}</span>
            <span class="summary-value">{{ apiDoc.schemas.length }}</span>
          </div>
        </div>

        <!-- 警告 -->
        <div v-for="(w, i) in warnings" :key="i" class="warning-msg">
          ⚠️ {{ w }}
        </div>
      </section>

      <!-- 步骤 2：预览与 Tag 筛选 -->
      <section class="card" v-if="apiDoc">
        <h2>{{ t.step2 }}</h2>

        <!-- Tag 筛选 -->
        <div class="tag-filter">
          <button
            class="tag-btn"
            :class="{ active: selectedTag === null }"
            @click="selectedTag = null"
          >
            {{ t.all(operations.length) }}
          </button>
          <button
            v-for="tag in tags"
            :key="tag"
            class="tag-btn"
            :class="{ active: selectedTag === tag }"
            @click="selectedTag = tag"
          >
            {{ tag
            }}{{
              t.tagCountSuffix(
                operations.filter((o) => o.primaryTag === tag).length,
              )
            }}
          </button>
        </div>

        <!-- 接口列表 -->
        <div class="op-list">
          <div
            v-for="op in filteredOperations"
            :key="op.operationKey"
            class="op-item"
            :class="{ expanded: isExpanded(op.operationKey) }"
          >
            <div class="op-header" @click="toggleOp(op.operationKey)">
              <span
                class="method-badge"
                :class="`method-${op.method.toLowerCase()}`"
              >
                {{ op.method }}
              </span>
              <span class="op-path">{{ op.path }}</span>
              <span class="op-name">{{ op.displayName }}</span>
              <span v-if="op.deprecated" class="deprecated-badge">{{
                t.deprecated
              }}</span>
              <span class="expand-icon">{{
                isExpanded(op.operationKey) ? "−" : "+"
              }}</span>
            </div>

            <!-- 展开详情 -->
            <div v-if="isExpanded(op.operationKey)" class="op-detail">
              <div class="detail-row">
                <span class="detail-label">{{ t.desc }}</span>
                <span class="detail-value">{{ op.description || "—" }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">{{ t.reqFormat }}</span>
                <span class="detail-value">{{
                  op.requestContentType || t.none
                }}</span>
              </div>

              <!-- 参数表 -->
              <div v-if="op.parameters.length > 0" class="detail-section">
                <h4>{{ t.reqParams }}</h4>
                <table class="param-table">
                  <thead>
                    <tr>
                      <th>{{ t.name }}</th>
                      <th>{{ t.location }}</th>
                      <th>{{ t.type }}</th>
                      <th>{{ t.required }}</th>
                      <th>{{ t.desc }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in op.parameters" :key="p.name">
                      <td>{{ p.name }}</td>
                      <td>{{ p.location }}</td>
                      <td>{{ p.type }}</td>
                      <td>{{ p.required ? t.yes : t.no }}</td>
                      <td>{{ p.description || "" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- 请求体 -->
              <div v-if="op.requestBody" class="detail-section">
                <h4>{{ t.reqBody(op.requestBody.contentType) }}</h4>
                <div
                  v-if="op.requestBody.fields.length === 0"
                  class="empty-hint"
                >
                  {{ t.noFields }}
                </div>
                <table v-else class="param-table">
                  <thead>
                    <tr>
                      <th>{{ t.index }}</th>
                      <th>{{ t.field }}</th>
                      <th>{{ t.type }}</th>
                      <th>{{ t.required }}</th>
                      <th>{{ t.desc }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="f in op.requestBody.fields" :key="f.path">
                      <td>{{ f.displayIndex }}</td>
                      <td>{{ f.name }}</td>
                      <td>{{ f.type }}</td>
                      <td>{{ f.required ? t.yes : t.no }}</td>
                      <td>{{ f.description || "" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- 响应 -->
              <div class="detail-section">
                <h4>{{ t.responses }}</h4>
                <table class="param-table">
                  <thead>
                    <tr>
                      <th>{{ t.statusCode }}</th>
                      <th>{{ t.desc }}</th>
                      <th>Content-Type</th>
                      <th>{{ t.model }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in op.responses" :key="r.statusCode">
                      <td>{{ r.statusCode }}</td>
                      <td>{{ r.description }}</td>
                      <td>{{ r.contentType || "—" }}</td>
                      <td>{{ r.referenceName || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 步骤 3：导出 -->
      <section class="card" v-if="apiDoc">
        <h2>{{ t.step3 }}</h2>
        <div class="config-row">
          <label>{{ t.projectName }}</label>
          <input
            v-model="projectName"
            type="text"
            :placeholder="t.projectNamePh"
          />
        </div>
        <div class="config-row">
          <label>{{ t.exportScope }}</label>
          <span class="export-scope">
            {{
              selectedTag
                ? t.scopeTag(selectedTag, filteredOperations.length)
                : t.scopeAll(operations.length)
            }}
          </span>
        </div>
        <div class="config-row">
          <label>{{ t.exportFormat }}</label>
          <div class="format-options">
            <button
              class="btn btn-primary"
              :disabled="exporting !== null"
              @click="onExportWord"
            >
              {{ exporting === "word" ? t.exporting : t.exportWord }}
            </button>
          </div>
        </div>
        <div v-if="exportError" class="error-msg">{{ exportError }}</div>
        <div v-if="exportSuccess" class="success-msg">
          ✅ {{ exportSuccess }}
        </div>
      </section>

      <!-- 占位 -->
      <section class="card placeholder" v-if="!hasContent">
        <p>{{ t.placeholder }}</p>
      </section>
    </main>

    <footer class="app-footer">
      <span v-if="contactEmail"
        >{{ t.contact
        }}<a class="footer-link" :href="`mailto:${contactEmail}`">{{
          contactEmail
        }}</a></span
      >
      <span v-else>{{ t.footer }}</span>
      <span class="build-version">{{ t.version }}{{ buildVersion }}</span>
    </footer>
  </div>
</template>

<style scoped>
.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.app-header {
  text-align: center;
  margin-bottom: 32px;
}

.lang-toggle {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.lang-btn {
  padding: 4px 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.lang-btn:first-child {
  border-radius: 6px 0 0 6px;
}

.lang-btn:last-child {
  border-radius: 0 6px 6px 0;
  border-left: none;
}

.lang-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.app-header h1 {
  font-size: 1.75rem;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.subtitle {
  color: #666;
  font-size: 0.95rem;
}

.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.card h2 {
  font-size: 1.1rem;
  color: #334155;
  margin-bottom: 16px;
}

.drop-zone {
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
  margin-bottom: 16px;
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: #3b82f6;
  background: #f0f7ff;
}

.drop-zone.dragging {
  border-color: #2563eb;
  background: #dbeafe;
  transform: scale(1.01);
}

.drop-zone p {
  margin: 4px 0;
  color: #475569;
}

.hint {
  font-size: 0.85rem;
  color: #94a3b8;
}

.paste-area label {
  display: block;
  margin-bottom: 8px;
  color: #475569;
  font-size: 0.9rem;
}

.paste-area textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
  font-family: "Cascadia Code", "Fira Code", monospace;
  font-size: 0.85rem;
  resize: vertical;
}

.file-info {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  color: #166534;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.format-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.btn-clear {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  color: #6b7280;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-clear:hover {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #dc2626;
}

.error-msg {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #991b1b;
  font-size: 0.9rem;
}

.success-msg {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  color: #166534;
  font-size: 0.9rem;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.config-row label {
  white-space: nowrap;
  color: #475569;
}

.config-row input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 12px;
}

.export-scope {
  color: #475569;
  font-size: 0.9rem;
}

.format-options {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn:hover {
  opacity: 0.85;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-secondary {
  background: #10b981;
  color: #fff;
}

.placeholder {
  text-align: center;
  color: #94a3b8;
  padding: 48px 24px;
}

.app-footer {
  text-align: center;
  margin-top: 32px;
  color: #94a3b8;
  font-size: 0.85rem;
}

.footer-link {
  color: #3b82f6;
  text-decoration: none;
}

.footer-link:hover {
  text-decoration: underline;
}

.build-version {
  display: block;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 0.82rem;
}

/* 解析摘要 */
.parse-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.summary-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-bottom: 4px;
}

.summary-value {
  display: block;
  font-size: 1.1rem;
  font-weight: 600;
  color: #1e293b;
}

.parsing-msg {
  margin-top: 12px;
  padding: 8px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  color: #1e40af;
  font-size: 0.9rem;
}

.warning-msg {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  color: #92400e;
  font-size: 0.85rem;
}

/* Tag 筛选 */
.tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.tag-btn {
  padding: 6px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #fff;
  color: #475569;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.tag-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.tag-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

/* 接口列表 */
.op-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 4px;
}

.op-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.op-item.expanded {
  border-color: #93c5fd;
}

.op-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  background: #fafafa;
  transition: background 0.15s;
}

.op-header:hover {
  background: #f0f7ff;
}

.method-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  min-width: 50px;
  text-align: center;
}

.method-get {
  background: #dbeafe;
  color: #1e40af;
}

.method-post {
  background: #d1fae5;
  color: #065f46;
}

.method-put {
  background: #fef3c7;
  color: #92400e;
}

.method-delete {
  background: #fee2e2;
  color: #991b1b;
}

.method-patch {
  background: #e9d5ff;
  color: #6b21a8;
}

.method-head {
  background: #f3f4f6;
  color: #374151;
}

.method-options {
  background: #f3f4f6;
  color: #374151;
}

.op-path {
  font-family: "Cascadia Code", "Fira Code", monospace;
  font-size: 0.85rem;
  color: #334155;
  flex: 1;
}

.op-name {
  font-size: 0.8rem;
  color: #64748b;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deprecated-badge {
  padding: 1px 6px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 3px;
  font-size: 0.7rem;
}

.expand-icon {
  font-size: 1.1rem;
  color: #94a3b8;
  min-width: 20px;
  text-align: center;
}

/* 接口详情 */
.op-detail {
  padding: 16px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.detail-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.detail-label {
  min-width: 70px;
  color: #64748b;
  font-weight: 500;
}

.detail-value {
  color: #334155;
}

.detail-section {
  margin-top: 16px;
}

.detail-section h4 {
  font-size: 0.9rem;
  color: #475569;
  margin-bottom: 8px;
}

.empty-hint {
  color: #94a3b8;
  font-size: 0.85rem;
  padding: 8px 0;
}

/* 参数表格 */
.param-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.param-table th {
  background: #f8fafc;
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: #475569;
  border-bottom: 2px solid #e2e8f0;
}

.param-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.param-table tr:hover td {
  background: #f8fafc;
}
</style>
