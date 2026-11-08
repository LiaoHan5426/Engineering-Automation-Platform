/** Lazy Monaco diff editor bootstrap; falls back when import or mount fails. */

export type DiffLanguage =
  | 'typescript'
  | 'javascript'
  | 'java'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'plaintext'

export function diffLanguageForPath(path: string): DiffLanguage {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'java':
      return 'java'
    case 'json':
      return 'json'
    case 'vue':
    case 'html':
    case 'htm':
      return 'html'
    case 'css':
    case 'scss':
      return 'css'
    case 'md':
      return 'markdown'
    default:
      return 'plaintext'
  }
}

export type MonacoDiffBundle = {
  monaco: typeof import('monaco-editor')
  create: (
    el: HTMLElement,
    options: {
      original: string
      modified: string
      language: DiffLanguage
      readOnly?: boolean
    },
  ) => import('monaco-editor').editor.IStandaloneDiffEditor
  dispose: (editor: import('monaco-editor').editor.IStandaloneDiffEditor) => void
  update: (
    editor: import('monaco-editor').editor.IStandaloneDiffEditor,
    options: { original: string; modified: string; language: DiffLanguage },
  ) => void
}

export async function loadMonacoDiff(): Promise<MonacoDiffBundle | null> {
  if (import.meta.env.MODE === 'test') return null
  try {
    const monaco = await import('monaco-editor')
    return {
      monaco,
      create(el, { original, modified, language, readOnly = true }) {
        const editor = monaco.editor.createDiffEditor(el, {
          readOnly,
          originalEditable: false,
          renderSideBySide: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          fontSize: 12,
          theme: 'vs-dark',
        })
        editor.setModel({
          original: monaco.editor.createModel(original, 'plaintext'),
          modified: monaco.editor.createModel(modified, 'plaintext'),
        })
        void language
        return editor
      },
      dispose(editor) {
        const model = editor.getModel()
        // Detach first: the diff widget still observes both models until reset/disposal.
        editor.setModel(null)
        editor.dispose()
        model?.original?.dispose()
        model?.modified?.dispose()
      },
      update(editor, { original, modified, language }) {
        const model = editor.getModel()
        if (!model) return
        if (model.original.getValue() !== original) model.original.setValue(original)
        if (model.modified.getValue() !== modified) model.modified.setValue(modified)
        monaco.editor.setModelLanguage(model.original, 'plaintext')
        monaco.editor.setModelLanguage(model.modified, 'plaintext')
        void language
      },
    }
  } catch {
    return null
  }
}
