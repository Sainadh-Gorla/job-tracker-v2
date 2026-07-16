import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

const HEADING_COLOR = '1F4E79'
const BULLET_PATTERN = /^[•\-*]\s+/

// Scraped descriptions (e.g. from the Chrome extension) often arrive as one
// unbroken string with no line breaks at all - LinkedIn's DOM text content
// doesn't preserve the visual line breaks the page renders. These known
// section labels are forced onto their own line wherever they appear, so the
// paragraph builder below can then recognize them as headings.
const KNOWN_HEADING_PHRASES = [
  'About the job',
  'About the Company',
  'About Peregrine',
  'About You',
  "What you'll do",
  "What we're looking for",
  'What We Look For',
  'The Position',
  'The Company',
  'Role',
  'Team',
  'Our Stack',
  'Responsibilities:',
  'Requirements:',
  'Qualifications:',
  'Qualifications',
  'Nice-to-have:',
  'Benefits:',
  'Benefits',
  'Perks',
  'Salary',
  'Compensation',
  'Equal Opportunity',
  'Who You Are',
  'Why Join',
]

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Case-sensitive on purpose: several of these (Role, Team, Salary, Benefits,
// "Equal Opportunity", "The Company"...) are ordinary English words that show
// up constantly in normal sentences ("...lead our platform team.", "we are
// an equal opportunity employer"). Matching case-insensitively fragments
// those sentences. Requiring the exact Title Case shown in the list matches
// how postings actually render these as headings, while leaving lowercase
// in-sentence usage alone. (ALL-CAPS variants like "TEAM" are handled
// separately by splitAllCapsBeforeNewline below.)
//
// Leading \b prevents matching mid-word (so "Role" doesn't fire inside
// "Roleplay"); trailing \b does the same at the end. Any trailing colon in
// the source (with or without one already in the phrase) is consumed as part
// of the same match, so a lone ":" is never left behind for
// splitOnColonWord to isolate into its own bogus heading line.
function buildHeadingRegex(phrase) {
  const base = phrase.endsWith(':') ? phrase.slice(0, -1) : phrase
  return new RegExp(`\\s*\\b${escapeRegExp(base)}\\b\\s*:?\\s*`, 'g')
}

function splitOnKnownHeadings(text) {
  return KNOWN_HEADING_PHRASES.reduce((result, phrase) => {
    return result.replace(buildHeadingRegex(phrase), (match) => `\n${match.trim()}\n`)
  }, text)
}

// Catches squashed "Label:Content" runs not in the known-phrase list above -
// a colon immediately followed by a non-space character reads as a heading
// glued directly onto its content (a real sentence colon is always followed
// by a space, e.g. "Note: this is fine").
function splitOnColonWord(text) {
  return text.replace(/:(?=\S)/g, ':\n')
}

// ALL-CAPS section labels (e.g. "ROLE", "TEAM", "ABOUT YOU") that already sit
// right before a line break - either a real one in the source, or one just
// inserted by the passes above - are isolated onto their own line too, so
// they get picked up as headings even though they weren't in the known list.
function splitAllCapsBeforeNewline(text) {
  return text.replace(/([A-Z][A-Z']*(?:\s[A-Z][A-Z']*){0,3})\n/g, (_match, phrase) => `\n${phrase.trim()}\n`)
}

function normalizeDescriptionText(raw) {
  if (!raw) return ''
  let text = splitOnKnownHeadings(raw)
  text = splitOnColonWord(text)
  text = splitAllCapsBeforeNewline(text)
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function labelValue(label, value) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value || '—' }),
    ],
  })
}

function isBulletLine(line) {
  return BULLET_PATTERN.test(line)
}

function stripBullet(line) {
  return line.replace(BULLET_PATTERN, '').trim()
}

// A line reads as a section heading (e.g. "Responsibilities", "What you'll
// need:") when it's short and the content right after it is clearly longer -
// the shape of a label introducing a block of text, not a sentence itself.
function isHeadingLine(line, nextContentLine) {
  if (!line || line.length >= 60 || isBulletLine(line)) return false
  if (!nextContentLine) return false
  return nextContentLine.length > line.length
}

function buildBodyParagraphs(value) {
  const lines = value.split('\n').map((line) => line.trim())
  const paragraphs = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue

    if (isBulletLine(line)) {
      paragraphs.push(
        new Paragraph({
          text: stripBullet(line),
          bullet: { level: 0 },
          spacing: { after: 80 },
        }),
      )
      continue
    }

    const nextContentLine = lines.slice(i + 1).find((l) => l)
    if (isHeadingLine(line, nextContentLine)) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: line, bold: true, size: 24, color: HEADING_COLOR })],
        }),
      )
      continue
    }

    paragraphs.push(new Paragraph({ text: line, spacing: { after: 120 } }))
  }

  return paragraphs
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      bottom: { color: '999999', space: 1, style: BorderStyle.SINGLE, size: 6 },
    },
  })
}

async function buildJobDescriptionDoc(job) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 160 },
      children: [new TextRun({ text: job.role || 'Untitled Role', bold: true })],
    }),
    labelValue('Company', job.company),
    labelValue('Location', job.location),
    labelValue('Job Type', job.jobType),
    labelValue('Status', job.status),
    labelValue('Date Applied', job.dateApplied),
    labelValue('Job URL', job.link),
    divider(),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 160 },
      children: [new TextRun({ text: 'Job Description', color: HEADING_COLOR })],
    }),
    ...buildBodyParagraphs(normalizeDescriptionText(job.description)),
  ]

  if (job.notes) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 160 },
        children: [new TextRun({ text: 'Notes', color: HEADING_COLOR })],
      }),
      ...buildBodyParagraphs(job.notes),
    )
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

function sanitizeForFilename(value) {
  return (value || 'Unknown')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|]/g, '')
}

function buildFilename(job) {
  const company = sanitizeForFilename(job.company)
  const role = sanitizeForFilename(job.role)
  const date = job.dateApplied || new Date().toISOString().slice(0, 10)
  return `${company}_${role}_${date}.docx`
}

export async function downloadJobDescription(job) {
  const blob = await buildJobDescriptionDoc(job)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = buildFilename(job)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
