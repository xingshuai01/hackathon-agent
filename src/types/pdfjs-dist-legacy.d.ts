/**
 * pdfjs-dist 的最小类型声明(只声明我们实际用到的部分)。
 *
 * 为什么要手写:包的子路径入口 `pdfjs-dist/legacy/build/pdf.mjs`
 * 在本版本的 typesVersions 下解析不到类型。手写几十行比引入 `any` 干净。
 */

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export interface PdfTextItem {
    /** 文本内容 */
    str: string
    /** [scaleX, skewX, skewY, scaleY, x, y] —— x 是第 4 项,y 是第 5 项 */
    transform: number[]
    /** 该项的宽度(用于判断与下一项之间是否有空格距离) */
    width: number
    /** 该项之后是否换行 */
    hasEOL?: boolean
    /** 项类型标记(TextItem 有 str,TextMarkedContent 没有) */
    type?: string
  }

  export interface PdfTextContent {
    items: PdfTextItem[]
  }

  export interface PdfPage {
    getTextContent(): Promise<PdfTextContent>
    cleanup(): void
  }

  export interface PdfMetadata {
    info?: Record<string, unknown>
    metadata?: { get(name: string): unknown } | null
  }

  export interface PdfDocument {
    numPages: number
    getPage(pageNumber: number): Promise<PdfPage>
    getMetadata(): Promise<PdfMetadata | null>
    cleanup(): void
  }

  export interface PdfLoadingTask {
    promise: Promise<PdfDocument>
    destroy(): Promise<void>
  }

  export function getDocument(src: {
    data: Uint8Array
    useSystemFonts?: boolean
    disableFontFace?: boolean
    verbosity?: number
    isEvalSupported?: boolean
  }): PdfLoadingTask
}
