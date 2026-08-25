/**
 * useApiParser - 将输入文本解析为 IR 的 composable
 */
import { ref, computed, watch } from "vue";
import type { ApiDocument, ParseResult } from "../types/ir";
import { parseToIR } from "../parsers/openapi-parser";
import type { Ref } from "vue";

interface UseApiParserOptions {
  rawText: Ref<string>;
  format: Ref<string>;
  hasContent: Ref<boolean>;
}

export function useApiParser({ rawText, format, hasContent }: UseApiParserOptions) {
  const result = ref<ParseResult | null>(null);
  const isParsing = ref(false);
  const parseError = ref("");
  const warnings = ref<string[]>([]);

  const document = computed<ApiDocument | null>(() => result.value?.document ?? null);
  const operations = computed(() => document.value?.operations ?? []);
  const tags = computed(() => {
    const tagSet = new Set<string>();
    for (const op of operations.value) {
      tagSet.add(op.primaryTag);
    }
    return Array.from(tagSet).sort();
  });

  const selectedTag = ref<string | null>(null);
  const filteredOperations = computed(() => {
    if (selectedTag.value === null) return operations.value;
    return operations.value.filter((op) => op.primaryTag === selectedTag.value);
  });

  function doParse() {
    if (!rawText.value || !rawText.value.trim()) {
      result.value = null;
      parseError.value = "";
      return;
    }
    isParsing.value = true;
    parseError.value = "";
    warnings.value = [];

    try {
      const res = parseToIR(rawText.value, format.value as "json" | "yaml");
      result.value = res;
      if (res.success) {
        selectedTag.value = null;
        warnings.value = res.warnings || [];
      } else {
        parseError.value = res.error || "解析失败";
      }
    } catch (e: any) {
      result.value = null;
      parseError.value = `解析异常：${e.message || "未知错误"}`;
    } finally {
      isParsing.value = false;
    }
  }

  // 监听输入变化，自动解析
  watch(
    [rawText, format, hasContent],
    () => {
      if (hasContent.value && rawText.value.trim()) {
        doParse();
      } else {
        result.value = null;
        parseError.value = "";
      }
    },
    { immediate: true }
  );

  return {
    result,
    isParsing,
    parseError,
    warnings,
    document,
    operations,
    tags,
    selectedTag,
    filteredOperations,
    doParse,
  };
}
