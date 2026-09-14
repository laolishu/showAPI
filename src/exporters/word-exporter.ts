/**
 * Word (.docx) 导出渲染器
 * 将 IR (ApiDocument) 转换为 Word 文档。
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  PageBreak,
  TableLayoutType,
  TableOfContents,
  LineRuleType,
} from "docx";
import type { ApiDocument, ApiOperation, ApiField } from "../types/ir";

/** 生成默认文件名 */
function getFileName(doc: ApiDocument, projectName: string): string {
  const title = projectName || doc.info.title || "api-document";
  const version = doc.info.version;
  const date = new Date().toISOString().slice(0, 10);
  return `${title}_${version}_${date}.docx`;
}

/** 表格列数（统一为 7 列） */
const COLS = 7;

/** 配色方案（商务深蓝：与 Word 内置蓝色表格风格一致的办公配色） */
const COLOR = {
  border: "A9BFD6",      // 表格线：浅蓝灰细线（替代纯黑，降低视觉硬度）
  headerFill: "DEEAF6",  // 表头背景：浅蓝
  labelFill: "F2F6FB",   // 标签背景：极浅蓝
  sectionFill: "C9D9F1", // 分区标题背景：中浅蓝（比表头深一级，形成层次）
  sectionText: "1F4E79", // 分区标题文字 / 主色：深蓝
  labelText: "2F435E",   // 标签文字：深岩灰
  valueText: "262626",   // 值文字：中性近黑
  warn: "C00000",        // 已废弃状态：警示红
};

/** 字体（与预览一致：中文微软雅黑 + 西文 Calibri） */
const FONT = {
  ascii: "Calibri",
  hAnsi: "Calibri",
  eastAsia: "Microsoft YaHei",
  cs: "Calibri",
};

/** 正文行距：1.45 倍（与预览 line-height 1.45 对齐；240 = 单倍行距） */
const LINE_SPACING = { line: 348, lineRule: LineRuleType.AUTO };

/** 单元格内边距（twips：上下 90 ≈ 4.5pt、左右 135 ≈ 6.75pt，与预览 padding 对齐） */
const CELL_MARGINS = { top: 90, bottom: 90, left: 135, right: 135 };

/** 通用边框（细线，浅蓝灰） */
const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
};

const COL_WIDTHS = [1080, 630, 900, 450, 3960, 900, 1080];
const TABLE_WIDTH = COL_WIDTHS.reduce((total, width) => total + width, 0);

/** 创建普通单元格 */
function cell(text: string, opts?: { bold?: boolean; fill?: string; colSpan?: number; width?: number; color?: string }): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "", size: 20, bold: opts?.bold, color: opts?.color, font: FONT })],
        alignment: AlignmentType.LEFT,
        spacing: LINE_SPACING,
      }),
    ],
    shading: opts?.fill ? { type: "clear", fill: opts.fill } : undefined,
    borders,
    margins: CELL_MARGINS,
    columnSpan: opts?.colSpan,
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
  });
}

/** 创建表头单元格 */
function headerCell(text: string): TableCell {
  return cell(text, { bold: true, fill: COLOR.headerFill, color: COLOR.labelText });
}

/** 创建分区标题行（跨 7 列） */
function sectionRow(text: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text, bold: true, size: 20, color: COLOR.sectionText, font: FONT })],
            spacing: LINE_SPACING,
          }),
        ],
        shading: { type: "clear", fill: COLOR.sectionFill },
        borders,
        margins: CELL_MARGINS,
        columnSpan: COLS,
      }),
    ],
  });
}

/** 创建基本信息行（标签 1 列带背景色，值跨 6 列） */
function infoRow(label: string, value: string, valueColor?: string): TableRow {
  return new TableRow({
    children: [
      cell(label, { bold: true, fill: COLOR.labelFill, color: COLOR.labelText, width: COL_WIDTHS[0] }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: value || "—", size: 20, color: valueColor ?? COLOR.valueText, font: FONT })],
            spacing: LINE_SPACING,
          }),
        ],
        borders,
        margins: CELL_MARGINS,
        columnSpan: COLS - 1,
        width: { size: TABLE_WIDTH - COL_WIDTHS[0], type: WidthType.DXA },
      }),
    ],
  });
}

/** 展平字段为行数据 */
function flattenFieldRows(fields: ApiField[], indent: number): string[][] {
  const rows: string[][] = [];
  for (const f of fields) {
    const prefix = "  ".repeat(indent);
    rows.push([
      `${prefix}${f.displayIndex}`,
      `${prefix}${f.name}`,
      f.type,
      f.required ? "是" : "否",
      f.description || "",
      f.defaultValue || "",
      f.example || "",
    ]);
    if (f.children.length > 0) {
      rows.push(...flattenFieldRows(f.children, indent + 1));
    }
  }
  return rows;
}

/** 创建带列宽的数据行 */
function dataRow(values: string[]): TableRow {
  return new TableRow({
    children: values.map((v, i) => cell(v, { width: COL_WIDTHS[i], color: COLOR.valueText })),
  });
}

/** 创建带列宽的表头行 */
function headerRow(labels: string[]): TableRow {
  return new TableRow({
    children: labels.map((l, i) => cell(l, { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[i] })),
  });
}

/** 构建单个接口的统一表格（基本信息 + 请求参数 + 响应码 + 响应字段） */
function buildOperationTable(op: ApiOperation): Table {
  const rows: TableRow[] = [];

  // === 基本信息区 ===
  rows.push(infoRow("接口标识", op.operationId || "—"));
  rows.push(infoRow("请求方法", op.method));
  rows.push(infoRow("请求路径", op.path));
  rows.push(infoRow("所属模块", op.primaryTag));
  if (op.description) {
    rows.push(infoRow("接口说明", op.description));
  }
  rows.push(infoRow("请求格式", op.requestContentType || "无"));
  if (op.deprecated) {
    rows.push(infoRow("状态", "⚠️ 已废弃", COLOR.warn));
  }

  // === 请求参数区 ===
  const hasParams = op.parameters.length > 0 || (op.requestBody && op.requestBody.fields.length > 0);
  if (hasParams) {
    rows.push(sectionRow("请求参数"));
    rows.push(headerRow(["序号/字段", "位置", "类型", "必填", "描述", "默认值", "示例"]));

    // 非请求体参数
    for (const p of op.parameters) {
      rows.push(dataRow([
        p.name,
        p.location,
        p.type,
        p.required ? "是" : "否",
        p.description || "",
        p.defaultValue || "",
        p.example || "",
      ]));
    }

    // 请求体字段
    if (op.requestBody && op.requestBody.fields.length > 0) {
      const bodyRows = flattenFieldRows(op.requestBody.fields, 0);
      for (const r of bodyRows) {
        rows.push(dataRow([r[0], "body", r[2], r[3], r[4], r[5], r[6]]));
      }
    }
  }

  // === 响应码区 ===
  // 描述列跨 3 列（合并原 Content-Type），模型列跨 3 列
  const respDescWidth = COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3];
  const respModelWidth = COL_WIDTHS[4] + COL_WIDTHS[5] + COL_WIDTHS[6];
  rows.push(sectionRow("响应码"));
  rows.push(new TableRow({
    children: [
      cell("状态码", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[0] }),
      cell("描述", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 3, width: respDescWidth }),
      cell("模型", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 3, width: respModelWidth }),
    ],
  }));

  for (const r of op.responses) {
    const descText = r.contentType
      ? `${r.description || ""}（${r.contentType}）`
      : r.description || "";
    rows.push(new TableRow({
      children: [
        cell(r.statusCode, { width: COL_WIDTHS[0], color: COLOR.valueText }),
        cell(descText, { colSpan: 3, width: respDescWidth, color: COLOR.valueText }),
        cell(r.referenceName || "", { colSpan: 3, width: respModelWidth, color: COLOR.valueText }),
      ],
    }));
  }

  // === 响应字段区 ===
  const successResp =
    op.responses.find((r) => r.statusCode.startsWith("2")) ||
    op.responses[0];

  if (successResp && successResp.fields.length > 0) {
    rows.push(sectionRow("响应字段"));
    // 响应字段列：层级序号(1) | 字段名(2) | 类型(2) | 描述(1) | 示例(1)
    const respNameWidth = COL_WIDTHS[1] + COL_WIDTHS[2];
    const respTypeWidth = COL_WIDTHS[3] + COL_WIDTHS[4];
    rows.push(new TableRow({
      children: [
        cell("层级序号", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[0] }),
        cell("字段名", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 2, width: respNameWidth }),
        cell("类型", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 2, width: respTypeWidth }),
        cell("描述", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[5] }),
        cell("示例", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[6] }),
      ],
    }));

    const fieldRows = flattenFieldRows(successResp.fields, 0);
    for (const r of fieldRows) {
      // r: [层级序号, 字段名, 类型, 必填, 描述, 默认值, 示例]
      rows.push(new TableRow({
        children: [
          cell(r[0], { width: COL_WIDTHS[0], color: COLOR.valueText }),
          cell(r[1], { colSpan: 2, width: respNameWidth, color: COLOR.valueText }),
          cell(r[2], { colSpan: 2, width: respTypeWidth, color: COLOR.valueText }),
          cell(r[4], { width: COL_WIDTHS[5], color: COLOR.valueText }),
          cell(r[6], { width: COL_WIDTHS[6], color: COLOR.valueText }),
        ],
      }));
    }
  }

  return new Table({
    rows,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    layout: TableLayoutType.FIXED,
  });
}

/** 主导出函数 */
export async function exportToWord(doc: ApiDocument, projectName: string, selectedTag?: string | null): Promise<void> {
  const children: (Paragraph | Table)[] = [];
  const operations = selectedTag ? doc.operations.filter((op) => op.primaryTag === selectedTag) : doc.operations;

  // 封面
  children.push(new Paragraph({ children: [] }));
  children.push(new Paragraph({ children: [] }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: projectName || doc.info.title || "API 文档",
          bold: true,
          size: 48,
          color: COLOR.sectionText,
          font: FONT,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `版本：${doc.info.version}`, size: 24, font: FONT }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `生成时间：${new Date().toLocaleString("zh-CN")}`,
          size: 20,
          font: FONT,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `规范版本：${doc.sourceVersion}`, size: 20, font: FONT }),
      ],
    })
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 文档概述
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "文档概述", bold: true, size: 32, font: FONT })],
    })
  );
  if (doc.info.description) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.info.description, size: 20, font: FONT })],
        spacing: LINE_SPACING,
      })
    );
  }
  if (doc.servers.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "服务地址：", bold: true, size: 20, font: FONT }),
          new TextRun({ text: doc.servers.map((s) => s.url).join(", "), size: 20, font: FONT }),
        ],
        spacing: LINE_SPACING,
      })
    );
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 接口目录（Word 自动目录）
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "接口目录", bold: true, size: 32, font: FONT })],
    })
  );

  children.push(
    new TableOfContents("接口目录", {
      hyperlink: true,
      headingStyleRange: "1-3",
    })
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 接口详情
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "接口详情", bold: true, size: 32, font: FONT })],
    })
  );

  let opIndex = 0;
  let currentTag = "";
  for (const op of operations) {
    if (op.primaryTag !== currentTag) {
      currentTag = op.primaryTag;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: currentTag, bold: true, size: 28, font: FONT })],
        })
      );
    }

    // 接口标题
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [
          new TextRun({
            text: `${opIndex + 1}. ${op.displayName}`,
            bold: true,
            size: 24,
            font: FONT,
          }),
        ],
        spacing: { before: 200, after: 100, line: LINE_SPACING.line, lineRule: LINE_SPACING.lineRule },
      })
    );

    // 统一表格（基本信息 + 请求参数 + 响应码 + 响应字段）
    children.push(buildOperationTable(op));
    children.push(new Paragraph({ children: [], spacing: { after: 200 } }));

    opIndex++;
  }

  // 数据模型附录
  if (doc.schemas.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "数据模型附录", bold: true, size: 32, font: FONT })],
      })
    );

    for (const schema of doc.schemas) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: schema.name, bold: true, size: 24, font: FONT })],
        })
      );
      if (schema.description) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: schema.description, size: 20, font: FONT })],
            spacing: LINE_SPACING,
          })
        );
      }

      // 字段表
      const rows: TableRow[] = [
        new TableRow({
          children: [
            headerCell("序号"),
            headerCell("字段名"),
            headerCell("类型"),
            headerCell("必填"),
            headerCell("描述"),
          ],
        }),
      ];

      function addSchemaFields(fields: ApiField[], indent: number) {
        for (const f of fields) {
          const prefix = "  ".repeat(indent);
          rows.push(
            new TableRow({
              children: [
                cell(`${prefix}${f.displayIndex}`),
                cell(`${prefix}${f.name}`),
                cell(f.type),
                cell(f.required ? "是" : "否"),
                cell(f.description || ""),
              ],
            })
          );
          if (f.children.length > 0) {
            addSchemaFields(f.children, indent + 1);
          }
        }
      }

      addSchemaFields([schema.rootField], 0);

      children.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }) as unknown as Paragraph
      );
      children.push(new Paragraph({ children: [] }));
    }
  }
  // 生成文档（document 级默认样式兜底：字体、字号、颜色、行距，覆盖目录等未显式设置的文本）
  const wordDoc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20, color: COLOR.valueText },
          paragraph: { spacing: LINE_SPACING },
        },
      },
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(wordDoc);
  downloadBlob(blob, getFileName(doc, projectName));
}

/** 触发浏览器下载 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
