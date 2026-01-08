import MarkdownIt from 'markdown-it'

// Minimal, safe-ish markdown for standup notes.
// - allows links (for Linear/Jira/etc)
// - no raw HTML
// - renders soft breaks as <br> so lists look right
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

export function renderMarkdown(input: string): string {
  return md.render(input || '')
}

