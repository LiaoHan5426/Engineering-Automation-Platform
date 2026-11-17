import { h, type VNodeChild, type CSSProperties } from 'vue'
/**
 * TeX-to-Vue via KaTeX, replicating the rehype-katex pipeline this renderer
 * replaced: the same three-arm error chain (strict render, `strict: 'ignore'`
 * retry, error span) and a DOM-identical element tree, so settled math keeps
 * its exact markup. KaTeX emits an HTML string; the browser's own HTML parser
 * (`DOMParser`, applying the spec's SVG/MathML foreign-content attribute
 * adjustments KaTeX output relies on) turns it into a tree this module maps
 * onto Vue elements — KaTeX output is a static span/MathML/SVG vocabulary
 * with no raw user HTML, the same trust shiki's tree gets in CodeBlock.
 *
 * Vue 18 has no MathML support, so the `.katex-mathml` subtree's elements
 * land in the HTML namespace — exactly as they did under the replaced
 * hast-util-to-jsx-runtime pipeline. The visual arm is the `.katex-html`
 * span tree; the MathML arm serves assistive technology, which reads it by
 * tag name regardless of namespace.
 */
import katex from 'katex'
/**
 * Convert one inline `style` attribute string into Vue's style object.
 * KaTeX emits only plain kebab-case declarations (no custom properties and no
 * nameless declarations), so camel-casing the property is the whole mapping.
 */
function styleObject(css: string): CSSProperties {
  const style: Record<string, string> = {}
  for (const declaration of css.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1)
      continue
    const name = declaration.slice(0, colon).trim()
    const key = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    style[key] = declaration.slice(colon + 1).trim()
  }
  return style
}
/** Map one parsed DOM node onto a Vue element (text nodes pass through). */
function domToVue(node: ChildNode, key: number): VNodeChild {
  if (node.nodeType === Node.TEXT_NODE)
    return node.textContent
    /* v8 ignore next 2 -- KaTeX output holds only elements and text; other
       node kinds cannot appear in its serialized vocabulary. */
  if (node.nodeType !== Node.ELEMENT_NODE)
    return null
  const element = node as Element
  const props: Record<string, unknown> = { key }
  for (const attribute of element.attributes) {
    if (attribute.name === 'class')
      props['class'] = attribute.value
    else if (attribute.name === 'style')
      props['style'] = styleObject(attribute.value)
    else
      props[attribute.name] = attribute.value
  }
  const children = [...element.childNodes].map(domToVue)
  return children.length === 0
    ? h(element.localName, props) : h(element.localName, props, [...children])
}
/**
 * Render TeX source to Vue elements through KaTeX.
 * @param value - The TeX source (math node value; fenced `math` blocks append
 * their trailing newline to match the replaced pipeline's text extraction).
 * @param displayMode - Display (block) versus inline rendering.
 * @returns KaTeX's element tree, or the error span when the source does not
 * parse (colored with KaTeX's stock `errorColor`, matching rehype-katex).
 */
export function renderTexToVue(value: string, displayMode: boolean): VNodeChild {
  let html: string
  try {
    html = katex.renderToString(value, { displayMode, throwOnError: true })
  }
  catch (error) {
    try {
      html = katex.renderToString(value, { displayMode, strict: 'ignore', throwOnError: false })
    }
    catch {
      // KaTeX renders ParseErrors itself under throwOnError: false; only its
      // internal errors reach here, so mirror rehype-katex's manual span.
      /* v8 ignore next 8 */
      return (h('span', { 'class': 'katex-error', 'style': { color: '#cc0000' }, 'title': String(error) }, [value]))
    }
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return [...parsed.body.childNodes].map(domToVue)
}
